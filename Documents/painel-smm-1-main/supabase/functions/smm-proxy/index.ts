import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Default API URL (legacy support)
const DEFAULT_SMM_API_URL = "https://upmidiass.net/api/v2";

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { action, key, apiUrl, ...params } = await req.json();

    if (!key) {
      return new Response(
        JSON.stringify({ error: "API key is required" }),
        { 
          status: 400, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    if (!action) {
      return new Response(
        JSON.stringify({ error: "Action is required" }),
        { 
          status: 400, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    // Use provided API URL or fall back to default
    const targetApiUrl = apiUrl || DEFAULT_SMM_API_URL;

    // Build form data for the SMM API
    const formData = new FormData();
    formData.append("key", key);
    formData.append("action", action);

    // Add any additional parameters
    for (const [paramKey, paramValue] of Object.entries(params)) {
      if (paramValue !== undefined && paramValue !== null) {
        formData.append(paramKey, String(paramValue));
      }
    }

    console.log(`SMM Proxy: action=${action}, apiUrl=${targetApiUrl}`);

    // Make the request to the SMM API
    const response = await fetch(targetApiUrl, {
      method: "POST",
      body: formData,
    });

    const data = await response.json();

    // Log full structure of first service to see all available fields
    if (action === 'services' && Array.isArray(data) && data.length > 0) {
      console.log(`SMM Proxy - First service full structure:`, JSON.stringify(data[0]));
      console.log(`SMM Proxy - All keys in service:`, Object.keys(data[0]).join(', '));
    } else {
      console.log(`SMM Proxy response:`, JSON.stringify(data).substring(0, 500));
    }

    return new Response(
      JSON.stringify(data),
      { 
        status: 200, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );

  } catch (error) {
    console.error("SMM Proxy error:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ error: "Failed to process request", details: errorMessage }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});
