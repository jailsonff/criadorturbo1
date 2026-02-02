import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type Body = {
  bucket: string;
  path: string;
  base64: string; // raw base64 (no data: prefix)
  contentType?: string;
  // When the app is configured to use an external backend/database, we still call this
  // function on Lovable Cloud, but authenticate/authorize using the external project.
  externalUrl?: string;
  externalAnonKey?: string;
  serviceRoleKey?: string;
};

function base64ToUint8Array(base64: string): Uint8Array {
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) bytes[i] = binaryString.charCodeAt(i);
  return bytes;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    if (req.method !== "POST") {
      return new Response(JSON.stringify({ success: false, error: "Method not allowed" }), {
        status: 405,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const authHeader = req.headers.get("authorization") || req.headers.get("Authorization") || "";
    if (!authHeader.toLowerCase().startsWith("bearer ")) {
      return new Response(JSON.stringify({ success: false, error: "Missing Authorization header" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = (await req.json()) as Body;
    if (!body?.bucket || !body?.path || !body?.base64) {
      return new Response(JSON.stringify({ success: false, error: "Missing bucket/path/base64" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // 1) Authenticate request user
    // If the app is pointing to an external project, the user's JWT is issued by that project.
    // So we must validate the JWT against the same project (externalUrl/externalAnonKey).
    const authUrl = body.externalUrl || SUPABASE_URL;
    const authAnonKey = body.externalAnonKey || SUPABASE_ANON_KEY;

    const authClient = createClient(authUrl, authAnonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { Authorization: authHeader } },
    });

    const { data: userData, error: userError } = await authClient.auth.getUser();
    const user = userData?.user;
    if (userError || !user) {
      console.error("[storage-upload] auth.getUser failed", userError);
      return new Response(JSON.stringify({ success: false, error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 2) Authorize admin (on the same project that owns the roles)
    const roleCheckUrl = body.externalUrl || SUPABASE_URL;
    const roleCheckServiceKey = body.serviceRoleKey || SUPABASE_SERVICE_ROLE_KEY;

    const serviceClient = createClient(roleCheckUrl, roleCheckServiceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: isAdmin, error: roleError } = await serviceClient.rpc("has_role", {
      _user_id: user.id,
      _role: "admin",
    });

    if (roleError) {
      console.error("[storage-upload] role check failed", roleError);
      return new Response(JSON.stringify({ success: false, error: "Role check failed" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!isAdmin) {
      return new Response(JSON.stringify({ success: false, error: "Forbidden" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 3) Upload using service role
    const targetUrl = body.externalUrl || SUPABASE_URL;
    const targetServiceKey = body.serviceRoleKey || SUPABASE_SERVICE_ROLE_KEY;

    const target = createClient(targetUrl, targetServiceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const bytes = base64ToUint8Array(body.base64);

    const { error: uploadError } = await target.storage.from(body.bucket).upload(body.path, bytes, {
      upsert: true,
      contentType: body.contentType || "application/octet-stream",
    });

    if (uploadError) {
      console.error("[storage-upload] upload error", uploadError);
      return new Response(JSON.stringify({ success: false, error: uploadError.message }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: urlData } = target.storage.from(body.bucket).getPublicUrl(body.path);

    return new Response(JSON.stringify({ success: true, publicUrl: urlData.publicUrl }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: any) {
    console.error("[storage-upload] error", error);
    return new Response(JSON.stringify({ success: false, error: error?.message || "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
