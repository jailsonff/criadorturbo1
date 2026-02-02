import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Plus,
  Server,
  Loader2,
  Edit2,
  Trash2,
  Power,
  PowerOff,
  Download,
  Star,
  ExternalLink,
  Wallet,
  RefreshCw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { getSupabaseClient } from "@/lib/supabaseClient";
import { backendSupabase } from "@/lib/backendClient";
import { useToast } from "@/hooks/use-toast";
import ServiceImportDialog from "@/components/ServiceImportDialog";

interface SmmProvider {
  id: string;
  name: string;
  slug: string;
  api_url: string;
  api_key: string;
  is_active: boolean;
  is_default: boolean;
  created_at: string;
  updated_at: string;
}

interface ProviderBalance {
  balance: string | number | null;
  currency: string;
  loading: boolean;
  error: boolean;
}

const AdminProviders = () => {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [editingProvider, setEditingProvider] = useState<SmmProvider | null>(null);
  const [deletingProvider, setDeletingProvider] = useState<SmmProvider | null>(null);
  const [importingProvider, setImportingProvider] = useState<SmmProvider | null>(null);
  
  // Form state
  const [name, setName] = useState("");
  const [apiUrl, setApiUrl] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [isDefault, setIsDefault] = useState(false);
  
  // Provider balances state
  const [providerBalances, setProviderBalances] = useState<Record<string, ProviderBalance>>({});
  const [isLoadingBalances, setIsLoadingBalances] = useState(false);

  const { data: providers, isLoading } = useQuery({
    queryKey: ["smm-providers"],
    queryFn: async () => {
      const supabase = getSupabaseClient();
      const { data, error } = await supabase
        .from("smm_providers")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as SmmProvider[];
    },
  });

  const { data: importedServicesCount } = useQuery({
    queryKey: ["imported-services-count"],
    queryFn: async () => {
      const supabase = getSupabaseClient();
      const { data, error } = await supabase
        .from("imported_services")
        .select("provider_id");
      if (error) throw error;
      
      const counts: Record<string, number> = {};
      data.forEach((s) => {
        counts[s.provider_id] = (counts[s.provider_id] || 0) + 1;
      });
      return counts;
    },
  });

  // Fetch balance for a single provider
  const fetchProviderBalance = async (provider: SmmProvider) => {
    setProviderBalances(prev => ({
      ...prev,
      [provider.id]: { balance: null, currency: 'USD', loading: true, error: false }
    }));

    // Always use Lovable Cloud for edge functions (smm-proxy doesn't exist in external DBs)
    try {
      const { data, error } = await backendSupabase.functions.invoke("smm-proxy", {
        body: {
          action: "balance",
          key: provider.api_key,
          apiUrl: provider.api_url,
        },
      });

      if (error) throw error;

      // API returns { balance: "123.45", currency: "USD" } or similar
      const balance = data?.balance ?? data?.Balance ?? null;
      const currency = data?.currency ?? data?.Currency ?? 'USD';

      setProviderBalances(prev => ({
        ...prev,
        [provider.id]: { balance, currency, loading: false, error: false }
      }));
    } catch (err) {
      console.error(`Error fetching balance for ${provider.name}:`, err);
      setProviderBalances(prev => ({
        ...prev,
        [provider.id]: { balance: null, currency: 'USD', loading: false, error: true }
      }));
    }
  };

  // Fetch all balances
  const fetchAllBalances = async () => {
    if (!providers?.length) return;
    setIsLoadingBalances(true);
    
    await Promise.all(providers.map(p => fetchProviderBalance(p)));
    
    setIsLoadingBalances(false);
  };

  // Fetch balances when providers load
  useEffect(() => {
    if (providers?.length) {
      fetchAllBalances();
    }
  }, [providers]);

  const createSlug = (name: string) => {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");
  };

  const saveMutation = useMutation({
    mutationFn: async (data: { 
      id?: string; 
      name: string; 
      api_url: string; 
      api_key: string;
      is_default: boolean;
    }) => {
      const supabase = getSupabaseClient();
      if (data.is_default) {
        // Remove default from other providers
        await supabase
          .from("smm_providers")
          .update({ is_default: false })
          .neq("id", data.id || "");
      }

      if (data.id) {
        const { error } = await supabase
          .from("smm_providers")
          .update({
            name: data.name,
            api_url: data.api_url,
            api_key: data.api_key,
            is_default: data.is_default,
          })
          .eq("id", data.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("smm_providers").insert({
          name: data.name,
          slug: createSlug(data.name),
          api_url: data.api_url,
          api_key: data.api_key,
          is_default: data.is_default,
        });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["smm-providers"] });
      toast({
        title: editingProvider ? "Fornecedor atualizado!" : "Fornecedor adicionado!",
        description: "As alterações foram salvas com sucesso.",
      });
      handleCloseDialog();
    },
    onError: (error) => {
      toast({
        title: "Erro ao salvar",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const supabase = getSupabaseClient();
      const { error } = await supabase.from("smm_providers").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["smm-providers"] });
      queryClient.invalidateQueries({ queryKey: ["imported-services-count"] });
      toast({
        title: "Fornecedor excluído!",
        description: "O fornecedor e seus serviços foram removidos.",
      });
      setDeleteDialogOpen(false);
      setDeletingProvider(null);
    },
    onError: (error) => {
      toast({
        title: "Erro ao excluir",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const toggleActiveMutation = useMutation({
    mutationFn: async ({ id, is_active }: { id: string; is_active: boolean }) => {
      const supabase = getSupabaseClient();
      const { error } = await supabase
        .from("smm_providers")
        .update({ is_active })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["smm-providers"] });
    },
  });

  const handleOpenDialog = (provider?: SmmProvider) => {
    if (provider) {
      setEditingProvider(provider);
      setName(provider.name);
      setApiUrl(provider.api_url);
      setApiKey(provider.api_key);
      setIsDefault(provider.is_default);
    } else {
      setEditingProvider(null);
      setName("");
      setApiUrl("");
      setApiKey("");
      setIsDefault(false);
    }
    setDialogOpen(true);
  };

  const handleCloseDialog = () => {
    setDialogOpen(false);
    setEditingProvider(null);
    setName("");
    setApiUrl("");
    setApiKey("");
    setIsDefault(false);
  };

  const handleSave = () => {
    if (!name.trim() || !apiUrl.trim() || !apiKey.trim()) {
      toast({
        title: "Campos obrigatórios",
        description: "Preencha todos os campos.",
        variant: "destructive",
      });
      return;
    }

    saveMutation.mutate({
      id: editingProvider?.id,
      name: name.trim(),
      api_url: apiUrl.trim(),
      api_key: apiKey.trim(),
      is_default: isDefault,
    });
  };

  const handleImport = (provider: SmmProvider) => {
    setImportingProvider(provider);
    setImportDialogOpen(true);
  };

  return (
    <div className="space-y-6 p-4 sm:p-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold gradient-text flex items-center gap-2">
            <Server className="w-6 h-6 sm:w-8 sm:h-8" />
            Fornecedores de API
          </h1>
          <p className="text-muted-foreground mt-1 text-sm sm:text-base">
            Gerencie múltiplos fornecedores SMM e importe serviços
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button 
            variant="outline" 
            onClick={fetchAllBalances}
            disabled={isLoadingBalances || !providers?.length}
            size="sm"
            className="text-xs sm:text-sm"
          >
            {isLoadingBalances ? (
              <Loader2 className="w-4 h-4 mr-1 sm:mr-2 animate-spin" />
            ) : (
              <RefreshCw className="w-4 h-4 mr-1 sm:mr-2" />
            )}
            <span className="hidden xs:inline">Atualizar </span>Saldos
          </Button>
          <Button onClick={() => handleOpenDialog()} size="sm" className="text-xs sm:text-sm">
            <Plus className="w-4 h-4 mr-1 sm:mr-2" />
            <span className="hidden xs:inline">Novo </span>Fornecedor
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 sm:gap-4">
        <Card className="glass-card border-border/50">
          <CardContent className="pt-3 sm:pt-4 px-3 sm:px-6">
            <p className="text-xs sm:text-sm text-muted-foreground">Total</p>
            <p className="text-xl sm:text-2xl font-bold text-primary">{providers?.length || 0}</p>
          </CardContent>
        </Card>
        <Card className="glass-card border-border/50">
          <CardContent className="pt-3 sm:pt-4 px-3 sm:px-6">
            <p className="text-xs sm:text-sm text-muted-foreground">Ativos</p>
            <p className="text-xl sm:text-2xl font-bold text-green-500">
              {providers?.filter((p) => p.is_active).length || 0}
            </p>
          </CardContent>
        </Card>
        <Card className="glass-card border-border/50">
          <CardContent className="pt-3 sm:pt-4 px-3 sm:px-6">
            <p className="text-xs sm:text-sm text-muted-foreground">Serviços</p>
            <p className="text-xl sm:text-2xl font-bold text-blue-500">
              {Object.values(importedServicesCount || {}).reduce((a, b) => a + b, 0)}
            </p>
          </CardContent>
        </Card>
        <Card className="glass-card border-border/50">
          <CardContent className="pt-3 sm:pt-4 px-3 sm:px-6">
            <p className="text-xs sm:text-sm text-muted-foreground flex items-center gap-1">
              <Wallet className="w-3 h-3 sm:w-4 sm:h-4" />
              Saldo APIs
            </p>
            <p className="text-lg sm:text-2xl font-bold text-emerald-500">
              {isLoadingBalances ? (
                <Loader2 className="w-4 h-4 sm:w-5 sm:h-5 animate-spin inline" />
              ) : (
                `R$ ${Object.values(providerBalances)
                  .reduce((sum, b) => {
                    if (b.error || b.loading || b.balance === null) return sum;
                    const val = typeof b.balance === 'string' ? parseFloat(b.balance) : b.balance;
                    return sum + (val || 0);
                  }, 0)
                  .toFixed(2)}`
              )}
            </p>
          </CardContent>
        </Card>
        <Card className="glass-card border-border/50 col-span-2 sm:col-span-1">
          <CardContent className="pt-3 sm:pt-4 px-3 sm:px-6">
            <p className="text-xs sm:text-sm text-muted-foreground">Padrão</p>
            <p className="text-lg sm:text-2xl font-bold text-amber-500 truncate">
              {providers?.find((p) => p.is_default)?.name || "Nenhum"}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Providers Table */}
      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      ) : providers?.length === 0 ? (
        <Card className="glass-card border-border/50">
          <CardContent className="py-20 text-center">
            <Server className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-lg font-semibold mb-2">Nenhum fornecedor cadastrado</h3>
            <p className="text-muted-foreground mb-4">
              Adicione um fornecedor SMM para começar a importar serviços.
            </p>
            <Button onClick={() => handleOpenDialog()}>
              <Plus className="w-4 h-4 mr-2" />
              Adicionar Fornecedor
            </Button>
          </CardContent>
        </Card>
      ) : (
        <Card className="glass-card border-border/50 overflow-hidden">
          <div className="overflow-x-auto scrollbar-hide">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/50 hover:bg-muted/50">
                  <TableHead className="text-xs sm:text-sm">Fornecedor</TableHead>
                  <TableHead className="text-xs sm:text-sm hidden md:table-cell">URL da API</TableHead>
                  <TableHead className="text-center text-xs sm:text-sm">Saldo</TableHead>
                  <TableHead className="text-center text-xs sm:text-sm hidden sm:table-cell">Serviços</TableHead>
                  <TableHead className="text-center text-xs sm:text-sm">Status</TableHead>
                  <TableHead className="text-center text-xs sm:text-sm">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {providers?.map((provider) => (
                  <TableRow key={provider.id} className="hover:bg-muted/30">
                    <TableCell>
                      <div className="flex items-center gap-1 sm:gap-2 flex-wrap">
                        <span className="font-medium text-xs sm:text-sm">{provider.name}</span>
                        {provider.is_default && (
                          <Badge variant="outline" className="text-amber-500 border-amber-500 text-[10px] sm:text-xs px-1 sm:px-2">
                            <Star className="w-2 h-2 sm:w-3 sm:h-3 mr-0.5 sm:mr-1 fill-amber-500" />
                          </Badge>
                        )}
                      </div>
                      <p className="text-[10px] sm:text-xs text-muted-foreground mt-0.5 truncate max-w-[100px] sm:max-w-none">
                        {provider.slug}
                      </p>
                    </TableCell>
                    <TableCell className="hidden md:table-cell">
                      <div className="flex items-center gap-2">
                        <span className="text-xs sm:text-sm truncate max-w-[150px] lg:max-w-[200px]">
                          {provider.api_url}
                        </span>
                        <a
                          href={provider.api_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-muted-foreground hover:text-primary"
                        >
                          <ExternalLink className="w-3 h-3 sm:w-4 sm:h-4" />
                        </a>
                      </div>
                    </TableCell>
                    <TableCell className="text-center">
                      {(() => {
                        const balanceData = providerBalances[provider.id];
                        if (!balanceData || balanceData.loading) {
                          return (
                            <div className="flex items-center justify-center">
                              <Loader2 className="w-3 h-3 sm:w-4 sm:h-4 animate-spin text-muted-foreground" />
                            </div>
                          );
                        }
                        if (balanceData.error) {
                          return (
                            <Badge variant="outline" className="text-muted-foreground text-[10px] sm:text-xs">
                              N/A
                            </Badge>
                          );
                        }
                        const balance = typeof balanceData.balance === 'string' 
                          ? parseFloat(balanceData.balance) 
                          : balanceData.balance;
                        return (
                          <Badge 
                            variant="outline" 
                            className={`text-[10px] sm:text-xs ${
                              balance && balance > 0 
                                ? 'text-green-500 border-green-500/50 bg-green-500/10' 
                                : 'text-amber-500 border-amber-500/50 bg-amber-500/10'
                            }`}
                          >
                            R$ {balance?.toFixed(2) ?? '0.00'}
                          </Badge>
                        );
                      })()}
                    </TableCell>
                    <TableCell className="text-center hidden sm:table-cell">
                      <Badge variant="secondary" className="text-[10px] sm:text-xs">
                        {importedServicesCount?.[provider.id] || 0}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-center">
                      <Switch
                        checked={provider.is_active}
                        onCheckedChange={(checked) =>
                          toggleActiveMutation.mutate({
                            id: provider.id,
                            is_active: checked,
                          })
                        }
                      />
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center justify-center gap-0.5 sm:gap-1">
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => handleImport(provider)}
                          className="h-7 w-7 sm:h-8 sm:w-8"
                          title="Importar Serviços"
                        >
                          <Download className="w-3 h-3 sm:w-4 sm:h-4" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => handleOpenDialog(provider)}
                          className="h-7 w-7 sm:h-8 sm:w-8"
                        >
                          <Edit2 className="w-3 h-3 sm:w-4 sm:h-4" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="text-destructive hover:text-destructive h-7 w-7 sm:h-8 sm:w-8"
                          onClick={() => {
                            setDeletingProvider(provider);
                            setDeleteDialogOpen(true);
                          }}
                        >
                          <Trash2 className="w-3 h-3 sm:w-4 sm:h-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </Card>
      )}

      {/* Add/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {editingProvider ? "Editar Fornecedor" : "Novo Fornecedor"}
            </DialogTitle>
            <DialogDescription>
              {editingProvider
                ? "Atualize as informações do fornecedor SMM."
                : "Adicione um novo fornecedor SMM para importar serviços."}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="name">Nome do Fornecedor</Label>
              <Input
                id="name"
                placeholder="Ex: UpMidias, SmmPanel, etc."
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="apiUrl">URL da API</Label>
              <Input
                id="apiUrl"
                placeholder="https://exemplo.com/api/v2"
                value={apiUrl}
                onChange={(e) => setApiUrl(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="apiKey">API Key</Label>
              <Input
                id="apiKey"
                type="password"
                placeholder="Sua chave de API"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
              />
            </div>

            <div className="flex items-center gap-2">
              <Switch
                id="isDefault"
                checked={isDefault}
                onCheckedChange={setIsDefault}
              />
              <Label htmlFor="isDefault" className="cursor-pointer">
                Definir como fornecedor padrão
              </Label>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={handleCloseDialog}>
              Cancelar
            </Button>
            <Button onClick={handleSave} disabled={saveMutation.isPending}>
              {saveMutation.isPending && (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              )}
              {editingProvider ? "Salvar" : "Adicionar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir Fornecedor</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir <strong>{deletingProvider?.name}</strong>?
              <br />
              Todos os serviços importados deste fornecedor também serão excluídos.
              Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deletingProvider && deleteMutation.mutate(deletingProvider.id)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteMutation.isPending && (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              )}
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Import Dialog */}
      <ServiceImportDialog
        provider={importingProvider}
        open={importDialogOpen}
        onOpenChange={setImportDialogOpen}
      />
    </div>
  );
};

export default AdminProviders;
