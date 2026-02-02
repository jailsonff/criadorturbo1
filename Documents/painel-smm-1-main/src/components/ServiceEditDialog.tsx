import { useState, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Save, Sparkles, ArrowRightLeft, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { ScrollArea } from "@/components/ui/scroll-area";
import { getSupabaseClient } from "@/lib/supabaseClient";
import { backendSupabase } from "@/lib/backendClient";
import { useToast } from "@/hooks/use-toast";
import { formatCurrency } from "@/lib/utils";
import type { Service } from "@/lib/api";

interface ServiceCustomization {
  id?: string;
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

interface ServiceEditDialogProps {
  service: Service | null;
  customization: ServiceCustomization | null;
  importedServiceId?: string | null;
  currentInternalServiceId?: number | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface ProviderService {
  service: number;
  name: string;
  rate: string;
  min: string;
  max: string;
  category: string;
}

const ServiceEditDialog = ({
  service,
  customization,
  importedServiceId,
  currentInternalServiceId,
  open,
  onOpenChange,
}: ServiceEditDialogProps) => {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [saving, setSaving] = useState(false);
  const [generatingDescription, setGeneratingDescription] = useState(false);
  const [showProviderChange, setShowProviderChange] = useState(false);
  const [selectedProviderId, setSelectedProviderId] = useState<string>("");
  const [providerServices, setProviderServices] = useState<ProviderService[]>([]);
  const [loadingServices, setLoadingServices] = useState(false);
  const [serviceSearch, setServiceSearch] = useState("");
  const [selectedNewService, setSelectedNewService] = useState<ProviderService | null>(null);

  const [formData, setFormData] = useState({
    custom_name: "",
    custom_description: "",
    custom_rate: "",
    custom_average_time: "",
    custom_min: "",
    custom_max: "",
    show_refill_button: true,
    is_active: true,
  });

  // Fetch providers
  const { data: providers = [] } = useQuery({
    queryKey: ["smm-providers"],
    queryFn: async () => {
      const supabaseClient = getSupabaseClient();
      const { data, error } = await supabaseClient
        .from("smm_providers")
        .select("*")
        .eq("is_active", true)
        .order("name");
      
      if (error) throw error;
      return data || [];
    },
  });

  useEffect(() => {
    if (service) {
      setFormData({
        custom_name: customization?.custom_name || "",
        custom_description: customization?.custom_description || "",
        custom_rate: customization?.custom_rate || "",
        custom_average_time: customization?.custom_average_time || "",
        custom_min: (customization as any)?.custom_min || "",
        custom_max: (customization as any)?.custom_max || "",
        show_refill_button: customization?.show_refill_button ?? true,
        is_active: customization?.is_active ?? true,
      });
      // Reset provider change state when service changes
      setShowProviderChange(false);
      setSelectedProviderId("");
      setProviderServices([]);
      setSelectedNewService(null);
      setServiceSearch("");
    }
  }, [service, customization]);

  // Fetch services from selected provider
  const fetchProviderServices = async (providerId: string) => {
    setLoadingServices(true);
    setProviderServices([]);
    setSelectedNewService(null);
    
    try {
      const provider = providers.find(p => p.id === providerId);
      if (!provider) return;

      const { data, error } = await backendSupabase.functions.invoke("smm-proxy", {
        body: {
          action: "services",
          apiUrl: provider.api_url,
          key: provider.api_key,
        },
      });

      if (error) throw error;
      
      if (Array.isArray(data)) {
        setProviderServices(data.map((s: any) => ({
          service: parseInt(s.service),
          name: s.name,
          rate: s.rate,
          min: s.min,
          max: s.max,
          category: s.category,
        })));
      }
    } catch (error) {
      console.error("Error fetching provider services:", error);
      toast({
        title: "Erro ao carregar serviços",
        description: "Não foi possível carregar os serviços do provedor.",
        variant: "destructive",
      });
    } finally {
      setLoadingServices(false);
    }
  };

  const handleProviderChange = (providerId: string) => {
    setSelectedProviderId(providerId);
    setServiceSearch("");
    fetchProviderServices(providerId);
  };

  const handleSelectNewService = (newService: ProviderService) => {
    setSelectedNewService(newService);
  };

  const handleSave = async () => {
    if (!service) return;

    setSaving(true);
    try {
      // If changing to a new service from different provider
      // IMPORTANT: We keep the original external_service_id to maintain order history integrity
      // Only update the provider_id and service metadata (name, rate, etc.)
      if (selectedNewService && selectedProviderId) {
        const supabaseClient = getSupabaseClient();

        if (!importedServiceId) {
          toast({
            title: "Erro ao salvar",
            description: "Não consegui identificar o registro deste serviço para salvar. Recarregue a página e tente novamente.",
            variant: "destructive",
          });
          return;
        }

        // Update only the provider reference - this is an INTERNAL change only
        // The user-facing data (name, category, external_service_id) must remain unchanged
        // Store the new service's ID in internal_provider_service_id for order processing
        
        // First try with internal_provider_service_id column
        let updateError = null;
        
        const { error: fullUpdateError } = await supabaseClient
          .from("imported_services")
          .update({
            provider_id: selectedProviderId,
            internal_provider_service_id: selectedNewService.service,
            rate: selectedNewService.rate,
            min: selectedNewService.min,
            max: selectedNewService.max,
            updated_at: new Date().toISOString(),
          })
          .eq("id", importedServiceId);
        
        // If column doesn't exist (error codes 42703 or PGRST204), try without it
        const columnNotExistsError = fullUpdateError?.code === '42703' || fullUpdateError?.code === 'PGRST204';
        
        if (columnNotExistsError) {
          const { error: fallbackError } = await supabaseClient
            .from("imported_services")
            .update({
              provider_id: selectedProviderId,
              rate: selectedNewService.rate,
              min: selectedNewService.min,
              max: selectedNewService.max,
              updated_at: new Date().toISOString(),
            })
            .eq("id", importedServiceId);
          
          updateError = fallbackError;
          
          if (!fallbackError) {
            toast({
              title: "Provedor alterado",
              description: `O serviço #${service.service} agora usa o provedor selecionado. Nota: Para rastreamento completo do serviço interno, execute a migration no banco externo.`,
            });
          }
        } else {
          updateError = fullUpdateError;
        }

        if (updateError) throw updateError;

        // Only show this toast if we didn't already show the fallback one
        if (!columnNotExistsError) {
          toast({
            title: "Provedor alterado internamente",
            description: `O serviço #${service.service} agora usa internamente o serviço #${selectedNewService.service} do novo provedor. O nome e categoria originais foram preservados.`,
          });
        }

        queryClient.invalidateQueries({ queryKey: ["imported-services-with-providers"] });
        queryClient.invalidateQueries({ queryKey: ["services"] });
        onOpenChange(false);
        return;
      }

      // Regular customization save
      const data: Record<string, any> = {
        service_id: service.service,
        custom_name: formData.custom_name || null,
        custom_description: formData.custom_description || null,
        custom_rate: formData.custom_rate || null,
        custom_average_time: formData.custom_average_time || null,
        custom_min: formData.custom_min || null,
        custom_max: formData.custom_max || null,
        show_refill_button: formData.show_refill_button,
        is_active: formData.is_active,
      };

      const supabaseClient = getSupabaseClient();
      const save = async (payload: Record<string, any>) => {
        if (customization?.id) {
          return await supabaseClient
            .from("service_customizations")
            .update(payload as any)
            .eq("id", customization.id);
        }

        return await supabaseClient.from("service_customizations").insert(payload as any);
      };

      let { error } = await save(data);
      let savedPartially = false;

      // If the external database schema cache doesn't have the new columns yet,
      // retry without them so the rest of the customization can still be saved.
      const msg = String((error as any)?.message || "");
      const missingCustomColumns =
        msg.includes("schema cache") && (msg.includes("custom_min") || msg.includes("custom_max"));

      if (error && missingCustomColumns) {
        const { custom_min, custom_max, ...dataWithoutMinMax } = data;
        const retry = await save(dataWithoutMinMax);
        error = retry.error;
        savedPartially = !error;
      }

      if (error) throw error;

      if (savedPartially) {
        toast({
          title: "Salvo parcialmente",
          description:
            "Min/máx personalizados não foram salvos. Execute o setup do banco em Admin Database para adicionar essas colunas.",
          variant: "destructive",
        });
      } else {
        toast({
          title: "Serviço atualizado",
          description: "As personalizações foram salvas com sucesso.",
        });
      }

      queryClient.invalidateQueries({ queryKey: ["service-customizations"] });
      onOpenChange(false);
    } catch (error: any) {
      console.error("Error saving customization:", error);
      console.error("Error details:", JSON.stringify(error, null, 2));
      toast({
        title: "Erro ao salvar",
        description: error?.message || "Não foi possível salvar as personalizações.",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const handleGenerateDescription = async () => {
    if (!service) return;

    setGeneratingDescription(true);
    try {
      const { data, error } = await backendSupabase.functions.invoke("generate-service-description", {
        body: {
          serviceName: formData.custom_name || service.name,
          category: service.category,
        },
      });

      if (error) throw error;

      if (data?.description) {
        setFormData({ ...formData, custom_description: data.description });
        toast({
          title: "Descrição gerada",
          description: "A descrição foi gerada com sucesso pela IA.",
        });
      }
    } catch (error) {
      console.error("Error generating description:", error);
      toast({
        title: "Erro ao gerar descrição",
        description: "Não foi possível gerar a descrição. Tente novamente.",
        variant: "destructive",
      });
    } finally {
      setGeneratingDescription(false);
    }
  };

  const filteredProviderServices = providerServices.filter(s =>
    s.name.toLowerCase().includes(serviceSearch.toLowerCase()) ||
    s.service.toString().includes(serviceSearch) ||
    s.category.toLowerCase().includes(serviceSearch.toLowerCase())
  );

  if (!service) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>Editar Serviço #{service.service}</DialogTitle>
          <DialogDescription>
            Personalize as informações deste serviço. Deixe em branco para usar os valores originais.
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="flex-1 pr-4">
          <div className="space-y-4 py-4">
            {/* Original Info */}
            <div className="glass rounded-lg p-3 text-sm">
              <p className="text-muted-foreground mb-1">Nome original:</p>
              <p className="font-medium">{service.name}</p>
              <p className="text-muted-foreground mt-2 mb-1">Preço original:</p>
              <p className="font-medium text-primary">{formatCurrency(parseFloat(service.rate))}/1K</p>
              
              {/* Show current internal service if set */}
              {currentInternalServiceId && (
                <div className="mt-3 pt-3 border-t border-border/50">
                  <p className="text-muted-foreground mb-1">Serviço interno atual:</p>
                  <p className="font-medium text-amber-500">#{currentInternalServiceId}</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    O cliente compra o serviço #{service.service}, mas internamente usamos o serviço #{currentInternalServiceId} do provedor.
                  </p>
                </div>
              )}
            </div>

            {/* Provider Change Section */}
            <Collapsible open={showProviderChange} onOpenChange={setShowProviderChange}>
              <CollapsibleTrigger asChild>
                <Button variant="outline" className="w-full justify-between">
                  <span className="flex items-center gap-2">
                    <ArrowRightLeft className="w-4 h-4" />
                    Alterar Provedor/Serviço
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {showProviderChange ? "Fechar" : "Expandir"}
                  </span>
                </Button>
              </CollapsibleTrigger>
              <CollapsibleContent className="mt-3 space-y-3">
                <div className="space-y-2">
                  <Label>Selecionar Provedor</Label>
                  <Select value={selectedProviderId} onValueChange={handleProviderChange}>
                    <SelectTrigger>
                      <SelectValue placeholder="Escolha um provedor..." />
                    </SelectTrigger>
                    <SelectContent>
                      {providers.map((provider) => (
                        <SelectItem key={provider.id} value={provider.id}>
                          {provider.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {selectedProviderId && (
                  <div className="space-y-2">
                    <Label>Buscar Serviço</Label>
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                      <Input
                        placeholder="Buscar por nome, ID ou categoria..."
                        value={serviceSearch}
                        onChange={(e) => setServiceSearch(e.target.value)}
                        className="pl-9"
                      />
                    </div>
                  </div>
                )}

                {loadingServices && (
                  <div className="flex items-center justify-center py-4">
                    <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
                    <span className="ml-2 text-sm text-muted-foreground">Carregando serviços...</span>
                  </div>
                )}

                {!loadingServices && providerServices.length > 0 && (
                  <div className="space-y-2">
                    <Label>Serviços Disponíveis ({filteredProviderServices.length})</Label>
                    <ScrollArea className="h-48 rounded-md border">
                      <div className="p-2 space-y-1">
                        {filteredProviderServices.slice(0, 50).map((s) => (
                          <div
                            key={s.service}
                            onClick={() => handleSelectNewService(s)}
                            className={`p-2 rounded-md cursor-pointer transition-colors text-sm ${
                              selectedNewService?.service === s.service
                                ? "bg-primary text-primary-foreground"
                                : "hover:bg-muted"
                            }`}
                          >
                            <div className="flex items-center justify-between">
                              <span className="font-medium">#{s.service}</span>
                              <span className="text-xs">
                                {formatCurrency(parseFloat(s.rate))}/1K
                              </span>
                            </div>
                            <p className="text-xs mt-1 line-clamp-2 opacity-90">{s.name}</p>
                            <p className="text-xs mt-0.5 opacity-70">{s.category}</p>
                          </div>
                        ))}
                        {filteredProviderServices.length > 50 && (
                          <p className="text-xs text-center text-muted-foreground py-2">
                            Mostrando 50 de {filteredProviderServices.length} resultados. Use a busca para filtrar.
                          </p>
                        )}
                      </div>
                    </ScrollArea>
                  </div>
                )}

                {selectedNewService && (
                  <div className="glass rounded-lg p-3 border-primary/50 border">
                    <p className="text-xs text-primary font-medium mb-1">Novo serviço selecionado:</p>
                    <p className="font-medium text-sm">{selectedNewService.name}</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      ID: #{selectedNewService.service} • {formatCurrency(parseFloat(selectedNewService.rate))}/1K
                    </p>
                  </div>
                )}
              </CollapsibleContent>
            </Collapsible>

            {/* Custom Name */}
            <div className="space-y-2">
              <Label htmlFor="custom_name">Nome personalizado</Label>
              <Input
                id="custom_name"
                placeholder="Deixe vazio para usar o original"
                value={formData.custom_name}
                onChange={(e) =>
                  setFormData({ ...formData, custom_name: e.target.value })
                }
              />
            </div>


            {/* Custom Min/Max */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="custom_min">Quantidade mínima</Label>
                <Input
                  id="custom_min"
                  type="number"
                  min="1"
                  placeholder={service?.min || "Mín. original"}
                  value={formData.custom_min}
                  onChange={(e) =>
                    setFormData({ ...formData, custom_min: e.target.value })
                  }
                />
                <p className="text-xs text-muted-foreground">Original: {service?.min || "N/A"}</p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="custom_max">Quantidade máxima</Label>
                <Input
                  id="custom_max"
                  type="number"
                  min="1"
                  placeholder={service?.max || "Máx. original"}
                  value={formData.custom_max}
                  onChange={(e) =>
                    setFormData({ ...formData, custom_max: e.target.value })
                  }
                />
                <p className="text-xs text-muted-foreground">Original: {service?.max || "N/A"}</p>
              </div>
            </div>

            {/* Custom Description */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="custom_description">Descrição</Label>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleGenerateDescription}
                  disabled={generatingDescription}
                  className="h-7 text-xs"
                >
                  {generatingDescription ? (
                    <>
                      <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                      Gerando...
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-3 h-3 mr-1" />
                      Gerar com IA
                    </>
                  )}
                </Button>
              </div>
              <Textarea
                id="custom_description"
                placeholder="Adicione uma descrição para este serviço ou clique em 'Gerar com IA'..."
                value={formData.custom_description}
                onChange={(e) =>
                  setFormData({ ...formData, custom_description: e.target.value })
                }
                rows={4}
              />
            </div>

            {/* Custom Rate */}
            <div className="space-y-2">
              <Label htmlFor="custom_rate">Preço personalizado (por 1K)</Label>
              <Input
                id="custom_rate"
                type="number"
                step="0.01"
                placeholder="Deixe vazio para usar o original"
                value={formData.custom_rate}
                onChange={(e) =>
                  setFormData({ ...formData, custom_rate: e.target.value })
                }
              />
            </div>

            {/* Custom Average Time */}
            <div className="space-y-2">
              <Label htmlFor="custom_average_time">Tempo médio</Label>
              <Input
                id="custom_average_time"
                placeholder="Ex: 9 minutos, 1 hora, 24 horas..."
                value={formData.custom_average_time}
                onChange={(e) =>
                  setFormData({ ...formData, custom_average_time: e.target.value })
                }
              />
              <p className="text-xs text-muted-foreground">
                Informe o tempo médio de entrega do serviço
              </p>
            </div>

            {/* Toggles */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <Label>Mostrar botão de reposição</Label>
                  <p className="text-sm text-muted-foreground">
                    Exibir opção de refill para este serviço
                  </p>
                </div>
                <Switch
                  checked={formData.show_refill_button}
                  onCheckedChange={(checked) =>
                    setFormData({ ...formData, show_refill_button: checked })
                  }
                />
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <Label>Serviço ativo</Label>
                  <p className="text-sm text-muted-foreground">
                    Desative para ocultar este serviço
                  </p>
                </div>
                <Switch
                  checked={formData.is_active}
                  onCheckedChange={(checked) =>
                    setFormData({ ...formData, is_active: checked })
                  }
                />
              </div>
            </div>
          </div>
        </ScrollArea>

        <DialogFooter className="mt-4">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Salvando...
              </>
            ) : (
              <>
                <Save className="w-4 h-4 mr-2" />
                {selectedNewService ? "Alterar Serviço" : "Salvar"}
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default ServiceEditDialog;
