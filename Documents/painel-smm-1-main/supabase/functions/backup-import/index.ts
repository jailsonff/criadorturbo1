import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Tables to import (in order of dependencies - parents first)
const IMPORT_ORDER = [
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

// Tables with single row (upsert by id)
const SINGLE_ROW_TABLES = ["landing_content", "site_settings", "terms_content", "privacy_content"];

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { externalUrl, serviceRoleKey, backupData, clearExisting } = await req.json();

    const supabaseUrl = externalUrl || Deno.env.get("SUPABASE_URL");
    const supabaseServiceKey = serviceRoleKey || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !supabaseServiceKey) {
      return new Response(
        JSON.stringify({ success: false, error: "Missing Supabase credentials" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
      );
    }

    if (!backupData || !backupData.tables) {
      return new Response(
        JSON.stringify({ success: false, error: "Invalid backup data" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const results: Record<string, { success: boolean; count: number; error?: string }> = {};

    // Clear existing data if requested (reverse order due to dependencies)
    if (clearExisting) {
      const reverseOrder = [...IMPORT_ORDER].reverse();
      for (const tableName of reverseOrder) {
        if (SINGLE_ROW_TABLES.includes(tableName)) continue; // Don't delete single-row config tables
        try {
          await supabase.from(tableName).delete().neq("id", "00000000-0000-0000-0000-000000000000");
        } catch (e) {
          console.log(`Skip clearing ${tableName}:`, e);
        }
      }
    }

    // Import tables in order
    for (const tableName of IMPORT_ORDER) {
      const tableData = backupData.tables[tableName];
      if (!tableData || tableData.length === 0) {
        results[tableName] = { success: true, count: 0 };
        continue;
      }

      try {
        if (SINGLE_ROW_TABLES.includes(tableName)) {
          // For single-row tables, upsert the first record
          const record = tableData[0];
          const { error } = await supabase.from(tableName).upsert(record, { onConflict: "id" });
          if (error) throw error;
          results[tableName] = { success: true, count: 1 };
        } else {
          // For multi-row tables, insert in batches
          const batchSize = 100;
          let insertedCount = 0;

          for (let i = 0; i < tableData.length; i += batchSize) {
            const batch = tableData.slice(i, i + batchSize);
            const { error } = await supabase.from(tableName).upsert(batch, { 
              onConflict: "id",
              ignoreDuplicates: false 
            });
            if (error) {
              console.error(`Error inserting batch into ${tableName}:`, error);
              // Try individual inserts for failed batches
              for (const record of batch) {
                try {
                  await supabase.from(tableName).upsert(record, { onConflict: "id" });
                  insertedCount++;
                } catch (e) {
                  console.error(`Error inserting record into ${tableName}:`, e);
                }
              }
            } else {
              insertedCount += batch.length;
            }
          }
          results[tableName] = { success: true, count: insertedCount };
        }
      } catch (e: any) {
        console.error(`Error importing ${tableName}:`, e);
        results[tableName] = { success: false, count: 0, error: e.message };
      }
    }

    // Import storage files
    const storageResults: Record<string, { success: boolean; count: number; error?: string }> = {};
    if (backupData.storage) {
      for (const [bucket, files] of Object.entries(backupData.storage)) {
        if (!Array.isArray(files) || files.length === 0) {
          storageResults[bucket] = { success: true, count: 0 };
          continue;
        }

        let uploadedCount = 0;
        for (const file of files as any[]) {
          try {
            const binaryData = base64ToUint8Array(file.data);
            const { error } = await supabase.storage.from(bucket).upload(file.name, binaryData, {
              contentType: file.type || "application/octet-stream",
              upsert: true,
            });
            if (error) {
              console.error(`Error uploading ${file.name} to ${bucket}:`, error);
            } else {
              uploadedCount++;
            }
          } catch (e) {
            console.error(`Error processing file ${file.name}:`, e);
          }
        }
        storageResults[bucket] = { success: true, count: uploadedCount };
      }
    }

    // Create auth users if provided
    let authResults = { success: true, count: 0, skipped: 0 };
    if (backupData.authUsers && backupData.authUsers.length > 0) {
      for (const user of backupData.authUsers) {
        try {
          // Check if user already exists
          const { data: existingUsers } = await supabase.auth.admin.listUsers();
          const exists = existingUsers?.users?.some((u: any) => u.email === user.email);

          if (exists) {
            authResults.skipped++;
            continue;
          }

          // Create user with a temporary password (they'll need to reset)
          await supabase.auth.admin.createUser({
            email: user.email,
            email_confirm: true,
            user_metadata: user.user_metadata,
            password: "TempPassword123!", // Temporary password
          });
          authResults.count++;
        } catch (e) {
          console.error(`Error creating auth user ${user.email}:`, e);
        }
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        tables: results,
        storage: storageResults,
        auth: authResults,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("Import error:", error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
    );
  }
});

function base64ToUint8Array(base64: string): Uint8Array {
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}
