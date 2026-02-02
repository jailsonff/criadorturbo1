import { useState, useMemo } from "react";
import { useMutation, useQueryClient, useQuery } from "@tanstack/react-query";
import {
  Loader2,
  Search,
  Check,
  CheckSquare,
  Square,
  ChevronDown,
  ChevronRight,
  Package,
  AlertCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { getSupabaseClient } from "@/lib/supabaseClient";
import { backendSupabase } from "@/lib/backendClient";
import { useToast } from "@/hooks/use-toast";

interface SmmProvider {
  id: string;
  name: string;
  slug: string;
  api_url: string;
  api_key: string;
  is_active: boolean;
  is_default: boolean;
}

interface ExternalService {
  service: number;
  name: string;
  type: string;
  category: string;
  rate: string;
  min: string;
  max: string;
  refill: boolean;
  cancel: boolean;
  description?: string;
  dripfeed?: boolean;
  average_time?: string;
}

interface ServiceImportDialogProps {
  provider: SmmProvider | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const ServiceImportDialog = ({
  provider,
  open,
  onOpenChange,
}: ServiceImportDialogProps) => {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [selectedServices, setSelectedServices] = useState<Set<number>>(new Set());
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());

  // Fetch services from the provider API
  const {
    data: services,
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: ["provider-services", provider?.id],
    queryFn: async () => {
      if (!provider) return [];

      // Call the provider API via backend function (always runs on Lovable Cloud)
      const { data, error } = await backendSupabase.functions.invoke("smm-proxy", {
        body: {
          action: "services",
          key: provider.api_key,
          apiUrl: provider.api_url,
        },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      return data as ExternalService[];
    },
    enabled: open && !!provider,
  });

  // Fetch already imported services
  const { data: importedServices } = useQuery({
    queryKey: ["imported-services", provider?.id],
    queryFn: async () => {
      if (!provider) return [];
      const supabase = getSupabaseClient();
      const { data, error } = await supabase
        .from("imported_services")
        .select("external_service_id")
        .eq("provider_id", provider.id);
      if (error) throw error;
      return data.map((s) => s.external_service_id);
    },
    enabled: open && !!provider,
  });

  const importedSet = useMemo(
    () => new Set(importedServices || []),
    [importedServices]
  );

  // Group services by category
  const servicesByCategory = useMemo(() => {
    if (!services) return {};

    const filtered = services.filter((service) => {
      const matchesSearch =
        service.name.toLowerCase().includes(search.toLowerCase()) ||
        service.category.toLowerCase().includes(search.toLowerCase()) ||
        service.service.toString().includes(search);
      return matchesSearch;
    });

    const grouped: Record<string, ExternalService[]> = {};
    filtered.forEach((service) => {
      if (!grouped[service.category]) {
        grouped[service.category] = [];
      }
      grouped[service.category].push(service);
    });

    return grouped;
  }, [services, search]);

  const categories = Object.keys(servicesByCategory).sort();

  // Toggle category expansion
  const toggleCategory = (category: string) => {
    const newExpanded = new Set(expandedCategories);
    if (newExpanded.has(category)) {
      newExpanded.delete(category);
    } else {
      newExpanded.add(category);
    }
    setExpandedCategories(newExpanded);
  };

  // Toggle service selection
  const toggleService = (serviceId: number) => {
    const newSelected = new Set(selectedServices);
    if (newSelected.has(serviceId)) {
      newSelected.delete(serviceId);
    } else {
      newSelected.add(serviceId);
    }
    setSelectedServices(newSelected);
  };

  // Toggle all services in a category
  const toggleCategoryServices = (category: string) => {
    const categoryServiceIds = servicesByCategory[category]
      .filter((s) => !importedSet.has(s.service))
      .map((s) => s.service);

    const allSelected = categoryServiceIds.every((id) =>
      selectedServices.has(id)
    );

    const newSelected = new Set(selectedServices);
    if (allSelected) {
      categoryServiceIds.forEach((id) => newSelected.delete(id));
    } else {
      categoryServiceIds.forEach((id) => newSelected.add(id));
    }
    setSelectedServices(newSelected);
  };

  // Select all services
  const selectAll = () => {
    const allServiceIds =
      services
        ?.filter((s) => !importedSet.has(s.service))
        .map((s) => s.service) || [];
    setSelectedServices(new Set(allServiceIds));
  };

  // Deselect all
  const deselectAll = () => {
    setSelectedServices(new Set());
  };

  // Import mutation
  const importMutation = useMutation({
    mutationFn: async () => {
      if (!provider || !services) return;

      const supabase = getSupabaseClient();
      
      // First, get existing services to filter out duplicates
      const { data: existingServices } = await supabase
        .from("imported_services")
        .select("external_service_id")
        .eq("provider_id", provider.id);
      
      const existingSet = new Set(existingServices?.map(s => s.external_service_id) || []);

      const servicesToImport = services.filter((s) =>
        selectedServices.has(s.service) && !existingSet.has(s.service)
      );

      if (servicesToImport.length === 0) {
        return 0;
      }

      const insertData = servicesToImport.map((service) => ({
        provider_id: provider.id,
        external_service_id: service.service,
        name: service.name,
        category: service.category,
        type: service.type,
        rate: service.rate,
        min: service.min,
        max: service.max,
        refill: service.refill || false,
        cancel: service.cancel || false,
        description: service.description || null,
        dripfeed: service.dripfeed || false,
        average_time: service.average_time || null,
        is_active: true,
      }));

      // Use insert instead of upsert (no unique constraint in external DB)
      const { error } = await supabase
        .from("imported_services")
        .insert(insertData);

      if (error) throw error;

      return servicesToImport.length;
    },
    onSuccess: (count) => {
      queryClient.invalidateQueries({ queryKey: ["imported-services"] });
      queryClient.invalidateQueries({ queryKey: ["imported-services-count"] });
      toast({
        title: "Serviços importados!",
        description: `${count} serviços foram importados com sucesso.`,
      });
      setSelectedServices(new Set());
      onOpenChange(false);
    },
    onError: (error) => {
      toast({
        title: "Erro ao importar",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleImport = () => {
    if (selectedServices.size === 0) {
      toast({
        title: "Nenhum serviço selecionado",
        description: "Selecione pelo menos um serviço para importar.",
        variant: "destructive",
      });
      return;
    }
    importMutation.mutate();
  };

  const availableCount =
    services?.filter((s) => !importedSet.has(s.service)).length || 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl max-h-[90vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Package className="w-5 h-5" />
            Importar Serviços - {provider?.name}
          </DialogTitle>
          <DialogDescription>
            Selecione os serviços e categorias que deseja importar.
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <div className="text-center">
              <Loader2 className="w-8 h-8 animate-spin text-primary mx-auto mb-4" />
              <p className="text-muted-foreground">Buscando serviços da API...</p>
            </div>
          </div>
        ) : error ? (
          <div className="flex items-center justify-center py-20">
            <div className="text-center">
              <AlertCircle className="w-12 h-12 text-destructive mx-auto mb-4" />
              <p className="text-lg font-medium mb-2">Erro ao buscar serviços</p>
              <p className="text-muted-foreground mb-4">
                {error instanceof Error ? error.message : "Erro desconhecido"}
              </p>
              <Button onClick={() => refetch()} variant="outline">
                Tentar novamente
              </Button>
            </div>
          </div>
        ) : (
          <>
            {/* Search and Actions */}
            <div className="flex flex-col sm:flex-row gap-4">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder="Buscar serviços..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-10"
                />
              </div>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={selectAll}>
                  <CheckSquare className="w-4 h-4 mr-1" />
                  Selecionar Todos
                </Button>
                <Button variant="outline" size="sm" onClick={deselectAll}>
                  <Square className="w-4 h-4 mr-1" />
                  Limpar
                </Button>
              </div>
            </div>

            {/* Stats */}
            <div className="flex gap-4 text-sm">
              <Badge variant="secondary">
                {services?.length || 0} serviços disponíveis
              </Badge>
              <Badge variant="secondary">
                {importedSet.size} já importados
              </Badge>
              <Badge variant="default" className="bg-primary">
                {selectedServices.size} selecionados
              </Badge>
            </div>

            {/* Services List */}
            <ScrollArea className="h-[400px] border rounded-lg">
              <div className="p-2">
                {categories.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    Nenhum serviço encontrado.
                  </div>
                ) : (
                  categories.map((category) => {
                    const categoryServices = servicesByCategory[category];
                    const availableInCategory = categoryServices.filter(
                      (s) => !importedSet.has(s.service)
                    );
                    const selectedInCategory = categoryServices.filter(
                      (s) => selectedServices.has(s.service)
                    ).length;
                    const isExpanded = expandedCategories.has(category);
                    const allSelected =
                      availableInCategory.length > 0 &&
                      availableInCategory.every((s) =>
                        selectedServices.has(s.service)
                      );

                    return (
                      <div key={category} className="mb-2">
                        {/* Category Header */}
                        <div
                          className="flex items-center gap-2 p-2 bg-muted/50 rounded-lg cursor-pointer hover:bg-muted transition-colors"
                          onClick={() => toggleCategory(category)}
                        >
                          <button className="p-0.5">
                            {isExpanded ? (
                              <ChevronDown className="w-4 h-4" />
                            ) : (
                              <ChevronRight className="w-4 h-4" />
                            )}
                          </button>
                          <Checkbox
                            checked={allSelected}
                            onCheckedChange={() =>
                              toggleCategoryServices(category)
                            }
                            onClick={(e) => e.stopPropagation()}
                            disabled={availableInCategory.length === 0}
                          />
                          <span className="font-medium flex-1">{category}</span>
                          <Badge variant="outline" className="text-xs">
                            {selectedInCategory}/{categoryServices.length}
                          </Badge>
                        </div>

                        {/* Category Services */}
                        {isExpanded && (
                          <div className="ml-6 mt-1 space-y-1">
                            {categoryServices.map((service) => {
                              const isImported = importedSet.has(service.service);
                              const isSelected = selectedServices.has(
                                service.service
                              );

                              return (
                                <div
                                  key={service.service}
                                  className={`flex items-center gap-2 p-2 rounded-lg transition-colors ${
                                    isImported
                                      ? "opacity-50 bg-muted/30"
                                      : isSelected
                                      ? "bg-primary/10 border border-primary/30"
                                      : "hover:bg-muted/30"
                                  }`}
                                >
                                  <Checkbox
                                    checked={isSelected || isImported}
                                    disabled={isImported}
                                    onCheckedChange={() =>
                                      toggleService(service.service)
                                    }
                                  />
                                  <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2">
                                      <span className="text-xs text-muted-foreground">
                                        #{service.service}
                                      </span>
                                      <span className="truncate text-sm">
                                        {service.name}
                                      </span>
                                      {isImported && (
                                        <Badge
                                          variant="secondary"
                                          className="text-xs"
                                        >
                                          <Check className="w-3 h-3 mr-1" />
                                          Importado
                                        </Badge>
                                      )}
                                    </div>
                                    <div className="flex gap-2 mt-1 text-xs text-muted-foreground">
                                      <span>R$ {service.rate}/1k</span>
                                      <span>•</span>
                                      <span>
                                        Min: {parseInt(service.min).toLocaleString()}
                                      </span>
                                      <span>•</span>
                                      <span>
                                        Max: {parseInt(service.max).toLocaleString()}
                                      </span>
                                      {service.refill && (
                                        <>
                                          <span>•</span>
                                          <span className="text-green-500">
                                            Refill ♻️
                                          </span>
                                        </>
                                      )}
                                    </div>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            </ScrollArea>
          </>
        )}

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            onClick={handleImport}
            disabled={
              importMutation.isPending ||
              selectedServices.size === 0 ||
              isLoading
            }
          >
            {importMutation.isPending ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Importando...
              </>
            ) : (
              <>
                <Check className="w-4 h-4 mr-2" />
                Importar {selectedServices.size} Serviços
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default ServiceImportDialog;
