import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { getSupabaseClient } from "@/lib/supabaseClient";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Switch } from "@/components/ui/switch";
import { Store } from "lucide-react";
import {
  Layout,
  Save,
  Eye,
  Zap,
  Shield,
  Clock,
  TrendingUp,
  Star,
  Heart,
  Rocket,
  Target,
  Award,
  CheckCircle,
  Globe,
  Users,
  Sparkles,
} from "lucide-react";

const ICON_OPTIONS = [
  { value: "Zap", label: "Raio", icon: Zap },
  { value: "Shield", label: "Escudo", icon: Shield },
  { value: "Clock", label: "Relógio", icon: Clock },
  { value: "TrendingUp", label: "Tendência", icon: TrendingUp },
  { value: "Star", label: "Estrela", icon: Star },
  { value: "Heart", label: "Coração", icon: Heart },
  { value: "Rocket", label: "Foguete", icon: Rocket },
  { value: "Target", label: "Alvo", icon: Target },
  { value: "Award", label: "Prêmio", icon: Award },
  { value: "CheckCircle", label: "Check", icon: CheckCircle },
  { value: "Globe", label: "Globo", icon: Globe },
  { value: "Users", label: "Usuários", icon: Users },
  { value: "Sparkles", label: "Brilho", icon: Sparkles },
];

interface LandingContent {
  id: string;
  site_name: string;
  hero_badge_text: string;
  hero_title_line1: string;
  hero_title_highlight: string;
  hero_subtitle: string;
  hero_button_primary: string;
  hero_button_secondary: string;
  features_title: string;
  features_title_highlight: string;
  features_subtitle: string;
  feature1_icon: string;
  feature1_title: string;
  feature1_description: string;
  feature2_icon: string;
  feature2_title: string;
  feature2_description: string;
  feature3_icon: string;
  feature3_title: string;
  feature3_description: string;
  feature4_icon: string;
  feature4_title: string;
  feature4_description: string;
  cta_title: string;
  cta_subtitle: string;
  cta_button_text: string;
  footer_copyright: string;
  updated_at: string;
}

interface StoreFrontend {
  id: string;
  name: string;
  slug: string;
}

// Component for Store Landing Settings
const StoreLandingSettings = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: settings, isLoading: loadingSettings } = useQuery({
    queryKey: ["site-settings-store-landing"],
    queryFn: async () => {
      const supabase = getSupabaseClient();

      const { data, error } = await supabase
        .from("site_settings")
        .select("id, use_store_landing, store_landing_slug")
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) {
        // Postgres undefined_column: external DB can be out of sync
        if ((error as any)?.code === "42703" || String((error as any)?.message || "").includes("does not exist")) {
          const { data: fallback, error: fallbackError } = await supabase
            .from("site_settings")
            .select("id")
            .order("updated_at", { ascending: false })
            .limit(1)
            .maybeSingle();

          if (fallbackError) throw fallbackError;

          return {
            id: (fallback as any)?.id,
            use_store_landing: false,
            store_landing_slug: "loja",
            __missing_store_landing_columns: true,
          };
        }

        throw error;
      }

      return data;
    },
  });

  const { data: storeFrontends = [] } = useQuery({
    queryKey: ["store-frontends-list"],
    queryFn: async () => {
      const supabase = getSupabaseClient();
      const { data, error } = await supabase
        .from("store_frontends")
        .select("id, name, slug")
        .eq("is_active", true)
        .order("name");
      if (error) throw error;
      return data as StoreFrontend[];
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ useStoreLanding, storeSlug }: { useStoreLanding: boolean; storeSlug: string }) => {
      if ((settings as any)?.__missing_store_landing_columns) {
        throw new Error(
          "Seu banco externo está sem as colunas 'use_store_landing' e 'store_landing_slug'. Atualize o schema do banco externo e tente novamente."
        );
      }

      const supabase = getSupabaseClient();

      // If site_settings is empty, create a default row first
      let settingsId = settings?.id;
      if (!settingsId) {
        const { data: created, error: createError } = await supabase
          .from("site_settings")
          .insert({
            site_title: "SMM Panel",
            site_description: "",
          } as any)
          .select("id")
          .single();

        if (createError) throw createError;
        settingsId = (created as any)?.id;
      }

      if (!settingsId) throw new Error("No settings ID");

      const { error } = await supabase
        .from("site_settings")
        .update({
          use_store_landing: useStoreLanding,
          store_landing_slug: storeSlug,
          updated_at: new Date().toISOString(),
          updated_by: user?.id,
        })
        .eq("id", settingsId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["site-settings-store-landing"] });
      queryClient.invalidateQueries({ queryKey: ["site-settings-landing"] });
      toast({
        title: "Configuração salva!",
        description: "A landing page foi atualizada.",
      });
    },
    onError: (error) => {
      toast({
        title: "Erro ao salvar",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleToggle = (checked: boolean) => {
    updateMutation.mutate({
      useStoreLanding: checked,
      storeSlug: settings?.store_landing_slug || "loja",
    });
  };

  const handleSlugChange = (slug: string) => {
    updateMutation.mutate({
      useStoreLanding: settings?.use_store_landing || false,
      storeSlug: slug,
    });
  };

  if (loadingSettings) {
    return <Skeleton className="h-24 w-full rounded-lg" />;
  }

  return (
    <Card className="border-primary/30 bg-gradient-to-r from-primary/5 to-transparent mb-6">
      <CardContent className="p-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-primary/20 flex items-center justify-center">
              <Store className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h3 className="font-semibold">Landing Page da Loja</h3>
              <p className="text-sm text-muted-foreground">
                Usar a página da loja como página principal do site
              </p>
            </div>
          </div>
          
          <div className="flex items-center gap-4">
            {settings?.use_store_landing && !(settings as any)?.__missing_store_landing_columns && storeFrontends.length > 0 && (
              <Select
                value={settings.store_landing_slug || "loja"}
                onValueChange={handleSlugChange}
              >
                <SelectTrigger className="w-40">
                  <SelectValue placeholder="Selecione a loja" />
                </SelectTrigger>
                <SelectContent>
                  {storeFrontends.map((frontend) => (
                    <SelectItem key={frontend.id} value={frontend.slug}>
                      {frontend.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            <Switch
              checked={settings?.use_store_landing || false}
              onCheckedChange={handleToggle}
              disabled={updateMutation.isPending || Boolean((settings as any)?.__missing_store_landing_columns)}
            />
          </div>
        </div>
        
        {Boolean((settings as any)?.__missing_store_landing_columns) ? (
          <div className="mt-3 p-2 rounded-lg bg-destructive/10 border border-destructive/20">
            <p className="text-sm text-destructive">
              Seu <strong>banco externo</strong> está desatualizado e não tem as colunas necessárias para ativar a landing da loja.
              Atualize o schema do banco externo e depois tente ativar novamente.
            </p>
          </div>
        ) : (
          settings?.use_store_landing && (
            <div className="mt-3 p-2 rounded-lg bg-green-500/10 border border-green-500/20">
              <p className="text-sm text-green-400">
                ✓ A landing page da loja está ativa. Visitantes verão a loja na página inicial <span className="font-mono">/</span>
              </p>
            </div>
          )
        )}
      </CardContent>
    </Card>
  );
};

const AdminLanding = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isAdmin, setIsAdmin] = useState(false);
  const [formData, setFormData] = useState<LandingContent | null>(null);

  // Check admin status
  useEffect(() => {
    const checkAdmin = async () => {
      if (!user) {
        navigate("/auth");
        return;
      }

      const supabase = getSupabaseClient();
      const { data: roleData } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", user.id)
        .eq("role", "admin")
        .maybeSingle();

      if (!roleData) {
        toast({
          title: "Acesso negado",
          description: "Você não tem permissão para acessar esta página.",
          variant: "destructive",
        });
        navigate("/");
        return;
      }

      setIsAdmin(true);
    };

    checkAdmin();
  }, [user, navigate, toast]);

  // Fetch landing content
  const { data: content, isLoading } = useQuery({
    queryKey: ["landing-content"],
    queryFn: async () => {
      const supabase = getSupabaseClient();
      const { data, error } = await supabase
        .from("landing_content")
        .select("*")
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data as LandingContent;
    },
    enabled: isAdmin,
  });

  // Update form data when content loads
  useEffect(() => {
    if (content) {
      setFormData(content);
    }
  }, [content]);

  // Save mutation
  const saveMutation = useMutation({
    mutationFn: async (data: Partial<LandingContent>) => {
      if (!formData?.id) throw new Error("No content ID");
      
      const supabase = getSupabaseClient();
      const { error } = await supabase
        .from("landing_content")
        .update({
          ...data,
          updated_at: new Date().toISOString(),
          updated_by: user?.id,
        })
        .eq("id", formData.id);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["landing-content"] });
      toast({
        title: "Salvo com sucesso!",
        description: "As alterações foram salvas.",
      });
    },
    onError: (error) => {
      toast({
        title: "Erro ao salvar",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleInputChange = (field: keyof LandingContent, value: string) => {
    if (formData) {
      setFormData({ ...formData, [field]: value });
    }
  };

  const handleSave = () => {
    if (formData) {
      saveMutation.mutate(formData);
    }
  };

  const renderIconSelect = (field: keyof LandingContent, value: string) => (
    <Select value={value} onValueChange={(v) => handleInputChange(field, v)}>
      <SelectTrigger>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {ICON_OPTIONS.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            <div className="flex items-center gap-2">
              <option.icon className="w-4 h-4" />
              <span>{option.label}</span>
            </div>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );

  if (!isAdmin) {
    return null;
  }

  if (isLoading || !formData) {
    return (
      <div className="space-y-6 p-6">
        <Skeleton className="h-10 w-64" />
        <div className="grid gap-4">
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-32 w-full" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold gradient-text flex items-center gap-2">
            <Layout className="w-8 h-8" />
            Editor da Landing Page
          </h1>
          <p className="text-muted-foreground mt-1">
            Personalize todo o conteúdo da página inicial
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => window.open("/", "_blank")}>
            <Eye className="w-4 h-4 mr-2" />
            Visualizar
          </Button>
          <Button onClick={handleSave} disabled={saveMutation.isPending}>
            <Save className="w-4 h-4 mr-2" />
            {saveMutation.isPending ? "Salvando..." : "Salvar Alterações"}
          </Button>
        </div>
      </div>

      {/* Store Landing Page Toggle */}
      <StoreLandingSettings />

      <Accordion type="multiple" defaultValue={["header", "hero", "features", "cta", "footer"]} className="space-y-4">
        {/* Header Section */}
        <AccordionItem value="header" className="border rounded-lg overflow-hidden">
          <AccordionTrigger className="px-4 py-3 bg-gradient-to-r from-cyan-500/20 to-transparent hover:no-underline">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-cyan-500/30 flex items-center justify-center">
                <Globe className="w-4 h-4 text-cyan-300" />
              </div>
              <span className="font-semibold">Cabeçalho</span>
            </div>
          </AccordionTrigger>
          <AccordionContent className="px-4 py-4">
            <div className="space-y-4">
              <div>
                <Label>Nome do Site</Label>
                <Input
                  value={formData.site_name}
                  onChange={(e) => handleInputChange("site_name", e.target.value)}
                  placeholder="Nome do site"
                />
              </div>
            </div>
          </AccordionContent>
        </AccordionItem>

        {/* Hero Section */}
        <AccordionItem value="hero" className="border rounded-lg overflow-hidden">
          <AccordionTrigger className="px-4 py-3 bg-gradient-to-r from-emerald-500/20 to-transparent hover:no-underline">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-emerald-500/30 flex items-center justify-center">
                <Sparkles className="w-4 h-4 text-emerald-300" />
              </div>
              <span className="font-semibold">Seção Hero (Principal)</span>
            </div>
          </AccordionTrigger>
          <AccordionContent className="px-4 py-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="md:col-span-2">
                <Label>Texto do Badge</Label>
                <Input
                  value={formData.hero_badge_text}
                  onChange={(e) => handleInputChange("hero_badge_text", e.target.value)}
                  placeholder="Sistema Online • +10.000 pedidos entregues"
                />
              </div>
              <div>
                <Label>Título - Linha 1</Label>
                <Input
                  value={formData.hero_title_line1}
                  onChange={(e) => handleInputChange("hero_title_line1", e.target.value)}
                  placeholder="Impulsione suas"
                />
              </div>
              <div>
                <Label>Título - Destaque (colorido)</Label>
                <Input
                  value={formData.hero_title_highlight}
                  onChange={(e) => handleInputChange("hero_title_highlight", e.target.value)}
                  placeholder="Redes Sociais"
                />
              </div>
              <div className="md:col-span-2">
                <Label>Subtítulo</Label>
                <Textarea
                  value={formData.hero_subtitle}
                  onChange={(e) => handleInputChange("hero_subtitle", e.target.value)}
                  placeholder="A melhor plataforma SMM do Brasil..."
                  rows={3}
                />
              </div>
              <div>
                <Label>Botão Principal</Label>
                <Input
                  value={formData.hero_button_primary}
                  onChange={(e) => handleInputChange("hero_button_primary", e.target.value)}
                  placeholder="Acessar Painel"
                />
              </div>
              <div>
                <Label>Botão Secundário</Label>
                <Input
                  value={formData.hero_button_secondary}
                  onChange={(e) => handleInputChange("hero_button_secondary", e.target.value)}
                  placeholder="Criar Conta"
                />
              </div>
            </div>
          </AccordionContent>
        </AccordionItem>

        {/* Features Section */}
        <AccordionItem value="features" className="border rounded-lg overflow-hidden">
          <AccordionTrigger className="px-4 py-3 bg-gradient-to-r from-violet-500/20 to-transparent hover:no-underline">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-violet-500/30 flex items-center justify-center">
                <Star className="w-4 h-4 text-violet-300" />
              </div>
              <span className="font-semibold">Seção de Recursos</span>
            </div>
          </AccordionTrigger>
          <AccordionContent className="px-4 py-4">
            <div className="space-y-6">
              {/* Features Title */}
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <Label>Título da Seção</Label>
                  <Input
                    value={formData.features_title}
                    onChange={(e) => handleInputChange("features_title", e.target.value)}
                    placeholder="Por que escolher a"
                  />
                </div>
                <div>
                  <Label>Título - Destaque</Label>
                  <Input
                    value={formData.features_title_highlight}
                    onChange={(e) => handleInputChange("features_title_highlight", e.target.value)}
                    placeholder="UpMidias"
                  />
                </div>
                <div className="md:col-span-2">
                  <Label>Subtítulo</Label>
                  <Input
                    value={formData.features_subtitle}
                    onChange={(e) => handleInputChange("features_subtitle", e.target.value)}
                    placeholder="Oferecemos os melhores serviços..."
                  />
                </div>
              </div>

              {/* Feature Cards */}
              <div className="grid gap-4 md:grid-cols-2">
                {/* Feature 1 */}
                <Card className="border-cyan-500/30">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm text-cyan-400">Recurso 1</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div>
                      <Label>Ícone</Label>
                      {renderIconSelect("feature1_icon", formData.feature1_icon)}
                    </div>
                    <div>
                      <Label>Título</Label>
                      <Input
                        value={formData.feature1_title}
                        onChange={(e) => handleInputChange("feature1_title", e.target.value)}
                      />
                    </div>
                    <div>
                      <Label>Descrição</Label>
                      <Textarea
                        value={formData.feature1_description}
                        onChange={(e) => handleInputChange("feature1_description", e.target.value)}
                        rows={2}
                      />
                    </div>
                  </CardContent>
                </Card>

                {/* Feature 2 */}
                <Card className="border-emerald-500/30">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm text-emerald-400">Recurso 2</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div>
                      <Label>Ícone</Label>
                      {renderIconSelect("feature2_icon", formData.feature2_icon)}
                    </div>
                    <div>
                      <Label>Título</Label>
                      <Input
                        value={formData.feature2_title}
                        onChange={(e) => handleInputChange("feature2_title", e.target.value)}
                      />
                    </div>
                    <div>
                      <Label>Descrição</Label>
                      <Textarea
                        value={formData.feature2_description}
                        onChange={(e) => handleInputChange("feature2_description", e.target.value)}
                        rows={2}
                      />
                    </div>
                  </CardContent>
                </Card>

                {/* Feature 3 */}
                <Card className="border-amber-500/30">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm text-amber-400">Recurso 3</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div>
                      <Label>Ícone</Label>
                      {renderIconSelect("feature3_icon", formData.feature3_icon)}
                    </div>
                    <div>
                      <Label>Título</Label>
                      <Input
                        value={formData.feature3_title}
                        onChange={(e) => handleInputChange("feature3_title", e.target.value)}
                      />
                    </div>
                    <div>
                      <Label>Descrição</Label>
                      <Textarea
                        value={formData.feature3_description}
                        onChange={(e) => handleInputChange("feature3_description", e.target.value)}
                        rows={2}
                      />
                    </div>
                  </CardContent>
                </Card>

                {/* Feature 4 */}
                <Card className="border-violet-500/30">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm text-violet-400">Recurso 4</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div>
                      <Label>Ícone</Label>
                      {renderIconSelect("feature4_icon", formData.feature4_icon)}
                    </div>
                    <div>
                      <Label>Título</Label>
                      <Input
                        value={formData.feature4_title}
                        onChange={(e) => handleInputChange("feature4_title", e.target.value)}
                      />
                    </div>
                    <div>
                      <Label>Descrição</Label>
                      <Textarea
                        value={formData.feature4_description}
                        onChange={(e) => handleInputChange("feature4_description", e.target.value)}
                        rows={2}
                      />
                    </div>
                  </CardContent>
                </Card>
              </div>
            </div>
          </AccordionContent>
        </AccordionItem>

        {/* CTA Section */}
        <AccordionItem value="cta" className="border rounded-lg overflow-hidden">
          <AccordionTrigger className="px-4 py-3 bg-gradient-to-r from-amber-500/20 to-transparent hover:no-underline">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-amber-500/30 flex items-center justify-center">
                <Rocket className="w-4 h-4 text-amber-300" />
              </div>
              <span className="font-semibold">Seção CTA (Chamada para Ação)</span>
            </div>
          </AccordionTrigger>
          <AccordionContent className="px-4 py-4">
            <div className="grid gap-4">
              <div>
                <Label>Título</Label>
                <Input
                  value={formData.cta_title}
                  onChange={(e) => handleInputChange("cta_title", e.target.value)}
                  placeholder="Pronto para começar?"
                />
              </div>
              <div>
                <Label>Subtítulo</Label>
                <Textarea
                  value={formData.cta_subtitle}
                  onChange={(e) => handleInputChange("cta_subtitle", e.target.value)}
                  placeholder="Crie sua conta gratuitamente..."
                  rows={2}
                />
              </div>
              <div className="max-w-xs">
                <Label>Texto do Botão</Label>
                <Input
                  value={formData.cta_button_text}
                  onChange={(e) => handleInputChange("cta_button_text", e.target.value)}
                  placeholder="Criar Conta Grátis"
                />
              </div>
            </div>
          </AccordionContent>
        </AccordionItem>

        {/* Footer Section */}
        <AccordionItem value="footer" className="border rounded-lg overflow-hidden">
          <AccordionTrigger className="px-4 py-3 bg-gradient-to-r from-rose-500/20 to-transparent hover:no-underline">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-rose-500/30 flex items-center justify-center">
                <Layout className="w-4 h-4 text-rose-300" />
              </div>
              <span className="font-semibold">Rodapé</span>
            </div>
          </AccordionTrigger>
          <AccordionContent className="px-4 py-4">
            <div>
              <Label>Texto de Copyright</Label>
              <Input
                value={formData.footer_copyright}
                onChange={(e) => handleInputChange("footer_copyright", e.target.value)}
                placeholder="© 2024 UpMidias. Todos os direitos reservados."
              />
            </div>
          </AccordionContent>
        </AccordionItem>
      </Accordion>

      {/* Fixed Save Button for Mobile */}
      <div className="fixed bottom-4 right-4 md:hidden">
        <Button size="lg" onClick={handleSave} disabled={saveMutation.isPending} className="shadow-xl">
          <Save className="w-5 h-5 mr-2" />
          Salvar
        </Button>
      </div>
    </div>
  );
};

export default AdminLanding;
