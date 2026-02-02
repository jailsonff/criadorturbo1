import { useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { getSupabaseClient } from "@/lib/supabaseClient";
import { useQuery } from "@tanstack/react-query";
import { PackageCard } from "@/components/store/PackageCard";
import { PurchaseModal } from "@/components/store/PurchaseModal";
import { OrderLookupModal } from "@/components/store/OrderLookupModal";
import { StoreBannerGrid, type StoreBanner } from "@/components/store/StoreBannerGrid";
import { StorePopupModal } from "@/components/store/StorePopupModal";
import { 
  Zap, 
  Search, 
  Clock, 
  CreditCard, 
  Package, 
  Link2, 
  QrCode, 
  Play,
  AlertTriangle,
  Bot,
  Instagram,
  MessageCircle,
  Rocket,
  CheckCircle2,
  ArrowDown,
  Menu,
  Smartphone
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";

type StoreMenuBanner = {
  id: string;
  title: string | null;
  image_url: string;
  target_url: string | null;
  package_id: string | null;
};

function normalizeExternalUrl(input: string): string {
  const raw = String(input || "").trim();
  if (!raw) return "";
  if (/^https?:\/\//i.test(raw)) return raw;
  return `https://${raw}`;
}

interface StoreFrontend {
  id: string;
  name: string;
  slug: string;
  cta_title: string;
  cta_subtitle: string;
}

interface PredefinedQuantity {
  quantity: number;
  price: number;
  link_fields?: number;
}

type LinkTutorialRule = {
  service: string;
  allowed: string;
};

interface StorePackage {
  id: string;
  name: string;
  description: string | null;
  cover_image_url: string | null;
  service_id: number;
  base_quantity: number;
  base_price: number;
  price_per_thousand: number;
  allow_custom_quantity: boolean;
  min_quantity: number;
  max_quantity: number;
  sales_count: number;
  badge_text: string | null;
  predefined_quantities?: PredefinedQuantity[] | null;
  package_type?: "single" | "combo";
  combo_items?: Array<{
    service_id: number;
    quantity: number;
    links_count: number;
    link_label?: string;
  }> | null;
  link_label?: string | null;
  link_tutorial_rules?: LinkTutorialRule[] | null;
  default_link_fields?: number | null;
  section?: { id: string; name: string; display_order: number; is_active: boolean } | null;
}


export default function StoreFront({
  forcedSlug,
}: {
  forcedSlug?: string;
} = {}) {
  const supabase = getSupabaseClient();
  const params = useParams<{ slug: string }>();
  const slug = forcedSlug ?? params.slug ?? "loja";
  const [selectedPackage, setSelectedPackage] = useState<StorePackage | null>(null);
  const [showOrderLookup, setShowOrderLookup] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  const { data: frontend, isLoading: loadingFrontend } = useQuery({
    queryKey: ["store-frontend", slug],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("store_frontends")
        .select("*")
        .eq("slug", slug)
        .eq("is_active", true)
        .single();
      
      if (error) throw error;
      return data as StoreFrontend;
    },
  });

  const parsePredefined = (value: unknown): PredefinedQuantity[] | null => {
    if (!Array.isArray(value)) return null;
    return value
      .filter((v): v is any => v && typeof v === "object")
      .map((v: any) => ({
        quantity: Number(v.quantity) || 0,
        price: Number(v.price) || 0,
        link_fields:
          v.link_fields === null || v.link_fields === undefined
            ? undefined
            : Math.max(1, Number(v.link_fields) || 1),
      }))
      .filter((v) => v.quantity > 0 && v.price >= 0);
  };

  const parseComboItems = (value: unknown): StorePackage["combo_items"] => {
    if (!Array.isArray(value)) return null;
    return value
      .filter((v): v is any => v && typeof v === "object")
      .map((v: any) => ({
        service_id: Number(v.service_id) || 0,
        quantity: Number(v.quantity) || 0,
        links_count: Math.max(1, Number(v.links_count) || 1),
        link_label: typeof v.link_label === "string" ? v.link_label : undefined,
      }))
      .filter((v) => v.service_id > 0 && v.quantity > 0);
  };

  const parseTutorialRules = (value: unknown): LinkTutorialRule[] | null => {
    if (!Array.isArray(value)) return null;
    return value
      .filter((v): v is any => v && typeof v === "object")
      .map((v: any) => ({
        service: String(v.service ?? "").trim(),
        allowed: String(v.allowed ?? "").trim(),
      }))
      .filter((v) => v.service || v.allowed);
  };

  const parseStorePackage = (pkg: any): StorePackage => ({
    id: String(pkg.id),
    name: String(pkg.name),
    description: pkg.description ?? null,
    cover_image_url: pkg.cover_image_url ?? null,
    service_id: Number(pkg.service_id) || 0,
    base_quantity: Number(pkg.base_quantity) || 0,
    base_price: Number(pkg.base_price) || 0,
    price_per_thousand: Number(pkg.price_per_thousand) || 0,
    allow_custom_quantity: Boolean(pkg.allow_custom_quantity),
    min_quantity: Number(pkg.min_quantity) || 0,
    max_quantity: Number(pkg.max_quantity) || 0,
    sales_count: Number(pkg.sales_count) || 0,
    badge_text: pkg.badge_text ?? null,
    predefined_quantities: parsePredefined(pkg.predefined_quantities),
    package_type: (pkg.package_type as StorePackage["package_type"]) ?? "single",
    combo_items: parseComboItems(pkg.combo_items),
    link_label: pkg.link_label ?? null,
    link_tutorial_rules: parseTutorialRules(pkg.link_tutorial_rules),
    default_link_fields:
      pkg.default_link_fields === null || pkg.default_link_fields === undefined
        ? null
        : Math.max(1, Number(pkg.default_link_fields) || 1),
    section: pkg.section ?? null,
  });

  const fetchPackageById = async (packageId: string) => {
    if (!frontend?.id) return null;
    const { data, error } = await supabase
      .from("store_packages")
      .select(
        `*,
        section:store_package_sections(id, name, display_order, is_active)
      `
      )
      .eq("id", packageId)
      .eq("frontend_id", frontend.id)
      .eq("is_active", true)
      .maybeSingle();
    if (error) throw error;
    return data ? parseStorePackage(data) : null;
  };

  const { data: packages = [], isLoading: loadingPackages } = useQuery({
    queryKey: ["store-packages", frontend?.id],
    queryFn: async () => {
      if (!frontend?.id) return [];
      const { data, error } = await supabase
        .from("store_packages")
        .select(`
          *,
          section:store_package_sections(id, name, display_order, is_active)
        `)
        .eq("frontend_id", frontend.id)
        .eq("is_active", true)
        .eq("hidden_from_storefront", false)
        .order("display_order", { ascending: true });

      if (error) throw error;

      return (data ?? []).map(parseStorePackage);
    },
    enabled: !!frontend?.id,
  });

  const { data: banners = [] } = useQuery({
    queryKey: ["store-banners", frontend?.id],
    queryFn: async () => {
      if (!frontend?.id) return [];
      const { data, error } = await (supabase as any)
        .from("store_banners")
        .select("id, title, image_url, target_url, package_id")
        .eq("frontend_id", frontend.id)
        .eq("is_active", true)
        .order("display_order", { ascending: true });
      if (error) throw error;
      return (data || []) as StoreBanner[];
    },
    enabled: !!frontend?.id,
  });

  const { data: menuBanners = [] } = useQuery({
    queryKey: ["store-menu-banners", frontend?.id],
    queryFn: async () => {
      if (!frontend?.id) return [];
      const { data, error } = await (supabase as any)
        .from("store_menu_banners")
        .select("id, title, image_url, target_url, package_id")
        .eq("frontend_id", frontend.id)
        .eq("is_active", true)
        .order("display_order", { ascending: true });
      if (error) throw error;
      return (data || []) as StoreMenuBanner[];
    },
    enabled: !!frontend?.id,
  });

  const { data: sections = [] } = useQuery({
    queryKey: ["store-sections", frontend?.id],
    queryFn: async () => {
      if (!frontend?.id) return [];
      const { data, error } = await supabase
        .from("store_package_sections")
        .select("*")
        .eq("frontend_id", frontend.id)
        .eq("is_active", true)
        .order("display_order", { ascending: true });
      
      if (error) throw error;
      return data as Array<{ id: string; name: string; display_order: number; is_active: boolean }>;
    },
    enabled: !!frontend?.id,
  });

  // Group packages by section
  const packagesBySection = useMemo(
    () =>
      sections
        .map((section) => ({
          section,
          packages: packages.filter((pkg) => pkg.section?.id === section.id),
        }))
        .filter((group) => group.packages.length > 0),
    [packages, sections]
  );

  const { data: siteName } = useQuery({
    queryKey: ["site-name-store"],
    queryFn: async () => {
      const { data } = await supabase
        .from("landing_content")
        .select("site_name")
        .limit(1)
        .single();
      return data?.site_name || "SMM Panel";
    },
  });

  const { data: siteSettings } = useQuery({
    queryKey: ["site-settings-store"],
    queryFn: async () => {
      const { data } = await supabase
        .from("site_settings")
        .select("whatsapp_number, instagram_handle, contact_section_title")
        .order("updated_at", { ascending: false })
        .limit(1)
        .single();
      return data;
    },
  });

  // Format Instagram URL
  const instagramHandle = siteSettings?.instagram_handle || "@agenciarecife_";
  const instagramUsername = instagramHandle.replace("@", "");
  const instagramUrl = `https://instagram.com/${instagramUsername}`;
  
  // Format WhatsApp URL - handle with or without country code
  const whatsappNumber = siteSettings?.whatsapp_number || "5581952557567";
  const whatsappClean = whatsappNumber.replace(/\D/g, "");
  // Add country code if not present (assuming Brazil 55)
  const whatsappFull = whatsappClean.startsWith("55") ? whatsappClean : `55${whatsappClean}`;
  const whatsappUrl = `https://wa.me/${whatsappFull}`;
  
  // Format display: extract DDD and number properly
  const formatWhatsappDisplay = (num: string) => {
    if (num.includes("(")) return num; // Already formatted
    const clean = num.replace(/\D/g, "");
    // If starts with 55, remove it for display formatting
    const withoutCountry = clean.startsWith("55") ? clean.slice(2) : clean;
    if (withoutCountry.length === 11) {
      // Format: (XX) XXXXX-XXXX
      return `(${withoutCountry.slice(0, 2)}) ${withoutCountry.slice(2, 7)}-${withoutCountry.slice(7)}`;
    } else if (withoutCountry.length === 10) {
      // Format: (XX) XXXX-XXXX
      return `(${withoutCountry.slice(0, 2)}) ${withoutCountry.slice(2, 6)}-${withoutCountry.slice(6)}`;
    }
    return num; // Return as-is if can't parse
  };
  const whatsappDisplay = formatWhatsappDisplay(whatsappNumber);
  
  // Contact section title
  const contactTitle = siteSettings?.contact_section_title || "Fale com a Agência Recife";

  const scrollToPackages = () => {
    document.getElementById("packages-section")?.scrollIntoView({ behavior: "smooth" });
  };

  if (loadingFrontend) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (!frontend) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-foreground mb-2">Loja não encontrada</h1>
          <p className="text-muted-foreground">A loja que você está procurando não existe.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background pb-20 md:pb-0">
      <StorePopupModal
        frontendId={frontend?.id}
        onOpenPackage={(packageId) => {
          const pkg = packages.find((p) => p.id === packageId);
          if (pkg) {
            setSelectedPackage(pkg);
            return;
          }
          fetchPackageById(packageId)
            .then((found) => {
              if (found) {
                setSelectedPackage(found);
                return;
              }
              scrollToPackages();
            })
            .catch(() => scrollToPackages());
        }}
      />
      {/* Header */}
      <header className="border-b border-border/50 bg-background/80 backdrop-blur-xl sticky top-0 z-50">
        <div className="container mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-primary to-cyan-400 flex items-center justify-center">
              <Rocket className="w-5 h-5 text-white" />
            </div>
            <span className="font-bold text-lg">{siteName}</span>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <Button
              size="sm"
              onClick={() => setShowOrderLookup(true)}
              className="gap-2 bg-primary hover:bg-primary/90 text-primary-foreground"
            >
              <Search className="w-4 h-4" />
              <span className="hidden sm:inline">Consultar Pedido</span>
            </Button>

            <Button
              type="button"
              variant="outline"
              size="icon"
              className="h-9 w-9"
              onClick={() => setMenuOpen(true)}
              aria-label="Abrir menu"
            >
              <Menu className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </header>

      <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
        <SheetContent side="right" className="w-[18rem] p-0">
          <SheetHeader className="border-b border-border/60 bg-secondary/40 px-6 py-4">
            <SheetTitle className="text-center">Menu</SheetTitle>
          </SheetHeader>

           <div className="px-4 py-4">
             <div className="rounded-xl border border-border/70 bg-card/30 p-1 shadow-sm">
               <a href="/app" className="block">
                 <Button
                   variant="ghost"
                   className={
                     "store-menu-button mt-0 " +
                     "border border-primary/40 bg-primary/15 text-foreground " +
                     "shadow-[0_0_0_1px_hsl(var(--primary)/0.25),0_0_24px_hsl(var(--primary)/0.20)] " +
                     "hover:bg-primary/20"
                   }
                   onClick={() => setMenuOpen(false)}
                 >
                   <Smartphone className="mr-2 h-4 w-4" />
                   DOWNLOAD APP
                 </Button>
               </a>

               <Button
                 variant="ghost"
                  className="store-menu-button"
                onClick={() => {
                  setMenuOpen(false);
                  scrollToPackages();
                }}
              >
                <Package className="mr-2 h-4 w-4" />
                Pacotes
              </Button>

              <Button
                variant="ghost"
                 className="mt-1 store-menu-button"
                onClick={() => {
                  setMenuOpen(false);
                  setShowOrderLookup(true);
                }}
              >
                <Search className="mr-2 h-4 w-4" />
                Consultar pedido
              </Button>

              <a href={instagramUrl} target="_blank" rel="noopener noreferrer" className="block">
                 <Button
                   variant="ghost"
                    className="mt-1 store-menu-button"
                 >
                  <Instagram className="mr-2 h-4 w-4" />
                  Instagram
                </Button>
              </a>

              <a href={whatsappUrl} target="_blank" rel="noopener noreferrer" className="block">
                 <Button
                   variant="ghost"
                    className="mt-1 store-menu-button"
                 >
                  <MessageCircle className="mr-2 h-4 w-4" />
                  WhatsApp
                </Button>
              </a>
            </div>

            {menuBanners.length > 0 && (
              <div className="mt-4">
                <div className="text-xs text-muted-foreground px-2">Banners</div>
                <div className="mt-2 flex flex-col gap-2">
                  {menuBanners.map((b) => {
                    const hasPackage = Boolean(b.package_id);
                    const hasUrl = Boolean(String(b.target_url || "").trim());

                    return (
                      <button
                        key={b.id}
                        type="button"
                        onClick={() => {
                          setMenuOpen(false);
                          if (hasPackage && b.package_id) {
                            fetchPackageById(b.package_id)
                              .then((found) => {
                                if (found) {
                                  setSelectedPackage(found);
                                  return;
                                }
                                scrollToPackages();
                              })
                              .catch(() => scrollToPackages());
                            return;
                          }
                          if (hasUrl) {
                            const url = normalizeExternalUrl(b.target_url || "");
                            if (url) window.open(url, "_blank", "noopener,noreferrer");
                          }
                        }}
                        className="group relative w-full overflow-hidden rounded-xl border border-border bg-card hover:border-primary/50 transition-colors"
                        aria-label={
                          hasPackage
                            ? `Abrir pacote do banner${b.title ? `: ${b.title}` : ""}`
                            : `Abrir link do banner${b.title ? `: ${b.title}` : ""}`
                        }
                      >
                        <div className="relative w-full aspect-[16/7] bg-muted">
                          <img
                            src={b.image_url}
                            alt={b.title ? b.title : "Banner do menu"}
                            className="absolute inset-0 h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.02]"
                            loading="lazy"
                          />
                          <div className="absolute inset-0 bg-gradient-to-t from-background/50 via-transparent to-transparent" />
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </SheetContent>
      </Sheet>

      {/* Hero Section */}
      <section className="relative py-16 md:py-24 lg:py-32 overflow-hidden">
        {/* Background effects */}
        <div className="absolute inset-0 bg-gradient-to-b from-primary/10 via-primary/5 to-transparent" />
        <div className="absolute top-20 left-1/4 w-72 h-72 bg-primary/20 rounded-full blur-3xl animate-pulse" />
        <div className="absolute bottom-10 right-1/4 w-96 h-96 bg-cyan-500/10 rounded-full blur-3xl" />
        
        <div className="container mx-auto px-4 relative z-10">
          <div className="text-center max-w-4xl mx-auto">
            {/* Badge */}
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 border border-primary/20 mb-6 animate-fade-in">
              <Rocket className="w-4 h-4 text-primary" />
              <span className="text-sm font-medium text-primary">Entrega Automática • 24/7 Online</span>
            </div>
            
            {/* Title */}
            <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold mb-6 leading-tight">
              Quer{" "}
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary via-cyan-400 to-primary animate-gradient">
                ENGAJAMENTO
              </span>{" "}
              de verdade?
            </h1>
            
            <p className="text-2xl md:text-3xl font-semibold text-foreground/80 mb-4">
              Impulsione seu Instagram agora mesmo
            </p>
            
            <p className="text-lg text-muted-foreground mb-6 max-w-2xl mx-auto">
              Escolha os pacotes ideais para o seu perfil e aumente curtidas, visualizações e engajamento de forma rápida, segura e totalmente automática.
            </p>
            
            {/* Highlight */}
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-green-500/10 border border-green-500/20 mb-8">
              <CheckCircle2 className="w-4 h-4 text-green-500" />
              <span className="text-sm text-green-400">Sem burocracia. Sem contato manual. 100% online.</span>
            </div>
            
            {/* CTA Button */}
            <div>
              <Button 
                size="lg" 
                onClick={scrollToPackages}
                className="gap-2 text-lg px-8 py-6 bg-gradient-to-r from-primary to-cyan-500 hover:from-primary/90 hover:to-cyan-500/90 shadow-lg shadow-primary/25 transition-all hover:shadow-xl hover:shadow-primary/30 hover:scale-105"
              >
                <Package className="w-5 h-5" />
                Escolher Pacote de Engajamento
                <ArrowDown className="w-4 h-4 animate-bounce" />
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* Packages Section - Moved to be right after Hero */}
      <section id="packages-section" className="py-16 md:py-20 bg-gradient-to-b from-background via-card/30 to-background">
        <div className="container mx-auto px-4">
          <div className="text-center mb-12">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 border border-primary/20 mb-4">
              <span className="text-sm text-primary">🎯 Pacotes disponíveis</span>
            </div>
            <h2 className="text-3xl md:text-4xl font-bold mb-4">
              Escolha seu <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary to-cyan-400">Pacote de Engajamento</span>
            </h2>
            <p className="text-muted-foreground max-w-xl mx-auto mb-6">
              Os pacotes já vêm pré-configurados, prontos para uso imediato. Basta escolher, pagar e acompanhar.
            </p>
            
            {/* Feature tags */}
            <div className="flex flex-wrap justify-center gap-3 mb-8">
              {["Curtidas", "Visualizações", "Engajamento real", "Sistema 100% automático"].map((tag, i) => (
                <div key={i} className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-primary/10 border border-primary/20">
                  <CheckCircle2 className="w-4 h-4 text-primary" />
                  <span className="text-sm font-medium text-primary">{tag}</span>
                </div>
              ))}
            </div>

            {/* Banners (2 colunas no desktop, 1 no mobile) */}
            <div className="mb-8">
              <StoreBannerGrid
                banners={banners}
                onOpenPackage={(packageId) => {
                  const pkg = packages.find((p) => p.id === packageId);
                  if (pkg) {
                    setSelectedPackage(pkg);
                    return;
                  }
                    fetchPackageById(packageId)
                      .then((found) => {
                        if (found) {
                          setSelectedPackage(found);
                          return;
                        }
                        scrollToPackages();
                      })
                      .catch(() => scrollToPackages());
                }}
              />
            </div>
          </div>

          {loadingPackages ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
              {[...Array(6)].map((_, i) => (
                <Skeleton key={i} className="aspect-[3/4] rounded-xl" />
              ))}
            </div>
          ) : packagesBySection.length === 0 ? (
            <div className="text-center py-16">
              <Package className="w-16 h-16 text-muted-foreground/30 mx-auto mb-4" />
              <p className="text-muted-foreground">Nenhum pacote disponível no momento.</p>
            </div>
          ) : (
            <div className="space-y-14">
              {packagesBySection.map(({ section, packages: sectionPackages }, idx) => (
                <div key={section.id}>
                  {/* Section Header */}
                  {idx > 0 && (
                    <div className="text-center mb-8">
                      <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 border border-primary/20 mb-4">
                        <span className="text-sm text-primary">
                          {section.name === "Combos Promocionais" ? "🔥" : "🎯"} {section.name}
                        </span>
                      </div>
                      {section.name === "Combos Promocionais" && (
                        <>
                          <h3 className="text-2xl md:text-3xl font-bold mb-3">
                            {section.name.split(" ")[0]}{" "}
                            <span className="text-primary">{section.name.split(" ")[1]}</span>
                          </h3>
                          <p className="text-muted-foreground max-w-xl mx-auto">
                            Pacotes especiais com vantagens e melhor custo-benefício.
                          </p>
                        </>
                      )}
                    </div>
                  )}

                  {/* Packages Grid */}
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
                    {sectionPackages.map((pkg) => (
                      <PackageCard
                        key={pkg.id}
                        package={pkg}
                        onBuy={() => setSelectedPackage(pkg)}
                      />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>


      {/* How it Works Section */}
      <section className="py-16 md:py-20">
        <div className="container mx-auto px-4">
          <div className="text-center mb-12">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 border border-primary/20 mb-4">
              <span className="text-sm text-primary">📌 Passo a passo</span>
            </div>
            <h2 className="text-3xl md:text-4xl font-bold">
              Como funciona o <span className="text-primary">pedido?</span>
            </h2>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 md:gap-6 max-w-5xl mx-auto">
            {[
              { icon: Package, title: "Escolha o pacote", desc: "Selecione o pacote de engajamento desejado", step: 1, color: "from-primary to-cyan-500" },
              { icon: Link2, title: "Informe o link", desc: "Cole o link do post, foto ou vídeo", step: 2, color: "from-cyan-500 to-blue-500" },
              { icon: QrCode, title: "Pague via PIX", desc: "Realize o pagamento instantâneo", step: 3, color: "from-blue-500 to-purple-500" },
              { icon: Play, title: "Entrega automática", desc: "O sistema inicia automaticamente", step: 4, color: "from-purple-500 to-pink-500" },
            ].map((item, index) => (
              <div key={index} className="relative group">
                <div className="p-6 rounded-2xl bg-card border border-border/50 hover:border-primary/30 transition-all hover:shadow-lg hover:shadow-primary/5 h-full">
                  <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${item.color} flex items-center justify-center mb-4 group-hover:scale-110 transition-transform`}>
                    <item.icon className="w-6 h-6 text-white" />
                  </div>
                  <h3 className="font-semibold text-lg mb-2">{item.title}</h3>
                  <p className="text-sm text-muted-foreground">{item.desc}</p>
                </div>
              </div>
            ))}
          </div>

          {/* Delivery info */}
          <div className="mt-10 max-w-2xl mx-auto">
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <div className="flex items-center gap-2 px-4 py-2 rounded-lg bg-green-500/10 border border-green-500/20">
                <Clock className="w-4 h-4 text-green-500" />
                <span className="text-sm text-green-400">Pedido inicia imediatamente após o pagamento</span>
              </div>
              <div className="flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-500/10 border border-blue-500/20">
                <Package className="w-4 h-4 text-blue-500" />
                <span className="text-sm text-blue-400">Entrega em até 24 horas</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Warning Section */}
      <section className="py-12 md:py-16">
        <div className="container mx-auto px-4">
          <div className="max-w-3xl mx-auto">
            <div className="p-6 md:p-8 rounded-2xl bg-gradient-to-br from-amber-500/10 to-orange-500/10 border border-amber-500/20">
              <div className="flex items-start gap-4">
                <div className="w-12 h-12 rounded-xl bg-amber-500/20 flex items-center justify-center flex-shrink-0">
                  <AlertTriangle className="w-6 h-6 text-amber-500" />
                </div>
                <div>
                  <h3 className="text-xl font-bold text-amber-400 mb-3">
                    ⚠️ Atenção antes de finalizar seu pedido
                  </h3>
                  <ul className="space-y-2 text-sm text-muted-foreground">
                    <li className="flex items-start gap-2">
                      <CheckCircle2 className="w-4 h-4 text-amber-500 mt-0.5 flex-shrink-0" />
                      <span>Verifique se o link do post está correto</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <CheckCircle2 className="w-4 h-4 text-amber-500 mt-0.5 flex-shrink-0" />
                      <span>O link deve ser público</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <CheckCircle2 className="w-4 h-4 text-amber-500 mt-0.5 flex-shrink-0" />
                      <span>Pedidos com link incorreto não poderão ser reembolsados</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <CheckCircle2 className="w-4 h-4 text-amber-500 mt-0.5 flex-shrink-0" />
                      <span>Não nos responsabilizamos por pedidos feitos com links errados</span>
                    </li>
                  </ul>
                  <p className="mt-4 text-amber-400 font-medium">
                    👉 Revise com atenção antes de confirmar
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Automatic System Section */}
      <section className="py-12 md:py-16 bg-card/30">
        <div className="container mx-auto px-4">
          <div className="max-w-3xl mx-auto text-center">
            <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-primary/20 to-cyan-500/20 flex items-center justify-center mx-auto mb-6">
              <Bot className="w-10 h-10 text-primary" />
            </div>
            <h2 className="text-3xl md:text-4xl font-bold mb-4">
              🤖 Sistema <span className="text-primary">100% Automático</span>
            </h2>
            <p className="text-lg text-muted-foreground mb-8">
              Nosso sistema cuida de tudo para você:
            </p>
            
            <div className="grid sm:grid-cols-2 gap-4 max-w-md mx-auto">
              <div className="flex items-center gap-3 p-4 rounded-xl bg-background border border-border/50">
                <CheckCircle2 className="w-5 h-5 text-green-500" />
                <span className="text-sm font-medium">Pedido processado automaticamente</span>
              </div>
              <div className="flex items-center gap-3 p-4 rounded-xl bg-background border border-border/50">
                <CheckCircle2 className="w-5 h-5 text-green-500" />
                <span className="text-sm font-medium">Sem falar com atendente</span>
              </div>
            </div>
            
            <p className="mt-8 text-xl font-semibold text-primary">
              👉 Você compra, o sistema entrega.
            </p>
          </div>
        </div>
      </section>

      {/* Contact Section */}
      <section className="py-12 md:py-16">
        <div className="container mx-auto px-4">
          <div className="max-w-3xl mx-auto text-center">
            <h2 className="text-2xl md:text-3xl font-bold mb-6">
              📲 {contactTitle.includes("Fale com") ? (
                <>
                  Fale com a <span className="text-primary">{contactTitle.replace("Fale com a ", "").replace("Fale com ", "")}</span>
                </>
              ) : (
                <span className="text-primary">{contactTitle}</span>
              )}
            </h2>
            
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <a 
                href={instagramUrl} 
                target="_blank" 
                rel="noopener noreferrer"
                className="flex items-center gap-3 px-6 py-4 rounded-xl bg-gradient-to-r from-pink-500/10 to-purple-500/10 border border-pink-500/20 hover:border-pink-500/40 transition-colors"
              >
                <Instagram className="w-6 h-6 text-pink-500" />
                <span className="font-medium">{instagramHandle}</span>
              </a>
              <a 
                href={whatsappUrl} 
                target="_blank" 
                rel="noopener noreferrer"
                className="flex items-center gap-3 px-6 py-4 rounded-xl bg-gradient-to-r from-green-500/10 to-emerald-500/10 border border-green-500/20 hover:border-green-500/40 transition-colors"
              >
                <MessageCircle className="w-6 h-6 text-green-500" />
                <span className="font-medium">{whatsappDisplay}</span>
              </a>
            </div>
            
            <p className="mt-6 text-muted-foreground">
              Estamos prontos para te ajudar a crescer nas redes sociais 🚀
            </p>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-8 border-t border-border/50 bg-card/30">
        <div className="container mx-auto px-4 text-center">
          <p className="text-sm text-muted-foreground">
            © {new Date().getFullYear()} {siteName} — Todos os direitos reservados.
          </p>
          <p className="text-xs text-muted-foreground/60 mt-2">
            Plataforma automática de engajamento para redes sociais.
          </p>
        </div>
      </footer>

      {/* Mobile Bottom Navigation */}
      <nav className="fixed bottom-0 left-0 right-0 z-50 md:hidden bg-background/95 backdrop-blur-lg border-t border-border/50 safe-area-bottom">
        <div className="grid grid-cols-5 items-center gap-1 px-2 py-2">
          <button
            onClick={scrollToPackages}
            className="flex flex-col items-center justify-center gap-1 px-2 py-2 rounded-xl transition-all duration-200 text-muted-foreground hover:text-foreground hover:bg-muted/50"
          >
            <Package className="w-5 h-5" />
            <span className="text-[10px] font-medium leading-none">Pacotes</span>
          </button>

          <a
            href={instagramUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex flex-col items-center justify-center gap-1 px-2 py-2 rounded-xl transition-all duration-200 text-muted-foreground hover:text-foreground hover:bg-muted/50"
          >
            <Instagram className="w-5 h-5" />
            <span className="text-[10px] font-medium leading-none">Insta</span>
          </a>

          <button
            onClick={() => setShowOrderLookup(true)}
            className="flex flex-col items-center justify-center gap-1 px-2 py-2 rounded-xl transition-all duration-200 bg-primary text-primary-foreground"
          >
            <Search className="w-5 h-5" />
            <span className="text-[10px] font-medium leading-none">Consultar</span>
          </button>

          <a
            href="/app"
            className="flex flex-col items-center justify-center gap-1 px-2 py-2 rounded-xl transition-all duration-200 text-muted-foreground hover:text-foreground hover:bg-muted/50"
          >
            <Smartphone className="w-5 h-5" />
            <span className="text-[10px] font-medium leading-none">App</span>
          </a>

          <a
            href={whatsappUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex flex-col items-center justify-center gap-1 px-2 py-2 rounded-xl transition-all duration-200 text-muted-foreground hover:text-foreground hover:bg-muted/50"
          >
            <MessageCircle className="w-5 h-5" />
            <span className="text-[10px] font-medium leading-none">Whats</span>
          </a>
        </div>
      </nav>

      {/* Purchase Modal */}
      {selectedPackage && (
        <PurchaseModal
          isOpen={!!selectedPackage}
          onClose={() => setSelectedPackage(null)}
          package={selectedPackage}
          frontendId={frontend.id}
        />
      )}

      {/* Order Lookup Modal */}
      <OrderLookupModal
        isOpen={showOrderLookup}
        onClose={() => setShowOrderLookup(false)}
      />
    </div>
  );
}
