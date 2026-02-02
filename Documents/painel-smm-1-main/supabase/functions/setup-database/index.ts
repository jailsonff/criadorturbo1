import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { externalUrl, serviceRoleKey, schema } = await req.json();

    console.log('Received setup request for external database');

    if (!externalUrl || !serviceRoleKey || !schema) {
      console.error('Missing required parameters');
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'URL, Service Role Key e Schema são obrigatórios' 
        }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 400 
        }
      );
    }

    // Validate URL format
    if (!externalUrl.includes('supabase.co')) {
      console.error('Invalid Supabase URL format');
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'URL inválida. Use o formato: https://xxxxx.supabase.co' 
        }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 400 
        }
      );
    }

    console.log('Creating client for external database:', externalUrl);

    // Create client for external database with service role key
    const externalClient = createClient(externalUrl, serviceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
      db: {
        schema: 'public'
      }
    });

    // Test connection first
    console.log('Testing connection to external database...');
    const { error: testError } = await externalClient
      .from('profiles')
      .select('count', { count: 'exact', head: true });

    // If profiles table doesn't exist (42P01), that's expected - we'll create it
    // Other errors mean connection failed
    if (testError && testError.code !== 'PGRST116' && testError.code !== '42P01') {
      console.error('Connection test failed:', testError);
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: `Falha na conexão: ${testError.message}` 
        }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 400 
        }
      );
    }

    console.log('Connection successful, attempting to execute schema...');

    // Try to execute the SQL schema using the postgres extension
    // Note: This requires the exec_sql function to be created first
    // We'll provide a fallback message if it doesn't exist
    
    // First, try to create the exec_sql function if it doesn't exist
    const createExecSqlFunction = `
      CREATE OR REPLACE FUNCTION exec_sql(sql text)
      RETURNS void
      LANGUAGE plpgsql
      SECURITY DEFINER
      AS $$
      BEGIN
        EXECUTE sql;
      END;
      $$;
    `;

    // Unfortunately, Supabase doesn't allow direct SQL execution via the client
    // The user needs to run the SQL manually in the Supabase Dashboard
    
    console.log('Direct SQL execution not available via client API');
    
    return new Response(
      JSON.stringify({ 
        success: false, 
        requiresManualSetup: true,
        message: 'O Supabase não permite execução direta de SQL via API. Por favor, execute o script SQL manualmente no SQL Editor do Supabase Dashboard.',
        instructions: [
          '1. Acesse o Supabase Dashboard do seu projeto',
          '2. Vá em SQL Editor',
          '3. Cole o script SQL (use o botão "Copiar Script SQL")',
          '4. Execute o script',
          '5. Volte aqui e clique em "Testar Conexão"'
        ]
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200 
      }
    );

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Erro desconhecido';
    console.error('Setup error:', error);
    
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: errorMessage 
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500 
      }
    );
  }
});
