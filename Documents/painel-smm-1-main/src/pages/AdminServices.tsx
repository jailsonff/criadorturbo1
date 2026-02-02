import { useState, useMemo, useEffect } from "react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { Search, Filter, Loader2, AlertCircle, Edit2, EyeOff, Package, Store, RefreshCw, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, Sparkles, ShoppingCart, Save, ChevronUp, ChevronDown, ArrowUp, ArrowDown, GripVertical } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
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
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import ServiceEditDialog from "@/components/ServiceEditDialog";
import { Service } from "@/lib/api";
import { formatCurrency } from "@/lib/utils";
import { getSupabaseClient } from "@/lib/supabaseClient";
import { backendSupabase } from "@/lib/backendClient";
import { Link } from "react-router-dom";
import { useToast } from "@/hooks/use-toast";

interface CategoryDisplayOrder {
  id: string;
  category_name: string;
  display_order: number;
}

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

const PAGE_SIZE_OPTIONS = [25, 50, 100, 200];

const AdminServices = () => {
  const [search, setSearch] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [selectedProvider, setSelectedProvider] = useState<string>("all");
  const [showInactive, setShowInactive] = useState(false);
  const [editingService, setEditingService] = useState<Service | null>(null);
  const [editingImportedServiceId, setEditingImportedServiceId] = useState<string | null>(null);
  const [editingInternalServiceId, setEditingInternalServiceId] = useState<number | null>(null);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(50);
  const [batchProgress, setBatchProgress] = useState<{ current: number; total: number; isRunning: boolean; category: string | null }>({
    current: 0,
    total: 0,
    isRunning: false,
    category: null,
  });
  
  const { toast } = useToast();
  const queryClient = useQueryClient();


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

  // Fetch category display order
  const [orderSchemaSupported, setOrderSchemaSupported] = useState(true);
  
  const { data: categoryOrders } = useQuery({
    queryKey: ["category-display-order"],
    queryFn: async () => {
      const supabase = getSupabaseClient();
      const { data, error } = await supabase
        .from("category_display_order")
        .select("*")
        .order("display_order", { ascending: true });
      
      if (error?.code === "42P01" || error?.message?.includes("does not exist")) {
        setOrderSchemaSupported(false);
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

  // Fetch site settings for default order config
  const [defaultOrderSchemaSupported, setDefaultOrderSchemaSupported] = useState(true);

  const { data: siteSettings } = useQuery({
    queryKey: ["site-settings-default-order"],
    queryFn: async () => {
      const supabase = getSupabaseClient();
      const { data, error } = await supabase
        .from("site_settings")
        .select("id, default_order_category, default_order_service_id")
        .limit(1)
        .maybeSingle();

      // External DB might be missing these new columns
      if (error?.code === "42703" || error?.code === "PGRST204") {
        setDefaultOrderSchemaSupported(false);
        return null;
      }

      if (error) throw error;
      setDefaultOrderSchemaSupported(true);
      return data;
    },
  });

  const [defaultCategory, setDefaultCategory] = useState<string>("");
  const [defaultServiceId, setDefaultServiceId] = useState<string>("");
  const [savingDefaults, setSavingDefaults] = useState(false);

  // Sync default values when site settings load
  useEffect(() => {
    if (siteSettings) {
      setDefaultCategory(siteSettings.default_order_category || "");
      setDefaultServiceId(siteSettings.default_order_service_id?.toString() || "");
    }
  }, [siteSettings]);

  // Fetch imported services with provider info AND their correct data
  const { data: importedServices, isLoading, error } = useQuery({
    queryKey: ["imported-services-with-providers"],
    queryFn: async () => {
      const supabase = getSupabaseClient();
      
      // First try with the new column, fallback without it if not exists
       const { data, error } = await supabase
         .from("imported_services")
         .select(`
           id,
           external_service_id,
           provider_id,
           internal_provider_service_id,
           name,
           rate,
           min,
           max,
           category,
           type,
           refill,
           cancel,
           dripfeed,
           description,
           smm_providers (
             name
           )
         `)
         .order("external_service_id", { ascending: true });
      
      // If column doesn't exist, try without it
      if (error?.code === '42703') {
        const { data: fallbackData, error: fallbackError } = await supabase
          .from("imported_services")
          .select(`
            id,
            external_service_id,
            provider_id,
            name,
            rate,
            min,
            max,
            category,
            type,
            refill,
            cancel,
            dripfeed,
            description,
            smm_providers (
              name
            )
          `);
        
        if (fallbackError) throw fallbackError;
        
        // Add null for the missing column
        return (fallbackData || []).map(s => ({
          ...s,
          internal_provider_service_id: null as number | null,
        }));
      }
      
      if (error) throw error;
      return data as Array<{
        id: string;
        external_service_id: number;
        provider_id: string;
        internal_provider_service_id: number | null;
        name: string;
        rate: string;
        min: string;
        max: string;
        category: string;
        type: string | null;
        refill: boolean | null;
        cancel: boolean | null;
        dripfeed: boolean | null;
        description: string | null;
        smm_providers: { name: string } | null;
      }>;
    },
  });

  // Map service_id to provider name
  const providerMap = useMemo(() => {
    const map: Record<number, string> = {};
    importedServices?.forEach((s) => {
      if (s.smm_providers?.name) {
        map[s.external_service_id] = s.smm_providers.name;
      }
    });
    return map;
  }, [importedServices]);

  // Map service_id to imported service data (for correct rate, min, max)
  const importedDataMap = useMemo(() => {
    const map: Record<number, {
      rate: string;
      min: string;
      max: string;
      name: string;
      type: string | null;
      refill: boolean | null;
      cancel: boolean | null;
      dripfeed: boolean | null;
      description: string | null;
    }> = {};
    importedServices?.forEach((s) => {
      map[s.external_service_id] = {
        rate: s.rate,
        min: s.min,
        max: s.max,
        name: s.name,
        type: s.type,
        refill: s.refill,
        cancel: s.cancel,
        dripfeed: s.dripfeed,
        description: s.description,
      };
    });
    return map;
  }, [importedServices]);

  const customizationsMap = useMemo(() => {
    const map: Record<number, ServiceCustomization> = {};
    customizations?.forEach((c) => {
      map[c.service_id] = c;
    });
    return map;
  }, [customizations]);

  // Usar categorias dos serviços importados.
  // Se category_display_order tiver registros, aplica a ordem; senão preserva a ordem natural (estável por external_service_id).
  const categories = useMemo(() => {
    if (!importedServices) return [];

    const seen = new Set<string>();
    const cats: string[] = [];
    for (const s of importedServices) {
      if (!seen.has(s.category)) {
        seen.add(s.category);
        cats.push(s.category);
      }
    }

    if (Object.keys(categoryOrderMap).length > 0) {
      return [...cats].sort((a, b) => {
        const orderA = categoryOrderMap[a] ?? 999999;
        const orderB = categoryOrderMap[b] ?? 999999;
        if (orderA !== orderB) return orderA - orderB;
        return a.localeCompare(b);
      });
    }

    return cats;
  }, [importedServices, categoryOrderMap]);

  // Services for default selection dropdown (filtered by selected category)
  const defaultOrderServices = useMemo(() => {
    if (!importedServices || !defaultCategory) return [];
    return importedServices.filter(s => s.category === defaultCategory);
  }, [importedServices, defaultCategory]);

  // Save default order settings
  const handleSaveDefaults = async () => {
    if (!defaultOrderSchemaSupported) {
      toast({
        title: "Não foi possível salvar",
        description:
          "Seu Banco Externo ainda não tem as colunas de padrão do novo pedido. Atualize o schema do banco e tente novamente.",
        variant: "destructive",
      });
      return;
    }

    if (!siteSettings?.id) {
      toast({
        title: "Não foi possível salvar",
        description: "Não encontrei o registro de configurações do site.",
        variant: "destructive",
      });
      return;
    }

    setSavingDefaults(true);
    const supabase = getSupabaseClient();

    try {
      const { error } = await supabase
        .from("site_settings")
        .update({
          default_order_category: defaultCategory || null,
          default_order_service_id: defaultServiceId ? parseInt(defaultServiceId) : null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", siteSettings.id);

      if (error?.code === "42703" || error?.code === "PGRST204") {
        setDefaultOrderSchemaSupported(false);
        throw new Error(
          "Seu Banco Externo ainda não tem as colunas de padrão do novo pedido (default_order_category / default_order_service_id)."
        );
      }

      if (error) throw error;

      queryClient.invalidateQueries({ queryKey: ["site-settings-default-order"] });
      queryClient.invalidateQueries({ queryKey: ["site-settings-order-defaults"] });

      toast({
        title: "Configuração salva!",
        description: "O serviço padrão foi atualizado.",
      });
    } catch (err: any) {
      toast({
        title: "Erro ao salvar",
        description: err.message,
        variant: "destructive",
      });
    } finally {
      setSavingDefaults(false);
    }
  };

  // Lista de provedores únicos
  const providers = useMemo(() => {
    if (!importedServices) return [];
    const provs = importedServices
      .map((s) => s.smm_providers?.name)
      .filter((name): name is string => !!name);
    return [...new Set(provs)].sort();
  }, [importedServices]);

  // Filtrar serviços importados (fonte principal)
  const filteredServices = useMemo(() => {
    if (!importedServices) return [];

    const rawSearch = search.trim();
    const searchLower = rawSearch.toLowerCase();
    const digitsOnly = rawSearch.replace(/\D/g, "");

    return importedServices.filter((service) => {
      const customization = customizationsMap[service.external_service_id];
      const displayName = customization?.custom_name || service.name;

      if (!showInactive && customization?.is_active === false) {
        return false;
      }

      const matchesSearch =
        displayName.toLowerCase().includes(searchLower) ||
        service.category.toLowerCase().includes(searchLower) ||
        (digitsOnly.length > 0 && service.external_service_id.toString().includes(digitsOnly));

      const matchesCategory =
        selectedCategory === "all" || service.category === selectedCategory;
      const matchesProvider =
        selectedProvider === "all" || service.smm_providers?.name === selectedProvider;
      return matchesSearch && matchesCategory && matchesProvider;
    });
  }, [importedServices, search, selectedCategory, selectedProvider, customizationsMap, showInactive]);

  // Paginação
  const totalPages = Math.ceil(filteredServices.length / itemsPerPage);
  const paginatedServices = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage;
    return filteredServices.slice(start, start + itemsPerPage);
  }, [filteredServices, currentPage, itemsPerPage]);

  const handleItemsPerPageChange = (value: string) => {
    setItemsPerPage(Number(value));
    setCurrentPage(1);
  };

  // Reset página quando filtros mudam
  const handleSearchChange = (value: string) => {
    setSearch(value);
    setCurrentPage(1);
  };

  const handleCategoryChange = (value: string) => {
    setSelectedCategory(value);
    setCurrentPage(1);
  };

  const handleProviderChange = (value: string) => {
    setSelectedProvider(value);
    setCurrentPage(1);
  };

  // Agrupar serviços paginados por categoria (respeitando display_order)
  const servicesByCategory = useMemo(() => {
    const grouped: Record<string, typeof paginatedServices> = {};
    paginatedServices.forEach((service) => {
      if (!grouped[service.category]) {
        grouped[service.category] = [];
      }
      grouped[service.category].push(service);
    });
    return grouped;
  }, [paginatedServices]);

  // Ordenar categorias para exibição
  const sortedCategoryNames = useMemo(() => {
    const names = Object.keys(servicesByCategory);

    // If category_display_order has entries, apply it; otherwise keep natural order from `categories`
    if (Object.keys(categoryOrderMap).length > 0) {
      return [...names].sort((a, b) => {
        const orderA = categoryOrderMap[a] ?? 999999;
        const orderB = categoryOrderMap[b] ?? 999999;
        if (orderA !== orderB) return orderA - orderB;
        return a.localeCompare(b);
      });
    }

    return categories.filter((c) => names.includes(c));
  }, [servicesByCategory, categoryOrderMap, categories]);

  // Move category up/down
  const handleMoveCategory = async (categoryName: string, direction: 'up' | 'down') => {
    if (!orderSchemaSupported) {
      toast({
        title: "Recurso não disponível",
        description: "A tabela de ordenação não existe no banco de dados.",
        variant: "destructive",
      });
      return;
    }

    const supabase = getSupabaseClient();
    const currentOrder = categoryOrderMap[categoryName] ?? categories.indexOf(categoryName);
    const categoryIndex = sortedCategoryNames.indexOf(categoryName);
    
    if (direction === 'up' && categoryIndex === 0) return;
    if (direction === 'down' && categoryIndex === sortedCategoryNames.length - 1) return;
    
    const swapCategoryName = direction === 'up' 
      ? sortedCategoryNames[categoryIndex - 1]
      : sortedCategoryNames[categoryIndex + 1];
    
    const swapOrder = categoryOrderMap[swapCategoryName] ?? categories.indexOf(swapCategoryName);
    
    try {
      // Upsert both categories with swapped orders
      const { error: error1 } = await supabase
        .from("category_display_order")
        .upsert({ 
          category_name: categoryName, 
          display_order: swapOrder,
          updated_at: new Date().toISOString()
        }, { onConflict: 'category_name' });
      
      if (error1) throw error1;
      
      const { error: error2 } = await supabase
        .from("category_display_order")
        .upsert({ 
          category_name: swapCategoryName, 
          display_order: currentOrder,
          updated_at: new Date().toISOString()
        }, { onConflict: 'category_name' });
      
      if (error2) throw error2;
      
      queryClient.invalidateQueries({ queryKey: ["category-display-order"] });
      
      toast({
        title: "Ordem atualizada",
        description: `Categoria "${categoryName}" movida para ${direction === 'up' ? 'cima' : 'baixo'}.`,
      });
    } catch (err: any) {
      toast({
        title: "Erro ao mover categoria",
        description: err.message,
        variant: "destructive",
      });
    }
  };

  // Move service up/down within category
  const handleMoveService = async (service: ImportedService, direction: 'up' | 'down') => {
    const supabase = getSupabaseClient();
    const servicesInCategory = servicesByCategory[service.category] || [];
    const currentIndex = servicesInCategory.findIndex(s => s.id === service.id);
    
    if (direction === 'up' && currentIndex === 0) return;
    if (direction === 'down' && currentIndex === servicesInCategory.length - 1) return;
    
    const swapService = direction === 'up'
      ? servicesInCategory[currentIndex - 1]
      : servicesInCategory[currentIndex + 1];
    
    const currentDisplayOrder = (service as any).display_order ?? currentIndex;
    const swapDisplayOrder = (swapService as any).display_order ?? (direction === 'up' ? currentIndex - 1 : currentIndex + 1);
    
    try {
      // Swap display_order values
      const { error: error1 } = await supabase
        .from("imported_services")
        .update({ display_order: swapDisplayOrder })
        .eq("id", service.id);
      
      if (error1) throw error1;
      
      const { error: error2 } = await supabase
        .from("imported_services")
        .update({ display_order: currentDisplayOrder })
        .eq("id", swapService.id);
      
      if (error2) throw error2;
      
      queryClient.invalidateQueries({ queryKey: ["imported-services-with-providers"] });
      queryClient.invalidateQueries({ queryKey: ["imported-services-user"] });
      
      toast({
        title: "Ordem atualizada",
        description: `Serviço movido para ${direction === 'up' ? 'cima' : 'baixo'}.`,
      });
    } catch (err: any) {
      toast({
        title: "Erro ao mover serviço",
        description: err.message,
        variant: "destructive",
      });
    }
  };

  // Tipo para serviço importado
  type ImportedService = NonNullable<typeof importedServices>[number];

  const handleEdit = (service: ImportedService) => {
    // Converter para formato Service para o dialog
    const serviceForEdit: Service = {
      service: service.external_service_id,
      name: service.name,
      rate: service.rate,
      min: service.min,
      max: service.max,
      category: service.category,
      type: service.type || 'Default',
      refill: service.refill || false,
      cancel: service.cancel || false,
      dripfeed: service.dripfeed || false,
    };
    setEditingImportedServiceId(service.id);
    setEditingInternalServiceId(service.internal_provider_service_id);
    setEditingService(serviceForEdit);
    setEditDialogOpen(true);
  };

  const getDisplayData = (service: ImportedService) => {
    const customization = customizationsMap[service.external_service_id];
    
    return {
      name: customization?.custom_name || service.name,
      description: customization?.custom_description || service.description || null,
      rate: customization?.custom_rate || service.rate,
      min: customization?.custom_min || service.min,
      max: customization?.custom_max || service.max,
      originalMin: service.min,
      originalMax: service.max,
      isCustomized: !!customization,
      isActive: customization?.is_active ?? true,
      showRefillButton: customization?.show_refill_button ?? true,
      type: service.type,
      refill: service.refill,
      cancel: service.cancel,
      dripfeed: service.dripfeed,
    };
  };

  // Stats baseados nos serviços importados (fonte principal de dados)
  const stats = useMemo(() => {
    // Total de serviços importados de todos os provedores
    const total = importedServices?.length || 0;
    
    // Serviços ativos (não desativados nas customizações)
    const active = importedServices?.filter(s => 
      customizationsMap[s.external_service_id]?.is_active !== false
    ).length || total;
    
    // Serviços personalizados
    const customized = Object.keys(customizationsMap).length;
    
    // Categorias únicas de todos os serviços importados
    const importedCategories = new Set(importedServices?.map(s => s.category) || []);
    const categoriesCount = importedCategories.size;
    
    return { total, active, customized, categoriesCount };
  }, [importedServices, customizationsMap]);

  // Sync mutation
  const syncMutation = useMutation({
    mutationFn: async () => {
      const supabase = getSupabaseClient();
      const { data, error } = await supabase.functions.invoke("sync-services");
      if (error) throw error;
      if (!data.success) throw new Error(data.error || "Sync failed");
      return data;
    },
    onSuccess: (data) => {
      toast({
        title: "Sincronização concluída!",
        description: `${data.updated} serviços atualizados.`,
      });
      queryClient.invalidateQueries({ queryKey: ["imported-services-with-providers"] });
      queryClient.invalidateQueries({ queryKey: ["services"] });
    },
    onError: (error) => {
      toast({
        title: "Erro na sincronização",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Batch generate descriptions for a specific category
  const handleBatchGenerateDescriptions = async (categoryName: string) => {
    const servicesInCategory = importedServices?.filter(s => s.category === categoryName) || [];
    
    if (servicesInCategory.length === 0) {
      toast({
        title: "Nenhum serviço encontrado",
        description: "Não há serviços nesta categoria.",
        variant: "destructive",
      });
      return;
    }

    setBatchProgress({ current: 0, total: servicesInCategory.length, isRunning: true, category: categoryName });

    const supabase = getSupabaseClient();
    let successCount = 0;
    let errorCount = 0;

    for (let i = 0; i < servicesInCategory.length; i++) {
      const service = servicesInCategory[i];
      setBatchProgress(prev => ({ ...prev, current: i + 1 }));

      let retries = 0;
      const maxRetries = 3;
      let success = false;

      while (retries < maxRetries && !success) {
        try {
          // Generate description via Lovable Cloud edge function (always use Lovable client for edge functions)
          const { data, error } = await backendSupabase.functions.invoke("generate-service-description", {
            body: { serviceName: service.name, category: service.category },
          });

          if (error) {
            // Check if it's a rate limit error
            if (error.message?.includes("429") || error.message?.includes("rate") || error.message?.includes("limite")) {
              retries++;
              if (retries < maxRetries) {
                // Exponential backoff: 2s, 4s, 8s
                await new Promise(resolve => setTimeout(resolve, 2000 * Math.pow(2, retries)));
                continue;
              }
            }
            throw error;
          }

          const description = data?.description;
          if (!description) {
            errorCount++;
            success = true;
            continue;
          }

          // Check if customization exists
          const existingCustomization = customizationsMap[service.external_service_id];

          if (existingCustomization) {
            // Update existing
            await supabase
              .from("service_customizations")
              .update({
                custom_description: description,
                updated_at: new Date().toISOString(),
              })
              .eq("service_id", service.external_service_id);
          } else {
            // Insert new
            await supabase
              .from("service_customizations")
              .insert({
                service_id: service.external_service_id,
                custom_description: description,
                is_active: true,
                show_refill_button: true,
              });
          }

          successCount++;
          success = true;

          // Longer delay to avoid rate limiting (1.5 seconds between requests)
          await new Promise(resolve => setTimeout(resolve, 1500));
        } catch (err) {
          console.error(`Error generating description for service ${service.external_service_id} (attempt ${retries + 1}):`, err);
          retries++;
          if (retries >= maxRetries) {
            errorCount++;
          } else {
            // Wait before retry
            await new Promise(resolve => setTimeout(resolve, 2000 * Math.pow(2, retries)));
          }
        }
      }
    }

    setBatchProgress({ current: 0, total: 0, isRunning: false, category: null });
    queryClient.invalidateQueries({ queryKey: ["service-customizations"] });

    toast({
      title: "Geração em lote concluída!",
      description: `${successCount} descrições geradas com sucesso. ${errorCount > 0 ? `${errorCount} erros.` : ''}`,
    });
  };

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold gradient-text flex items-center gap-2">
            <Package className="w-8 h-8" />
            Gerenciar Serviços
          </h1>
          <p className="text-muted-foreground mt-1">
            Personalize nomes, preços e visibilidade dos serviços
          </p>
        </div>
        <Button
          onClick={() => syncMutation.mutate()}
          disabled={syncMutation.isPending}
          className="gap-2"
        >
          <RefreshCw className={`w-4 h-4 ${syncMutation.isPending ? 'animate-spin' : ''}`} />
          {syncMutation.isPending ? 'Sincronizando...' : 'Atualizar Preços'}
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="relative overflow-hidden border-0 bg-gradient-to-br from-cyan-500/40 via-cyan-600/25 to-cyan-900/10 shadow-xl shadow-cyan-500/25">
          <div className="absolute top-0 right-0 w-24 h-24 bg-cyan-400/30 rounded-full blur-2xl -translate-y-1/2 translate-x-1/2" />
          <CardContent className="pt-4 relative">
            <p className="text-sm text-muted-foreground">Total</p>
            <p className="text-2xl font-bold text-cyan-300">{stats.total}</p>
          </CardContent>
        </Card>
        <Card className="relative overflow-hidden border-0 bg-gradient-to-br from-emerald-500/40 via-emerald-600/25 to-emerald-900/10 shadow-xl shadow-emerald-500/25">
          <div className="absolute top-0 right-0 w-24 h-24 bg-emerald-400/30 rounded-full blur-2xl -translate-y-1/2 translate-x-1/2" />
          <CardContent className="pt-4 relative">
            <p className="text-sm text-muted-foreground">Ativos</p>
            <p className="text-2xl font-bold text-emerald-300">{stats.active}</p>
          </CardContent>
        </Card>
        <Card className="relative overflow-hidden border-0 bg-gradient-to-br from-violet-500/40 via-violet-600/25 to-violet-900/10 shadow-xl shadow-violet-500/25">
          <div className="absolute top-0 right-0 w-24 h-24 bg-violet-400/30 rounded-full blur-2xl -translate-y-1/2 translate-x-1/2" />
          <CardContent className="pt-4 relative">
            <p className="text-sm text-muted-foreground">Personalizados</p>
            <p className="text-2xl font-bold text-violet-300">{stats.customized}</p>
          </CardContent>
        </Card>
        <Card className="relative overflow-hidden border-0 bg-gradient-to-br from-amber-500/40 via-amber-600/25 to-amber-900/10 shadow-xl shadow-amber-500/25">
          <div className="absolute top-0 right-0 w-24 h-24 bg-amber-400/30 rounded-full blur-2xl -translate-y-1/2 translate-x-1/2" />
          <CardContent className="pt-4 relative">
            <p className="text-sm text-muted-foreground">Categorias</p>
            <p className="text-2xl font-bold text-amber-300">{stats.categoriesCount}</p>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card className="glass-card border-border/50">
        <CardContent className="pt-6">
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
            <Input
                placeholder="Buscar por ID ou nome do serviço..."
                value={search}
                onChange={(e) => handleSearchChange(e.target.value)}
                className="pl-10"
              />
            </div>
            <Select value={selectedCategory} onValueChange={handleCategoryChange}>
              <SelectTrigger className="w-full sm:w-56">
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
            <Select value={selectedProvider} onValueChange={handleProviderChange}>
              <SelectTrigger className="w-full sm:w-48">
                <Store className="w-4 h-4 mr-2" />
                <SelectValue placeholder="Todos os provedores" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os provedores</SelectItem>
                {providers.map((provider) => (
                  <SelectItem key={provider} value={provider}>
                    {provider}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-2 mt-4">
            <Switch
              id="show-inactive"
              checked={showInactive}
              onCheckedChange={setShowInactive}
            />
            <label htmlFor="show-inactive" className="text-sm text-muted-foreground cursor-pointer">
              Mostrar serviços desativados
            </label>
          </div>
          
          {batchProgress.isRunning && (
            <div className="mt-4 space-y-2">
              <Progress value={(batchProgress.current / batchProgress.total) * 100} className="h-2" />
              <p className="text-xs text-muted-foreground text-center">
                Gerando descrição {batchProgress.current} de {batchProgress.total} serviços...
              </p>
            </div>
          )}

          {/* Default Order Settings */}
          <div className="mt-6 pt-6 border-t border-border/50">
            <div className="flex items-center gap-2 mb-3">
              <ShoppingCart className="w-4 h-4 text-cyan-500" />
              <span className="font-medium text-sm">Serviço Padrão do Novo Pedido</span>
            </div>

            {!defaultOrderSchemaSupported && (
              <Alert className="mb-4">
                <AlertDescription>
                  Seu <span className="font-medium">Banco Externo</span> ainda não possui as colunas
                  necessárias (<span className="font-mono">default_order_category</span> e{" "}
                  <span className="font-mono">default_order_service_id</span>). Atualize o schema do
                  banco para habilitar este recurso.
                </AlertDescription>
              </Alert>
            )}

            <p className="text-xs text-muted-foreground mb-4">
              Configure qual categoria e serviço serão selecionados automaticamente ao abrir a página de novo pedido
            </p>
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 items-end">
              <div className="space-y-2">
                <Label className="text-xs">Categoria Padrão</Label>
                <Select
                  value={defaultCategory}
                  onValueChange={(value) => {
                    setDefaultCategory(value);
                    setDefaultServiceId("");
                  }}
                  disabled={!defaultOrderSchemaSupported}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione a categoria padrão" />
                  </SelectTrigger>
                  <SelectContent>
                    {categories.map((category) => (
                      <SelectItem key={category} value={category}>
                        {category}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label className="text-xs">Serviço Padrão</Label>
                <Select
                  value={defaultServiceId}
                  onValueChange={setDefaultServiceId}
                  disabled={!defaultCategory || !defaultOrderSchemaSupported}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={defaultCategory ? "Selecione o serviço" : "Selecione uma categoria"} />
                  </SelectTrigger>
                  <SelectContent>
                    {defaultOrderServices.map((service) => (
                      <SelectItem key={service.external_service_id} value={service.external_service_id.toString()}>
                        #{service.external_service_id} - {service.name.substring(0, 50)}{service.name.length > 50 ? '...' : ''}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button
                onClick={handleSaveDefaults}
                disabled={savingDefaults || !defaultOrderSchemaSupported}
                size="sm"
                className="gap-2"
              >
                <Save className="w-4 h-4" />
                {savingDefaults ? "Salvando..." : "Salvar Padrão"}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Services Table */}
      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      ) : error ? (
        <div className="text-center py-20">
          <AlertCircle className="w-12 h-12 text-destructive mx-auto mb-4" />
          <p className="text-lg text-muted-foreground">
            Erro ao carregar serviços. Verifique a API Key.
          </p>
        </div>
      ) : filteredServices.length === 0 ? (
        <div className="text-center py-20">
          <Package className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
          <p className="text-lg text-muted-foreground">
            Nenhum serviço encontrado.
          </p>
        </div>
      ) : (
        <>
          <p className="text-sm text-muted-foreground">
            {filteredServices.length} serviços encontrados
          </p>
          
          <div className="space-y-6">
            {sortedCategoryNames.map((category, categoryIndex) => {
              const categoryServices = servicesByCategory[category];
              return (
              <Card key={category} className="glass-card border-border/50 overflow-hidden">
                <CardHeader className="bg-primary py-3 flex flex-row items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    {/* Category reorder buttons */}
                    <div className="flex flex-col gap-0.5">
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-5 w-5 p-0 text-primary-foreground/70 hover:text-primary-foreground hover:bg-primary-foreground/10"
                        onClick={() => handleMoveCategory(category, 'up')}
                        disabled={categoryIndex === 0}
                        title="Mover categoria para cima"
                      >
                        <ChevronUp className="w-3 h-3" />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-5 w-5 p-0 text-primary-foreground/70 hover:text-primary-foreground hover:bg-primary-foreground/10"
                        onClick={() => handleMoveCategory(category, 'down')}
                        disabled={categoryIndex === sortedCategoryNames.length - 1}
                        title="Mover categoria para baixo"
                      >
                        <ChevronDown className="w-3 h-3" />
                      </Button>
                    </div>
                    <CardTitle className="text-primary-foreground text-base">
                      {category}
                    </CardTitle>
                  </div>
                  <Button
                    onClick={() => handleBatchGenerateDescriptions(category)}
                    disabled={batchProgress.isRunning}
                    size="sm"
                    variant="secondary"
                    className="gap-1.5 h-7 text-xs"
                  >
                    <Sparkles className={`w-3.5 h-3.5 ${batchProgress.isRunning && batchProgress.category === category ? 'animate-pulse' : ''}`} />
                    {batchProgress.isRunning && batchProgress.category === category 
                      ? `Gerando ${batchProgress.current}/${batchProgress.total}...` 
                      : 'Gerar descrições'}
                  </Button>
                </CardHeader>
                <CardContent className="p-0">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/50 hover:bg-muted/50">
                        <TableHead className="w-16"></TableHead>
                        <TableHead className="w-20">ID</TableHead>
                        <TableHead>Nome / Descrição</TableHead>
                        <TableHead className="w-28 text-right">Preço/1K</TableHead>
                        <TableHead className="w-24 text-center">Mín</TableHead>
                        <TableHead className="w-24 text-center">Máx</TableHead>
                        <TableHead className="w-24 text-center">Ação</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {categoryServices.map((service, serviceIndex) => {
                        const displayData = getDisplayData(service);
                        return (
                          <TableRow 
                            key={service.external_service_id} 
                            className={`hover:bg-muted/30 align-top ${!displayData.isActive ? 'opacity-50' : ''}`}
                          >
                            {/* Service reorder buttons */}
                            <TableCell className="pt-4">
                              <div className="flex flex-col gap-0.5">
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="h-5 w-5 p-0 text-muted-foreground hover:text-foreground"
                                  onClick={() => handleMoveService(service, 'up')}
                                  disabled={serviceIndex === 0}
                                  title="Mover serviço para cima"
                                >
                                  <ChevronUp className="w-3 h-3" />
                                </Button>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="h-5 w-5 p-0 text-muted-foreground hover:text-foreground"
                                  onClick={() => handleMoveService(service, 'down')}
                                  disabled={serviceIndex === categoryServices.length - 1}
                                  title="Mover serviço para baixo"
                                >
                                  <ChevronDown className="w-3 h-3" />
                                </Button>
                              </div>
                            </TableCell>
                            <TableCell className="font-mono text-sm text-muted-foreground pt-4">
                              {service.external_service_id}
                              {displayData.isCustomized && (
                                <span className="block text-xs text-primary mt-1">editado</span>
                              )}
                              {service.smm_providers?.name && (
                                <span className="flex items-center gap-1 text-xs text-amber-500 mt-1">
                                  <Store className="w-3 h-3" />
                                  {service.smm_providers.name}
                                </span>
                              )}
                            </TableCell>
                            <TableCell className="py-3">
                              <div className="flex flex-col gap-1">
                                <div className="flex items-center gap-2">
                                  <span className="font-medium">{displayData.name}</span>
                                  {!displayData.isActive && (
                                    <EyeOff className="w-4 h-4 text-muted-foreground" />
                                  )}
                                </div>
                                <span className="text-xs text-muted-foreground">
                                  Tipo: {displayData.type || 'Default'}
                                  {displayData.refill && displayData.showRefillButton && " • Refill ♻️"}
                                  {displayData.cancel && " • Cancelável"}
                                  {displayData.dripfeed && " • Drip-feed 💧"}
                                </span>
                                {displayData.description && (
                                  <div className="text-xs text-muted-foreground mt-1 whitespace-pre-line max-w-xl">
                                    {displayData.description.substring(0, 200)}
                                    {displayData.description.length > 200 && '...'}
                                  </div>
                                )}
                              </div>
                            </TableCell>
                            <TableCell className="text-right pt-4">
                              <span className="font-semibold text-primary">
                                {formatCurrency(parseFloat(displayData.rate))}
                              </span>
                              {displayData.isCustomized && customizationsMap[service.external_service_id]?.custom_rate && (
                                <span className="block text-xs text-muted-foreground line-through">
                                  {formatCurrency(parseFloat(service.rate))}
                                </span>
                              )}
                            </TableCell>
                            <TableCell className="text-center text-sm pt-4">
                              {parseInt(displayData.min).toLocaleString()}
                              {displayData.isCustomized && customizationsMap[service.external_service_id]?.custom_min && (
                                <span className="block text-xs text-muted-foreground line-through">
                                  {parseInt(displayData.originalMin).toLocaleString()}
                                </span>
                              )}
                            </TableCell>
                            <TableCell className="text-center text-sm pt-4">
                              {parseInt(displayData.max).toLocaleString()}
                              {displayData.isCustomized && customizationsMap[service.external_service_id]?.custom_max && (
                                <span className="block text-xs text-muted-foreground line-through">
                                  {parseInt(displayData.originalMax).toLocaleString()}
                                </span>
                              )}
                            </TableCell>
                            <TableCell className="text-center pt-4">
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => handleEdit(service)}
                              >
                                <Edit2 className="w-4 h-4" />
                              </Button>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
              );
            })}
          </div>

          {/* Paginação */}
          {totalPages > 1 && (
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mt-6">
              <div className="flex items-center gap-4">
                <p className="text-sm text-muted-foreground">
                  Mostrando {((currentPage - 1) * itemsPerPage) + 1} a {Math.min(currentPage * itemsPerPage, filteredServices.length)} de {filteredServices.length} serviços
                </p>
                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground">Por página:</span>
                  <Select value={itemsPerPage.toString()} onValueChange={handleItemsPerPageChange}>
                    <SelectTrigger className="w-20 h-8">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {PAGE_SIZE_OPTIONS.map((size) => (
                        <SelectItem key={size} value={size.toString()}>
                          {size}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="flex items-center gap-1">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage(1)}
                  disabled={currentPage === 1}
                  title="Primeira página"
                >
                  <ChevronsLeft className="w-4 h-4" />
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                  title="Página anterior"
                >
                  <ChevronLeft className="w-4 h-4" />
                </Button>
                <div className="flex items-center gap-1">
                  {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                    let page: number;
                    if (totalPages <= 5) {
                      page = i + 1;
                    } else if (currentPage <= 3) {
                      page = i + 1;
                    } else if (currentPage >= totalPages - 2) {
                      page = totalPages - 4 + i;
                    } else {
                      page = currentPage - 2 + i;
                    }
                    return (
                      <Button
                        key={page}
                        variant={currentPage === page ? "default" : "outline"}
                        size="sm"
                        onClick={() => setCurrentPage(page)}
                        className="w-8 h-8 p-0"
                      >
                        {page}
                      </Button>
                    );
                  })}
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                  disabled={currentPage === totalPages}
                  title="Próxima página"
                >
                  <ChevronRight className="w-4 h-4" />
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage(totalPages)}
                  disabled={currentPage === totalPages}
                  title="Última página"
                >
                  <ChevronsRight className="w-4 h-4" />
                </Button>
              </div>
            </div>
          )}
        </>
      )}

      <ServiceEditDialog
        service={editingService}
        importedServiceId={editingImportedServiceId}
        currentInternalServiceId={editingInternalServiceId}
        customization={editingService ? customizationsMap[editingService.service] || null : null}
        open={editDialogOpen}
        onOpenChange={(open) => {
          setEditDialogOpen(open);
          if (!open) {
            setEditingService(null);
            setEditingImportedServiceId(null);
            setEditingInternalServiceId(null);
          }
        }}
      />
    </div>
  );
};

export default AdminServices;