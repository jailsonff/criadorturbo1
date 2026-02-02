import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

type Action = "list" | "redeem";

type Body = {
  action: Action;
  phone?: string;
  token?: string;
  package_id?: string;
  expected_amount?: number;
  // order fields
  frontend_id?: string | null;
  link?: string;
  quantity?: number;
  service_name?: string;
  order_payload?: unknown;
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
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const body = (await req.json().catch(() => ({}))) as Body;
    const action = body.action;
    if (action !== "list" && action !== "redeem") return json(400, { error: "Ação inválida" });

    // IMPORTANT: externalDb is only for DB access. The function endpoint is always this project's backend.
    const dbUrl = body.externalDb?.url || Deno.env.get("SUPABASE_URL")!;
    const serviceKey = body.externalDb?.serviceRoleKey || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const functionsDbUrl = Deno.env.get("SUPABASE_URL")!;
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
      const { data: rows, error } = await service
        .from("store_package_credits")
        .select("package_id, amount")
        .eq("phone", phone)
        .eq("status", "available")
        .gt("amount", 0);

      if (error) return json(500, { error: "Falha ao buscar saldo" });

      const list = Array.isArray(rows) ? rows : [];
      const byPackage = new Map<string, number>();
      for (const r of list) {
        const pid = String((r as any)?.package_id || "");
        const amt = Number((r as any)?.amount) || 0;
        if (!pid || amt <= 0) continue;
        byPackage.set(pid, (byPackage.get(pid) || 0) + amt);
      }

      const packageIds = Array.from(byPackage.keys());
      const nameMap: Record<string, string> = {};
      if (packageIds.length > 0) {
        const { data: pkgs } = await service.from("store_packages").select("id, name").in("id", packageIds);
        (pkgs || []).forEach((p: any) => {
          const k = String(p?.id || "");
          if (k) nameMap[k] = String(p?.name || "");
        });
      }

      const credits = packageIds.map((pid) => ({
        package_id: pid,
        package_name: nameMap[pid] || "Pacote",
        amount: byPackage.get(pid) || 0,
        currency: "BRL",
      }));

      const total = credits.reduce((sum, c) => sum + (Number(c.amount) || 0), 0);
      return json(200, { total, credits });
    }

    // action === "redeem"
    const packageId = String(body.package_id || "").trim();
    if (!packageId) return json(400, { error: "package_id obrigatório" });

    const expectedAmount = Math.max(0, Number(body.expected_amount) || 0);

    const frontendId = body.frontend_id === undefined ? null : (body.frontend_id as any);
    const link = String(body.link || "").trim();
    const quantity = Math.max(1, Math.floor(Number(body.quantity) || 0));
    const serviceName = String(body.service_name || "").trim() || "Pedido";
    const orderPayload = body.order_payload ?? null;

    if (!link) return json(400, { error: "Link obrigatório" });
    if (quantity <= 0) return json(400, { error: "Quantidade inválida" });

    // Pick one available credit for this package
    const { data: credit, error: creditErr } = await service
      .from("store_package_credits")
      .select("id, amount, status")
      .eq("phone", phone)
      .eq("package_id", packageId)
      .eq("status", "available")
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();

    if (creditErr) return json(500, { error: "Falha ao validar saldo" });
    if (!credit?.id) return json(400, { error: "Sem saldo disponível para este pacote" });

    if (expectedAmount > 0 && (Number((credit as any)?.amount) || 0) < expectedAmount) {
      return json(400, { error: "Saldo insuficiente para este pacote" });
    }

    // Atomic consume (claim)
    const { data: claimed, error: claimErr } = await service
      .from("store_package_credits")
      .update({ status: "redeemed", redeemed_at: new Date().toISOString() })
      .eq("id", String(credit.id))
      .eq("status", "available")
      .select("id, amount")
      .maybeSingle();

    if (claimErr) return json(500, { error: "Falha ao consumir saldo" });
    if (!claimed?.id) return json(409, { error: "Saldo já foi usado" });

    // Create a $0 order and process it (the payment was already captured; we are fulfilling using the credit)
    const orderInsert = {
      frontend_id: frontendId,
      package_id: packageId,
      phone,
      customer_id: session.customerId,
      link,
      quantity,
      total_price: 0,
      service_name: serviceName,
      payment_status: "approved",
      order_status: "pending",
      order_payload: orderPayload,
      payment_id: `credit:${String(claimed.id)}`,
    } as any;

    const { data: order, error: orderErr } = await service
      .from("store_orders")
      .insert(orderInsert)
      .select("id")
      .single();

    if (orderErr || !order?.id) {
      // Best-effort rollback to allow retry
      try {
        await service.from("store_package_credits").update({ status: "available", redeemed_at: null }).eq("id", String(claimed.id));
      } catch {
        // ignore
      }
      return json(500, { error: "Falha ao criar pedido" });
    }

    try {
      await service
        .from("store_package_credits")
        .update({ redeemed_order_id: String(order.id) })
        .eq("id", String(claimed.id));
    } catch {
      // non-blocking
    }

    // Trigger fulfillment on THIS project's backend (even if DB is external)
    try {
      const functionsClient = createClient(functionsDbUrl, functionsServiceKey, {
        auth: { persistSession: false, autoRefreshToken: false },
      });

      // @ts-ignore - EdgeRuntime exists in edge runtime
      EdgeRuntime.waitUntil(
        functionsClient.functions.invoke("store-order-process", {
          body: { action: "process_paid_order", order_id: String(order.id), externalDb: body.externalDb },
        })
      );
    } catch (e) {
      console.warn("[store-package-credits] store-order-process schedule failed", e);
    }

    return json(200, { ok: true, order_id: String(order.id), amount: Number(claimed.amount) || 0 });
  } catch (e) {
    console.error("[store-package-credits] error", e);
    return json(500, { error: "Erro interno" });
  }
});
