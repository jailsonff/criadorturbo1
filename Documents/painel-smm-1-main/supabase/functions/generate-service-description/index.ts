import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { serviceName, category } = await req.json();
    
    if (!serviceName) {
      return new Response(
        JSON.stringify({ error: "Nome do serviço é obrigatório" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    const systemPrompt = `Você é um engenheiro de produto e especialista em sistemas SMM.
Sua tarefa é gerar descrições técnicas padronizadas de serviços SMM, interpretando exclusivamente o título do serviço como fonte de verdade.

🔴 REGRA PRINCIPAL: O TÍTULO DO SERVIÇO É A ÚNICA FONTE DE INFORMAÇÃO
Tudo que estiver no nome do serviço DEVE ser refletido na descrição.
Nada pode ser inventado ou omitido.

FORMATO FIXO DA DESCRIÇÃO (NÃO ALTERAR):
A saída DEVE seguir exatamente este modelo (linhas, emojis e ordem):

⏰0-30min, podendo levar até 4h.
⚡️20-50k/dia
⭐️HQ, alta qualidade
[ORIGEM / TIPO DO SERVIÇO]
[REGRA EXTRA DO TÍTULO - se houver]
[REPOSIÇÃO / REFIL]

🚨Notas: perfis privados ou com restrição de idade serão cancelados.

MAPEAMENTO OBRIGATÓRIO DO TÍTULO → DESCRIÇÃO:

QUALIDADE:
- HQ → já incluído como "⭐️HQ, alta qualidade"

ORIGEM:
- Mundial / World → 🌍 Seguidores mundiais
- BR / Brasil → 🇧🇷 Seguidores brasileiros
- USA / EUA → 🇺🇸 Seguidores americanos

VOLUME EXTRA:
- Sobe 10% / +10% → ➕ Sobe 10% a mais na entrega
- Sobe 20% / +20% → ➕ Sobe 20% a mais na entrega

REPOSIÇÃO:
- SR / Sem Reposição → ❌ Sem reposição (SR)
- R30 → ♻️ Reposição por 30 dias
- R60 → ♻️ Reposição por 60 dias
- R90 → ♻️ Reposição por 90 dias

TIPO DE SERVIÇO (adicionar no final):
- Seguidores → 🔗 Link do perfil ou @
- Curtidas / Likes → 🔗 Link do post
- Views / Visualizações → 🔗 Link do vídeo
- Stories → 🔗 Link do story
- Comentários → 🔗 Link do post

REGRAS DE BLOQUEIO:
❌ NÃO gerar copywriting ou textos promocionais
❌ NÃO inventar dados técnicos
❌ NÃO mudar o formato fixo
❌ NÃO adicionar emojis extras
❌ NÃO remover linhas obrigatórias
❌ NÃO adicionar frases extras

EXEMPLO:
Título: IG - Seguidores Mundiais | ⭐ HQ | Sobe 10% a mais | ❌ SR
Saída:
⏰0-30min, podendo levar até 4h.
⚡️20-50k/dia
⭐️HQ, alta qualidade
🌍 Seguidores mundiais
➕ Sobe 10% a mais na entrega
❌ Sem reposição (SR)
🔗 Link do perfil ou @

🚨Notas: perfis privados ou com restrição de idade serão cancelados.`;

    const userPrompt = `Gere a descrição técnica padronizada para o seguinte serviço SMM:

TÍTULO DO SERVIÇO: ${serviceName}

Siga EXATAMENTE o formato fixo. Analise o título e mapeie as palavras-chave para as linhas correspondentes.
Retorne APENAS a descrição formatada, sem explicações.`;

    console.log("Generating description for:", serviceName);

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
          { role: "user", content: userPrompt },
        ],
        max_tokens: 500,
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: "Limite de requisições excedido. Tente novamente em alguns segundos." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (response.status === 402) {
        return new Response(
          JSON.stringify({ error: "Créditos insuficientes. Adicione créditos ao workspace." }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      const errorText = await response.text();
      console.error("AI gateway error:", response.status, errorText);
      throw new Error(`AI gateway error: ${response.status}`);
    }

    const data = await response.json();
    const description = data.choices?.[0]?.message?.content?.trim() || "";

    console.log("Generated description:", description);

    return new Response(
      JSON.stringify({ description }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error generating description:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Erro ao gerar descrição" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
