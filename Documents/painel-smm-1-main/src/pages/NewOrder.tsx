import { useState, useEffect, useMemo, useCallback } from "react";
import { useSearchParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ShoppingCart, Loader2, AlertCircle, CheckCircle, ChevronDown, Check, User, Wallet, ClipboardList, Star } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import PlatformCategoryFilter from "@/components/PlatformCategoryFilter";
import {
  createOrder,
  saveLocalOrder,
  Service,
} from "@/lib/api";
import { getSupabaseClient } from "@/lib/supabaseClient";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { cn, formatCurrency, formatCurrencyPrecise, extractAverageTime } from "@/lib/utils";
import { useCategoryIcons } from "@/hooks/useCategoryIcons";
import { useGlobalOrderCount } from "@/hooks/useGlobalOrderCount";
import { useFavoriteServices } from "@/hooks/useFavoriteServices";

interface ServiceCustomization {
  id: string;
  service_id: number;
  custom_name: string | null;
  custom_description: string | null;
  custom_rate: string | null;
  custom_average_time: string | null;
  custom_min: string | null;
  custom_max: string | null;
  show_refill_button: boolean;
  is_active: boolean;
}

const NewOrder = () => {
  const [searchParams] = useSearchParams();
  const preSelectedService = searchParams.get("service");
  const { toast } = useToast();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { getCategoryIcon } = useCategoryIcons();
  const { favorites, isFavorite, toggleFavorite } = useFavoriteServices();
  const [selectedCategory, setSelectedCategory] = useState<string>("");
  const [selectedService, setSelectedService] = useState<string>("");
  const [link, setLink] = useState("");
  const [quantity, setQuantity] = useState("");
  const [customComments, setCustomComments] = useState("");
  const [categoryOpen, setCategoryOpen] = useState(false);
  const [serviceOpen, setServiceOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [platformFilter, setPlatformFilter] = useState<string | null>(null);
  const [categoryKeywordFilter, setCategoryKeywordFilter] = useState<string | null>(null);
  const [defaultsApplied, setDefaultsApplied] = useState(false);

  // Fetch default order settings
  const { data: siteSettings } = useQuery({
    queryKey: ["site-settings-order-defaults"],
    queryFn: async () => {
      const supabase = getSupabaseClient();
      const { data, error } = await supabase
        .from("site_settings")
        .select("default_order_category, default_order_service_id")
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  // Fetch category display order
  const { data: categoryOrders } = useQuery({
    queryKey: ["category-display-order"],
    queryFn: async () => {
      const supabase = getSupabaseClient();
      const { data, error } = await supabase
        .from("category_display_order")
        .select("*")
        .order("display_order", { ascending: true });
      
      if (error?.code === "42P01" || error?.message?.includes("does not exist")) {
        return [];
      }
      
      if (error) throw error;
      return data as { category_name: string; display_order: number }[];
    },
  });

  const categoryOrderMap = useMemo(() => {
    const map: Record<string, number> = {};
    categoryOrders?.forEach((c) => {
      map[c.category_name] = c.display_order;
    });
    return map;
  }, [categoryOrders]);

  // Fetch services from imported_services table (already imported by admin)
  const { data: services, isLoading: servicesLoading } = useQuery({
    queryKey: ["imported-services-user"],
    queryFn: async (): Promise<Service[]> => {
      const supabase = getSupabaseClient();
      
      // Order by external_service_id for stable, consistent ordering across pages
      const { data, error } = await supabase
        .from("imported_services")
        .select("id, external_service_id, provider_id, name, category, type, rate, min, max, description, average_time, refill, cancel, dripfeed, is_active")
        .eq("is_active", true)
        .order("external_service_id", { ascending: true });
      
      if (error) throw error;
      
      // Map imported_services to Service format
      return (data || []).map((s: any) => ({
        service: s.external_service_id,
        name: s.name,
        type: s.type || "Default",
        category: s.category,
        rate: s.rate,
        min: s.min,
        max: s.max,
        refill: s.refill || false,
        cancel: s.cancel || false,
        description: s.description || undefined,
        dripfeed: s.dripfeed || false,
        average_time: s.average_time || undefined,
      }));
    },
    retry: 1,
  });

  const fetchUserProfile = async () => {
    if (!user) return { balance: 0, full_name: null };
    const supabase = getSupabaseClient();
    const { data, error } = await supabase
      .from("profiles")
      .select("balance, full_name")
      .eq("id", user.id)
      .single();
    if (error) throw error;
    return { balance: data?.balance || 0, full_name: data?.full_name || null };
  };

  const { data: userProfile, isLoading: profileLoading } = useQuery({
    queryKey: ["user-profile", user?.id],
    queryFn: fetchUserProfile,
    enabled: !!user,
    staleTime: 0,
    refetchOnMount: "always",
  });

  const userBalance = userProfile?.balance || 0;
  const userName = userProfile?.full_name;

  const { count: globalOrderCount, loading: globalOrdersLoading } = useGlobalOrderCount();

  const { data: customizations } = useQuery({
    queryKey: ["service-customizations"],
    queryFn: async () => {
      const supabase = getSupabaseClient();
      const { data, error } = await supabase
        .from("service_customizations")
        .select("*");
      if (error) throw error;
      return data as ServiceCustomization[];
    },
  });

  const customizationsMap = useMemo(() => {
    const map: Record<number, ServiceCustomization> = {};
    customizations?.forEach((c) => {
      map[c.service_id] = c;
    });
    return map;
  }, [customizations]);

  const getDisplayData = useCallback((service: Service) => {
    const customization = customizationsMap[service.service];
    return {
      name: customization?.custom_name || service.name,
      description: customization?.custom_description || service.description || null,
      rate: customization?.custom_rate || service.rate,
      min: customization?.custom_min || service.min,
      max: customization?.custom_max || service.max,
      isActive: customization?.is_active ?? true,
    };
  }, [customizationsMap]);

  // Auto-select category and service when page loads (using admin defaults or first available)
  useEffect(() => {
    if (preSelectedService && services) {
      setSelectedService(preSelectedService);
      return;
    }
    
    // Only apply defaults once
    if (defaultsApplied || !services || services.length === 0) return;
    if (selectedCategory || selectedService) return;
    
    // Use admin-configured defaults if available
    if (siteSettings?.default_order_category && siteSettings?.default_order_service_id) {
      const categoryExists = services.some(s => s.category === siteSettings.default_order_category);
      const serviceExists = services.some(s => s.service === siteSettings.default_order_service_id);
      
      if (categoryExists && serviceExists) {
        const customization = customizationsMap[siteSettings.default_order_service_id];
        const isActive = customization?.is_active ?? true;
        
        if (isActive) {
          setSelectedCategory(siteSettings.default_order_category);
          setSelectedService(siteSettings.default_order_service_id.toString());
          setDefaultsApplied(true);
          return;
        }
      }
    }
    
    // Fallback: auto-select first category and first active service
    const firstCategory = services[0].category;
    setSelectedCategory(firstCategory);
    
    const servicesInCategory = services.filter((s) => s.category === firstCategory);
    if (servicesInCategory.length > 0) {
      const firstActiveService = servicesInCategory.find((s) => {
        const customization = customizationsMap[s.service];
        return customization?.is_active ?? true;
      });
      
      if (firstActiveService) {
        setSelectedService(firstActiveService.service.toString());
      }
    }
    setDefaultsApplied(true);
  }, [preSelectedService, services, customizationsMap, selectedCategory, selectedService, siteSettings, defaultsApplied]);

  // Auto-select service when user types an exact ID in search
  useEffect(() => {
    if (!services || services.length === 0 || !searchTerm) return;
    
    const trimmedSearch = searchTerm.trim();
    
    // Check if search term is a number (service ID)
    if (/^\d+$/.test(trimmedSearch)) {
      const serviceId = parseInt(trimmedSearch);
      const matchedService = services.find((s) => s.service === serviceId);
      
      if (matchedService) {
        const customization = customizationsMap[matchedService.service];
        const isActive = customization?.is_active ?? true;
        
        if (isActive) {
          // Use timeout to avoid immediate clearing while typing
          const timer = setTimeout(() => {
            setSelectedService(matchedService.service.toString());
            setSelectedCategory(matchedService.category);
            setSearchTerm(""); // Clear search after selection
          }, 500);
          return () => clearTimeout(timer);
        }
      }
    }
  }, [searchTerm, services, customizationsMap]);

  const currentService = useMemo(() => {
    if (!services || !selectedService) return null;
    return services.find((s) => s.service.toString() === selectedService);
  }, [services, selectedService]);

  const currentCustomization = useMemo(() => {
    if (!currentService) return null;
    return customizationsMap[currentService.service] || null;
  }, [currentService, customizationsMap]);

  // Check if service requires custom comments
  const requiresCustomComments = useMemo(() => {
    if (!currentService) return false;
    const name = currentService.name.toLowerCase();
    const type = (currentService.type || "").toLowerCase();
    // Check for keywords that indicate custom/personalized comments
    return (
      name.includes("personalizado") ||
      name.includes("personalizados") ||
      name.includes("custom comment") ||
      type.includes("custom comments") ||
      type.includes("custom_comments")
    );
  }, [currentService]);

  // Count comments (non-empty lines)
  const commentsCount = useMemo(() => {
    if (!customComments.trim()) return 0;
    return customComments.split('\n').filter(line => line.trim().length > 0).length;
  }, [customComments]);

  // Auto-update quantity when comments change for custom comment services
  useEffect(() => {
    if (requiresCustomComments && commentsCount > 0) {
      setQuantity(commentsCount.toString());
    }
  }, [commentsCount, requiresCustomComments]);

  const orderMutation = useMutation({
    mutationFn: () =>
      createOrder(parseInt(selectedService), link, parseInt(quantity), requiresCustomComments ? customComments : undefined),
    onSuccess: async (data) => {
      // Save order locally
      if (currentService) {
        saveLocalOrder({
          id: data.order,
          serviceId: currentService.service,
          serviceName: currentService.name,
          link,
          quantity: parseInt(quantity),
          createdAt: new Date().toISOString(),
        });

        // Save order to database and deduct balance
        if (user) {
          const customRate = currentCustomization?.custom_rate;
          const rate = parseFloat(customRate || currentService.rate);
          const qty = parseInt(quantity);
          const charge = (rate * qty) / 1000;

          const supabase = getSupabaseClient();
          // Insert order
          await supabase.from("orders").insert({
            order_id: data.order,
            user_id: user.id,
            service_id: currentService.service,
            service_name: currentCustomization?.custom_name || currentService.name,
            link,
            quantity: qty,
            charge,
            status: "pending",
          });

          // Deduct balance from user profile
          const { data: currentProfile } = await supabase
            .from("profiles")
            .select("balance")
            .eq("id", user.id)
            .single();

          if (currentProfile) {
            const newBalance = Math.max(0, (currentProfile.balance || 0) - charge);
            await supabase
              .from("profiles")
              .update({ balance: newBalance })
              .eq("id", user.id);
          }

          // Invalidate profile cache to update balance display
          queryClient.invalidateQueries({ queryKey: ["user-profile", user.id] });
        }
      }
      
      // Invalidate orders cache
      queryClient.invalidateQueries({ queryKey: ["local-orders"] });
      
      toast({
        title: "Pedido criado com sucesso!",
        description: `ID do pedido: #${data.order}`,
      });
      setLink("");
      setQuantity("");
      setCustomComments("");
      setSelectedService("");
    },
    onError: () => {
      toast({
        title: "Erro ao criar pedido",
        description: "Verifique os dados e tente novamente.",
        variant: "destructive",
      });
    },
  });

  const totalPrice = useMemo(() => {
    if (!currentService || !quantity) return 0;
    const customRate = currentCustomization?.custom_rate;
    const rate = parseFloat(customRate || currentService.rate);
    const qty = parseInt(quantity);
    return (rate * qty) / 1000;
  }, [currentService, currentCustomization, quantity]);

  // Effective min/max considering customizations
  const effectiveMin = useMemo(() => {
    if (!currentService) return 1;
    const customMin = currentCustomization?.custom_min;
    return parseInt(customMin || currentService.min);
  }, [currentService, currentCustomization]);

  const effectiveMax = useMemo(() => {
    if (!currentService) return 1000000;
    const customMax = currentCustomization?.custom_max;
    return parseInt(customMax || currentService.max);
  }, [currentService, currentCustomization]);

  // Check if user has sufficient balance
  const hasInsufficientBalance = useMemo(() => {
    return totalPrice > userBalance;
  }, [totalPrice, userBalance]);

  const isValidOrder = useMemo(() => {
    if (!currentService || !link || !quantity) return false;
    const qty = parseInt(quantity);
    const baseValid = qty >= effectiveMin && qty <= effectiveMax;
    // Check balance
    if (hasInsufficientBalance) return false;
    // If custom comments required, ensure they're provided
    if (requiresCustomComments) {
      return baseValid && customComments.trim().length > 0;
    }
    return baseValid;
  }, [currentService, link, quantity, effectiveMin, effectiveMax, requiresCustomComments, customComments, hasInsufficientBalance]);

  // Get favorite services
  const favoriteServices = useMemo(() => {
    if (!services || favorites.length === 0) return [];
    return services.filter((s) => favorites.includes(s.service));
  }, [services, favorites]);

  const categoriesFromServices = useMemo(() => {
    if (!services) return [];
    // Preserve the order of categories as they appear in services (which are already ordered by category)
    const seen = new Set<string>();
    const cats: string[] = [];
    for (const s of services) {
      if (!seen.has(s.category)) {
        seen.add(s.category);
        cats.push(s.category);
      }
    }
    // If category_display_order is available, use it; otherwise keep natural order
    if (Object.keys(categoryOrderMap).length > 0) {
      return cats.sort((a, b) => {
        const orderA = categoryOrderMap[a] ?? 999999;
        const orderB = categoryOrderMap[b] ?? 999999;
        if (orderA !== orderB) return orderA - orderB;
        return a.localeCompare(b);
      });
    }
    return cats;
  }, [services, categoryOrderMap]);

  // Categories with Favoritos at top
  const categories = useMemo(() => {
    const cats: string[] = [];
    if (favoriteServices.length > 0) {
      cats.push("⭐ Favoritos");
    }
    cats.push(...categoriesFromServices);
    return cats;
  }, [categoriesFromServices, favoriteServices]);

  // Platform keywords mapping for filtering
  const PLATFORM_KEYWORDS: Record<string, string[]> = {
    Instagram: ["instagram", "ig ", "insta"],
    YouTube: ["youtube", "yt ", "ytb"],
    TikTok: ["tiktok", "tik tok", "tt "],
    Facebook: ["facebook", "fb "],
    Twitter: ["twitter", "x ", " x "],
    Telegram: ["telegram", "tg "],
    Spotify: ["spotify"],
    Twitch: ["twitch"],
    LinkedIn: ["linkedin"],
    Discord: ["discord"],
  };

  const CATEGORY_KEYWORDS: Record<string, string[]> = {
    Seguidores: ["follower", "seguidores", "seguidor"],
    Curtidas: ["like", "curtida", "curtidas", "likes"],
    Views: ["view", "views", "visualiza"],
    Comentários: ["comment", "coment", "comentário"],
    Compartilhar: ["share", "compartil"],
    Inscritos: ["subscri", "inscrit"],
    Plays: ["play", "stream", "ouvintes"],
    Retweet: ["retweet", "repost"],
    Saves: ["save", "salvar", "salvo"],
    Reações: ["reaction", "reação", "react"],
  };

  const handlePlatformFilterChange = useCallback((platform: string | null, categoryKw: string | null, autoSelectCategory?: string) => {
    setPlatformFilter(platform);
    setCategoryKeywordFilter(categoryKw);
    
    // If a category should be auto-selected
    if (autoSelectCategory) {
      setSelectedCategory(autoSelectCategory);
      setSelectedService("");
    } else if (platform !== platformFilter) {
      // Reset category/service selection when platform changes
      setSelectedCategory("");
      setSelectedService("");
    }
  }, [platformFilter]);

  const filteredServices = useMemo(() => {
    if (!services) return [];
    let filtered = services;

    // Platform filter
    if (platformFilter && PLATFORM_KEYWORDS[platformFilter]) {
      const keywords = PLATFORM_KEYWORDS[platformFilter];
      filtered = filtered.filter((s) => {
        const name = s.name.toLowerCase();
        const category = s.category.toLowerCase();
        return keywords.some(
          (kw) => name.includes(kw.toLowerCase()) || category.includes(kw.toLowerCase())
        );
      });
    }

    // Category keyword filter
    if (categoryKeywordFilter && CATEGORY_KEYWORDS[categoryKeywordFilter]) {
      const keywords = CATEGORY_KEYWORDS[categoryKeywordFilter];
      filtered = filtered.filter((s) => {
        const name = s.name.toLowerCase();
        const category = s.category.toLowerCase();
        return keywords.some(
          (kw) => name.includes(kw.toLowerCase()) || category.includes(kw.toLowerCase())
        );
      });
    }
    
    if (selectedCategory) {
      if (selectedCategory === "⭐ Favoritos") {
        filtered = filtered.filter((s) => favorites.includes(s.service));
      } else {
        filtered = filtered.filter((s) => s.category === selectedCategory);
      }
    }
    
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      filtered = filtered.filter(
        (s) =>
          s.name.toLowerCase().includes(term) ||
          s.service.toString().includes(term) ||
          s.category.toLowerCase().includes(term)
      );
    }
    
    return filtered;
  }, [services, selectedCategory, searchTerm, platformFilter, categoryKeywordFilter]);

  const groupedServices = useMemo(() => {
    const grouped: Record<string, Service[]> = {};
    
    // If "Favoritos" category is selected, show only favorites
    if (selectedCategory === "⭐ Favoritos") {
      if (favoriteServices.length > 0) {
        grouped["⭐ Favoritos"] = favoriteServices;
      }
      return grouped;
    }
    
    // Otherwise, show favorites at top + filtered services by category
    if (favoriteServices.length > 0 && !selectedCategory) {
      grouped["⭐ Favoritos"] = favoriteServices;
    }
    
    filteredServices.forEach((service) => {
      // Skip favorites in other categories when showing all (they're already in Favoritos group)
      if (!selectedCategory && favorites.includes(service.service)) {
        return;
      }
      if (!grouped[service.category]) {
        grouped[service.category] = [];
      }
      grouped[service.category].push(service);
    });
    return grouped;
  }, [filteredServices, favoriteServices, selectedCategory, favorites]);

  // Show message if no services are available
  if (!servicesLoading && (!services || services.length === 0)) {
    return (
      <div className="min-h-screen">
        <main className="container mx-auto px-4 py-8">
          <div className="max-w-md mx-auto text-center py-20">
            <div className="w-20 h-20 rounded-full bg-muted flex items-center justify-center mx-auto mb-6">
              <AlertCircle className="w-10 h-10 text-muted-foreground" />
            </div>
            <h2 className="text-2xl font-bold mb-4">Nenhum Serviço Disponível</h2>
            <p className="text-muted-foreground mb-6">
              Ainda não há serviços disponíveis. Entre em contato com o suporte.
            </p>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <main className="container mx-auto px-4 py-8">
        {/* Dashboard Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          {/* Welcome Card */}
          <div className="relative overflow-hidden rounded-xl p-6 border-0 bg-gradient-to-br from-cyan-500/40 via-cyan-600/25 to-cyan-900/10 shadow-xl shadow-cyan-500/25 flex items-center gap-4">
            <div className="absolute top-0 right-0 w-32 h-32 bg-cyan-400/30 rounded-full blur-2xl -translate-y-1/2 translate-x-1/2" />
            <div className="w-14 h-14 rounded-xl bg-cyan-500/50 flex items-center justify-center relative">
              <User className="w-7 h-7 text-cyan-200" />
            </div>
            <div className="relative">
              <p className="text-2xl font-bold text-cyan-300">{userName || "Usuário"}</p>
              <p className="text-muted-foreground text-sm">BEM VINDO !</p>
            </div>
          </div>

          {/* Balance Card */}
          <div className="relative overflow-hidden rounded-xl p-6 border-0 bg-gradient-to-br from-emerald-500/40 via-emerald-600/25 to-emerald-900/10 shadow-xl shadow-emerald-500/25 flex items-center gap-4">
            <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-400/30 rounded-full blur-2xl -translate-y-1/2 translate-x-1/2" />
            <div className="w-14 h-14 rounded-xl bg-emerald-500/50 flex items-center justify-center relative">
              <Wallet className="w-7 h-7 text-emerald-200" />
            </div>
            <div className="relative">
              {profileLoading ? (
                <div className="h-8 w-24 bg-muted animate-pulse rounded" />
              ) : (
                <p className="text-2xl font-bold text-emerald-300">
                  {formatCurrency(userBalance)}
                </p>
              )}
              <p className="text-muted-foreground text-sm">SEU SALDO</p>
            </div>
          </div>

          {/* Total Orders Card */}
          <div className="relative overflow-hidden rounded-xl p-6 border-0 bg-gradient-to-br from-violet-500/40 via-violet-600/25 to-violet-900/10 shadow-xl shadow-violet-500/25 flex items-center gap-4">
            <div className="absolute top-0 right-0 w-32 h-32 bg-violet-400/30 rounded-full blur-2xl -translate-y-1/2 translate-x-1/2" />
            <div className="w-14 h-14 rounded-xl bg-violet-500/50 flex items-center justify-center relative">
              <ClipboardList className="w-7 h-7 text-violet-200" />
            </div>
            <div className="relative">
              {globalOrdersLoading ? (
                <div className="h-8 w-16 bg-muted animate-pulse rounded" />
              ) : (
                <p className="text-2xl font-bold text-violet-300">{(globalOrderCount || 0).toLocaleString('pt-BR')}</p>
              )}
              <p className="text-muted-foreground text-sm">TOTAL DE PEDIDOS</p>
            </div>
          </div>
        </div>

        {/* Insufficient Balance Alert */}
        {userBalance <= 0 && !profileLoading && (
          <div className="mb-6 p-4 rounded-xl border border-destructive/50 bg-destructive/10 flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-destructive/20 flex items-center justify-center">
                <AlertCircle className="w-5 h-5 text-destructive" />
              </div>
              <div>
                <p className="font-semibold text-destructive">Saldo insuficiente</p>
                <p className="text-sm text-muted-foreground">
                  Adicione fundos à sua conta para realizar pedidos.
                </p>
              </div>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="border-destructive/50 hover:bg-destructive/10"
              onClick={() => window.location.href = '/add-balance'}
            >
              Adicionar Saldo
            </Button>
          </div>
        )}

        {/* Platform & Category Filter */}
        {services && services.length > 0 && (
          <PlatformCategoryFilter
            services={services}
            onFilterChange={handlePlatformFilterChange}
            selectedPlatform={platformFilter}
            selectedCategoryKeyword={categoryKeywordFilter}
          />
        )}

        <div className="flex flex-col lg:flex-row gap-6 mb-8">
          <div className="flex-1">
            <h1 className="text-3xl font-bold mb-2">Novo Pedido</h1>
            <p className="text-muted-foreground">
              Preencha os dados abaixo para fazer um novo pedido
            </p>
          </div>
        </div>

        <div className="max-w-2xl">
          <div className="glass rounded-xl p-6 md:p-8 border border-border/50">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                orderMutation.mutate();
              }}
              className="space-y-6"
            >
              {/* Search Field with auto-selection */}
              <div className="space-y-2">
                <Label>Procurar</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <div className="relative">
                      <Input
                        placeholder="Buscar por ID ou nome do serviço..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="pl-10"
                      />
                      <svg
                        className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground"
                        xmlns="http://www.w3.org/2000/svg"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                      </svg>
                    </div>
                  </PopoverTrigger>
                  {searchTerm && filteredServices.length > 0 && (
                    <PopoverContent className="w-[calc(100vw-2rem)] sm:w-[500px] max-w-[500px] p-0 bg-card border-border" align="start">
                      <Command className="bg-transparent">
                        <CommandList className="max-h-[300px]">
                          <CommandEmpty>Nenhum serviço encontrado.</CommandEmpty>
                          <CommandGroup heading={`${filteredServices.length} serviço(s) encontrado(s)`}>
                            {filteredServices.slice(0, 20).map((service) => {
                              const displayData = getDisplayData(service);
                              if (!displayData.isActive) return null;
                              return (
                                <CommandItem
                                  key={service.service}
                                  value={`${service.service} ${displayData.name}`}
                                  onSelect={() => {
                                    setSelectedService(service.service.toString());
                                    setSelectedCategory(service.category);
                                    setSearchTerm("");
                                  }}
                                  className="flex justify-between items-start py-3 cursor-pointer"
                                >
                                  <div className="flex items-start gap-2 flex-1 min-w-0">
                                    <Check
                                      className={cn(
                                        "h-4 w-4 mt-0.5 shrink-0",
                                        selectedService === service.service.toString()
                                          ? "opacity-100 text-primary"
                                          : "opacity-0"
                                      )}
                                    />
                                    <span className="flex-1">
                                      <span className="inline-flex items-center justify-center bg-primary text-primary-foreground text-xs font-medium px-2 py-0.5 rounded mr-2">
                                        {service.service}
                                      </span>
                                      <span className="line-clamp-2">{displayData.name}</span>
                                    </span>
                                  </div>
                                  <div className="flex items-center gap-2 shrink-0">
                                    <span className="text-primary font-semibold">
                                      R$ {displayData.rate}
                                    </span>
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        toggleFavorite(service.service);
                                      }}
                                      className="p-1 hover:bg-muted rounded transition-colors"
                                    >
                                      <Star
                                        className={cn(
                                          "h-4 w-4",
                                          isFavorite(service.service)
                                            ? "fill-yellow-400 text-yellow-400"
                                            : "text-muted-foreground"
                                        )}
                                      />
                                    </button>
                                  </div>
                                </CommandItem>
                              );
                            })}
                          </CommandGroup>
                        </CommandList>
                      </Command>
                    </PopoverContent>
                  )}
                </Popover>
              </div>

              {/* Category Selection */}
              <div className="space-y-2">
                <Label>Categoria</Label>
                <Popover open={categoryOpen} onOpenChange={setCategoryOpen}>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      role="combobox"
                      aria-expanded={categoryOpen}
                      className="w-full justify-between h-auto min-h-10 py-2 px-3 font-normal"
                      disabled={servicesLoading}
                    >
                      {servicesLoading ? (
                        <span className="text-muted-foreground">Carregando...</span>
                      ) : selectedCategory ? (
                        <span className="text-left inline-flex items-center gap-2">
                          {(() => {
                            const iconData = getCategoryIcon(selectedCategory);
                            if (!iconData) return null;
                            return iconData.type === 'image' ? (
                              <img src={iconData.icon} alt="" className="w-5 h-5 object-contain" />
                            ) : (
                              <span>{iconData.icon}</span>
                            );
                          })()}
                          <span>{selectedCategory}</span>
                        </span>
                      ) : (
                        <span className="text-muted-foreground">Selecione uma categoria</span>
                      )}
                      <ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-[calc(100vw-2rem)] sm:w-[500px] max-w-[500px] p-0 bg-card border-border" align="start">
                    <Command className="bg-transparent">
                      <CommandInput placeholder="Buscar categoria..." className="h-10" />
                      <CommandList className="max-h-[300px]">
                        <CommandEmpty>Nenhuma categoria encontrada.</CommandEmpty>
                        <CommandGroup>
                          {categories.map((category) => (
                            <CommandItem
                              key={category}
                              value={category}
                              onSelect={() => {
                                setSelectedCategory(category);
                                setSelectedService("");
                                setCategoryOpen(false);
                              }}
                              className="flex items-center py-3 cursor-pointer"
                            >
                              <Check
                                className={cn(
                                  "h-4 w-4 mr-2 shrink-0",
                                  selectedCategory === category
                                    ? "opacity-100 text-primary"
                                    : "opacity-0"
                                )}
                              />
                              <span className="inline-flex items-center gap-2">
                                {(() => {
                                  const iconData = getCategoryIcon(category);
                                  if (!iconData) return null;
                                  return iconData.type === 'image' ? (
                                    <img src={iconData.icon} alt="" className="w-5 h-5 object-contain" />
                                  ) : (
                                    <span>{iconData.icon}</span>
                                  );
                                })()}
                                <span>{category}</span>
                              </span>
                            </CommandItem>
                          ))}
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
              </div>

              {/* Service Selection */}
              <div className="space-y-2">
                <Label>Serviço</Label>
                <Popover open={serviceOpen} onOpenChange={setServiceOpen}>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      role="combobox"
                      aria-expanded={serviceOpen}
                      className="w-full justify-between h-auto min-h-10 py-2 px-3 font-normal"
                      disabled={servicesLoading}
                    >
                      {servicesLoading ? (
                        <span className="text-muted-foreground">Carregando serviços...</span>
                      ) : currentService ? (
                        <span className="text-left line-clamp-2 flex-1">
                          <span className="inline-flex items-center justify-center bg-primary text-primary-foreground text-xs font-medium px-2 py-0.5 rounded mr-2">
                            {currentService.service}
                          </span>
                          {currentCustomization?.custom_name || currentService.name}
                          <span className="text-primary font-semibold ml-2">
                            R$ {currentCustomization?.custom_rate || currentService.rate}
                          </span>
                        </span>
                      ) : (
                        <span className="text-muted-foreground">Selecione um serviço</span>
                      )}
                      <ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-[calc(100vw-2rem)] sm:w-[500px] max-w-[500px] p-0 bg-card border-border" align="start">
                    <Command className="bg-transparent">
                      <CommandInput placeholder="Buscar serviço..." className="h-10" />
                      <CommandList className="max-h-[400px]">
                        <CommandEmpty>Nenhum serviço encontrado.</CommandEmpty>
                        {Object.entries(groupedServices).map(([category, categoryServices]) => {
                          const iconData = getCategoryIcon(category);
                          // For CommandGroup heading, we can only use text, so use emoji or skip for images
                          const iconPrefix = iconData && iconData.type === 'emoji' ? `${iconData.icon} ` : '';
                          return (
                          <CommandGroup key={category} heading={`${iconPrefix}${category}`} className="text-muted-foreground">
                            {categoryServices.map((service) => {
                              const displayData = getDisplayData(service);
                              if (!displayData.isActive) return null;
                              return (
                                <CommandItem
                                  key={service.service}
                                  value={`${service.service} ${displayData.name} ${service.category}`}
                                  onSelect={() => {
                                    setSelectedService(service.service.toString());
                                    setSelectedCategory(service.category);
                                    setServiceOpen(false);
                                  }}
                                  className="flex justify-between items-start py-3 cursor-pointer"
                                >
                                  <div className="flex items-start gap-2 flex-1 min-w-0">
                                    <Check
                                      className={cn(
                                        "h-4 w-4 mt-0.5 shrink-0",
                                        selectedService === service.service.toString()
                                          ? "opacity-100 text-primary"
                                          : "opacity-0"
                                      )}
                                    />
                                    <span className="flex-1">
                                      <span className="inline-flex items-center justify-center bg-primary text-primary-foreground text-xs font-medium px-2 py-0.5 rounded mr-2">
                                        {service.service}
                                      </span>
                                      {displayData.name}
                                    </span>
                                  </div>
                                  <div className="flex items-center gap-2 shrink-0">
                                    <span className="text-primary font-semibold">
                                      R$ {displayData.rate}
                                    </span>
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        toggleFavorite(service.service);
                                      }}
                                      className="p-1 hover:bg-muted rounded transition-colors"
                                    >
                                      <Star
                                        className={cn(
                                          "h-4 w-4",
                                          isFavorite(service.service)
                                            ? "fill-yellow-400 text-yellow-400"
                                            : "text-muted-foreground"
                                        )}
                                      />
                                    </button>
                                  </div>
                                </CommandItem>
                              );
                            })}
                          </CommandGroup>
                          );
                        })}
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
              </div>

              {currentService && (
                <div className="space-y-4">
                  <div className="glass rounded-lg p-4 border border-primary/20">
                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div>
                        <span className="text-muted-foreground">Mínimo:</span>
                        <span className="ml-2 font-medium">{effectiveMin.toLocaleString('pt-BR')}</span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Máximo:</span>
                        <span className="ml-2 font-medium">{effectiveMax.toLocaleString('pt-BR')}</span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Refill:</span>
                        <span className={`ml-2 font-medium ${currentService.refill ? 'text-success' : 'text-muted-foreground'}`}>
                          {currentService.refill ? "Sim" : "Não"}
                        </span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Cancelável:</span>
                        <span className={`ml-2 font-medium ${currentService.cancel ? 'text-success' : 'text-muted-foreground'}`}>
                          {currentService.cancel ? "Sim" : "Não"}
                        </span>
                      </div>
                    </div>
                  </div>
                  
                  {/* Service Description - from customization or API */}
                  {(currentCustomization?.custom_description || currentService.description) && (
                    <div className="glass rounded-lg p-4 border border-border/50">
                      <h4 className="font-semibold mb-3 text-sm">Descrição</h4>
                      <div 
                        className="text-sm text-muted-foreground whitespace-pre-line"
                      >
                        {currentCustomization?.custom_description || currentService.description}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Link */}
              <div className="space-y-2">
                <Label htmlFor="link">Link</Label>
                <Input
                  id="link"
                  placeholder="https://..."
                  value={link}
                  onChange={(e) => setLink(e.target.value)}
                />
              </div>

              {/* Quantity */}
              <div className="space-y-2">
                <Label htmlFor="quantity">Quantidade</Label>
                <Input
                  id="quantity"
                  type="number"
                  placeholder={
                    currentService
                      ? `${effectiveMin} - ${effectiveMax}`
                      : "Quantidade"
                  }
                  value={quantity}
                  onChange={(e) => !requiresCustomComments && setQuantity(e.target.value)}
                  min={effectiveMin}
                  max={effectiveMax}
                  readOnly={requiresCustomComments}
                  className={requiresCustomComments ? "bg-muted cursor-not-allowed" : ""}
                />
                {currentService && (
                  <p className="text-sm text-muted-foreground">
                    Mín.: <span className="text-foreground font-medium">{effectiveMin.toLocaleString('pt-BR')}</span> - Máx.: <span className="text-foreground font-medium">{effectiveMax.toLocaleString('pt-BR')}</span>
                  </p>
                )}
              </div>

              {/* Custom Comments - shown for personalized comment services */}
              {requiresCustomComments && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="comments">Comentários (1 por linha)</Label>
                    <span className="text-sm text-muted-foreground">
                      <span className="text-primary font-medium">{commentsCount}</span> comentário(s)
                    </span>
                  </div>
                  <Textarea
                    id="comments"
                    placeholder="Digite seus comentários personalizados aqui...&#10;Um comentário por linha&#10;Exemplo: Que foto incrível!&#10;Amei esse conteúdo!"
                    value={customComments}
                    onChange={(e) => setCustomComments(e.target.value)}
                    className="min-h-[150px] resize-y"
                  />
                  <p className="text-sm text-muted-foreground">
                    Insira os comentários que deseja, um por linha. A quantidade será calculada automaticamente.
                  </p>
                </div>
              )}

              {/* Estimated Time */}
              {currentService && (
                <div className="space-y-2">
                  <Label>Tempo médio</Label>
                  <div className="glass rounded-lg px-4 py-3 border border-border/50">
                    <span className="text-muted-foreground">
                      {currentCustomization?.custom_average_time || 
                       currentService.average_time || 
                       extractAverageTime(currentService.name) ||
                       extractAverageTime(currentCustomization?.custom_description) ||
                       "Não informado"}
                    </span>
                  </div>
                </div>
              )}

              {/* Value to Pay */}
              <div className="space-y-2">
                <Label>Valor</Label>
                <div className={`glass rounded-lg px-4 py-3 border ${hasInsufficientBalance ? 'border-destructive/50' : 'border-primary/30'}`}>
                  <span className={`text-2xl font-bold ${hasInsufficientBalance ? 'text-destructive' : 'text-primary'}`}>
                    {formatCurrencyPrecise(totalPrice)}
                  </span>
                </div>
              </div>

              {/* Insufficient Balance Warning */}
              {hasInsufficientBalance && quantity && parseInt(quantity) > 0 && (
                <div className="flex items-center gap-3 p-4 rounded-lg bg-destructive/10 border border-destructive/30">
                  <AlertCircle className="w-5 h-5 text-destructive flex-shrink-0" />
                  <div className="flex-1">
                    <p className="text-sm font-medium text-destructive">Saldo insuficiente</p>
                    <p className="text-sm text-muted-foreground">
                      Seu saldo: {formatCurrency(userBalance)}. Adicione fundos para continuar.
                    </p>
                  </div>
                  <Button variant="outline" size="sm" asChild className="shrink-0">
                    <a href="/add-balance">Adicionar</a>
                  </Button>
                </div>
              )}

              {/* Submit */}
              <Button
                type="submit"
                className="w-full"
                size="lg"
                disabled={!isValidOrder || orderMutation.isPending}
              >
                {orderMutation.isPending ? (
                  <>
                    <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                    Processando...
                  </>
                ) : orderMutation.isSuccess ? (
                  <>
                    <CheckCircle className="w-5 h-5 mr-2" />
                    Pedido Criado!
                  </>
                ) : (
                  <>
                    <ShoppingCart className="w-5 h-5 mr-2" />
                    Fazer Pedido
                  </>
                )}
              </Button>
            </form>
          </div>
        </div>
      </main>
    </div>
  );
};

export default NewOrder;
