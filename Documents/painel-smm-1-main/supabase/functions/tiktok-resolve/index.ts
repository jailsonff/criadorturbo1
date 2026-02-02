// Lovable Cloud Function: resolve TikTok shortened URLs (vt.tiktok.com) to canonical tiktok.com/@user/video/<id>

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function looksLikeTikTokUrl(input: string) {
  const s = String(input || "").trim().toLowerCase();
  return s.includes("tiktok.com");
}

function toCanonicalTikTokUrl(resolved: string): string {
  try {
    const u = new URL(resolved);
    const host = "www.tiktok.com";

     // TikTok sometimes redirects unauthenticated requests to /login with a redirect_url
     // that contains the actual video URL. Prefer extracting that.
     if (u.pathname === "/login") {
       const redirectUrl = u.searchParams.get("redirect_url");
       if (redirectUrl) {
         try {
           const decoded = decodeURIComponent(redirectUrl);
           // Re-run canonicalization on the decoded target.
           return toCanonicalTikTokUrl(decoded);
         } catch {
           // Fall through to normal parsing
         }
       }
     }

    const path = u.pathname || "/";
    const parts = path.split("/").filter(Boolean);

    // Expected shapes:
    // /@user/video/123
    // /@user/video/123/...
    const atIdx = parts.findIndex((p) => p.startsWith("@"));
    const videoIdx = parts.findIndex((p) => p.toLowerCase() === "video");
    const idPart = videoIdx >= 0 ? parts[videoIdx + 1] : undefined;

    if (atIdx >= 0 && videoIdx > atIdx && idPart) {
      const username = parts[atIdx];
      const videoId = idPart.replace(/[^0-9]/g, "");
      if (username && videoId) {
        return `https://${host}/${username}/video/${videoId}`;
      }
    }

    // Fallback: remove query/hash and normalize host
    return `https://${host}${u.pathname}`;
  } catch {
    return resolved;
  }
}

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    if (req.method !== "POST") {
      return new Response(JSON.stringify({ error: "Method not allowed" }), {
        status: 405,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json().catch(() => ({}));
    const inputUrl = String(body?.url || "").trim();

    if (!inputUrl) {
      return new Response(JSON.stringify({ error: "Missing url" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!looksLikeTikTokUrl(inputUrl)) {
      return new Response(JSON.stringify({ resolvedUrl: inputUrl, canonicalUrl: inputUrl }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Ensure protocol
    const candidate = /^https?:\/\//i.test(inputUrl) ? inputUrl : `https://${inputUrl}`;

    console.log("[tiktok-resolve] resolving", candidate);

    // Follow redirects to the final URL
    const res = await fetch(candidate, {
      redirect: "follow",
      headers: {
        // Some endpoints behave better with a UA
        "user-agent": "Mozilla/5.0 (Lovable Cloud) AppleWebKit/537.36",
        "accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      },
    });

    const resolvedUrl = res.url || candidate;
    const canonicalUrl = toCanonicalTikTokUrl(resolvedUrl);

    console.log("[tiktok-resolve] resolved", { resolvedUrl, canonicalUrl });

    return new Response(JSON.stringify({ resolvedUrl, canonicalUrl }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("[tiktok-resolve] error", e);
    return new Response(JSON.stringify({ error: "Failed to resolve link" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
