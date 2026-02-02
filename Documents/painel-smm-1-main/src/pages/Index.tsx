import { Link, useNavigate, Navigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowRight,
  Zap,
  Shield,
  Clock,
  TrendingUp,
  LogIn,
  Star,
  Heart,
  Rocket,
  Target,
  Award,
  CheckCircle,
  Globe,
  Users,
  Sparkles,
  Loader2,
  LayoutDashboard,
  LogOut,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { getSupabaseClient } from "@/lib/supabaseClient";
import { LucideIcon } from "lucide-react";
import { useSiteName } from "@/hooks/useSiteName";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";

// Icon mapping for dynamic rendering
const ICON_MAP: Record<string, LucideIcon> = {
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
};

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
}

interface SiteSettings {
  services_page_public?: boolean;
  use_store_landing?: boolean;
  store_landing_slug?: string;
}

const Index = () => {
  const { siteName } = useSiteName();
  const { user, loading: authLoading, signOut } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await signOut();
    toast({
      title: "Logout realizado",
      description: "Você foi desconectado com sucesso.",
    });
    navigate("/");
  };

  const { data: isAdmin } = useQuery({
    queryKey: ["is-admin", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const supabase = getSupabaseClient();
      const { data, error } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", user!.id)
        .eq("role", "admin")
        .maybeSingle();
      if (error) throw error;
      return !!data;
    },
    staleTime: 1000 * 60 * 5,
  });

  const dashboardPath = isAdmin ? "/admin-dashboard" : "/services";
  const authActionPath = user ? dashboardPath : "/auth";

  const { data: content, isLoading } = useQuery({
    queryKey: ["landing-content-public"],
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
    staleTime: 1000 * 60 * 5,
  });

  const { data: siteSettings, isLoading: loadingSettings } = useQuery({
    queryKey: ["site-settings-landing"],
    queryFn: async () => {
      const supabase = getSupabaseClient();

      // Some external databases may not be updated with the newest columns yet.
      // If so, gracefully fallback instead of breaking the landing page.
      const { data, error } = await supabase
        .from("site_settings")
        .select("services_page_public, use_store_landing, store_landing_slug")
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) {
        // Postgres undefined_column
        if ((error as any)?.code === "42703" || String((error as any)?.message || "").includes("does not exist")) {
          const { data: fallback, error: fallbackError } = await supabase
            .from("site_settings")
            .select("services_page_public")
            .order("updated_at", { ascending: false })
            .limit(1)
            .maybeSingle();

          if (fallbackError) throw fallbackError;

          return {
            services_page_public: (fallback as any)?.services_page_public ?? false,
            use_store_landing: false,
            store_landing_slug: "loja",
            __missing_store_landing_columns: true,
          } as SiteSettings & { __missing_store_landing_columns?: boolean };
        }

        throw error;
      }

      return data as SiteSettings;
    },
  });

  // Redirect to store landing if enabled
  if (!loadingSettings && siteSettings?.use_store_landing) {
    const storeSlug = siteSettings.store_landing_slug || "loja";
    // If the configured landing slug is the default ('loja'), keep URL clean: /loja
    const target = storeSlug === "loja" ? "/loja" : `/loja/${storeSlug}`;
    return <Navigate to={target} replace />;
  }

  const showPublicServicesLink = siteSettings?.services_page_public;

  // Default content if not loaded
  const defaultContent: LandingContent = {
    id: "",
    site_name: "UpMidias",
    hero_badge_text: "Sistema Online • +10.000 pedidos entregues",
    hero_title_line1: "Impulsione suas",
    hero_title_highlight: "Redes Sociais",
    hero_subtitle: "A melhor plataforma SMM do Brasil. Aumente seguidores, curtidas, visualizações e muito mais com entrega automática e instantânea.",
    hero_button_primary: "Acessar Painel",
    hero_button_secondary: "Criar Conta",
    features_title: "Por que escolher a",
    features_title_highlight: "UpMidias",
    features_subtitle: "Oferecemos os melhores serviços de SMM com qualidade garantida",
    feature1_icon: "Zap",
    feature1_title: "Entrega Instantânea",
    feature1_description: "Seus pedidos são processados e entregues em tempo recorde.",
    feature2_icon: "Shield",
    feature2_title: "100% Seguro",
    feature2_description: "Garantimos a segurança das suas contas e dados.",
    feature3_icon: "Clock",
    feature3_title: "Suporte 24/7",
    feature3_description: "Nossa equipe está sempre disponível para ajudar.",
    feature4_icon: "TrendingUp",
    feature4_title: "Melhor Preço",
    feature4_description: "Os melhores serviços com os menores preços do mercado.",
    cta_title: "Pronto para começar?",
    cta_subtitle: "Crie sua conta gratuitamente e comece a impulsionar suas redes sociais agora mesmo.",
    cta_button_text: "Criar Conta Grátis",
    footer_copyright: "© 2024 UpMidias. Todos os direitos reservados.",
  };

  const c = content || defaultContent;

  const features = [
    {
      icon: ICON_MAP[c.feature1_icon] || Zap,
      title: c.feature1_title,
      description: c.feature1_description,
    },
    {
      icon: ICON_MAP[c.feature2_icon] || Shield,
      title: c.feature2_title,
      description: c.feature2_description,
    },
    {
      icon: ICON_MAP[c.feature3_icon] || Clock,
      title: c.feature3_title,
      description: c.feature3_description,
    },
    {
      icon: ICON_MAP[c.feature4_icon] || TrendingUp,
      title: c.feature4_title,
      description: c.feature4_description,
    },
  ];

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      {/* Header */}
      <header className="fixed top-0 left-0 right-0 z-50 glass border-b border-border/50">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-10 h-10 rounded-lg bg-primary/20 flex items-center justify-center">
              <Zap className="w-6 h-6 text-primary" />
            </div>
            <span className="text-xl font-bold text-primary">{siteName}</span>
          </div>

          <div className="flex items-center gap-3">
            {showPublicServicesLink && (
              <Link to="/public-services">
                <Button variant="ghost" className="gap-2">
                  Serviços
                </Button>
              </Link>
            )}
            {user ? (
              <>
                <Link to={authActionPath} aria-label="Ir para o dashboard">
                  <Button variant="outline" className="gap-2" disabled={authLoading}>
                    <LayoutDashboard className="w-4 h-4" />
                    Dashboard
                  </Button>
                </Link>
                <Button 
                  variant="ghost" 
                  className="gap-2 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                  onClick={handleLogout}
                >
                  <LogOut className="w-4 h-4" />
                  Sair
                </Button>
              </>
            ) : (
              <Link to="/auth" aria-label="Entrar">
                <Button variant="outline" className="gap-2" disabled={authLoading}>
                  {authLoading ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <LogIn className="w-4 h-4" />
                  )}
                  Entrar
                </Button>
              </Link>
            )}
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="relative py-16 pt-32 overflow-hidden">
        {/* Background Effects */}
        <div className="absolute inset-0 overflow-hidden">
          <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-primary/20 rounded-full blur-3xl animate-pulse-slow" />
          <div className="absolute bottom-1/4 right-1/4 w-80 h-80 bg-primary/10 rounded-full blur-3xl animate-pulse-slow" style={{ animationDelay: "2s" }} />
        </div>

        <div className="container mx-auto px-4 relative">
          <div className="max-w-4xl mx-auto text-center">
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full glass mb-8 animate-fade-in">
              <span className="w-2 h-2 rounded-full bg-success animate-pulse" />
              <span className="text-sm text-muted-foreground">
                {c.hero_badge_text}
              </span>
            </div>

            <h1 className="text-4xl md:text-6xl lg:text-7xl font-bold mb-6 animate-slide-up">
              {c.hero_title_line1}{" "}
              <span className="gradient-text">{c.hero_title_highlight}</span>
            </h1>

            <p className="text-lg md:text-xl text-muted-foreground mb-10 max-w-2xl mx-auto animate-slide-up" style={{ animationDelay: "0.1s" }}>
              {c.hero_subtitle}
            </p>

            <div className="flex flex-col sm:flex-row items-center justify-center gap-4 animate-slide-up" style={{ animationDelay: "0.2s" }}>
              <Link to={authActionPath}>
                <Button size="lg" className="text-lg px-8 glow-primary">
                  {user ? "Dashboard" : c.hero_button_primary}
                  <ArrowRight className="w-5 h-5 ml-2" />
                </Button>
              </Link>

              {!user && (
                <Link to="/auth">
                  <Button size="lg" variant="outline" className="text-lg px-8">
                    {c.hero_button_secondary}
                  </Button>
                </Link>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="py-20">
        <div className="container mx-auto px-4">
          <div className="text-center mb-12">
            <h2 className="text-3xl md:text-4xl font-bold mb-4">
              {c.features_title} <span className="gradient-text">{c.features_title_highlight}</span>?
            </h2>
            <p className="text-muted-foreground max-w-2xl mx-auto">
              {c.features_subtitle}
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {features.map((feature, index) => (
              <div
                key={feature.title}
                className="glass rounded-xl p-6 border border-border/50 glass-hover group animate-slide-up"
                style={{ animationDelay: `${index * 0.1}s` }}
              >
                <div className="w-14 h-14 rounded-xl bg-primary/10 flex items-center justify-center mb-4 group-hover:glow-primary transition-all duration-300">
                  <feature.icon className="w-7 h-7 text-primary" />
                </div>
                <h3 className="text-xl font-semibold mb-2 group-hover:text-primary transition-colors">
                  {feature.title}
                </h3>
                <p className="text-muted-foreground">{feature.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20">
        <div className="container mx-auto px-4">
          <div className="glass rounded-2xl p-8 md:p-12 border border-primary/20 relative overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-r from-primary/10 to-transparent" />
            <div className="relative text-center">
              <h2 className="text-3xl md:text-4xl font-bold mb-4">
                {c.cta_title}
              </h2>
              <p className="text-muted-foreground mb-8 max-w-xl mx-auto">
                {c.cta_subtitle}
              </p>
              <Link to={authActionPath}>
                <Button size="lg" className="glow-primary">
                  {user ? "Acessar Dashboard" : c.cta_button_text}
                  <ArrowRight className="w-5 h-5 ml-2" />
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border/30 py-8">
        <div className="container mx-auto px-4">
          <div className="flex flex-col md:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <Zap className="w-5 h-5 text-primary" />
              <span className="font-bold gradient-text">{siteName}</span>
            </div>
            <p className="text-sm text-muted-foreground">
              {c.footer_copyright}
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default Index;
