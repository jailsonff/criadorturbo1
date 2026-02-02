import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

type PixPaymentRequest = {
  amount?: number;
  description?: string;
  email?: string;
  action?: "check_status" | "get_qr";
  payment_id?: string;
  order_id?: string;
  // Used to create a durable payment intent even if the pending order gets deleted later
  phone?: string;
  package_id?: string;
  externalDb?: { url: string; serviceRoleKey: string };
};

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const body: PixPaymentRequest = await req.json();
    const { amount, description, email, action, payment_id, order_id, externalDb } = body;

    const accessToken = Deno.env.get("MERCADOPAGO_ACCESS_TOKEN");
    if (!accessToken) {
      console.error("MERCADOPAGO_ACCESS_TOKEN not configured in secrets");
      return new Response(JSON.stringify({ error: "Token do MercadoPago não configurado no sistema" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // =========================
    // CHECK STATUS
    // =========================
    if (action === "check_status") {
      if (!payment_id) {
        return new Response(JSON.stringify({ error: "payment_id é obrigatório" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      console.log("Checking payment status for ID:", payment_id);

      const response = await fetch(`https://api.mercadopago.com/v1/payments/${payment_id}`, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });

      const data = await response.json();

      if (!response.ok) {
        console.error("MercadoPago API error (check_status):", data);
        return new Response(JSON.stringify({ error: "Erro ao verificar pagamento", details: data }), {
          status: response.status,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const status: string | null = data?.status ?? null;
      console.log("Payment status:", status);

      // Optional: if order_id provided, update order + trigger fulfillment when approved
      if (order_id && status === "approved") {
        const supabaseUrl = externalDb?.url || Deno.env.get("SUPABASE_URL");
        const serviceRoleKey = externalDb?.serviceRoleKey || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

        if (!supabaseUrl || !serviceRoleKey) {
          console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
        } else {
          const supabase = createClient(supabaseUrl, serviceRoleKey, {
            auth: { persistSession: false, autoRefreshToken: false },
          });

          // Fetch the order and verify it matches payment_id and is still pending
          const { data: order, error: orderErr } = await supabase
            .from("store_orders")
            .select("id, payment_id, payment_status, order_status, external_order_id, external_order_ids")
            .eq("id", order_id)
            .maybeSingle();

          if (orderErr) {
            console.error("Error fetching order for check_status:", orderErr);
          } else if (!order) {
            console.warn("Order not found for order_id:", order_id);
          } else if (String(order.payment_id) !== String(payment_id)) {
            console.warn("Payment ID mismatch for order:", { order_id, orderPaymentId: order.payment_id, payment_id });
          } else if (
            order.payment_status === "approved" ||
            order.order_status === "completed" ||
            order.external_order_id ||
            order.external_order_ids
          ) {
            // CRITICAL: Skip if already approved/completed/has external ids to prevent duplicate orders
            console.log("Order already processed or processing, skipping to prevent duplication:", {
              order_id,
              payment_status: order.payment_status,
              order_status: order.order_status,
              external_order_id: order.external_order_id,
              external_order_ids: order.external_order_ids,
            });
          } else if (order.payment_status !== "pending") {
            console.log("Order payment status is not pending, skipping:", { order_id, payment_status: order.payment_status });
          } else {
            // CRITICAL: Use atomic update with condition to prevent race conditions
            // Only update if payment_status is still "pending" (atomic lock)
            console.log("Attempting atomic lock for order fulfillment:", order_id);

            // IMPORTANT: Do NOT set order_status here.
            // store-order-process is responsible for atomically transitioning order_status to "processing".
            const { data: updateResult, error: updErr } = await supabase
              .from("store_orders")
              .update({ payment_status: "approved" })
              .eq("id", order_id)
              .eq("payment_status", "pending") // Atomic condition - only update if still pending
              .select("id")
              .maybeSingle();

            if (updErr) {
              console.error("Error updating order status:", updErr);
            } else if (!updateResult) {
              // No row was updated = another request already processed this
              console.log("Order was already claimed by another request, skipping:", order_id);
            } else {
              // Successfully claimed the order, now trigger processing
              console.log("Successfully claimed order, triggering fulfillment:", order_id);

              try {
                // @ts-ignore - EdgeRuntime exists in edge runtime
                EdgeRuntime.waitUntil(
                  supabase.functions.invoke("store-order-process", {
                    body: { order_id, action: "process_paid_order", externalDb },
                  })
                );
              } catch (e) {
                console.error("Error scheduling store-order-process:", e);
              }
            }
          }
        }
      }

      return new Response(
        JSON.stringify({
          id: data.id,
          status,
          status_detail: data.status_detail,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // =========================
    // GET QR (RESUME PAYMENT)
    // =========================
    if (action === "get_qr") {
      if (!payment_id) {
        return new Response(JSON.stringify({ error: "payment_id é obrigatório" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      console.log("Fetching PIX QR for payment ID:", payment_id);

      const response = await fetch(`https://api.mercadopago.com/v1/payments/${payment_id}`, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });

      const data = await response.json();

      if (!response.ok) {
        console.error("MercadoPago API error (get_qr):", data);
        return new Response(JSON.stringify({ error: "Erro ao buscar dados do pagamento", details: data }), {
          status: response.status,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const pixData = {
        payment_id: data.id,
        status: data.status,
        status_detail: data.status_detail,
        qr_code: data.point_of_interaction?.transaction_data?.qr_code,
        qr_code_base64: data.point_of_interaction?.transaction_data?.qr_code_base64,
        ticket_url: data.point_of_interaction?.transaction_data?.ticket_url,
        expiration_date: data.date_of_expiration,
      };

      return new Response(JSON.stringify(pixData), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // =========================
    // CREATE PIX PAYMENT
    // =========================
    console.log("Creating PIX payment for amount:", amount);

    if (!amount || amount <= 0) {
      console.error("Invalid amount:", amount);
      return new Response(JSON.stringify({ error: "Valor inválido" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Mercado Pago needs a PUBLIC URL to call our webhook.
    // SUPABASE_URL is like: https://<project-ref>.supabase.co
    // Edge Functions live at: https://<project-ref>.functions.supabase.co/<function-name>
    let notificationUrl: string | undefined;
    try {
      const base = Deno.env.get("SUPABASE_URL") || "";
      if (base) {
        const host = new URL(base).hostname; // <ref>.supabase.co
        const projectRef = host.split(".")[0];
        if (projectRef) notificationUrl = `https://${projectRef}.functions.supabase.co/mercadopago-webhook`;
      }
    } catch {
      notificationUrl = undefined;
    }

    const paymentData = {
      transaction_amount: amount,
      description: description || "Pagamento - SMM Panel",
      payment_method_id: "pix",
      payer: {
        email: email || "cliente@email.com",
      },
      // Ensure Mercado Pago notifies our backend immediately after payment confirmation
      ...(notificationUrl ? { notification_url: notificationUrl } : {}),
      ...(order_id ? { external_reference: String(order_id), metadata: { order_id: String(order_id) } } : {}),
    };

    console.log("Sending request to MercadoPago API...");

    const response = await fetch("https://api.mercadopago.com/v1/payments", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
        "X-Idempotency-Key": crypto.randomUUID(),
      },
      body: JSON.stringify(paymentData),
    });

    const data = await response.json();

    if (!response.ok) {
      console.error("MercadoPago API error (create_payment):", data);
      return new Response(
        JSON.stringify({
          error: data.message || "Erro ao criar pagamento PIX",
          details: data,
        }),
        { status: response.status, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("PIX payment created successfully, ID:", data.id);

    // Persist intent details (best-effort) so we can credit the customer if the pending order is later deleted.
    try {
      const phone = String(body.phone || "").replace(/\D/g, "");
      const packageId = String(body.package_id || "");

      if (phone && packageId && order_id) {
        const supabaseUrl = externalDb?.url || Deno.env.get("SUPABASE_URL")!;
        const serviceRoleKey = externalDb?.serviceRoleKey || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

        const service = createClient(supabaseUrl, serviceRoleKey, {
          auth: { persistSession: false, autoRefreshToken: false },
        });

        await service.from("store_payment_intents").upsert(
          {
            payment_id: String(data.id),
            order_id: String(order_id),
            phone,
            package_id: packageId,
            total_price: Number(amount) || 0,
            payment_provider: "mercadopago",
          } as any,
          { onConflict: "payment_id" }
        );
      }
    } catch (e) {
      console.warn("[mercadopago-pix] failed to persist store_payment_intents (non-blocking)", e);
    }

    const pixData = {
      payment_id: data.id,
      status: data.status,
      qr_code: data.point_of_interaction?.transaction_data?.qr_code,
      qr_code_base64: data.point_of_interaction?.transaction_data?.qr_code_base64,
      ticket_url: data.point_of_interaction?.transaction_data?.ticket_url,
      expiration_date: data.date_of_expiration,
    };

    return new Response(JSON.stringify(pixData), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error processing request:", error);
    return new Response(JSON.stringify({ error: "Erro interno ao processar requisição" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
