import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface SEORequest {
  type: "title" | "description" | "keywords" | "all";
  currentTitle?: string;
  currentDescription?: string;
  siteName?: string;
  businessContext?: string;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY não está configurada");
    }

    const { type, currentTitle, currentDescription, siteName, businessContext } = await req.json() as SEORequest;

    // Build the prompt based on what type of content to generate
    let userPrompt = "";
    
    if (type === "title") {
      userPrompt = `Gere um título SEO otimizado para um site.
${siteName ? `Nome do site: ${siteName}` : ""}
${currentTitle ? `Título atual: ${currentTitle}` : ""}
${businessContext ? `Contexto: ${businessContext}` : "Site de serviços SMM (Social Media Marketing) que vende seguidores, curtidas e visualizações para redes sociais."}

Requisitos:
- Máximo 60 caracteres
- Inclua palavra-chave principal no início
- Seja persuasivo e claro
- Responda APENAS com o título, sem explicações ou aspas`;
    } else if (type === "description") {
      userPrompt = `Gere uma meta description SEO otimizada.
${siteName ? `Nome do site: ${siteName}` : ""}
${currentDescription ? `Descrição atual: ${currentDescription}` : ""}
${businessContext ? `Contexto: ${businessContext}` : "Site de serviços SMM (Social Media Marketing) que vende seguidores, curtidas e visualizações para redes sociais."}

Requisitos:
- Máximo 160 caracteres
- Inclua call-to-action
- Seja persuasivo
- Responda APENAS com a descrição, sem explicações ou aspas`;
    } else if (type === "keywords") {
      userPrompt = `Gere palavras-chave SEO relevantes.
${siteName ? `Nome do site: ${siteName}` : ""}
${currentTitle ? `Título: ${currentTitle}` : ""}
${currentDescription ? `Descrição: ${currentDescription}` : ""}
${businessContext ? `Contexto: ${businessContext}` : "Site de serviços SMM (Social Media Marketing) que vende seguidores, curtidas e visualizações para redes sociais."}

Requisitos:
- 8 a 12 palavras-chave
- Separadas por vírgula
- Mix de termos gerais e específicos
- Responda APENAS com as keywords separadas por vírgula, sem explicações`;
    } else {
      userPrompt = `Gere conteúdo SEO completo para um site.
${siteName ? `Nome do site: ${siteName}` : ""}
${businessContext ? `Contexto: ${businessContext}` : "Site de serviços SMM (Social Media Marketing) que vende seguidores, curtidas e visualizações para redes sociais."}

Responda em formato JSON válido:
{
  "title": "título SEO (máx 60 chars)",
  "description": "meta description (máx 160 chars)",
  "keywords": "keyword1, keyword2, keyword3..."
}

APENAS o JSON, sem markdown ou explicações.`;
    }

    const systemPrompt = `Você é um especialista em SEO (Search Engine Optimization) com amplo conhecimento em otimização para mecanismos de busca. Sua função é criar conteúdo otimizado para melhorar o ranking em buscadores.

Diretrizes:
- Seja direto e conciso
- Use português brasileiro
- Foque em termos de busca populares
- Priorize clareza e persuasão`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt }
        ],
        temperature: 0.7,
        max_tokens: 500,
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Limite de requisições excedido. Tente novamente em alguns segundos." }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "Créditos de IA esgotados." }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const errorText = await response.text();
      console.error("AI gateway error:", response.status, errorText);
      throw new Error("Erro ao gerar conteúdo SEO");
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content?.trim() || "";

    // Parse response based on type
    let result: any = {};
    
    if (type === "all") {
      try {
        // Remove markdown code blocks if present
        const cleanContent = content.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
        result = JSON.parse(cleanContent);
      } catch {
        result = { error: "Não foi possível processar a resposta", raw: content };
      }
    } else {
      result = { [type]: content };
    }

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error) {
    console.error("SEO generate error:", error);
    return new Response(JSON.stringify({ 
      error: error instanceof Error ? error.message : "Erro desconhecido" 
    }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
