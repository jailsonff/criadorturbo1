import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface TicketData {
  ticketId: string;
  subject: string;
  message: string;
  orderId?: string;
  externalDbUrl?: string;
  externalDbKey?: string;
}

interface AIAgent {
  id: string;
  name: string;
  provider?: string | null;
  model: string;
  system_prompt: string | null;
  temperature: number;
  max_tokens: number;
  is_enabled: boolean;
}

interface OrderInfo {
  order_id: number;
  service_id: number;
  service_name: string;
  link: string;
  quantity: number;
  charge: number | null;
  status: string | null;
  start_count: string | null;
  remains: string | null;
  created_at: string;
}

interface ServiceInfo {
  id: string;
  name: string;
  category: string;
  rate: string;
  min: string;
  max: string;
  refill: boolean | null;
  cancel: boolean | null;
  description: string | null;
  provider_id: string;
}

interface ProviderInfo {
  id: string;
  name: string;
  api_url: string;
  api_key: string;
}

// Extract order IDs from message (e.g., #2712139, 2712139, ID 2712139, pedido 2712139)
// Filters out IDs that are too large for PostgreSQL integer type (max 2147483647)
function extractOrderIds(message: string): number[] {
  const MAX_INT = 2147483647; // PostgreSQL integer max value
  const MIN_ORDER_ID = 10000; // Minimum likely order ID
  
  const patterns = [
    /#(\d{5,10})/g,          // #2712139 (5-10 digits)
    /\b(\d{6,10})\b/g,       // 2712139 (6-10 digits to avoid false positives like phone numbers)
    /ID\s*:?\s*(\d{5,10})/gi,    // ID 2712139 or ID: 2712139
    /pedido\s*:?\s*#?(\d{5,10})/gi,// pedido 2712139 or pedido #2712139
    /order\s*:?\s*#?(\d{5,10})/gi, // order 2712139
  ];
  
  const ids = new Set<number>();
  for (const pattern of patterns) {
    let match;
    // Reset regex lastIndex to ensure all matches are found
    pattern.lastIndex = 0;
    while ((match = pattern.exec(message)) !== null) {
      const id = parseInt(match[1], 10);
      // Only add valid order IDs within PostgreSQL integer range
      if (id >= MIN_ORDER_ID && id <= MAX_INT) {
        ids.add(id);
      }
    }
  }
  
  console.log("Valid order IDs extracted:", Array.from(ids));
  return Array.from(ids);
}

// Fetch order details from database - with fallback for individual queries
async function fetchOrderDetails(supabase: any, orderIds: number[]): Promise<OrderInfo[]> {
  if (orderIds.length === 0) return [];
  
  console.log("Fetching order details for IDs:", orderIds);
  
  // Try batch query first
  const { data, error } = await supabase
    .from("orders")
    .select("*")
    .in("order_id", orderIds);
  
  if (error) {
    console.error("Error fetching orders (batch):", error);
    
    // Fallback: try individual queries for each ID
    console.log("Trying individual queries...");
    const results: OrderInfo[] = [];
    
    for (const orderId of orderIds) {
      try {
        const { data: singleOrder, error: singleError } = await supabase
          .from("orders")
          .select("*")
          .eq("order_id", orderId)
          .maybeSingle();
        
        if (!singleError && singleOrder) {
          results.push(singleOrder);
          console.log(`Found order ${orderId}`);
        } else if (singleError) {
          console.log(`Order ${orderId} query error:`, singleError.message);
        } else {
          console.log(`Order ${orderId} not found`);
        }
      } catch (e) {
        console.error(`Error fetching order ${orderId}:`, e);
      }
    }
    
    return results;
  }
  
  console.log(`Found ${data?.length || 0} orders in batch query`);
  return data || [];
}

// Fetch service details from imported_services by external_service_id
async function fetchServiceDetails(supabase: any, serviceIds: number[]): Promise<ServiceInfo[]> {
  if (serviceIds.length === 0) return [];
  
  const { data, error } = await supabase
    .from("imported_services")
    .select("id, name, category, rate, min, max, refill, cancel, description, provider_id, external_service_id, average_time, type")
    .in("external_service_id", serviceIds);
  
  if (error) {
    console.error("Error fetching services:", error);
    return [];
  }
  
  return (data || []).map((s: any) => ({
    ...s,
    id: s.external_service_id
  }));
}

// Extract service IDs from message (e.g., ID 509, serviço 509, #509, or just 3822)
function extractServiceIds(message: string, isServiceContext: boolean = false): number[] {
  const MAX_SERVICE_ID = 100000; // Reasonable max for service IDs
  const MIN_SERVICE_ID = 1;
  
  const patterns = [
    /servi[çc]o\s*(?:id\s*)?#?(\d{1,6})/gi,  // serviço 509, serviço ID 509, serviço #509
    /ID\s*(?:do\s*)?servi[çc]o\s*:?\s*#?(\d{1,6})/gi, // ID do serviço 509
    /\bID\s*:?\s*#?(\d{1,5})\b/gi,           // ID: 509, ID 509
    /#(\d{1,6})\b/g,                          // #509
  ];
  
  // If in service context, also match standalone numbers (like "3822" or "sim por favor" followed by a number)
  if (isServiceContext) {
    patterns.push(/\b(\d{3,5})\b/g);  // Any 3-5 digit number in service context
  }
  
  const ids = new Set<number>();
  for (const pattern of patterns) {
    let match;
    pattern.lastIndex = 0;
    while ((match = pattern.exec(message)) !== null) {
      const id = parseInt(match[1], 10);
      if (id >= MIN_SERVICE_ID && id <= MAX_SERVICE_ID) {
        ids.add(id);
      }
    }
  }
  
  console.log("Service IDs extracted:", Array.from(ids), "isServiceContext:", isServiceContext);
  return Array.from(ids);
}

// Search services by text (name, category, description)
async function searchServicesByText(supabase: any, searchText: string): Promise<ServiceInfo[]> {
  if (!searchText || searchText.length < 3) return [];
  
  // Clean search text
  const cleanSearch = searchText.toLowerCase().trim();
  
  // Search in name, category and description
  const { data, error } = await supabase
    .from("imported_services")
    .select("id, name, category, rate, min, max, refill, cancel, description, provider_id, external_service_id, average_time, type")
    .eq("is_active", true)
    .or(`name.ilike.%${cleanSearch}%,category.ilike.%${cleanSearch}%,description.ilike.%${cleanSearch}%`)
    .limit(10);
  
  if (error) {
    console.error("Error searching services:", error);
    return [];
  }
  
  return (data || []).map((s: any) => ({
    ...s,
    id: s.external_service_id
  }));
}

// Fetch service by ID
async function fetchServiceById(supabase: any, serviceId: number): Promise<ServiceInfo | null> {
  const { data, error } = await supabase
    .from("imported_services")
    .select("id, name, category, rate, min, max, refill, cancel, description, provider_id, external_service_id, average_time, type")
    .eq("external_service_id", serviceId)
    .eq("is_active", true)
    .maybeSingle();
  
  if (error) {
    console.error("Error fetching service by ID:", error);
    return null;
  }
  
  if (!data) return null;
  
  return {
    ...data,
    id: data.external_service_id
  };
}

// Build service context for AI
async function buildServiceContext(
  supabase: any,
  message: string,
  subject: string,
  conversationHistory: string = ""
): Promise<string> {
  // Only process service queries for "servicos" subject or when explicitly asking about services
  const isServiceQuery = subject === "servicos" || 
    /servi[çc]o|servi[çc]os|service|preço|pre[çc]o|valor|quanto custa/i.test(message);
  
  if (!isServiceQuery) return "";
  
  // Combine current message with conversation history to find IDs mentioned previously
  const fullContext = `${conversationHistory}\n${message}`;
  
  // Extract service IDs - in service context, also match standalone numbers
  const serviceIds = extractServiceIds(fullContext, true);
  
  console.log("Building service context with IDs:", serviceIds, "from full context");
  
  let services: ServiceInfo[] = [];
  
  // Fetch services by ID if found
  for (const sid of serviceIds) {
    const svc = await fetchServiceById(supabase, sid);
    if (svc) {
      services.push(svc);
      console.log(`Found service ${sid}:`, svc.name);
    } else {
      console.log(`Service ${sid} not found in database`);
    }
  }
  
  // If no services found by ID, try text search for key terms
  if (services.length === 0 && serviceIds.length === 0) {
    // Extract potential search terms (after removing common words)
    const searchTerms = message
      .replace(/servi[çc]o|servi[çc]os|quero|gostaria|sobre|como|funciona|qual|quanto|custa|preço|valor|sim|por favor|ok|obrigado/gi, '')
      .trim();
    
    if (searchTerms.length >= 3) {
      services = await searchServicesByText(supabase, searchTerms);
    }
  }
  
  if (services.length === 0 && serviceIds.length > 0) {
    // Get range of available services for better guidance
    const { data: rangeData } = await supabase
      .from("imported_services")
      .select("external_service_id")
      .eq("is_active", true)
      .order("external_service_id", { ascending: true })
      .limit(1);
    
    const { data: maxData } = await supabase
      .from("imported_services")
      .select("external_service_id")
      .eq("is_active", true)
      .order("external_service_id", { ascending: false })
      .limit(1);
    
    const minId = rangeData?.[0]?.external_service_id || "?";
    const maxId = maxData?.[0]?.external_service_id || "?";
    
    return `\n\n⚠️ SERVIÇOS NÃO ENCONTRADOS: Os IDs ${serviceIds.join(", ")} não foram encontrados no catálogo. Os IDs de serviços disponíveis estão na faixa de ${minId} a ${maxId}. Informe ao usuário que o ID informado não existe e sugira que ele verifique o ID na página de Serviços ou descreva o tipo de serviço que procura.`;
  }
  
  if (services.length === 0) {
    return `\n\n💡 DÚVIDA SOBRE SERVIÇOS: O usuário está perguntando sobre serviços, mas não especificou um ID. Solicite que o usuário informe o ID do serviço (visível na página de Serviços) ou o nome do serviço desejado para que você possa fornecer informações detalhadas.`;
  }
  
  // Build context string
  let context = "\n\n📦 INFORMAÇÕES DOS SERVIÇOS ENCONTRADOS:\n";
  
  for (const service of services) {
    const rateNum = parseFloat(service.rate);
    const formattedRate = isNaN(rateNum) ? service.rate : `R$ ${rateNum.toFixed(2)}`;
    
    context += `\n═══════════════════════════════════════\n`;
    context += `🆔 SERVIÇO ID: ${service.id}\n`;
    context += `═══════════════════════════════════════\n`;
    context += `📝 Nome: ${service.name}\n`;
    context += `📁 Categoria: ${service.category}\n`;
    context += `💰 Preço por 1K: ${formattedRate}\n`;
    context += `📊 Quantidade Mínima: ${service.min}\n`;
    context += `📈 Quantidade Máxima: ${service.max}\n`;
    
    if ((service as any).average_time) {
      context += `⏱️ Tempo Médio: ${(service as any).average_time}\n`;
    }
    
    if ((service as any).type) {
      context += `🏷️ Tipo: ${(service as any).type}\n`;
    }
    
    context += `\n🔄 REPOSIÇÃO: ${service.refill ? '✅ Oferece reposição' : '❌ Não oferece reposição'}\n`;
    context += `🚫 CANCELAMENTO: ${service.cancel ? '✅ Permite cancelamento' : '❌ Não permite cancelamento'}\n`;
    
    if (service.description) {
      context += `\n📋 DESCRIÇÃO:\n${service.description}\n`;
    }
  }
  
  context += `\n═══════════════════════════════════════\n`;
  context += `💡 USE ESSAS INFORMAÇÕES para responder sobre o serviço.\n`;
  context += `   - Informe preço, quantidade mínima/máxima, tempo de entrega\n`;
  context += `   - Explique se tem reposição ou cancelamento\n`;
  context += `   - Se o usuário quiser comprar, oriente a ir em "Novo Pedido"\n`;

  return context;
}

// Fetch provider details
async function fetchProviderDetails(supabase: any, providerIds: string[]): Promise<ProviderInfo[]> {
  if (providerIds.length === 0) return [];
  
  const uniqueIds = [...new Set(providerIds)];
  const { data, error } = await supabase
    .from("smm_providers")
    .select("id, name, api_url, api_key")
    .in("id", uniqueIds);
  
  if (error) {
    console.error("Error fetching providers:", error);
    return [];
  }
  
  return data || [];
}

// Check service refill status via provider API
async function checkServiceRefillFromProvider(
  provider: ProviderInfo, 
  serviceId: number
): Promise<{ refill: boolean; cancel: boolean } | null> {
  try {
    const formData = new URLSearchParams();
    formData.append("key", provider.api_key);
    formData.append("action", "services");

    const response = await fetch(provider.api_url, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: formData.toString(),
    });

    if (!response.ok) {
      console.error("Provider API error:", response.status);
      return null;
    }

    const services = await response.json();
    if (Array.isArray(services)) {
      const service = services.find((s: any) => 
        parseInt(s.service, 10) === serviceId || s.service === String(serviceId)
      );
      if (service) {
        return {
          refill: service.refill === true || service.refill === "true",
          cancel: service.cancel === true || service.cancel === "true",
        };
      }
    }
    return null;
  } catch (error) {
    console.error("Error checking service from provider:", error);
    return null;
  }
}

// Build context about orders for AI
async function buildOrderContext(
  supabase: any,
  message: string,
  providedOrderId?: string
): Promise<string> {
  // Extract order IDs from message
  const extractedIds = extractOrderIds(message);
  
  // Add provided order ID if exists
  if (providedOrderId) {
    const numericId = parseInt(providedOrderId, 10);
    if (!isNaN(numericId) && !extractedIds.includes(numericId)) {
      extractedIds.push(numericId);
    }
  }

  if (extractedIds.length === 0) {
    return "\n\n⚠️ NENHUM ID DE PEDIDO IDENTIFICADO NA MENSAGEM. Solicite ao usuário que informe o ID do pedido para poder verificar as informações.";
  }

  console.log("Extracted order IDs:", extractedIds);

  // Fetch order details
  const orders = await fetchOrderDetails(supabase, extractedIds);
  
  if (orders.length === 0) {
    return `\n\n⚠️ PEDIDOS NÃO ENCONTRADOS: Os IDs ${extractedIds.join(", ")} não foram encontrados no sistema. Pode ser que sejam de outro painel ou estejam incorretos.`;
  }

  // Get unique service IDs from orders
  const serviceIds = [...new Set(orders.map(o => o.service_id))];
  const services = await fetchServiceDetails(supabase, serviceIds);
  
  // Get provider IDs from services
  const providerIds = [...new Set(services.map(s => s.provider_id).filter(Boolean))];
  const providers = await fetchProviderDetails(supabase, providerIds);

  // Check refill capability from provider API for each service
  const serviceRefillInfo: Record<number, { refill: boolean; cancel: boolean }> = {};
  
  for (const service of services) {
    const provider = providers.find(p => p.id === service.provider_id);
    if (provider) {
      const serviceId = typeof service.id === 'string' ? parseInt(service.id, 10) : service.id;
      const refillInfo = await checkServiceRefillFromProvider(provider, serviceId);
      if (refillInfo) {
        serviceRefillInfo[serviceId] = refillInfo;
      }
    }
  }

  // Build context string
  let context = "\n\n📋 INFORMAÇÕES DOS PEDIDOS ENCONTRADOS:\n";
  
  for (const order of orders) {
    const service = services.find(s => {
      const sId = typeof s.id === 'string' ? parseInt(s.id, 10) : s.id;
      return sId === order.service_id;
    });
    const refillInfo = serviceRefillInfo[order.service_id];
    const provider = service ? providers.find(p => p.id === service.provider_id) : null;

    context += `\n═══════════════════════════════════════\n`;
    context += `🆔 PEDIDO #${order.order_id}\n`;
    context += `═══════════════════════════════════════\n`;
    context += `📦 Serviço ID: ${order.service_id}\n`;
    context += `📝 Nome do Serviço: ${order.service_name}\n`;
    context += `🔗 Link: ${order.link}\n`;
    context += `📊 Quantidade: ${order.quantity}\n`;
    context += `💰 Valor: R$ ${order.charge?.toFixed(2) || "N/A"}\n`;
    context += `📈 Status: ${translateStatus(order.status)}\n`;
    context += `🎯 Início: ${order.start_count || "N/A"}\n`;
    context += `📉 Restam: ${order.remains || "N/A"}\n`;
    context += `📅 Data: ${new Date(order.created_at).toLocaleString("pt-BR")}\n`;
    
    if (provider) {
      context += `🏢 Fornecedor: ${provider.name}\n`;
    }
    
    // Refill information
    const supportsRefill = refillInfo?.refill || service?.refill;
    const supportsCancel = refillInfo?.cancel || service?.cancel;
    
    context += `\n🔄 REPOSIÇÃO (REFILL):\n`;
    if (supportsRefill) {
      context += `   ✅ Este serviço OFERECE reposição.\n`;
      context += `   👉 Oriente o usuário a clicar no botão "Reposição" ao lado do pedido na página de Histórico de Pedidos.\n`;
    } else {
      context += `   ❌ Este serviço NÃO oferece reposição.\n`;
      context += `   👉 Informe ao usuário que infelizmente não é possível solicitar reposição para este tipo de serviço.\n`;
    }
    
    context += `\n🚫 CANCELAMENTO:\n`;
    if (supportsCancel) {
      context += `   ✅ Este serviço PERMITE cancelamento (se ainda não iniciou).\n`;
    } else {
      context += `   ❌ Este serviço NÃO permite cancelamento.\n`;
    }
    
    // Additional context based on status
    if (order.status === "Completed" || order.status === "completed") {
      context += `\n✅ STATUS: Este pedido já foi CONCLUÍDO.\n`;
      if (order.start_count && order.remains) {
        const delivered = parseInt(order.start_count) + order.quantity - parseInt(order.remains);
        context += `   📊 Entregue aproximadamente: ${delivered}\n`;
      }
    } else if (order.status === "Pending" || order.status === "pending") {
      context += `\n⏳ STATUS: Este pedido está PENDENTE aguardando processamento.\n`;
    } else if (order.status === "In progress" || order.status === "in_progress" || order.status === "Processing") {
      context += `\n🔄 STATUS: Este pedido está EM ANDAMENTO.\n`;
    } else if (order.status === "Canceled" || order.status === "canceled" || order.status === "Cancelled") {
      context += `\n❌ STATUS: Este pedido foi CANCELADO.\n`;
    } else if (order.status === "Partial" || order.status === "partial") {
      context += `\n⚠️ STATUS: Este pedido foi PARCIALMENTE concluído (entregou parte da quantidade).\n`;
      context += `   👉 O saldo restante pode ter sido reembolsado automaticamente.\n`;
    }
  }

  context += `\n═══════════════════════════════════════\n`;
  context += `💡 USE ESSAS INFORMAÇÕES para responder o usuário com precisão.\n`;
  context += `   - Se o usuário quer REPOSIÇÃO, verifique se o serviço oferece e oriente sobre o botão.\n`;
  context += `   - Se o usuário quer CANCELAR, verifique se é possível e o status atual.\n`;
  context += `   - Se o usuário pergunta sobre STATUS, informe com base nos dados acima.\n`;

  return context;
}

function translateStatus(status: string | null): string {
  if (!status) return "Desconhecido";
  const map: Record<string, string> = {
    "Pending": "Pendente",
    "pending": "Pendente",
    "In progress": "Em andamento",
    "in_progress": "Em andamento",
    "Processing": "Processando",
    "Completed": "Concluído",
    "completed": "Concluído",
    "Partial": "Parcial",
    "partial": "Parcial",
    "Canceled": "Cancelado",
    "canceled": "Cancelado",
    "Cancelled": "Cancelado",
    "Refunded": "Reembolsado",
    "refunded": "Reembolsado",
  };
  return map[status] || status;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { ticketId, subject, message, orderId, externalDbUrl, externalDbKey } = await req.json() as TicketData;
    
    if (!ticketId || !subject || !message) {
      return new Response(
        JSON.stringify({ error: "ticketId, subject and message are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Initialize Supabase client - use external DB if provided
    const supabaseUrl = externalDbUrl || Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = externalDbKey || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);
    
    console.log("Using database:", externalDbUrl ? "EXTERNAL" : "LOVABLE CLOUD");

    // Check if there's an enabled AI agent for support
    const { data: agent, error: agentError } = await supabase
      .from("ai_agents")
      .select("*")
      .eq("use_case", "support")
      .eq("is_enabled", true)
      .limit(1)
      .single();

    if (agentError || !agent) {
      console.log("No enabled support agent found");
      return new Response(
        JSON.stringify({ success: false, message: "No support agent configured" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const typedAgent = agent as AIAgent;

    const normalizeModel = (provider: string | null | undefined, model: string | null | undefined): string => {
      const m = (model || "").trim();
      if (!m) return "google/gemini-2.5-flash";
      if (m.includes("/")) return m;

      const p = (provider || "").toLowerCase();

      if (p === "google") return `google/${m}`;

      if (p === "openai") {
        const lower = m.toLowerCase();
        if (lower === "gpt-4o") return "openai/gpt-5-mini";
        if (lower === "gpt-4o-mini") return "openai/gpt-5-nano";
        if (lower === "gpt-3.5-turbo") return "openai/gpt-5-nano";
        return "openai/gpt-5-mini";
      }

      return `google/${m}`;
    };

    const gatewayModel = normalizeModel(typedAgent.provider, typedAgent.model);
    const isGpt5Family = gatewayModel.startsWith("openai/gpt-5");

    console.log("Selected agent:", typedAgent.name, "Provider:", typedAgent.provider, "Model:", typedAgent.model, "-> Gateway model:", gatewayModel);
    
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      console.error("LOVABLE_API_KEY not configured");
      return new Response(
        JSON.stringify({ error: "AI service not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const subjectLabels: Record<string, string> = {
      acelerar: "Acelerar pedido",
      cancelar: "Cancelar pedido",
      api: "Dúvida sobre API",
      reposicao: "Reposição de entrega",
      "concluiu-sem-entregar": "Concluiu sem entregar",
      servicos: "Dúvida sobre serviços",
      outros: "Outros assuntos",
    };

    // Fetch chat messages for context
    const { data: chatMessages } = await supabase
      .from("ticket_messages")
      .select("sender_type, message, created_at")
      .eq("ticket_id", ticketId)
      .order("created_at", { ascending: true });

    // Build conversation history from chat messages
    let conversationHistory = "";
    if (chatMessages && chatMessages.length > 0) {
      conversationHistory = chatMessages.map((msg: any) => {
        const sender = msg.sender_type === "user" ? "👤 Cliente" : "🤖 Suporte";
        const time = new Date(msg.created_at).toLocaleString("pt-BR");
        return `${sender} (${time}):\n${msg.message}`;
      }).join("\n\n---\n\n");
    } else {
      // Fallback to message field if no chat messages yet
      conversationHistory = message;
    }

    // Build order context with all details
    const orderContext = await buildOrderContext(supabase, conversationHistory + " " + message, orderId);
    console.log("Order context built:", orderContext.substring(0, 500) + "...");

    // Build service context if asking about services
    const serviceContext = await buildServiceContext(supabase, message, subject, conversationHistory);
    console.log("Service context built:", serviceContext.substring(0, 500) + "...");

    // Enhanced system prompt with order and service context capabilities
    const defaultSystemPrompt = `Você é um assistente de suporte ao cliente para uma plataforma de serviços de marketing digital (SMM Panel). 
Você deve responder tickets de suporte de forma profissional, educada e objetiva.

IMPORTANTE: Você tem acesso às informações completas dos pedidos E dos serviços disponíveis. Use esses dados para responder com precisão!

Diretrizes:
- Seja cordial e empático
- Forneça respostas claras e úteis baseadas nos dados reais
- Se o usuário menciona um ID de pedido, você terá acesso a todas as informações desse pedido
- Se o usuário pergunta sobre serviços, você pode buscar informações detalhadas pelo ID ou nome
- Para REPOSIÇÃO: Verifique se o serviço oferece refill e oriente o usuário a clicar no botão de reposição
- Para CANCELAMENTO: Verifique se o serviço permite cancelamento e o status atual
- Para STATUS: Informe baseado nos dados reais do pedido
- Para SERVIÇOS: Informe preço, quantidades, tempo estimado, se tem reposição/cancelamento
- Use português brasileiro
- Não prometa prazos específicos para entregas
- Se não conseguir encontrar o pedido ou serviço, peça o ID correto
- Para dúvidas de serviços, peça o ID do serviço (visível na página de Serviços) ou o nome do serviço

REGRAS DE STATUS DO TICKET:
- 'resolved' → Se a dúvida foi esclarecida ou o usuário agradeceu
- 'in_progress' → Se precisa de ação técnica ou aguardando resposta
- 'open' → Se a mensagem não está clara ou falta informação`;

    const systemPrompt = typedAgent.system_prompt || defaultSystemPrompt;

    // Build the user message with context
    let contextMessage = `
Ticket de Suporte:
- Assunto: ${subjectLabels[subject] || subject}
- Histórico completo da conversa:

${conversationHistory}`;

    if (orderId) {
      contextMessage += `\n\n- ID do Pedido informado pelo usuário: ${orderId}`;
    }

    // Add order context with all details
    contextMessage += orderContext;

    // Add service context if available
    contextMessage += serviceContext;

    contextMessage += `\n\nCom base nas informações acima, responda o usuário de forma precisa e útil.`;

    // Call the Lovable AI Gateway
    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify((() => {
        const body: Record<string, unknown> = {
          model: gatewayModel,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: contextMessage },
          ],
          tools: [
            {
              type: "function",
              function: {
                name: "respond_ticket",
                description: "Responde ao ticket de suporte com uma mensagem e define o status apropriado.",
                parameters: {
                  type: "object",
                  properties: {
                    response: {
                      type: "string",
                      description: "A resposta para o usuário em português brasileiro. Seja cordial, profissional e objetivo. Use as informações dos pedidos para responder com precisão.",
                    },
                    status: {
                      type: "string",
                      enum: ["open", "in_progress", "resolved"],
                      description: "O status do ticket. 'resolved' se resolveu a dúvida. 'in_progress' se precisa de ação. 'open' se falta informação.",
                    },
                  },
                  required: ["response", "status"],
                  additionalProperties: false,
                },
              },
            },
          ],
          tool_choice: { type: "function", function: { name: "respond_ticket" } },
        };

        const configuredMax = typedAgent.max_tokens || 1024;
        const maxTokens = isGpt5Family ? Math.max(configuredMax, 1024) : configuredMax;

        if (isGpt5Family) {
          body.max_completion_tokens = maxTokens;
        } else {
          body.temperature = typedAgent.temperature || 0.7;
          body.max_tokens = maxTokens;
        }

        return body;
      })()),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("AI gateway error:", response.status, errorText);
      
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: "Rate limit exceeded, please try again later" }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (response.status === 402) {
        return new Response(
          JSON.stringify({ error: "Payment required for AI service" }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      
      return new Response(
        JSON.stringify({ error: "AI service error" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const aiResponse = await response.json();
    console.log("AI Response:", JSON.stringify(aiResponse, null, 2));

    let generatedResponse = "";
    let ticketStatus = "in_progress";

    const extractFromAiResponse = (r: any) => {
      const toolCalls = r?.choices?.[0]?.message?.tool_calls;
      if (toolCalls && toolCalls.length > 0) {
        try {
          const toolArgs = JSON.parse(toolCalls[0].function.arguments);
          return {
            response: String(toolArgs.response || ""),
            status: String(toolArgs.status || "in_progress"),
            tool: true,
          };
        } catch (parseError) {
          console.error("Error parsing tool call:", parseError);
        }
      }
      return {
        response: String(r?.choices?.[0]?.message?.content || ""),
        status: "in_progress",
        tool: false,
      };
    };

    ({ response: generatedResponse, status: ticketStatus } = extractFromAiResponse(aiResponse));

    // Fallback: retry with Gemini if empty
    if (!generatedResponse?.trim()) {
      console.warn("Empty AI output; retrying with google/gemini-2.5-flash");
      const retry = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${LOVABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash",
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: contextMessage },
          ],
          temperature: 0.4,
          max_tokens: 1024,
          tools: [
            {
              type: "function",
              function: {
                name: "respond_ticket",
                description: "Responde ao ticket de suporte com uma mensagem e define o status apropriado.",
                parameters: {
                  type: "object",
                  properties: {
                    response: { type: "string" },
                    status: { type: "string", enum: ["open", "in_progress", "resolved"] },
                  },
                  required: ["response", "status"],
                  additionalProperties: false,
                },
              },
            },
          ],
          tool_choice: { type: "function", function: { name: "respond_ticket" } },
        }),
      });

      if (retry.ok) {
        const retryJson = await retry.json();
        console.log("AI Retry Response:", JSON.stringify(retryJson, null, 2));
        ({ response: generatedResponse, status: ticketStatus } = extractFromAiResponse(retryJson));
      } else {
        const t = await retry.text();
        console.error("AI retry failed:", retry.status, t);
      }
    }

    if (!generatedResponse?.trim()) {
      console.error("No response from AI");
      return new Response(
        JSON.stringify({ error: "No response from AI" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const validStatuses = ["open", "in_progress", "resolved"];
    if (!validStatuses.includes(ticketStatus)) {
      ticketStatus = "in_progress";
    }

    // Try to insert the AI response as a chat message first.
    // Some older/external databases only allow sender_type: user/admin/ai.
    // We attempt "support" first, then fall back to "admin" if a constraint blocks it.
    let messageError: { message: string } | null = null;

    {
      const { error } = await supabase
        .from("ticket_messages")
        .insert({
          ticket_id: ticketId,
          sender_type: "support",
          message: generatedResponse,
        });

      if (error) {
        const errMsg = String(error.message || "");
        // Retry for databases that don't accept 'support'
        if (errMsg.includes("valid_sender_type") || errMsg.includes("check constraint")) {
          const { error: retryInsertError } = await supabase
            .from("ticket_messages")
            .insert({
              ticket_id: ticketId,
              sender_type: "admin",
              message: generatedResponse,
            });

          if (retryInsertError) {
            messageError = { message: String(retryInsertError.message || retryInsertError) };
          }
        } else {
          messageError = { message: errMsg };
        }
      }
    }

    if (messageError) {
      console.log(
        "ticket_messages not available, using legacy admin_response accumulation:",
        messageError.message
      );

      // Fetch current ticket to get existing admin_response
      const { data: currentTicket } = await supabase
        .from("support_tickets")
        .select("admin_response")
        .eq("id", ticketId)
        .single();

      // Accumulate admin responses with timestamp separator
      const now = new Date().toLocaleString("pt-BR");
      const existingResponse = currentTicket?.admin_response || "";
      const accumulatedResponse = existingResponse
        ? `${existingResponse}\n\n---\n[${now}]\n${generatedResponse}`
        : generatedResponse;

      // Update the ticket with accumulated response
      const { error: updateError } = await supabase
        .from("support_tickets")
        .update({
          admin_response: accumulatedResponse,
          status: ticketStatus,
          updated_at: new Date().toISOString(),
        })
        .eq("id", ticketId);

      if (updateError) {
        console.error("Error updating ticket:", updateError);
        return new Response(
          JSON.stringify({ error: "Failed to update ticket" }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    } else {
      // ticket_messages worked, just update status
      const { error: updateError } = await supabase
        .from("support_tickets")
        .update({
          admin_response: generatedResponse, // Keep latest for backwards compat
          status: ticketStatus,
          updated_at: new Date().toISOString(),
        })
        .eq("id", ticketId);

      if (updateError) {
        console.error("Error updating ticket status:", updateError);
      }
    }

    console.log("AI response generated and saved for ticket:", ticketId, "Status:", ticketStatus);

    return new Response(
      JSON.stringify({ 
        success: true, 
        response: generatedResponse,
        status: ticketStatus,
        agentName: typedAgent.name
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("Error in ai-ticket-response:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
