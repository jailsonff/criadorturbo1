import { useState, useMemo, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Search, Filter, Loader2, AlertCircle, LogIn, Zap, Package } from "lucide-react";
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
import { Service } from "@/lib/api";
import { formatCurrency } from "@/lib/utils";
import { getSupabaseClient } from "@/lib/supabaseClient";
import { Link, useNavigate } from "react-router-dom";
import { useSiteName } from "@/hooks/useSiteName";

interface ServiceCustomization {
  id: string;
  service_id: number;
  custom_name: string | null;
  custom_description: string | null;
  custom_rate: string | null;
  show_refill_button: boolean;
  is_active: boolean;
}

const PublicServices = () => {
  const [search, setSearch] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const navigate = useNavigate();
  const { siteName } = useSiteName();

  // Check if public services is enabled
  const { data: siteSettings, isLoading: settingsLoading } = useQuery({
    queryKey: ["site-settings-public"],
    queryFn: async () => {
      const supabaseClient = getSupabaseClient();
      const { data, error } = await supabaseClient
        .from("site_settings")
        .select("services_page_public")
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  // Redirect if not enabled
  useEffect(() => {
    if (!settingsLoading && siteSettings && !siteSettings.services_page_public) {
      navigate("/auth");
    }
  }, [siteSettings, settingsLoading, navigate]);

  // Fetch services directly from imported_services table
  const { data: services, isLoading, error } = useQuery({
    queryKey: ["public-services-list"],
    queryFn: async () => {
      const supabaseClient = getSupabaseClient();
      const { data, error } = await supabaseClient
        .from("imported_services")
        .select("*")
        .eq("is_active", true)
        .order("category", { ascending: true });
      if (error) throw error;
      
      return data.map((s): Service => ({
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
    enabled: !!siteSettings?.services_page_public,
  });

  const { data: customizations } = useQuery({
    queryKey: ["public-service-customizations"],
    queryFn: async () => {
      const supabaseClient = getSupabaseClient();
      const { data, error } = await supabaseClient
        .from("service_customizations")
        .select("*")
        .eq("is_active", true);
      if (error) throw error;
      return data as ServiceCustomization[];
    },
    enabled: !!siteSettings?.services_page_public,
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
    const cats = [...new Set(services.map((s) => s.category))];
    return cats.sort();
  }, [services]);

  const filteredServices = useMemo(() => {
    if (!services) return [];
    return services.filter((service) => {
      const customization = customizationsMap[service.service];
      const displayName = customization?.custom_name || service.name;
      
      if (customization?.is_active === false) return false;
      
      const matchesSearch =
        displayName.toLowerCase().includes(search.toLowerCase()) ||
        service.category.toLowerCase().includes(search.toLowerCase()) ||
        service.service.toString().includes(search);
      const matchesCategory =
        selectedCategory === "all" || service.category === selectedCategory;
      return matchesSearch && matchesCategory;
    });
  }, [services, search, selectedCategory, customizationsMap]);

  const servicesByCategory = useMemo(() => {
    const grouped: Record<string, Service[]> = {};
    filteredServices.forEach((service) => {
      if (!grouped[service.category]) {
        grouped[service.category] = [];
      }
      grouped[service.category].push(service);
    });
    return grouped;
  }, [filteredServices]);

  const getDisplayData = (service: Service) => {
    const customization = customizationsMap[service.service];
    return {
      name: customization?.custom_name || service.name,
      description: customization?.custom_description || service.description || null,
      rate: customization?.custom_rate || service.rate,
      min: service.min,
      max: service.max,
      type: service.type,
      refill: service.refill,
      cancel: service.cancel,
      dripfeed: service.dripfeed,
    };
  };

  if (settingsLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!siteSettings?.services_page_public) {
    return null;
  }

  return (
    <div className="min-h-screen">
      {/* Header */}
      <header className="fixed top-0 left-0 right-0 z-50 glass border-b border-border/50">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2">
            <div className="w-10 h-10 rounded-lg bg-primary/20 flex items-center justify-center">
              <Zap className="w-6 h-6 text-primary" />
            </div>
            <span className="text-xl font-bold text-primary">{siteName}</span>
          </Link>

          <Link to="/auth">
            <Button variant="outline" className="gap-2">
              <LogIn className="w-4 h-4" />
              Entrar
            </Button>
          </Link>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8 pt-24">
        <div className="flex flex-col gap-6 mb-8">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-primary/20 flex items-center justify-center">
              <Package className="w-6 h-6 text-primary" />
            </div>
            <div>
              <h1 className="text-3xl font-bold">Nossos Serviços</h1>
              <p className="text-muted-foreground">
                Confira todos os serviços disponíveis
              </p>
            </div>
          </div>
        </div>

        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-4 mb-6">
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
              Erro ao carregar serviços.
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
              {filteredServices.length} serviços disponíveis
            </p>
            
            <div className="space-y-6">
              {Object.entries(servicesByCategory).map(([category, categoryServices]) => (
                <div key={category} className="rounded-lg border border-border overflow-hidden">
                  <div className="bg-primary px-4 py-3">
                    <h3 className="font-semibold text-primary-foreground">
                      {category}
                    </h3>
                  </div>
                  
                  <div className="overflow-x-auto scrollbar-hide">
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-muted/50 hover:bg-muted/50">
                          <TableHead className="w-16 sm:w-20 text-xs sm:text-sm">ID</TableHead>
                          <TableHead className="text-xs sm:text-sm">Nome / Descrição</TableHead>
                          <TableHead className="w-20 sm:w-28 text-right text-xs sm:text-sm">Preço/1K</TableHead>
                          <TableHead className="w-16 sm:w-24 text-center text-xs sm:text-sm hidden sm:table-cell">Mín</TableHead>
                          <TableHead className="w-16 sm:w-24 text-center text-xs sm:text-sm hidden sm:table-cell">Máx</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {categoryServices.map((service) => {
                          const displayData = getDisplayData(service);
                          return (
                            <TableRow key={service.service} className="hover:bg-muted/30 align-top">
                              <TableCell className="font-mono text-xs sm:text-sm text-muted-foreground pt-4">
                                {service.service}
                              </TableCell>
                              <TableCell className="py-3">
                                <div className="flex flex-col gap-1">
                                  <span className="font-medium text-xs sm:text-sm">{displayData.name}</span>
                                  <span className="text-[10px] sm:text-xs text-muted-foreground">
                                    Tipo: {displayData.type}
                                    {displayData.refill && " • Refill ♻️"}
                                    {displayData.cancel && " • Cancelável"}
                                    {displayData.dripfeed && " • Drip-feed 💧"}
                                  </span>
                                  {displayData.description && (
                                    <div className="text-[10px] sm:text-xs text-muted-foreground mt-1 whitespace-pre-line max-w-xl line-clamp-2">
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
                              </TableCell>
                              <TableCell className="text-center text-xs sm:text-sm pt-4 hidden sm:table-cell">
                                {parseInt(displayData.min).toLocaleString()}
                              </TableCell>
                              <TableCell className="text-center text-xs sm:text-sm pt-4 hidden sm:table-cell">
                                {parseInt(displayData.max).toLocaleString()}
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

            {/* CTA */}
            <div className="mt-12 text-center glass rounded-xl p-8 border border-primary/20">
              <h2 className="text-2xl font-bold mb-2">Pronto para começar?</h2>
              <p className="text-muted-foreground mb-6">
                Crie sua conta e faça seu primeiro pedido agora mesmo!
              </p>
              <Link to="/auth">
                <Button size="lg" className="glow-primary">
                  Criar Conta Grátis
                </Button>
              </Link>
            </div>
          </>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-border/30 py-8 mt-12">
        <div className="container mx-auto px-4 text-center">
          <p className="text-sm text-muted-foreground">
            © {new Date().getFullYear()} {siteName}. Todos os direitos reservados.
          </p>
        </div>
      </footer>
    </div>
  );
};

export default PublicServices;
