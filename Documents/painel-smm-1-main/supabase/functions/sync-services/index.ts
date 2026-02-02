import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface ExternalService {
  service: number;
  name: string;
  type: string;
  category: string;
  rate: string;
  min: string;
  max: string;
  refill: boolean;
  cancel: boolean;
  description?: string;
  dripfeed?: boolean;
  average_time?: string;
}

interface Provider {
  id: string;
  name: string;
  api_url: string;
  api_key: string;
  is_active: boolean;
}

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    console.log("Starting services sync...");

    // Get all active providers
    const { data: providers, error: providersError } = await supabase
      .from("smm_providers")
      .select("*")
      .eq("is_active", true);

    if (providersError) {
      console.error("Error fetching providers:", providersError);
      throw new Error("Failed to fetch providers");
    }

    if (!providers || providers.length === 0) {
      console.log("No active providers found");
      return new Response(
        JSON.stringify({ success: true, message: "No active providers found", updated: 0 }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`Found ${providers.length} active providers`);

    let totalUpdated = 0;
    const results: { provider: string; updated: number; error?: string }[] = [];

    // Process each provider
    for (const provider of providers as Provider[]) {
      console.log(`Processing provider: ${provider.name}`);

      try {
        // Fetch services from the provider's API
        const formData = new FormData();
        formData.append("key", provider.api_key);
        formData.append("action", "services");

        const response = await fetch(provider.api_url, {
          method: "POST",
          body: formData,
        });

        if (!response.ok) {
          console.error(`Failed to fetch from ${provider.name}: ${response.status}`);
          results.push({ provider: provider.name, updated: 0, error: `HTTP ${response.status}` });
          continue;
        }

        const externalServices: ExternalService[] = await response.json();
        console.log(`Fetched ${externalServices.length} services from ${provider.name}`);

        // Get all imported services for this provider
        const { data: importedServices, error: importedError } = await supabase
          .from("imported_services")
          .select("id, external_service_id")
          .eq("provider_id", provider.id);

        if (importedError) {
          console.error(`Error fetching imported services for ${provider.name}:`, importedError);
          results.push({ provider: provider.name, updated: 0, error: importedError.message });
          continue;
        }

        if (!importedServices || importedServices.length === 0) {
          console.log(`No imported services for ${provider.name}`);
          results.push({ provider: provider.name, updated: 0 });
          continue;
        }

        // Create a map for quick lookup
        const importedMap = new Map(importedServices.map(s => [s.external_service_id, s.id]));
        const externalMap = new Map(externalServices.map(s => [s.service, s]));

        let providerUpdated = 0;

        // Update each imported service with the latest data from provider
        for (const [externalId, localId] of importedMap) {
          const externalService = externalMap.get(externalId);
          if (externalService) {
            const { error: updateError } = await supabase
              .from("imported_services")
              .update({
                name: externalService.name,
                rate: externalService.rate,
                min: String(externalService.min),
                max: String(externalService.max),
                category: externalService.category,
                type: externalService.type,
                refill: externalService.refill || false,
                cancel: externalService.cancel || false,
                dripfeed: externalService.dripfeed || false,
                description: externalService.description || null,
                average_time: externalService.average_time || null,
                updated_at: new Date().toISOString(),
              })
              .eq("id", localId);

            if (updateError) {
              console.error(`Error updating service ${externalId}:`, updateError);
            } else {
              providerUpdated++;
            }
          }
        }

        console.log(`Updated ${providerUpdated} services for ${provider.name}`);
        totalUpdated += providerUpdated;
        results.push({ provider: provider.name, updated: providerUpdated });
      } catch (providerError) {
        console.error(`Error processing provider ${provider.name}:`, providerError);
        results.push({ 
          provider: provider.name, 
          updated: 0, 
          error: providerError instanceof Error ? providerError.message : "Unknown error" 
        });
      }
    }

    console.log(`Sync complete. Total updated: ${totalUpdated}`);

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: `Sincronização concluída! ${totalUpdated} serviços atualizados.`,
        updated: totalUpdated,
        results 
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Sync error:", error);
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: error instanceof Error ? error.message : "Unknown error" 
      }),
      { 
        status: 500, 
        headers: { ...corsHeaders, "Content-Type": "application/json" } 
      }
    );
  }
});
