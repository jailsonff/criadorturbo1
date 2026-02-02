import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type ReqBody = {
  pairs: Array<{ service_id: number; link: string }>;
  activeStatuses?: string[];
  externalDb?: { url: string; serviceRoleKey: string };
};

type Match = {
  service_id: number;
  normalized_link: string;
  status: string;
  order_id: string;
};

function normalizeLink(input: string) {
  return String(input || "")
    .trim()
    .replace(/\s+/g, "")
    .replace(/\/+$/g, "")
    .toLowerCase();
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const body: ReqBody = await req.json();
    const pairs = Array.isArray(body.pairs) ? body.pairs : [];
    const activeStatuses = (body.activeStatuses && body.activeStatuses.length
      ? body.activeStatuses
      : ["pending", "processing", "partial", "in_progress"])
      .map((s) => String(s || "").trim().toLowerCase())
      .filter(Boolean);

    // Create client (default backend or external DB)
    const supabaseUrl = body.externalDb?.url || Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = body.externalDb?.serviceRoleKey || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !serviceRoleKey) {
      return new Response(JSON.stringify({ error: "Backend não configurado" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const normalizedPairs = pairs
      .map((p) => ({
        service_id: Number(p?.service_id) || 0,
        normalized_link: normalizeLink(String(p?.link || "")),
      }))
      .filter((p) => p.service_id > 0 && !!p.normalized_link);

    if (normalizedPairs.length === 0) {
      return new Response(JSON.stringify({ blocked: false }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Batch query: for each pair, see if there is any active row
    // NOTE: PostgREST doesn't support composite IN, so we do an OR chain with small payload.
    // IMPORTANT: Do NOT pre-encode values here.
    // supabase-js will URL-encode the full `.or(...)` filter string.
    // Pre-encoding breaks matching for URLs (e.g. https://...) and causes false negatives.
    // PostgREST `.or()` filter uses `.` as a delimiter. Since URLs contain dots, we must
    // quote the string value, otherwise it gets parsed incorrectly and won't match.
    // JSON.stringify produces a safely quoted string (e.g. "https://...").
    const or = normalizedPairs
      .map((p) => `and(service_id.eq.${p.service_id},normalized_link.eq.${JSON.stringify(p.normalized_link)})`)
      .join(",");

    // NOTE: We intentionally do NOT filter by status at DB level.
    // Some installs may store status with different casing/spacing.
    // We'll normalize and filter in code to avoid false negatives.
    const { data, error } = await supabase
      .from("store_order_links")
      .select("service_id, normalized_link, status, order_id")
      .or(or)
      .limit(50);

    if (error) {
      console.error("[store-order-duplicate-check] query error:", error);
      return new Response(JSON.stringify({ error: "Erro ao validar duplicidade" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const rawMatches: Match[] = (data as any) || [];
    const matches: Match[] = rawMatches.filter((m: any) => {
      const st = String(m?.status || "").trim().toLowerCase();
      // Treat missing/blank status as active (fail-safe)
      if (!st) return true;
      return activeStatuses.includes(st);
    });

    return new Response(
      JSON.stringify({
        blocked: (matches?.length || 0) > 0,
        matches: (matches || []).map((m) => ({
          service_id: Number((m as any)?.service_id) || 0,
          normalized_link: String((m as any)?.normalized_link || ""),
          status: String((m as any)?.status || ""),
          order_id: String((m as any)?.order_id || ""),
        })),
      }),
      {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  } catch (e) {
    console.error("[store-order-duplicate-check] error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
