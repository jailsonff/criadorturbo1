import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type Body = {
  preserveUserId?: string;
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    const authHeader = req.headers.get("Authorization") || "";

    const supabaseAuthed = createClient(supabaseUrl, anonKey, {
      global: {
        headers: {
          Authorization: authHeader,
        },
      },
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    const { data: userData, error: userError } = await supabaseAuthed.auth.getUser();
    if (userError || !userData?.user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const callerId = userData.user.id;

    const { data: isAdmin, error: roleError } = await supabaseAuthed.rpc("has_role", {
      _user_id: callerId,
      _role: "admin",
    });

    if (roleError || !isAdmin) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = (await req.json().catch(() => ({}))) as Body;
    const preserveUserId = body.preserveUserId || callerId;

    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    // 1) Delete table data (service role bypasses RLS)
    // NOTE: Preserved tables (admin can edit manually):
    // - ai_providers, ai_agents, seo_actions (AI integrations)
    // - terms_content, privacy_content (legal pages)
    // - site_settings (SEO/marketing)
    // - landing_content (site branding)
    const tables = [
      "orders",
      "refills",
      "balance_history",
      "support_tickets",
      "imported_services",
      "service_customizations",
      "smm_providers",
      "platform_category_links",
      "platform_icons",
      "category_icons",
    ];

    const errors: string[] = [];

    for (const table of tables) {
      const { error } = await supabaseAdmin
        .from(table)
        .delete()
        .neq("id", "00000000-0000-0000-0000-000000000000");
      if (error) errors.push(`${table}: ${error.message}`);
    }

    // 2) Keep admin access but remove other roles + profiles
    {
      const { error } = await supabaseAdmin.from("user_roles").delete().neq("user_id", preserveUserId);
      if (error) errors.push(`user_roles: ${error.message}`);
    }

    {
      const { error } = await supabaseAdmin.from("profiles").delete().neq("id", preserveUserId);
      if (error) errors.push(`profiles: ${error.message}`);

      const { error: updateError } = await supabaseAdmin
        .from("profiles")
        .update({ balance: 0 })
        .eq("id", preserveUserId);
      if (updateError) errors.push(`profiles.balance: ${updateError.message}`);
    }

    // 3) Delete auth users except preserved
    const { data: listData, error: listError } = await supabaseAdmin.auth.admin.listUsers({ perPage: 1000 });
    if (listError) {
      errors.push(`auth.listUsers: ${listError.message}`);
    } else {
      const users = listData?.users || [];
      for (const u of users) {
        if (!u?.id || u.id === preserveUserId) continue;
        const { error } = await supabaseAdmin.auth.admin.deleteUser(u.id);
        if (error) errors.push(`auth.deleteUser(${u.id}): ${error.message}`);
      }
    }

    return new Response(
      JSON.stringify({
        success: errors.length === 0,
        preserveUserId,
        errors,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: unknown) {
    console.error("admin-clean error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
