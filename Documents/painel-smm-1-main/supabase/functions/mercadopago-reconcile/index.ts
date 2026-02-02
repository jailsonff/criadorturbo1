import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type ReconcileRequest = {
  hours?: number;
  limit?: number;
  phone?: string;
  order_id?: string;
  externalDb?: { url: string; serviceRoleKey: string };
};

function getAuthHeader(req: Request) {
  return req.headers.get("Authorization") || "";
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const accessToken = Deno.env.get("MERCADOPAGO_ACCESS_TOKEN");
    if (!accessToken) {
      return new Response(JSON.stringify({ error: "Token do MercadoPago não configurado no sistema" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body: ReconcileRequest = await req.json().catch(() => ({}));
    const hours = Math.min(168, Math.max(1, Number(body.hours ?? 48) || 48));
    const limit = Math.min(200, Math.max(1, Number(body.limit ?? 50) || 50));

    const supabaseUrl = body.externalDb?.url || Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = body.externalDb?.serviceRoleKey || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Auth check (admin only)
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const authed = createClient(supabaseUrl, anonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { Authorization: getAuthHeader(req) } },
    });

    const { data: userData, error: userErr } = await authed.auth.getUser();
    if (userErr || !userData?.user) {
      return new Response(JSON.stringify({ error: "Não autenticado" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: roleRow } = await authed
      .from("user_roles")
      .select("role")
      .eq("user_id", userData.user.id)
      .maybeSingle();

    if (!roleRow || roleRow.role !== "admin") {
      return new Response(JSON.stringify({ error: "Sem permissão" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const sinceIso = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();

    let query = admin
      .from("store_orders")
      .select("id, phone, payment_id, payment_status, order_status, external_order_id, external_order_ids, created_at")
      .eq("payment_status", "pending")
      .gte("created_at", sinceIso)
      .not("payment_id", "is", null)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (body.phone) query = query.eq("phone", String(body.phone).replace(/\D/g, ""));
    if (body.order_id) query = query.eq("id", body.order_id);

    const { data: orders, error: ordersErr } = await query;
    if (ordersErr) {
      console.error("[mercadopago-reconcile] Error fetching pending orders:", ordersErr);
      return new Response(JSON.stringify({ error: "Erro ao buscar pedidos pendentes" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const list = orders || [];
    console.log(`[mercadopago-reconcile] Checking ${list.length} pending payments (since ${sinceIso})`);

    let checked = 0;
    let approved = 0;
    let updated = 0;
    let alreadyApproved = 0;
    const results: any[] = [];

    for (const o of list) {
      const paymentId = String((o as any).payment_id || "");
      if (!paymentId) continue;

      checked++;

      const resp = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
        method: "GET",
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      const mp = await resp.json();
      if (!resp.ok) {
        results.push({ order_id: o.id, payment_id: paymentId, ok: false, error: mp });
        continue;
      }

      const status: string | null = mp?.status ?? null;
      if (status === "approved") {
        approved++;

        // If it was already processed, don't touch it.
        if (
          (o as any).payment_status === "approved" ||
          (o as any).order_status === "completed" ||
          (o as any).external_order_id ||
          (o as any).external_order_ids
        ) {
          alreadyApproved++;
          results.push({ order_id: o.id, payment_id: paymentId, ok: true, status: "approved", skipped: true });
          continue;
        }

        const { data: upd, error: updErr } = await admin
          .from("store_orders")
          .update({ payment_status: "approved" })
          .eq("id", o.id)
          .eq("payment_status", "pending")
          .select("id")
          .maybeSingle();

        if (updErr) {
          console.error("[mercadopago-reconcile] update failed:", updErr);
          results.push({ order_id: o.id, payment_id: paymentId, ok: false, status: "approved", error: updErr });
          continue;
        }

        if (upd) {
          updated++;
          try {
            // @ts-ignore - EdgeRuntime exists in edge runtime
            EdgeRuntime.waitUntil(
              admin.functions.invoke("store-order-process", {
                body: { order_id: o.id, action: "process_paid_order", externalDb: body.externalDb },
              })
            );
          } catch (e) {
            console.error("[mercadopago-reconcile] Error scheduling store-order-process:", e);
          }
        }

        results.push({ order_id: o.id, payment_id: paymentId, ok: true, status: "approved", updated: Boolean(upd) });
      } else {
        results.push({ order_id: o.id, payment_id: paymentId, ok: true, status });
      }
    }

    return new Response(
      JSON.stringify({
        since: sinceIso,
        limit,
        checked,
        approved,
        updated,
        alreadyApproved,
        results,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("[mercadopago-reconcile] Unexpected error:", e);
    return new Response(JSON.stringify({ error: "Erro interno" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
