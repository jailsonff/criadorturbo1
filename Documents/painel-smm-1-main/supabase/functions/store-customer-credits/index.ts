import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type Action = "list" | "redeem";

type Body = {
  action: Action;
  phone?: string;
  token?: string;
  service_id?: number;
  quantity?: number;
  link?: string;
  externalDb?: { url: string; serviceRoleKey: string };
};

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function normalizePhone(phone: unknown) {
  return String(phone || "").replace(/\D/g, "");
}

async function sha256Hex(input: string) {
  const enc = new TextEncoder();
  const digest = await crypto.subtle.digest("SHA-256", enc.encode(input));
  const bytes = new Uint8Array(digest);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function validateSession(service: any, phone: string, token: string) {
  const tokenHash = await sha256Hex(token);
  const { data, error } = await service
    .from("store_customer_sessions")
    .select("customer_id, expires_at")
    .eq("phone", phone)
    .eq("token_hash", tokenHash)
    .gt("expires_at", new Date().toISOString())
    .maybeSingle();

  if (error || !data?.customer_id) return null;
  return { customerId: String(data.customer_id), expiresAt: String(data.expires_at) };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const body = (await req.json()) as Body;
    const action = body.action;

    // IMPORTANT: externalDb is only for DB access. The function endpoint is always this project's backend.
    const dbUrl = body.externalDb?.url || Deno.env.get("SUPABASE_URL")!;
    const serviceKey = body.externalDb?.serviceRoleKey || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const functionsBaseUrl = Deno.env.get("SUPABASE_URL")!;
    const functionsServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const service = createClient(dbUrl, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    // housekeeping
    try {
      await service.rpc("cleanup_expired_store_customer_sessions");
    } catch {
      // non-blocking
    }

    const phone = normalizePhone(body.phone);
    const token = String(body.token || "");
    if (phone.length < 10 || !token) return json(401, { error: "Não autenticado" });

    const session = await validateSession(service, phone, token);
    if (!session) return json(401, { error: "Sessão inválida" });

    if (action === "list") {
      const { data: credits, error: creditsErr } = await service
        .from("store_customer_credits")
        .select("service_id, quantity_remaining")
        .eq("customer_id", session.customerId)
        .gt("quantity_remaining", 0);

      if (creditsErr) return json(500, { error: "Falha ao buscar créditos" });

      const rows = Array.isArray(credits) ? credits : [];
      const byService = new Map<number, number>();
      for (const r of rows) {
        const sid = Number((r as any)?.service_id) || 0;
        const qty = Number((r as any)?.quantity_remaining) || 0;
        if (sid <= 0 || qty <= 0) continue;
        byService.set(sid, (byService.get(sid) || 0) + qty);
      }

      const serviceIds = Array.from(byService.keys());
      let nameMap: Record<string, string> = {};
      if (serviceIds.length > 0) {
        const { data: services } = await service
          .from("imported_services")
          .select("external_service_id, name")
          .in("external_service_id", serviceIds);

        (services || []).forEach((s: any) => {
          const k = String(s?.external_service_id ?? "");
          if (k) nameMap[k] = String(s?.name || "");
        });
      }

      const result = serviceIds
        .sort((a, b) => a - b)
        .map((sid) => ({
          service_id: sid,
          service_name: nameMap[String(sid)] || `Serviço ${sid}`,
          quantity: byService.get(sid) || 0,
        }));

      return json(200, { credits: result });
    }

    if (action === "redeem") {
      const serviceId = Number(body.service_id) || 0;
      const qtyRequested = Math.max(0, Math.floor(Number(body.quantity) || 0));
      const link = String(body.link || "").trim();

      if (serviceId <= 0) return json(400, { error: "service_id inválido" });
      if (qtyRequested <= 0) return json(400, { error: "Quantidade inválida" });
      if (!link) return json(400, { error: "Link obrigatório" });

      // Find an active SINGLE package matching this service
      const { data: pkg, error: pkgErr } = await service
        .from("store_packages")
        .select("id, name")
        .eq("service_id", serviceId)
        .eq("package_type", "single")
        .eq("is_active", true)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (pkgErr || !pkg?.id) return json(400, { error: "Não existe pacote ativo para este serviço" });

      // Consume credits FIFO
      let remaining = qtyRequested;
      const { data: creditRows, error: creditErr } = await service
        .from("store_customer_credits")
        .select("id, quantity_remaining")
        .eq("customer_id", session.customerId)
        .eq("service_id", serviceId)
        .gt("quantity_remaining", 0)
        .order("created_at", { ascending: true });

      if (creditErr) return json(500, { error: "Falha ao validar créditos" });
      const list = Array.isArray(creditRows) ? creditRows : [];
      const totalAvailable = list.reduce((sum: number, r: any) => sum + (Number(r?.quantity_remaining) || 0), 0);
      if (totalAvailable < qtyRequested) return json(400, { error: "Crédito insuficiente" });

      for (const r of list) {
        if (remaining <= 0) break;
        const current = Number((r as any)?.quantity_remaining) || 0;
        if (current <= 0) continue;
        const take = Math.min(current, remaining);
        const next = current - take;

        const { error: upErr } = await service
          .from("store_customer_credits")
          .update({ quantity_remaining: next })
          .eq("id", (r as any).id);

        if (upErr) return json(500, { error: "Falha ao consumir créditos" });
        remaining -= take;
      }

      const orderPayload = { type: "single", quantity: qtyRequested, links: [link] };

      const { data: order, error: orderErr } = await service
        .from("store_orders")
        .insert({
          frontend_id: null,
          package_id: pkg.id,
          phone,
          customer_id: session.customerId,
          link,
          quantity: qtyRequested,
          total_price: 0,
          service_name: String(pkg.name || `Serviço ${serviceId}`),
          payment_status: "approved",
          order_status: "pending",
          order_payload: orderPayload,
        } as any)
        .select("id")
        .single();

      if (orderErr || !order?.id) return json(500, { error: "Falha ao criar pedido" });

      // Trigger fulfillment using the existing processor
      try {
        const res = await fetch(`${functionsBaseUrl}/functions/v1/store-order-process`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${functionsServiceKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ action: "process_paid_order", order_id: order.id, externalDb: body.externalDb }),
        });
        if (!res.ok) {
          console.warn("[store-customer-credits] store-order-process failed", await res.text());
        }
      } catch (e) {
        console.warn("[store-customer-credits] store-order-process call error", e);
      }

      return json(200, { ok: true, order_id: order.id });
    }

    return json(400, { error: "Ação inválida" });
  } catch (err) {
    console.error("[store-customer-credits] error", err);
    return json(500, { error: "Erro interno" });
  }
});
