import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Search, Filter, Loader2, AlertCircle, ArrowRight, EyeOff, Star } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useFavoriteServices } from "@/hooks/useFavoriteServices";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Switch } from "@/components/ui/switch";
import BalanceCard from "@/components/BalanceCard";
import { Service } from "@/lib/api";
import { formatCurrency } from "@/lib/utils";
import { getSupabaseClient } from "@/lib/supabaseClient";
import { Link, useNavigate } from "react-router-dom";

interface ServiceCustomization {
  id: string;
  service_id: number;
  custom_name: string | null;
  custom_description: string | null;
  custom_rate: string | null;
  show_refill_button: boolean;
  is_active: boolean;
}

interface ServiceWithProvider extends Service {
  provider_id?: string;
  provider_name?: string;
}

interface CategoryDisplayOrder {
  id: string;
  category_name: string;
  display_order: number;
}

const Services = () => {
  const [search, setSearch] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [selectedProvider, setSelectedProvider] = useState<string>("all");
  const [showInactive, setShowInactive] = useState(false);
  const navigate = useNavigate();
  const { isAdmin } = useAuth();
  const { favorites, isFavorite, toggleFavorite } = useFavoriteServices();

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
      return data as CategoryDisplayOrder[];
    },
  });

  const categoryOrderMap = useMemo(() => {
    const map: Record<string, number> = {};
    categoryOrders?.forEach((c) => {
      map[c.category_name] = c.display_order;
    });
    return map;
  }, [categoryOrders]);

  // Fetch providers for mapping
  const { data: providers } = useQuery({
    queryKey: ["smm-providers"],
    queryFn: async () => {
      const supabase = getSupabaseClient();
      const { data, error } = await supabase
        .from("smm_providers")
        .select("id, name");
      if (error) throw error;
      return data;
    },
    enabled: isAdmin,
  });

  const providersMap = useMemo(() => {
    const map: Record<string, string> = {};
    providers?.forEach((p) => {
      map[p.id] = p.name;
    });
    return map;
  }, [providers]);

  // Fetch services directly from imported_services table
  const { data: services, isLoading, error } = useQuery({
    queryKey: ["imported-services-list", isAdmin],
    queryFn: async () => {
      const supabase = getSupabaseClient();
      const { data, error } = await supabase
        .from("imported_services")
        .select("*")
        .order("external_service_id", { ascending: true });
      if (error) throw error;
      
      // Transform to Service format with provider info
      return data.map((s): ServiceWithProvider => ({
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
        provider_id: s.provider_id,
      }));
    },
    retry: 1,
  });

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

  const categories = useMemo(() => {
    if (!services) return [];

    // Preserve natural category order based on the service list (stable because we order by external_service_id)
    const seen = new Set<string>();
    const cats: string[] = [];
    for (const s of services) {
      if (!seen.has(s.category)) {
        seen.add(s.category);
        cats.push(s.category);
      }
    }

    // If category_display_order exists and has entries, apply it
    if (Object.keys(categoryOrderMap).length > 0) {
      return [...cats].sort((a, b) => {
        const orderA = categoryOrderMap[a] ?? 999999;
        const orderB = categoryOrderMap[b] ?? 999999;
        if (orderA !== orderB) return orderA - orderB;
        return a.localeCompare(b);
      });
    }

    return cats;
  }, [services, categoryOrderMap]);

  const filteredServices = useMemo(() => {
    if (!services) return [];
    return services.filter((service) => {
      const customization = customizationsMap[service.service];
      const displayName = customization?.custom_name || service.name;
      
      // Filter inactive services
      if (!showInactive && customization?.is_active === false) {
        return false;
      }
      
      const matchesSearch =
        displayName.toLowerCase().includes(search.toLowerCase()) ||
        service.category.toLowerCase().includes(search.toLowerCase()) ||
        service.service.toString().includes(search);
      const matchesCategory =
        selectedCategory === "all" || service.category === selectedCategory;
      const matchesProvider =
        selectedProvider === "all" || service.provider_id === selectedProvider;
      return matchesSearch && matchesCategory && matchesProvider;
    });
  }, [services, search, selectedCategory, selectedProvider, customizationsMap, showInactive]);

  // Group services by category
  // Get favorite services
  const favoriteServices = useMemo(() => {
    if (!services || favorites.length === 0) return [];
    return services.filter((s) => favorites.includes(s.service));
  }, [services, favorites]);

  const servicesByCategory = useMemo(() => {
    const grouped: Record<string, ServiceWithProvider[]> = {};
    
    filteredServices.forEach((service) => {
      if (!grouped[service.category]) {
        grouped[service.category] = [];
      }
      grouped[service.category].push(service);
    });
    return grouped;
  }, [filteredServices]);

  // Ordered categories with Favoritos at the top.
  // If category_display_order has entries, apply it; otherwise preserve natural order from `categories`.
  const orderedCategories = useMemo(() => {
    const result: Array<{ key: string; services: ServiceWithProvider[] }> = [];

    if (favoriteServices.length > 0) {
      result.push({ key: "⭐ Favoritos", services: favoriteServices });
    }

    const categoryNames = Object.keys(servicesByCategory);

    const orderedNames = Object.keys(categoryOrderMap).length > 0
      ? [...categoryNames].sort((a, b) => {
          const orderA = categoryOrderMap[a] ?? 999999;
          const orderB = categoryOrderMap[b] ?? 999999;
          if (orderA !== orderB) return orderA - orderB;
          return a.localeCompare(b);
        })
      : categories.filter((c) => categoryNames.includes(c));

    orderedNames.forEach((category) => {
      result.push({ key: category, services: servicesByCategory[category] });
    });

    return result;
  }, [servicesByCategory, favoriteServices, categoryOrderMap, categories]);

  const handleOrder = (serviceId: number) => {
    navigate(`/new-order?service=${serviceId}`);
  };

  const getDisplayData = (service: ServiceWithProvider) => {
    const customization = customizationsMap[service.service];
    const providerName = service.provider_id ? providersMap[service.provider_id] : undefined;
    
    return {
      name: customization?.custom_name || service.name,
      description: customization?.custom_description || service.description || null,
      rate: customization?.custom_rate || service.rate,
      min: service.min,
      max: service.max,
      isCustomized: !!customization,
      isActive: customization?.is_active ?? true,
      showRefillButton: customization?.show_refill_button ?? true,
      type: service.type,
      refill: service.refill,
      cancel: service.cancel,
      dripfeed: service.dripfeed,
      providerName,
    };
  };

  return (
    <div className="min-h-screen">
      <main className="container mx-auto px-4 py-8">
        <div className="flex flex-col lg:flex-row gap-6 mb-8">
          <div className="flex-1">
            <h1 className="text-3xl font-bold mb-2">Serviços Disponíveis</h1>
            <p className="text-muted-foreground">
              Escolha entre centenas de serviços de alta qualidade
            </p>
          </div>
          <div className="lg:w-80">
            <BalanceCard />
          </div>
        </div>

        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-4 mb-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
            <Input
              placeholder="Buscar por ID ou nome do serviço..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-10"
            />
          </div>
          <Select value={selectedCategory} onValueChange={setSelectedCategory}>
            <SelectTrigger className="w-full sm:w-64">
              <Filter className="w-4 h-4 mr-2" />
              <SelectValue placeholder="Todas as categorias" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas as categorias</SelectItem>
              {categories.map((category) => (
                <SelectItem key={category} value={category}>
                  {category}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {isAdmin && providers && providers.length > 0 && (
            <Select value={selectedProvider} onValueChange={setSelectedProvider}>
              <SelectTrigger className="w-full sm:w-48">
                <SelectValue placeholder="Todos os provedores" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os provedores</SelectItem>
                {providers.map((provider) => (
                  <SelectItem key={provider.id} value={provider.id}>
                    {provider.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>

        {/* Show inactive toggle */}
        <div className="flex items-center gap-2 mb-6">
          <Switch
            id="show-inactive"
            checked={showInactive}
            onCheckedChange={setShowInactive}
          />
          <label htmlFor="show-inactive" className="text-sm text-muted-foreground cursor-pointer">
            Mostrar serviços desativados
          </label>
        </div>

        {/* Services Table */}
        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
          </div>
        ) : error ? (
          <div className="text-center py-20">
            <AlertCircle className="w-12 h-12 text-destructive mx-auto mb-4" />
            <p className="text-lg text-muted-foreground">
              Erro ao carregar serviços. Verifique sua API Key.
            </p>
          </div>
        ) : filteredServices.length === 0 ? (
          <div className="text-center py-20">
            <p className="text-lg text-muted-foreground">
              Nenhum serviço encontrado.
            </p>
          </div>
        ) : (
          <>
            <p className="text-sm text-muted-foreground mb-4">
              {filteredServices.length} serviços encontrados
            </p>
            
            <div className="space-y-6">
              {orderedCategories.map(({ key: category, services: categoryServices }) => (
                <div key={category} className="rounded-lg border border-border overflow-hidden">
                  {/* Category Header */}
                  <div className="bg-primary px-4 py-3">
                    <h3 className="font-semibold text-primary-foreground">
                      {category}
                    </h3>
                  </div>
                  
                  {/* Services Table */}
                  <div className="overflow-x-auto scrollbar-hide">
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-muted/50 hover:bg-muted/50">
                          <TableHead className="w-16 sm:w-20 text-xs sm:text-sm">ID</TableHead>
                          <TableHead className="text-xs sm:text-sm">Nome / Descrição</TableHead>
                          <TableHead className="w-20 sm:w-28 text-right text-xs sm:text-sm">Preço/1K</TableHead>
                          <TableHead className="w-16 sm:w-24 text-center text-xs sm:text-sm hidden sm:table-cell">Mín</TableHead>
                          <TableHead className="w-16 sm:w-24 text-center text-xs sm:text-sm hidden sm:table-cell">Máx</TableHead>
                          <TableHead className="w-24 sm:w-44 text-center text-xs sm:text-sm">Ação</TableHead>
                        </TableRow>
                      </TableHeader>
                    <TableBody>
                      {categoryServices.map((service) => {
                        const displayData = getDisplayData(service);
                        return (
                          <TableRow 
                            key={service.service} 
                            className={`hover:bg-muted/30 align-top ${!displayData.isActive ? 'opacity-50' : ''}`}
                          >
                            <TableCell className="font-mono text-xs sm:text-sm text-muted-foreground pt-4">
                              {service.service}
                              {displayData.isCustomized && (
                                <span className="block text-[10px] sm:text-xs text-primary mt-1">editado</span>
                              )}
                            </TableCell>
                            <TableCell className="py-3">
                              <div className="flex flex-col gap-1">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className="font-medium text-xs sm:text-sm">{displayData.name}</span>
                                  {!displayData.isActive && (
                                    <EyeOff className="w-3 h-3 sm:w-4 sm:h-4 text-muted-foreground" />
                                  )}
                                </div>
                                <span className="text-[10px] sm:text-xs text-muted-foreground">
                                  Tipo: {displayData.type || service.type}
                                  {displayData.refill && displayData.showRefillButton && " • Refill ♻️"}
                                  {displayData.cancel && " • Cancelável"}
                                  {displayData.dripfeed && " • Drip-feed 💧"}
                                </span>
                                {displayData.description && (
                                  <div className="text-[10px] sm:text-xs text-muted-foreground mt-1 whitespace-pre-line max-w-xl line-clamp-2 sm:line-clamp-none">
                                    {displayData.description.substring(0, 200)}
                                    {displayData.description.length > 200 && '...'}
                                  </div>
                                )}
                              </div>
                            </TableCell>
                            <TableCell className="text-right pt-4">
                              <span className="font-semibold text-primary text-xs sm:text-sm">
                                {formatCurrency(parseFloat(displayData.rate))}
                              </span>
                              {displayData.isCustomized && customizationsMap[service.service]?.custom_rate && (
                                <span className="block text-[10px] sm:text-xs text-muted-foreground line-through">
                                  {formatCurrency(parseFloat(service.rate))}
                                </span>
                              )}
                            </TableCell>
                            <TableCell className="text-center text-xs sm:text-sm pt-4 hidden sm:table-cell">
                              {parseInt(displayData.min || service.min).toLocaleString()}
                            </TableCell>
                            <TableCell className="text-center text-xs sm:text-sm pt-4 hidden sm:table-cell">
                              {parseInt(displayData.max || service.max).toLocaleString()}
                            </TableCell>
                            <TableCell className="text-center pt-4">
                              <div className="flex items-center justify-center gap-1">
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    toggleFavorite(service.service);
                                  }}
                                  className="p-2 hover:bg-muted rounded transition-colors"
                                  title={isFavorite(service.service) ? "Remover dos favoritos" : "Adicionar aos favoritos"}
                                >
                                  <Star
                                    className={cn(
                                      "w-4 h-4",
                                      isFavorite(service.service)
                                        ? "fill-yellow-400 text-yellow-400"
                                        : "text-muted-foreground"
                                    )}
                                  />
                                </button>
                                <Button
                                  size="sm"
                                  onClick={() => handleOrder(service.service)}
                                  disabled={!displayData.isActive}
                                  className="text-xs sm:text-sm"
                                >
                                  <span className="hidden sm:inline">Pedir</span>
                                  <ArrowRight className="w-3 h-3 sm:w-4 sm:h-4 sm:ml-1" />
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                    </Table>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </main>
    </div>
  );
};

export default Services;
