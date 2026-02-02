import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

type Body = {
  source?: string;
  event_name?: string;
  checkout_req_id?: string;
  frontend_id?: string | null;
  package_id?: string | null;
  order_id?: string | null;
  mode?: string | null;
  phone_masked?: string | null;
  phone_last4?: string | null;
  phone_len?: number | null;
  user_agent?: string | null;
  url?: string | null;
  message?: string | null;
  error_json?: unknown;
  retention_days?: number;
};

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function clampStr(v: unknown, maxLen: number) {
  const s = String(v ?? "").trim();
  if (!s) return null;
  return s.length > maxLen ? s.slice(0, maxLen) : s;
}

function clampInt(v: unknown, min: number, max: number) {
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  return Math.max(min, Math.min(max, Math.trunc(n)));
}

function safeJson(v: unknown) {
  try {
    // Keep payload small-ish; stringify then parse to ensure JSON-serializable
    const s = JSON.stringify(v);
    if (!s) return null;
    // ~16KB max
    const trimmed = s.length > 16_000 ? s.slice(0, 16_000) : s;
    return JSON.parse(trimmed);
  } catch {
    return null;
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const body = (await req.json().catch(() => ({}))) as Body;

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !serviceRoleKey) {
      return json(500, { error: "Backend não configurado" });
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const retentionDays = clampInt(body.retention_days, 1, 90) ?? 7;

    const row = {
      source: clampStr(body.source, 40) ?? "storefront",
      event_name: clampStr(body.event_name, 80) ?? "checkout_error",
      checkout_req_id: clampStr(body.checkout_req_id, 80),
      frontend_id: clampStr(body.frontend_id, 60),
      package_id: clampStr(body.package_id, 60),
      order_id: clampStr(body.order_id, 60),
      mode: clampStr(body.mode, 20),
      phone_masked: clampStr(body.phone_masked, 30),
      phone_last4: clampStr(body.phone_last4, 8),
      phone_len: clampInt(body.phone_len, 0, 30),
      user_agent: clampStr(body.user_agent, 300),
      url: clampStr(body.url, 300),
      message: clampStr(body.message, 500),
      error_json: safeJson(body.error_json),
    };

    // Best-effort cleanup before insert (non-blocking).
    try {
      await supabase.rpc("cleanup_store_client_error_logs", { retention_days: retentionDays });
    } catch {
      // ignore
    }

    const { error } = await supabase.from("store_client_error_logs").insert(row as any);
    if (error) {
      return json(500, { error: "Falha ao salvar log", details: error });
    }

    return json(200, { ok: true });
  } catch (e) {
    console.error("[store-client-log] error", e);
    return json(500, { error: "Erro interno" });
  }
});
