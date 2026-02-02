import { useState, useEffect } from "react";
import { Bot, Key, Search, Plus, Edit2, Trash2, Loader2, Sparkles, Settings2, Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { getSupabaseClient } from "@/lib/supabaseClient";
import { safeRemoveItem, safeSetItem } from "@/lib/safeStorage";

interface AIProvider {
  id: string;
  name: string;
  provider_key: string;
  api_key_configured: boolean;
  is_enabled: boolean;
}

interface AIAgent {
  id: string;
  name: string;
  description: string | null;
  use_case: string;
  provider: string;
  model: string;
  system_prompt: string | null;
  temperature: number;
  max_tokens: number;
  is_enabled: boolean;
}

const providerModels: Record<string, { value: string; label: string }[]> = {
  google: [
    { value: "gemini-2.5-flash", label: "Gemini 2.5 Flash (Rápido)" },
    { value: "gemini-2.5-pro", label: "Gemini 2.5 Pro (Avançado)" },
    { value: "gemini-2.5-flash-lite", label: "Gemini 2.5 Flash Lite (Econômico)" },
  ],
  openai: [
    { value: "gpt-4o", label: "GPT-4o (Mais Capaz)" },
    { value: "gpt-4o-mini", label: "GPT-4o Mini (Equilibrado)" },
    { value: "gpt-3.5-turbo", label: "GPT-3.5 Turbo (Econômico)" },
  ],
};

type UseCaseOption = { value: string; label: string; description: string };

const useCases: UseCaseOption[] = [
  {
    value: "custom",
    label: "Personalizado",
    description: "Agente livre para qualquer tarefa. Você define tudo no prompt (regras, tom, limites e formato de resposta).",
  },
  {
    value: "content",
    label: "Geração de Conteúdo",
    description: "Cria textos (posts, descrições, FAQs, scripts) seguindo suas diretrizes e padrão de marca. Pode sugerir variações e CTAs.",
  },
  {
    value: "seo",
    label: "SEO",
    description: "Sugere melhorias de SEO (títulos, meta description, headings, palavras-chave) e recomendações para páginas do site.",
  },
  {
    value: "support",
    label: "Suporte (Tickets)",
    description: "Ajuda a responder tickets, pedir informações faltantes, resumir conversas e orientar próximos passos com linguagem amigável.",
  },

  // Store / Orders
  {
    value: "store_order_guard",
    label: "Loja: Anti-duplicado (pré-Pagamento)",
    description:
      "Valida antes do pagamento se já existe pedido ativo para o MESMO serviço + MESMO link. Se existir, bloqueia a compra e mostra aviso.",
  },
  {
    value: "store_link_validator",
    label: "Loja: Validador de Link",
    description:
      "Verifica se o link informado é válido (formato, domínio e tipo correto). Se estiver errado, orienta como corrigir e impede seguir até o pagamento.",
  },
  {
    value: "store_pre_purchase_assistant",
    label: "Loja: Assistente de Compra",
    description:
      "Ajuda o usuário a escolher pacote/quantidade e preencher corretamente os dados (link, campos extras), reduzindo erros antes do pagamento.",
  },
  {
    value: "store_post_purchase_monitor",
    label: "Loja: Monitor Pós-Compra",
    description:
      "Acompanha pedidos após a compra: identifica pedidos travados, inconsistências de status e sugere ações (reprocessar, abrir ticket, informar o cliente).",
  },
  {
    value: "store_refund_rules",
    label: "Loja: Regras de Reembolso",
    description:
      "Avalia casos de reembolso com base em regras do negócio (status, prazos, evidências) e recomenda decisão com justificativa clara.",
  },

  // Operations / Admin
  {
    value: "admin_ops",
    label: "Admin: Operações",
    description:
      "Assistente operacional para rotinas do painel: checagens, procedimentos, orientações e padronização de ações do time (sem alterar dados sozinho).",
  },
  {
    value: "admin_qa",
    label: "Admin: Auditoria/Qualidade",
    description:
      "Audita configurações e fluxos (serviços, preços, textos, regras) e aponta riscos/erros prováveis com uma lista de correções recomendadas.",
  },
  {
    value: "admin_data_cleanup",
    label: "Admin: Limpeza/Normalização",
    description:
      "Sugere padronizações e limpeza de dados (nomes, categorias, descrições, links). Ótimo para manter catálogo organizado e consistente.",
  },
  {
    value: "admin_reporting",
    label: "Admin: Relatórios",
    description:
      "Gera resumos e insights para gestão: principais métricas, anomalias e recomendações (ex: categorias mais vendidas, gargalos e tendências).",
  },

  // Marketing
  {
    value: "marketing_copy",
    label: "Marketing: Copy e Anúncios",
    description:
      "Cria copy persuasiva para anúncios, landing pages e banners, com variações por público-alvo e objetivos (CTR, conversão, retenção).",
  },
  {
    value: "social_calendar",
    label: "Marketing: Calendário de Conteúdo",
    description:
      "Monta um calendário de postagens (temas, formatos, CTAs), com frequência e ideias por canal (Instagram, TikTok, YouTube etc.).",
  },
  {
    value: "conversion_optimizer",
    label: "Marketing: Otimização de Conversão",
    description:
      "Analisa o funil e sugere melhorias de conversão (mensagens, provas sociais, CTAs, objeções). Pode propor testes A/B e hipóteses.",
  },

  // Customer / Support
  {
    value: "support_triage",
    label: "Suporte: Triagem e Classificação",
    description:
      "Classifica tickets por urgência e tema, identifica dados faltantes e sugere roteiros de atendimento para acelerar a resolução.",
  },
  {
    value: "support_response",
    label: "Suporte: Resposta Automática",
    description:
      "Redige respostas prontas e personalizadas (com tom e política do negócio), com perguntas objetivas para resolver mais rápido.",
  },
  {
    value: "support_refund",
    label: "Suporte: Reembolso/Disputa",
    description:
      "Ajuda a conduzir casos de disputa: checa requisitos, solicita evidências e sugere resolução (reembolso, reposição, crédito) com argumentos.",
  },

  // Finance
  {
    value: "pix_reconcile",
    label: "Financeiro: Conciliação PIX",
    description:
      "Concilia pagamentos PIX: identifica divergências (pago x pendente), duplicidades e falhas de confirmação, e sugere correções/ações.",
  },
  {
    value: "fraud_risk",
    label: "Financeiro: Risco/Fraude",
    description:
      "Analisa sinais de risco (padrões suspeitos de compras, repetição de links, volume anormal) e recomenda bloqueios, validações extras e alertas.",
  },
];

const useCaseDescriptionByValue = new Map(useCases.map((u) => [u.value, u.description] as const));

const AdminAI = () => {
  const [providers, setProviders] = useState<AIProvider[]>([]);
  const [agents, setAgents] = useState<AIAgent[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAgentDialog, setShowAgentDialog] = useState(false);
  const [editingAgent, setEditingAgent] = useState<AIAgent | null>(null);
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();

  // API Key dialog state
  const [showApiKeyDialog, setShowApiKeyDialog] = useState(false);
  const [selectedProvider, setSelectedProvider] = useState<AIProvider | null>(null);
  const [apiKeyInput, setApiKeyInput] = useState("");
  const [savingApiKey, setSavingApiKey] = useState(false);

  // Agent form state
  const [agentName, setAgentName] = useState("");
  const [agentDescription, setAgentDescription] = useState("");
  const [agentUseCase, setAgentUseCase] = useState("custom");
  const [agentProvider, setAgentProvider] = useState("google");
  const [agentModel, setAgentModel] = useState("gemini-2.5-flash");
  const [agentPrompt, setAgentPrompt] = useState("");
  const [agentTemperature, setAgentTemperature] = useState(0.7);
  const [agentMaxTokens, setAgentMaxTokens] = useState(1024);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const supabase = getSupabaseClient();
      const [providersRes, agentsRes] = await Promise.all([
        supabase.from("ai_providers").select("*").in("provider_key", ["google", "openai"]).order("created_at"),
        supabase.from("ai_agents").select("*").order("created_at", { ascending: false }),
      ]);

      if (providersRes.error) throw providersRes.error;
      if (agentsRes.error) throw agentsRes.error;

      // Deduplicate providers by provider_key (keep first of each)
      const uniqueProviders: AIProvider[] = [];
      const seenKeys = new Set<string>();
      for (const provider of (providersRes.data || [])) {
        if (!seenKeys.has(provider.provider_key)) {
          seenKeys.add(provider.provider_key);
          uniqueProviders.push(provider);
        }
      }

      setProviders(uniqueProviders);
      setAgents(agentsRes.data || []);
    } catch (error) {
      console.error("Error fetching data:", error);
      toast({
        title: "Erro",
        description: "Não foi possível carregar os dados.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const toggleProvider = async (id: string, enabled: boolean) => {
    try {
      const supabase = getSupabaseClient();
      const { error } = await supabase
        .from("ai_providers")
        .update({ is_enabled: enabled, updated_at: new Date().toISOString() })
        .eq("id", id);

      if (error) throw error;

      setProviders(prev => prev.map(p => p.id === id ? { ...p, is_enabled: enabled } : p));
      toast({ title: "Sucesso", description: `Provedor ${enabled ? "ativado" : "desativado"}.` });
    } catch (error) {
      console.error("Error toggling provider:", error);
      toast({ title: "Erro", description: "Não foi possível atualizar o provedor.", variant: "destructive" });
    }
  };

  const openApiKeyDialog = (provider: AIProvider) => {
    setSelectedProvider(provider);
    setApiKeyInput("");
    setShowApiKeyDialog(true);
  };

  const handleSaveApiKey = async () => {
    if (!selectedProvider || !apiKeyInput.trim()) {
      toast({ title: "Erro", description: "API Key é obrigatória.", variant: "destructive" });
      return;
    }

    setSavingApiKey(true);
    try {
      // Store the API key in localStorage (encrypted in production should use a proper secret manager)
      const storageKey = `ai_api_key_${selectedProvider.provider_key}`;
      safeSetItem(storageKey, apiKeyInput.trim());

      // Update the provider status in database
      const supabase = getSupabaseClient();
      const { error } = await supabase
        .from("ai_providers")
        .update({ 
          api_key_configured: true,
          updated_at: new Date().toISOString() 
        })
        .eq("id", selectedProvider.id);

      if (error) throw error;

      setProviders(prev => prev.map(p => 
        p.id === selectedProvider.id ? { ...p, api_key_configured: true } : p
      ));
      
      toast({ 
        title: "Sucesso", 
        description: `API Key do ${selectedProvider.name} configurada com sucesso!` 
      });
      setShowApiKeyDialog(false);
      setApiKeyInput("");
    } catch (error) {
      console.error("Error saving API key:", error);
      toast({ 
        title: "Erro", 
        description: "Não foi possível salvar a API Key.", 
        variant: "destructive" 
      });
    } finally {
      setSavingApiKey(false);
    }
  };

  const handleRemoveApiKey = async () => {
    if (!selectedProvider) return;
    
    if (!confirm(`Tem certeza que deseja remover a API Key do ${selectedProvider.name}?`)) return;

    setSavingApiKey(true);
    try {
      const storageKey = `ai_api_key_${selectedProvider.provider_key}`;
      safeRemoveItem(storageKey);

      const supabase = getSupabaseClient();
      const { error } = await supabase
        .from("ai_providers")
        .update({ 
          api_key_configured: false, 
          updated_at: new Date().toISOString() 
        })
        .eq("id", selectedProvider.id);

      if (error) throw error;

      setProviders(prev => prev.map(p => 
        p.id === selectedProvider.id ? { ...p, api_key_configured: false } : p
      ));
      
      toast({ 
        title: "Sucesso", 
        description: `API Key do ${selectedProvider.name} removida.` 
      });
      setShowApiKeyDialog(false);
    } catch (error) {
      console.error("Error removing API key:", error);
      toast({ 
        title: "Erro", 
        description: "Não foi possível remover a API Key.", 
        variant: "destructive" 
      });
    } finally {
      setSavingApiKey(false);
    }
  };

  const toggleAgent = async (id: string, enabled: boolean) => {
    try {
      const supabase = getSupabaseClient();
      const { error } = await supabase
        .from("ai_agents")
        .update({ is_enabled: enabled, updated_at: new Date().toISOString() })
        .eq("id", id);

      if (error) throw error;

      setAgents(prev => prev.map(a => a.id === id ? { ...a, is_enabled: enabled } : a));
    } catch (error) {
      console.error("Error toggling agent:", error);
      toast({ title: "Erro", description: "Não foi possível atualizar o agente.", variant: "destructive" });
    }
  };

  const openNewAgentDialog = () => {
    setEditingAgent(null);
    setAgentName("");
    setAgentDescription("");
    setAgentUseCase("custom");
    setAgentProvider("google");
    setAgentModel("gemini-2.5-flash");
    setAgentPrompt("");
    setAgentTemperature(0.7);
    setAgentMaxTokens(1024);
    setShowAgentDialog(true);
  };

  const openEditAgentDialog = (agent: AIAgent) => {
    setEditingAgent(agent);
    setAgentName(agent.name);
    setAgentDescription(agent.description || "");
    setAgentUseCase(agent.use_case);
    setAgentProvider(agent.provider);
    setAgentModel(agent.model);
    setAgentPrompt(agent.system_prompt || "");
    setAgentTemperature(agent.temperature);
    setAgentMaxTokens(agent.max_tokens);
    setShowAgentDialog(true);
  };

  const handleSaveAgent = async () => {
    if (!agentName.trim()) {
      toast({ title: "Erro", description: "Nome do agente é obrigatório.", variant: "destructive" });
      return;
    }

    setSaving(true);
    try {
      const agentData = {
        name: agentName.trim(),
        description: agentDescription.trim() || null,
        use_case: agentUseCase,
        provider: agentProvider,
        model: agentModel,
        system_prompt: agentPrompt.trim() || null,
        temperature: agentTemperature,
        max_tokens: agentMaxTokens,
        updated_at: new Date().toISOString(),
      };

      const supabase = getSupabaseClient();
      if (editingAgent) {
        const { error } = await supabase
          .from("ai_agents")
          .update(agentData)
          .eq("id", editingAgent.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("ai_agents").insert(agentData);
        if (error) throw error;
      }

      toast({ title: "Sucesso", description: `Agente ${editingAgent ? "atualizado" : "criado"} com sucesso!` });
      setShowAgentDialog(false);
      fetchData();
    } catch (error) {
      console.error("Error saving agent:", error);
      toast({ title: "Erro", description: "Não foi possível salvar o agente.", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteAgent = async (id: string) => {
    if (!confirm("Tem certeza que deseja excluir este agente?")) return;

    try {
      const supabase = getSupabaseClient();
      const { error } = await supabase.from("ai_agents").delete().eq("id", id);
      if (error) throw error;

      setAgents(prev => prev.filter(a => a.id !== id));
      toast({ title: "Sucesso", description: "Agente excluído com sucesso." });
    } catch (error) {
      console.error("Error deleting agent:", error);
      toast({ title: "Erro", description: "Não foi possível excluir o agente.", variant: "destructive" });
    }
  };

  const getProviderIcon = (key: string) => {
    switch (key) {
      case "google": return <Sparkles className="w-6 h-6 text-purple-400" />;
      case "openai": return <Bot className="w-6 h-6 text-emerald-400" />;
      default: return <Bot className="w-6 h-6" />;
    }
  };

  const getProviderGradient = (key: string) => {
    switch (key) {
      case "google": return "from-purple-500/20 to-purple-900/40 border-purple-500/30";
      case "openai": return "from-emerald-500/20 to-emerald-900/40 border-emerald-500/30";
      default: return "from-primary/20 to-primary/40 border-primary/30";
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6 p-4 sm:p-6">
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold flex items-center gap-2 sm:gap-3">
          <Settings2 className="w-6 h-6 sm:w-8 sm:h-8" />
          Configuração de IA
        </h1>
        <p className="text-muted-foreground mt-1 text-sm sm:text-base">
          Gerencie provedores de IA e agentes personalizados
        </p>
      </div>

      <Tabs defaultValue="providers" className="space-y-6">
        <TabsList className="bg-card/50 border border-border/50 w-full sm:w-auto flex-wrap h-auto p-1">
          <TabsTrigger value="providers" className="gap-1 sm:gap-2 text-xs sm:text-sm px-2 sm:px-3">
            <Key className="w-3 h-3 sm:w-4 sm:h-4" />
            <span className="hidden xs:inline">Provedores</span>
            <span className="xs:hidden">APIs</span>
          </TabsTrigger>
          <TabsTrigger value="agents" className="gap-1 sm:gap-2 text-xs sm:text-sm px-2 sm:px-3">
            <Bot className="w-3 h-3 sm:w-4 sm:h-4" />
            Agentes
          </TabsTrigger>
          <TabsTrigger value="seo" className="gap-1 sm:gap-2 text-xs sm:text-sm px-2 sm:px-3">
            <Search className="w-3 h-3 sm:w-4 sm:h-4" />
            SEO
          </TabsTrigger>
        </TabsList>

        {/* Providers Tab */}
        <TabsContent value="providers" className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {providers.map((provider) => (
              <Card 
                key={provider.id} 
                className={`bg-gradient-to-br ${getProviderGradient(provider.provider_key)} border`}
              >
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-lg bg-background/50 flex items-center justify-center">
                        {getProviderIcon(provider.provider_key)}
                      </div>
                      <div>
                        <CardTitle className="text-lg">{provider.name}</CardTitle>
                        <p className="text-xs text-muted-foreground capitalize">{provider.provider_key}</p>
                      </div>
                    </div>
                    <Switch
                      checked={provider.is_enabled}
                      onCheckedChange={(checked) => toggleProvider(provider.id, checked)}
                    />
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  
                  <Badge 
                    variant={provider.api_key_configured ? "default" : "destructive"}
                    className={provider.api_key_configured ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/30" : ""}
                  >
                    {provider.api_key_configured ? "API Configurada" : "API Não Configurada"}
                  </Badge>

                  <Button 
                    variant="outline" 
                    size="sm" 
                    className="w-full gap-2"
                    onClick={() => openApiKeyDialog(provider)}
                  >
                    <Key className="w-4 h-4" />
                    {provider.api_key_configured ? "Alterar API Key" : "Configurar API Key"}
                  </Button>

                  <div className="pt-2 border-t border-border/50">
                    <p className="text-xs text-muted-foreground mb-2">Modelos disponíveis:</p>
                    <ul className="space-y-1">
                      {providerModels[provider.provider_key]?.map((model) => (
                        <li key={model.value} className="text-sm flex items-center gap-2">
                          <span className="w-1.5 h-1.5 rounded-full bg-primary" />
                          {model.label}
                        </li>
                      ))}
                    </ul>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        {/* Agents Tab */}
        <TabsContent value="agents" className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-muted-foreground">
              Crie agentes de IA personalizados com prompts específicos
            </p>
            <Button onClick={openNewAgentDialog} className="gap-2">
              <Plus className="w-4 h-4" />
              Novo Agente
            </Button>
          </div>

          {agents.length === 0 ? (
            <Card className="p-8 text-center">
              <Bot className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
              <p className="text-muted-foreground">Nenhum agente criado ainda.</p>
              <Button onClick={openNewAgentDialog} className="mt-4 gap-2">
                <Plus className="w-4 h-4" />
                Criar Primeiro Agente
              </Button>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {agents.map((agent) => (
                <Card key={agent.id} className="border-border/50">
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <Bot className="w-5 h-5 text-primary" />
                        <div>
                          <CardTitle className="text-lg">{agent.name}</CardTitle>
                          <p className="text-xs text-muted-foreground">{agent.description}</p>
                        </div>
                      </div>
                      <Switch
                        checked={agent.is_enabled}
                        onCheckedChange={(checked) => toggleAgent(agent.id, checked)}
                      />
                    </div>
                  </CardHeader>
                  <CardContent>
                    <Badge variant="secondary" className="mb-3">{agent.model}</Badge>
                    <div className="flex gap-2">
                      <Button 
                        variant="outline" 
                        size="sm" 
                        className="flex-1 gap-2"
                        onClick={() => openEditAgentDialog(agent)}
                      >
                        <Edit2 className="w-4 h-4" />
                        Editar
                      </Button>
                      <Button 
                        variant="ghost" 
                        size="sm"
                        className="text-destructive hover:text-destructive"
                        onClick={() => handleDeleteAgent(agent.id)}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        {/* SEO Tab */}
        <TabsContent value="seo" className="space-y-4">
          <Card className="p-8 text-center">
            <Search className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
            <p className="text-muted-foreground">Ações de SEO com IA em breve.</p>
            <p className="text-sm text-muted-foreground mt-2">
              Configure agentes para otimização automática de SEO, meta tags e conteúdo.
            </p>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Agent Dialog */}
      <Dialog open={showAgentDialog} onOpenChange={setShowAgentDialog}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Bot className="w-5 h-5" />
              {editingAgent ? "Editar Agente" : "Criar Novo Agente"}
            </DialogTitle>
            <p className="text-sm text-muted-foreground">
              Configure um agente de IA para automatizar tarefas
            </p>
          </DialogHeader>

          <div className="space-y-6 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="flex items-center gap-1">
                  <span className="text-primary">•</span> Nome do Agente
                </Label>
                <Input
                  value={agentName}
                  onChange={(e) => setAgentName(e.target.value)}
                  placeholder="Ex: Moderador de Mensagens"
                />
              </div>
              <div className="space-y-2">
                <Label className="flex items-center gap-1">
                  <span className="text-primary">•</span> Caso de Uso
                </Label>
                <Select
                  value={agentUseCase}
                  onValueChange={(v) => {
                    setAgentUseCase(v);
                    const suggested = useCaseDescriptionByValue.get(v) || "";
                    if (!agentDescription.trim()) setAgentDescription(suggested);
                  }}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {useCases.map((uc) => (
                      <SelectItem key={uc.value} value={uc.value}>
                        <div className="flex gap-2">
                          <Sparkles className="w-4 h-4 mt-0.5" />
                          <div className="min-w-0">
                            <div className="font-medium leading-tight">{uc.label}</div>
                            <div className="text-xs text-muted-foreground leading-snug whitespace-normal">
                              {uc.description}
                            </div>
                          </div>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  {useCaseDescriptionByValue.get(agentUseCase) || ""}
                </p>
              </div>
            </div>

            <div className="space-y-2">
              <Label className="flex items-center gap-1">
                <span className="text-emerald-400">•</span> Descrição
              </Label>
              <Textarea
                value={agentDescription}
                onChange={(e) => setAgentDescription(e.target.value)}
                placeholder="Breve descrição do que o agente faz"
                className="min-h-[96px] resize-y"
              />
            </div>

            <Card className="p-4 bg-card/50">
              <div className="flex items-center gap-2 mb-4">
                <Settings2 className="w-4 h-4" />
                <span className="font-medium">Configuração do Modelo</span>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Provedor</Label>
                  <Select value={agentProvider} onValueChange={(v) => {
                    setAgentProvider(v);
                    setAgentModel(providerModels[v]?.[0]?.value || "");
                  }}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {providers.filter(p => p.provider_key === "google" || p.provider_key === "openai").map((p) => (
                        <SelectItem key={p.provider_key} value={p.provider_key}>
                          {p.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Modelo</Label>
                  <Select value={agentModel} onValueChange={setAgentModel}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {providerModels[agentProvider]?.map((m) => (
                        <SelectItem key={m.value} value={m.value}>
                          {m.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </Card>

            <div className="space-y-2">
              <Label className="flex items-center gap-1">
                <span className="text-amber-400">•</span> Prompt do Sistema
              </Label>
              <Textarea
                value={agentPrompt}
                onChange={(e) => setAgentPrompt(e.target.value)}
                placeholder="Você é um assistente especializado em..."
                className="min-h-[120px]"
              />
              <p className="text-xs text-muted-foreground">
                Defina o comportamento e personalidade do agente
              </p>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <Card className="p-4 bg-emerald-500/10 border-emerald-500/20">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-emerald-400" />
                    <span className="font-medium">Temperatura</span>
                  </div>
                  <Badge variant="secondary">
                    {agentTemperature <= 0.3 ? "Preciso" : agentTemperature <= 0.7 ? "Equilibrado" : "Criativo"}
                  </Badge>
                </div>
                <p className="text-2xl font-bold text-emerald-400 mb-2">{agentTemperature}</p>
                <Slider
                  value={[agentTemperature]}
                  onValueChange={([v]) => setAgentTemperature(v)}
                  min={0}
                  max={1}
                  step={0.1}
                  className="mb-2"
                />
                <p className="text-xs text-muted-foreground">
                  Menor = mais consistente • Maior = mais criativo
                </p>
              </Card>

              <Card className="p-4 bg-amber-500/10 border-amber-500/20">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-amber-400" />
                    <span className="font-medium">Max Tokens</span>
                  </div>
                  <Badge variant="secondary">
                    {agentMaxTokens <= 512 ? "Curto" : agentMaxTokens <= 1024 ? "Médio" : "Longo"}
                  </Badge>
                </div>
                <p className="text-2xl font-bold text-amber-400 mb-2">{agentMaxTokens}</p>
                <Slider
                  value={[agentMaxTokens]}
                  onValueChange={([v]) => setAgentMaxTokens(v)}
                  min={256}
                  max={4096}
                  step={256}
                  className="mb-2"
                />
                <p className="text-xs text-muted-foreground">
                  Limite de tokens por resposta do agente
                </p>
              </Card>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAgentDialog(false)}>
              Cancelar
            </Button>
            <Button onClick={handleSaveAgent} disabled={saving} className="gap-2">
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Bot className="w-4 h-4" />}
              {editingAgent ? "Salvar Alterações" : "Criar Agente"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* API Key Dialog */}
      <Dialog open={showApiKeyDialog} onOpenChange={setShowApiKeyDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Key className="w-5 h-5" />
              Configurar API Key - {selectedProvider?.name}
            </DialogTitle>
            <p className="text-sm text-muted-foreground">
              {selectedProvider?.api_key_configured 
                ? "Altere a API Key ou remova a configuração existente."
                : "Insira a API Key do provedor para habilitar a integração."}
            </p>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label className="flex items-center gap-1">
                <span className="text-primary">•</span> API Key
              </Label>
              <div className="relative">
                <Input
                  type="password"
                  value={apiKeyInput}
                  onChange={(e) => setApiKeyInput(e.target.value)}
                  placeholder={selectedProvider?.api_key_configured ? "••••••••••••••••" : "sk-..."}
                  className="pr-10"
                />
              </div>
              <p className="text-xs text-muted-foreground">
                {selectedProvider?.provider_key === "google" 
                  ? "Obtenha sua API Key em: console.cloud.google.com"
                  : "Obtenha sua API Key em: platform.openai.com"}
              </p>
            </div>

            {selectedProvider?.api_key_configured && (
              <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-lg">
                <p className="text-sm text-emerald-400 flex items-center gap-2">
                  <Key className="w-4 h-4" />
                  API Key já está configurada
                </p>
              </div>
            )}
          </div>

          <DialogFooter className="flex gap-2">
            {selectedProvider?.api_key_configured && (
              <Button 
                variant="destructive" 
                onClick={handleRemoveApiKey} 
                disabled={savingApiKey}
                className="mr-auto"
              >
                {savingApiKey ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                Remover
              </Button>
            )}
            <Button variant="outline" onClick={() => setShowApiKeyDialog(false)}>
              Cancelar
            </Button>
            <Button onClick={handleSaveApiKey} disabled={savingApiKey || !apiKeyInput.trim()} className="gap-2">
              {savingApiKey ? <Loader2 className="w-4 h-4 animate-spin" /> : <Key className="w-4 h-4" />}
              {selectedProvider?.api_key_configured ? "Atualizar" : "Salvar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AdminAI;
