import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Mercado Pago sends different shapes depending on the integration.
// We only need the payment id; if signature validation is not available, we validate by querying MP API.
function extractPaymentId(payload: any, url: URL): string | null {
  // Most common: { data: { id } }
  const fromData = payload?.data?.id;
  if (fromData) return String(fromData);

  // Some events: { resource: 'https://api.mercadopago.com/v1/payments/{id}', topic: 'payment' }
  const resource = payload?.resource;
  if (typeof resource === "string") {
    const m = resource.match(/\/v1\/payments\/(\d+)/);
    if (m?.[1]) return m[1];
  }

  // Some callbacks: query params: ?id=... or ?data.id=...
  const qpId = url.searchParams.get("id") || url.searchParams.get("data.id");
  if (qpId) return String(qpId);

  return null;
}

serve(async (req) => {
  // Webhooks are server-to-server; allow OPTIONS for safety.
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const accessToken = Deno.env.get("MERCADOPAGO_ACCESS_TOKEN");
    if (!accessToken) {
      console.error("[mercadopago-webhook] MERCADOPAGO_ACCESS_TOKEN missing");
      return new Response(JSON.stringify({ error: "Token do MercadoPago não configurado" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const url = new URL(req.url);
    const raw = await req.text();
    let payload: any = {};
    try {
      payload = raw ? JSON.parse(raw) : {};
    } catch {
      payload = {};
    }

    const paymentId = extractPaymentId(payload, url);
    console.log("[mercadopago-webhook] received", { paymentId, topic: payload?.topic, type: payload?.type });

    if (!paymentId) {
      // Acknowledge to avoid retries storm
      return new Response(JSON.stringify({ ok: true, ignored: true, reason: "no_payment_id" }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Confirm real status via MercadoPago API (this is our validation layer)
    const mpResp = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
      method: "GET",
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    const mp = await mpResp.json();
    if (!mpResp.ok) {
      console.error("[mercadopago-webhook] MP fetch failed", { paymentId, mp });
      // Still 200 to prevent retries loops; we will reconcile later.
      return new Response(JSON.stringify({ ok: false, paymentId, error: "mp_fetch_failed" }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const status: string | null = mp?.status ?? null;
    if (status !== "approved") {
      return new Response(JSON.stringify({ ok: true, paymentId, status }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    // Find order by payment_id (preferred) OR by external_reference/metadata (race-safe)
    const { data: orderByPaymentId, error: orderErr } = await supabase
      .from("store_orders")
      .select("id, payment_id, payment_status, order_status, external_order_id, external_order_ids")
      .eq("payment_id", String(paymentId))
      .maybeSingle();

    if (orderErr) {
      console.error("[mercadopago-webhook] order lookup failed", orderErr);
      return new Response(JSON.stringify({ ok: false, paymentId, error: "order_lookup_failed" }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let order = orderByPaymentId;

    // Race condition: payment can be approved before frontend saves payment_id into store_orders.
    // When creating PIX, we also set external_reference/metadata.order_id.
    if (!order) {
      const orderIdFromMp = (mp?.external_reference || mp?.metadata?.order_id) as string | undefined;
      if (orderIdFromMp) {
        const { data: orderById, error: orderByIdErr } = await supabase
          .from("store_orders")
          .select("id, payment_id, payment_status, order_status, external_order_id, external_order_ids")
          .eq("id", orderIdFromMp)
          .maybeSingle();

        if (orderByIdErr) {
          console.error("[mercadopago-webhook] order lookup by id failed", { orderIdFromMp, orderByIdErr });
        } else if (orderById) {
          // Attach payment_id if it wasn't saved yet (race fix)
          if (!orderById.payment_id) {
            await supabase.from("store_orders").update({ payment_id: String(paymentId) }).eq("id", orderById.id);
          }
          order = orderById;
        }
      }
    }

    if (!order) {
      // Order may have been deleted (admin cleanup) or not associated yet (race).
      // If we have a stored payment intent, create a package credit for the customer.
      try {
        const { data: intent, error: intentErr } = await supabase
          .from("store_payment_intents")
          .select("payment_id, phone, package_id, total_price, order_id")
          .eq("payment_id", String(paymentId))
          .maybeSingle();

        if (intentErr) {
          console.error("[mercadopago-webhook] intent lookup failed", intentErr);
        }

        if (intent?.payment_id && intent.phone && intent.package_id) {
          const creditPayload = {
            phone: String(intent.phone),
            package_id: String(intent.package_id),
            amount: Number(intent.total_price) || 0,
            currency: "BRL",
            status: "available",
            source_payment_id: String(paymentId),
            source_order_id: intent.order_id ? String(intent.order_id) : null,
          };

          // Idempotent: unique index on source_payment_id prevents duplicates.
          const { error: creditErr } = await supabase
            .from("store_package_credits")
            .insert(creditPayload as any);

          if (creditErr) {
            // Duplicate credit attempts should not fail the webhook.
            const msg = String((creditErr as any)?.message || "");
            if (!msg.toLowerCase().includes("duplicate") && !msg.toLowerCase().includes("unique")) {
              console.error("[mercadopago-webhook] credit insert failed", creditErr);
            }
          } else {
            console.log("[mercadopago-webhook] created store_package_credits from late payment", {
              paymentId,
              phone: intent.phone,
              package_id: intent.package_id,
              amount: intent.total_price,
            });
          }

          return new Response(JSON.stringify({ ok: true, paymentId, status: "approved", orderFound: false, credited: true }), {
            status: 200,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
      } catch (e) {
        console.error("[mercadopago-webhook] late-payment credit flow failed", e);
      }

      // No intent found: acknowledge and let reconcile handle the rest.
      return new Response(JSON.stringify({ ok: true, paymentId, status: "approved", orderFound: false, credited: false }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Avoid duplicates
    if (
      order.payment_status === "approved" ||
      order.order_status === "completed" ||
      order.external_order_id ||
      order.external_order_ids
    ) {
      return new Response(
        JSON.stringify({ ok: true, paymentId, status: "approved", order_id: order.id, skipped: true }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Atomic approve
    const { data: upd, error: updErr } = await supabase
      .from("store_orders")
      .update({ payment_status: "approved" })
      .eq("id", order.id)
      .eq("payment_status", "pending")
      .select("id")
      .maybeSingle();

    if (updErr) {
      console.error("[mercadopago-webhook] approve update failed", updErr);
      return new Response(JSON.stringify({ ok: false, paymentId, order_id: order.id, error: "approve_update_failed" }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (upd) {
      try {
        // @ts-ignore - EdgeRuntime exists in edge runtime
        EdgeRuntime.waitUntil(
          supabase.functions.invoke("store-order-process", {
            body: { order_id: order.id, action: "process_paid_order" },
          })
        );
      } catch (e) {
        console.error("[mercadopago-webhook] Error scheduling store-order-process:", e);
      }
    }

    return new Response(
      JSON.stringify({ ok: true, paymentId, status: "approved", order_id: order.id, updated: Boolean(upd) }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("[mercadopago-webhook] Unexpected error", e);
    // Return 200 to prevent webhook retry storms; reconcile covers missed ones.
    return new Response(JSON.stringify({ ok: false, error: "unexpected" }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
