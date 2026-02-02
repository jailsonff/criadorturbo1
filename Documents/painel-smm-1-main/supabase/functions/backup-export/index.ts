import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Tables to export (in order of dependencies)
const EXPORT_TABLES = [
  "landing_content",
  "site_settings",
  "terms_content",
  "privacy_content",
  "ai_providers",
  "ai_agents",
  "seo_actions",
  "smm_providers",
  "imported_services",
  "service_customizations",
  "category_display_order",
  "category_icons",
  "platform_icons",
  "platform_category_links",
  "store_frontends",
  "store_packages",
  "profiles",
  "user_roles",
  "orders",
  "store_orders",
  "refills",
  "balance_history",
  "support_tickets",
  "ticket_messages",
  "favorite_services",
  "api_keys",
];

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Get Supabase URL and Service Role Key from request or environment
    const { externalUrl, serviceRoleKey } = await req.json();
    
    const supabaseUrl = externalUrl || Deno.env.get("SUPABASE_URL");
    const supabaseServiceKey = serviceRoleKey || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !supabaseServiceKey) {
      return new Response(
        JSON.stringify({ success: false, error: "Missing Supabase credentials" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const backup: Record<string, any[]> = {};
    const errors: string[] = [];

    // Export each table
    for (const tableName of EXPORT_TABLES) {
      try {
        const { data, error } = await supabase.from(tableName).select("*");
        if (error) {
          // Table might not exist, skip it
          if (error.code === "42P01" || error.message?.includes("does not exist")) {
            backup[tableName] = [];
            continue;
          }
          errors.push(`${tableName}: ${error.message}`);
          backup[tableName] = [];
        } else {
          backup[tableName] = data || [];
        }
      } catch (e: any) {
        errors.push(`${tableName}: ${e.message}`);
        backup[tableName] = [];
      }
    }

    // Export storage files
    const storageBackup: Record<string, any[]> = {};
    const storageBuckets = ["site-assets", "category-icons"];

    for (const bucket of storageBuckets) {
      try {
        const { data: files, error } = await supabase.storage.from(bucket).list("", {
          limit: 1000,
          sortBy: { column: "name", order: "asc" },
        });

        if (error) {
          console.error(`Storage bucket ${bucket} error:`, error);
          storageBackup[bucket] = [];
          continue;
        }

        const filesWithData: any[] = [];
        for (const file of files || []) {
          if (file.name && !file.id?.includes("folder")) {
            try {
              const { data: fileData } = await supabase.storage.from(bucket).download(file.name);
              if (fileData) {
                const base64 = await blobToBase64(fileData);
                filesWithData.push({
                  name: file.name,
                  type: fileData.type,
                  data: base64,
                });
              }
            } catch (e) {
              console.error(`Error downloading ${file.name}:`, e);
            }
          }
        }
        storageBackup[bucket] = filesWithData;
      } catch (e: any) {
        console.error(`Storage bucket ${bucket} error:`, e);
        storageBackup[bucket] = [];
      }
    }

    // Export auth users (only if using service role key)
    let authUsers: any[] = [];
    try {
      const { data: listData } = await supabase.auth.admin.listUsers({ perPage: 1000 });
      if (listData?.users) {
        authUsers = listData.users.map((u: any) => ({
          id: u.id,
          email: u.email,
          phone: u.phone,
          email_confirmed_at: u.email_confirmed_at,
          user_metadata: u.user_metadata,
          created_at: u.created_at,
        }));
      }
    } catch (e) {
      console.error("Error exporting auth users:", e);
    }

    const exportData = {
      version: "1.0",
      exportedAt: new Date().toISOString(),
      tables: backup,
      storage: storageBackup,
      authUsers,
      errors: errors.length > 0 ? errors : undefined,
    };

    return new Response(
      JSON.stringify({ success: true, data: exportData }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("Export error:", error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
    );
  }
});

async function blobToBase64(blob: Blob): Promise<string> {
  const buffer = await blob.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}
