import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  clearExternalConfig,
  getCurrentDatabaseInfo,
  getExternalConfig,
  getSupabaseClient,
  hasExternalDatabase,
} from "@/lib/supabaseClient";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { backendSupabase } from "@/lib/backendClient";
import { Edit, Image as ImageIcon, Loader2, Plus, Trash2, Upload, X } from "lucide-react";

type DestinationType = "package" | "url";

interface StoreFrontend {
  id: string;
  name: string;
  slug: string;
}

interface StorePackageOption {
  id: string;
  name: string;
  package_type: string;
}

interface StoreBannerRow {
  id: string;
  frontend_id: string;
  title: string | null;
  image_url: string;
  target_url: string | null;
  package_id: string | null;
  display_order: number;
  is_active: boolean;
  created_at: string;
}

interface StoreMenuBannerRow {
  id: string;
  frontend_id: string;
  title: string | null;
  image_url: string;
  target_url: string | null;
  package_id: string | null;
  display_order: number;
  is_active: boolean;
  created_at: string;
}

export default function AdminStoreBanners() {
  const { toast } = useToast();
  const supabase = getSupabaseClient();
  const queryClient = useQueryClient();

  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingBanner, setEditingBanner] = useState<StoreBannerRow | null>(null);
  const [selectedFrontend, setSelectedFrontend] = useState<string>("all");
  const [uploadingImage, setUploadingImage] = useState(false);
  const [imageInputMode, setImageInputMode] = useState<"url" | "upload">("url");

  const [isMenuDialogOpen, setIsMenuDialogOpen] = useState(false);
  const [editingMenuBanner, setEditingMenuBanner] = useState<StoreMenuBannerRow | null>(null);
  const [selectedMenuFrontend, setSelectedMenuFrontend] = useState<string>("all");
  const [uploadingMenuImage, setUploadingMenuImage] = useState(false);
  const [menuImageInputMode, setMenuImageInputMode] = useState<"url" | "upload">("url");

  const [formData, setFormData] = useState({
    frontend_id: "",
    title: "",
    image_url: "",
    destination_type: "package" as DestinationType,
    target_url: "",
    package_id: "",
    display_order: 0,
    is_active: true,
  });

  const [menuFormData, setMenuFormData] = useState({
    frontend_id: "",
    title: "",
    image_url: "",
    destination_type: "package" as DestinationType,
    target_url: "",
    package_id: "",
    display_order: 0,
    is_active: true,
  });

  const { data: frontends = [] } = useQuery({
    queryKey: ["admin-store-frontends"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("store_frontends")
        .select("id, name, slug")
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data || []) as StoreFrontend[];
    },
  });

  const { data: banners = [], isLoading } = useQuery({
    queryKey: ["admin-store-banners", selectedFrontend],
    queryFn: async () => {
      // NOTE: cast to any so this page keeps compiling even before the generated DB types update
      let q = (supabase as any).from("store_banners").select("*");
      if (selectedFrontend !== "all") q = q.eq("frontend_id", selectedFrontend);
      const { data, error } = await q.order("display_order", { ascending: true });
      if (error) throw error;
      return (data || []) as StoreBannerRow[];
    },
  });

  const { data: menuBanners = [], isLoading: isLoadingMenu } = useQuery({
    queryKey: ["admin-store-menu-banners", selectedMenuFrontend],
    queryFn: async () => {
      let q = (supabase as any).from("store_menu_banners").select("*");
      if (selectedMenuFrontend !== "all") q = q.eq("frontend_id", selectedMenuFrontend);
      const { data, error } = await q.order("display_order", { ascending: true });
      if (error) throw error;
      return (data || []) as StoreMenuBannerRow[];
    },
  });

  const frontendForForm = formData.frontend_id || frontends[0]?.id || "";
  const frontendForMenuForm = menuFormData.frontend_id || frontends[0]?.id || "";

  const { data: packages = [] } = useQuery({
    queryKey: ["admin-store-packages-options", frontendForForm],
    queryFn: async () => {
      if (!frontendForForm) return [];
      const { data, error } = await supabase
        .from("store_packages")
        .select("id, name, package_type")
        .eq("frontend_id", frontendForForm)
        .order("display_order", { ascending: true });
      if (error) throw error;
      return (data || []) as StorePackageOption[];
    },
    enabled: !!frontendForForm,
  });

  const { data: menuPackages = [] } = useQuery({
    queryKey: ["admin-store-packages-options-menu", frontendForMenuForm],
    queryFn: async () => {
      if (!frontendForMenuForm) return [];
      const { data, error } = await supabase
        .from("store_packages")
        .select("id, name, package_type")
        .eq("frontend_id", frontendForMenuForm)
        .order("display_order", { ascending: true });
      if (error) throw error;
      return (data || []) as StorePackageOption[];
    },
    enabled: !!frontendForMenuForm,
  });

  const packagesSorted = useMemo(() => {
    const list = [...packages];
    list.sort((a, b) => {
      const ac = String(a.package_type || "").toLowerCase().includes("combo") ? 0 : 1;
      const bc = String(b.package_type || "").toLowerCase().includes("combo") ? 0 : 1;
      if (ac !== bc) return ac - bc;
      return String(a.name).localeCompare(String(b.name));
    });
    return list;
  }, [packages]);

  const menuPackagesSorted = useMemo(() => {
    const list = [...menuPackages];
    list.sort((a, b) => {
      const ac = String(a.package_type || "").toLowerCase().includes("combo") ? 0 : 1;
      const bc = String(b.package_type || "").toLowerCase().includes("combo") ? 0 : 1;
      if (ac !== bc) return ac - bc;
      return String(a.name).localeCompare(String(b.name));
    });
    return list;
  }, [menuPackages]);

  const resetForm = () => {
    setFormData({
      frontend_id: frontends[0]?.id || "",
      title: "",
      image_url: "",
      destination_type: "package",
      target_url: "",
      package_id: "",
      display_order: 0,
      is_active: true,
    });
    setImageInputMode("url");
  };

  const resetMenuForm = () => {
    setMenuFormData({
      frontend_id: frontends[0]?.id || "",
      title: "",
      image_url: "",
      destination_type: "package",
      target_url: "",
      package_id: "",
      display_order: 0,
      is_active: true,
    });
    setMenuImageInputMode("url");
  };

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        frontend_id: formData.frontend_id,
        title: formData.title.trim() ? formData.title.trim() : null,
        image_url: formData.image_url.trim(),
        display_order: Number(formData.display_order) || 0,
        is_active: Boolean(formData.is_active),
        package_id: formData.destination_type === "package" && formData.package_id ? formData.package_id : null,
        target_url: formData.destination_type === "url" && formData.target_url.trim() ? formData.target_url.trim() : null,
      };

      if (!payload.frontend_id) throw new Error("Selecione um frontend");
      if (!payload.image_url) throw new Error("Informe a imagem do banner");
      if (formData.destination_type === "package" && !payload.package_id) {
        throw new Error("Selecione um pacote/COMBO para conectar");
      }
      if (formData.destination_type === "url" && !payload.target_url) {
        throw new Error("Informe o link do banner");
      }

      if (editingBanner) {
        const { error } = await (supabase as any)
          .from("store_banners")
          .update(payload)
          .eq("id", editingBanner.id);
        if (error) throw error;
      } else {
        const { error } = await (supabase as any).from("store_banners").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-store-banners"] });
      setIsDialogOpen(false);
      setEditingBanner(null);
      resetForm();
      toast({
        title: "Sucesso",
        description: editingBanner ? "Banner atualizado!" : "Banner criado!",
      });
    },
    onError: (error: any) => {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
    },
  });

  const saveMenuMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        frontend_id: menuFormData.frontend_id,
        title: menuFormData.title.trim() ? menuFormData.title.trim() : null,
        image_url: menuFormData.image_url.trim(),
        display_order: Number(menuFormData.display_order) || 0,
        is_active: Boolean(menuFormData.is_active),
        package_id:
          menuFormData.destination_type === "package" && menuFormData.package_id
            ? menuFormData.package_id
            : null,
        target_url:
          menuFormData.destination_type === "url" && menuFormData.target_url.trim()
            ? menuFormData.target_url.trim()
            : null,
      };

      if (!payload.frontend_id) throw new Error("Selecione um frontend");
      if (!payload.image_url) throw new Error("Informe a imagem do banner");
      if (menuFormData.destination_type === "package" && !payload.package_id) {
        throw new Error("Selecione um pacote/COMBO para conectar");
      }
      if (menuFormData.destination_type === "url" && !payload.target_url) {
        throw new Error("Informe o link do banner");
      }

      if (editingMenuBanner) {
        const { error } = await (supabase as any)
          .from("store_menu_banners")
          .update(payload)
          .eq("id", editingMenuBanner.id);
        if (error) throw error;
      } else {
        const { error } = await (supabase as any).from("store_menu_banners").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-store-menu-banners"] });
      setIsMenuDialogOpen(false);
      setEditingMenuBanner(null);
      resetMenuForm();
      toast({
        title: "Sucesso",
        description: editingMenuBanner ? "Banner do menu atualizado!" : "Banner do menu criado!",
      });
    },
    onError: (error: any) => {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any).from("store_banners").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-store-banners"] });
      toast({ title: "Banner excluído!" });
    },
    onError: (error: any) => {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
    },
  });

  const deleteMenuMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any).from("store_menu_banners").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-store-menu-banners"] });
      toast({ title: "Banner do menu excluído!" });
    },
    onError: (error: any) => {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
    },
  });

  const handleEdit = (b: StoreBannerRow) => {
    setEditingBanner(b);
    const destination: DestinationType = b.package_id ? "package" : "url";
    setFormData({
      frontend_id: b.frontend_id,
      title: b.title || "",
      image_url: b.image_url || "",
      destination_type: destination,
      target_url: b.target_url || "",
      package_id: b.package_id || "",
      display_order: b.display_order || 0,
      is_active: Boolean(b.is_active),
    });
    setIsDialogOpen(true);
  };

  const handleEditMenu = (b: StoreMenuBannerRow) => {
    setEditingMenuBanner(b);
    const destination: DestinationType = b.package_id ? "package" : "url";
    setMenuFormData({
      frontend_id: b.frontend_id,
      title: b.title || "",
      image_url: b.image_url || "",
      destination_type: destination,
      target_url: b.target_url || "",
      package_id: b.package_id || "",
      display_order: b.display_order || 0,
      is_active: Boolean(b.is_active),
    });
    setIsMenuDialogOpen(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    saveMutation.mutate();
  };

  const handleSubmitMenu = (e: React.FormEvent) => {
    e.preventDefault();
    saveMenuMutation.mutate();
  };

  const dbInfo = getCurrentDatabaseInfo();

  return (
    <div className="space-y-6 w-full min-w-0 p-4 md:p-6">
        {hasExternalDatabase() && (
          <Card>
            <CardHeader>
              <CardTitle>Banco de dados externo ativo</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-sm text-muted-foreground">
                Você está usando um banco <b>externo</b>. Para criar banners aqui, clique em <b>Usar banco padrão</b>.
              </p>
              <div className="flex flex-col sm:flex-row gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    clearExternalConfig();
                    window.location.reload();
                  }}
                >
                  Usar banco padrão
                </Button>
                <div className="text-xs text-muted-foreground sm:self-center">Atual: {dbInfo.type}</div>
              </div>
            </CardContent>
          </Card>
        )}

        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h1 className="text-2xl font-bold">Loja: Banners</h1>
            <p className="text-muted-foreground">Crie banners (2 colunas no desktop, 1 no mobile) acima dos pacotes</p>
          </div>

          <Dialog
            open={isDialogOpen}
            onOpenChange={(open) => {
              setIsDialogOpen(open);
              if (!open) {
                setEditingBanner(null);
                resetForm();
              }
            }}
          >
            <DialogTrigger asChild>
              <Button className="gap-2">
                <Plus className="w-4 h-4" />
                Novo Banner
              </Button>
            </DialogTrigger>

            <DialogContent className="max-w-3xl">
              <DialogHeader>
                <DialogTitle>{editingBanner ? "Editar Banner" : "Novo Banner"}</DialogTitle>
              </DialogHeader>

              <form onSubmit={handleSubmit} className="space-y-5">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Frontend</Label>
                    <Select
                      value={formData.frontend_id}
                      onValueChange={(v) => setFormData({ ...formData, frontend_id: v, package_id: "" })}
                      disabled={!!editingBanner}
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Selecione..." />
                      </SelectTrigger>
                      <SelectContent>
                        {frontends.map((f) => (
                          <SelectItem key={f.id} value={f.id}>
                            {f.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label>Ordem</Label>
                    <Input
                      type="number"
                      className="w-full"
                      value={formData.display_order}
                      onChange={(e) => setFormData({ ...formData, display_order: Number(e.target.value) || 0 })}
                      min={0}
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Título (opcional)</Label>
                  <Input
                    className="w-full"
                    value={formData.title}
                    onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                    placeholder="Ex: Promoção de Curtidas"
                  />
                </div>

                <div className="space-y-2">
                  <Label>Imagem do Banner</Label>

                  <Tabs value={imageInputMode} onValueChange={(v: any) => setImageInputMode(v)}>
                    <TabsList className="grid w-full grid-cols-2">
                      <TabsTrigger value="url" className="gap-1.5 text-xs">
                        <ImageIcon className="w-3.5 h-3.5" />
                        URL
                      </TabsTrigger>
                      <TabsTrigger value="upload" className="gap-1.5 text-xs">
                        <Upload className="w-3.5 h-3.5" />
                        Upload
                      </TabsTrigger>
                    </TabsList>

                    <TabsContent value="url" className="mt-2">
                      <Input
                        className="w-full"
                        value={formData.image_url}
                        onChange={(e) => setFormData({ ...formData, image_url: e.target.value })}
                        placeholder="https://..."
                      />
                    </TabsContent>

                    <TabsContent value="upload" className="mt-2">
                      <div className="space-y-2">
                        <div className="flex items-center gap-2">
                          <Input
                            className="w-full"
                            type="file"
                            accept="image/*"
                            disabled={uploadingImage}
                            onChange={async (e) => {
                              const file = e.target.files?.[0];
                              if (!file) return;
                              if (file.size > 5 * 1024 * 1024) {
                                toast({ title: "Arquivo muito grande", description: "O tamanho máximo é 5MB", variant: "destructive" });
                                return;
                              }

                              setUploadingImage(true);
                              try {
                                const fileExt = file.name.split(".").pop();
                                const fileName = `banner-${Date.now()}.${fileExt}`;
                                const filePath = `banners/${fileName}`;

                                const dataUrl = await new Promise<string>((resolve, reject) => {
                                  const reader = new FileReader();
                                  reader.onload = () => resolve(String(reader.result || ""));
                                  reader.onerror = () => reject(new Error("Falha ao ler o arquivo"));
                                  reader.readAsDataURL(file);
                                });

                                const base64 = dataUrl.split(",")[1] || "";
                                if (!base64) throw new Error("Falha ao processar a imagem");

                                const external = hasExternalDatabase() ? getExternalConfig() : null;
                                const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
                                if (sessionError) throw sessionError;
                                const accessToken = sessionData.session?.access_token;
                                if (!accessToken) throw new Error("Sua sessão expirou. Faça login novamente.");

                                const { data, error } = await backendSupabase.functions.invoke("storage-upload", {
                                  headers: { Authorization: `Bearer ${accessToken}` },
                                  body: {
                                    bucket: "site-assets",
                                    path: filePath,
                                    base64,
                                    contentType: file.type,
                                    externalUrl: external?.url,
                                    externalAnonKey: external?.anonKey,
                                    serviceRoleKey: external?.serviceRoleKey,
                                  },
                                });

                                if (error) throw error;
                                if (!data?.success) throw new Error(data?.error || "Falha no upload");

                                setFormData({ ...formData, image_url: data.publicUrl });
                                toast({ title: "Imagem enviada!" });
                              } catch (error: any) {
                                toast({ title: "Erro no upload", description: error.message, variant: "destructive" });
                              } finally {
                                setUploadingImage(false);
                              }
                            }}
                          />
                          {uploadingImage && <Loader2 className="w-4 h-4 animate-spin" />}
                        </div>
                        <p className="text-xs text-muted-foreground">Formatos: JPG, PNG, WEBP • Tamanho máximo: 5MB</p>
                      </div>
                    </TabsContent>
                  </Tabs>

                  {formData.image_url && (
                    <div className="mt-3 relative inline-block">
                      <img
                        src={formData.image_url}
                        alt="Preview"
                        className="w-48 h-24 object-cover rounded-lg border border-border"
                        onError={(e) => {
                          (e.target as HTMLImageElement).style.display = "none";
                        }}
                      />
                      <Button
                        type="button"
                        variant="destructive"
                        size="icon"
                        className="absolute -top-2 -right-2 w-6 h-6"
                        onClick={() => setFormData({ ...formData, image_url: "" })}
                      >
                        <X className="w-3 h-3" />
                      </Button>
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Ao clicar no banner</Label>
                    <Select
                      value={formData.destination_type}
                      onValueChange={(v: DestinationType) =>
                        setFormData({
                          ...formData,
                          destination_type: v,
                          target_url: v === "url" ? formData.target_url : "",
                          package_id: v === "package" ? formData.package_id : "",
                        })
                      }
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Selecione..." />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="package">Abrir pacote/COMBO</SelectItem>
                        <SelectItem value="url">Abrir um link</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label>Ativo</Label>
                    <div className="h-10 flex items-center justify-between rounded-md border border-border px-3">
                      <span className="text-sm text-muted-foreground">Exibir na loja</span>
                      <Switch checked={formData.is_active} onCheckedChange={(c) => setFormData({ ...formData, is_active: c })} />
                    </div>
                  </div>
                </div>

                {formData.destination_type === "package" ? (
                  <div className="space-y-2">
                    <Label>Pacote / COMBO</Label>
                    <Select value={formData.package_id} onValueChange={(v) => setFormData({ ...formData, package_id: v })}>
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Selecione um pacote" />
                      </SelectTrigger>
                      <SelectContent>
                        {packagesSorted.map((p) => {
                          const isCombo = String(p.package_type || "").toLowerCase().includes("combo");
                          return (
                            <SelectItem key={p.id} value={p.id}>
                              {isCombo ? "[COMBO] " : ""}
                              {p.name}
                            </SelectItem>
                          );
                        })}
                      </SelectContent>
                    </Select>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <Label>Link do Banner</Label>
                    <Input
                      className="w-full"
                      value={formData.target_url}
                      onChange={(e) => setFormData({ ...formData, target_url: e.target.value })}
                      placeholder="https://..."
                    />
                  </div>
                )}

                <div className="flex justify-end gap-2">
                  <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)}>
                    Cancelar
                  </Button>
                  <Button type="submit" disabled={saveMutation.isPending || hasExternalDatabase()}>
                    {hasExternalDatabase() ? "Troque para o banco padrão" : saveMutation.isPending ? "Salvando..." : "Salvar"}
                  </Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ImageIcon className="w-5 h-5" />
              Banners cadastrados
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="mb-4">
              <Select value={selectedFrontend} onValueChange={setSelectedFrontend}>
                <SelectTrigger className="max-w-xs">
                  <SelectValue placeholder="Todos os frontends" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos os frontends</SelectItem>
                  {frontends.map((f) => (
                    <SelectItem key={f.id} value={f.id}>
                      {f.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {isLoading ? (
              <div className="flex justify-center py-10">
                <Loader2 className="w-8 h-8 animate-spin text-primary" />
              </div>
            ) : banners.length === 0 ? (
              <div className="text-center py-10 text-muted-foreground">Nenhum banner cadastrado.</div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Preview</TableHead>
                      <TableHead>Título</TableHead>
                      <TableHead>Destino</TableHead>
                      <TableHead className="w-20">Ordem</TableHead>
                      <TableHead className="w-20">Ativo</TableHead>
                      <TableHead className="text-right w-28">Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {banners.map((b) => {
                      const dest = b.package_id ? "Pacote/COMBO" : "Link";
                      return (
                        <TableRow key={b.id}>
                          <TableCell>
                            <img
                              src={b.image_url}
                              alt={b.title || "Banner"}
                              className="w-28 h-14 object-cover rounded-md border border-border"
                              loading="lazy"
                            />
                          </TableCell>
                          <TableCell className="max-w-[280px] truncate">{b.title || "—"}</TableCell>
                          <TableCell className="text-sm text-muted-foreground">{dest}</TableCell>
                          <TableCell>{b.display_order}</TableCell>
                          <TableCell>{b.is_active ? "Sim" : "Não"}</TableCell>
                          <TableCell className="text-right">
                            <div className="flex justify-end gap-2">
                              <Button size="icon" variant="outline" onClick={() => handleEdit(b)} title="Editar">
                                <Edit className="w-4 h-4" />
                              </Button>
                              <AlertDialog>
                                <AlertDialogTrigger asChild>
                                  <Button size="icon" variant="destructive" title="Excluir">
                                    <Trash2 className="w-4 h-4" />
                                  </Button>
                                </AlertDialogTrigger>
                                <AlertDialogContent>
                                  <AlertDialogHeader>
                                    <AlertDialogTitle>Excluir banner?</AlertDialogTitle>
                                    <AlertDialogDescription>
                                      Esta ação não pode ser desfeita. O banner será removido da loja.
                                    </AlertDialogDescription>
                                  </AlertDialogHeader>
                                  <AlertDialogFooter>
                                    <AlertDialogCancel type="button">Cancelar</AlertDialogCancel>
                                    <AlertDialogAction
                                      type="button"
                                      className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                      onClick={() => deleteMutation.mutate(b.id)}
                                    >
                                      {deleteMutation.isPending ? (
                                        <>
                                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                          Excluindo...
                                        </>
                                      ) : (
                                        "Excluir"
                                      )}
                                    </AlertDialogAction>
                                  </AlertDialogFooter>
                                </AlertDialogContent>
                              </AlertDialog>
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Menu footer banners */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h2 className="text-xl font-bold">Banners do menu (rodapé)</h2>
            <p className="text-muted-foreground">Esses banners aparecem empilhados no menu lateral do mobile</p>
          </div>

          <Dialog
            open={isMenuDialogOpen}
            onOpenChange={(open) => {
              setIsMenuDialogOpen(open);
              if (!open) {
                setEditingMenuBanner(null);
                resetMenuForm();
              }
            }}
          >
            <DialogTrigger asChild>
              <Button className="gap-2" variant="secondary">
                <Plus className="w-4 h-4" />
                Novo Banner (Menu)
              </Button>
            </DialogTrigger>

            <DialogContent className="max-w-3xl">
              <DialogHeader>
                <DialogTitle>{editingMenuBanner ? "Editar Banner (Menu)" : "Novo Banner (Menu)"}</DialogTitle>
              </DialogHeader>

              <form onSubmit={handleSubmitMenu} className="space-y-5">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Frontend</Label>
                    <Select
                      value={menuFormData.frontend_id}
                      onValueChange={(v) => setMenuFormData({ ...menuFormData, frontend_id: v, package_id: "" })}
                      disabled={!!editingMenuBanner}
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Selecione..." />
                      </SelectTrigger>
                      <SelectContent>
                        {frontends.map((f) => (
                          <SelectItem key={f.id} value={f.id}>
                            {f.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label>Ordem</Label>
                    <Input
                      type="number"
                      className="w-full"
                      value={menuFormData.display_order}
                      onChange={(e) => setMenuFormData({ ...menuFormData, display_order: Number(e.target.value) || 0 })}
                      min={0}
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Título (opcional)</Label>
                  <Input
                    className="w-full"
                    value={menuFormData.title}
                    onChange={(e) => setMenuFormData({ ...menuFormData, title: e.target.value })}
                      placeholder="Ex: Promoção"
                  />
                </div>

                <div className="space-y-2">
                  <Label>Imagem do Banner</Label>

                  <Tabs value={menuImageInputMode} onValueChange={(v: any) => setMenuImageInputMode(v)}>
                    <TabsList className="grid w-full grid-cols-2">
                      <TabsTrigger value="url" className="gap-1.5 text-xs">
                        <ImageIcon className="w-3.5 h-3.5" />
                        URL
                      </TabsTrigger>
                      <TabsTrigger value="upload" className="gap-1.5 text-xs">
                        <Upload className="w-3.5 h-3.5" />
                        Upload
                      </TabsTrigger>
                    </TabsList>

                    <TabsContent value="url" className="mt-2">
                      <Input
                        className="w-full"
                        value={menuFormData.image_url}
                        onChange={(e) => setMenuFormData({ ...menuFormData, image_url: e.target.value })}
                        placeholder="https://..."
                      />
                    </TabsContent>

                    <TabsContent value="upload" className="mt-2">
                      <div className="space-y-2">
                        <div className="flex items-center gap-2">
                          <Input
                            className="w-full"
                            type="file"
                            accept="image/*"
                            disabled={uploadingMenuImage}
                            onChange={async (e) => {
                              const file = e.target.files?.[0];
                              if (!file) return;
                              if (file.size > 5 * 1024 * 1024) {
                                toast({ title: "Arquivo muito grande", description: "O tamanho máximo é 5MB", variant: "destructive" });
                                return;
                              }

                              setUploadingMenuImage(true);
                              try {
                                const fileExt = file.name.split(".").pop();
                                const fileName = `menu-banner-${Date.now()}.${fileExt}`;
                                const filePath = `banners/${fileName}`;

                                const dataUrl = await new Promise<string>((resolve, reject) => {
                                  const reader = new FileReader();
                                  reader.onload = () => resolve(String(reader.result || ""));
                                  reader.onerror = () => reject(new Error("Falha ao ler o arquivo"));
                                  reader.readAsDataURL(file);
                                });

                                const base64 = dataUrl.split(",")[1] || "";
                                if (!base64) throw new Error("Falha ao processar a imagem");

                                const external = hasExternalDatabase() ? getExternalConfig() : null;
                                const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
                                if (sessionError) throw sessionError;
                                const accessToken = sessionData.session?.access_token;
                                if (!accessToken) throw new Error("Sua sessão expirou. Faça login novamente.");

                                const { data, error } = await backendSupabase.functions.invoke("storage-upload", {
                                  headers: { Authorization: `Bearer ${accessToken}` },
                                  body: {
                                    bucket: "site-assets",
                                    path: filePath,
                                    base64,
                                    contentType: file.type,
                                    externalUrl: external?.url,
                                    externalAnonKey: external?.anonKey,
                                    serviceRoleKey: external?.serviceRoleKey,
                                  },
                                });

                                if (error) throw error;
                                if (!data?.success) throw new Error(data?.error || "Falha no upload");

                                setMenuFormData({ ...menuFormData, image_url: data.publicUrl });
                                toast({ title: "Imagem enviada!" });
                              } catch (error: any) {
                                toast({ title: "Erro no upload", description: error.message, variant: "destructive" });
                              } finally {
                                setUploadingMenuImage(false);
                              }
                            }}
                          />
                          {uploadingMenuImage && <Loader2 className="w-4 h-4 animate-spin" />}
                        </div>
                        <p className="text-xs text-muted-foreground">Formatos: JPG, PNG, WEBP • Tamanho máximo: 5MB</p>
                      </div>
                    </TabsContent>
                  </Tabs>

                  {menuFormData.image_url && (
                    <div className="mt-3 relative inline-block">
                      <img
                        src={menuFormData.image_url}
                        alt="Preview"
                        className="w-48 h-24 object-cover rounded-lg border border-border"
                        onError={(e) => {
                          (e.target as HTMLImageElement).style.display = "none";
                        }}
                      />
                      <Button
                        type="button"
                        variant="destructive"
                        size="icon"
                        className="absolute -top-2 -right-2 w-6 h-6"
                        onClick={() => setMenuFormData({ ...menuFormData, image_url: "" })}
                      >
                        <X className="w-3 h-3" />
                      </Button>
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Ao clicar no banner</Label>
                    <Select
                      value={menuFormData.destination_type}
                      onValueChange={(v: DestinationType) =>
                        setMenuFormData({
                          ...menuFormData,
                          destination_type: v,
                          target_url: v === "url" ? menuFormData.target_url : "",
                          package_id: v === "package" ? menuFormData.package_id : "",
                        })
                      }
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Selecione..." />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="package">Abrir pacote/COMBO</SelectItem>
                        <SelectItem value="url">Abrir um link</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label>Ativo</Label>
                    <div className="h-10 flex items-center justify-between rounded-md border border-border px-3">
                      <span className="text-sm text-muted-foreground">Exibir no menu</span>
                      <Switch
                        checked={menuFormData.is_active}
                        onCheckedChange={(c) => setMenuFormData({ ...menuFormData, is_active: c })}
                      />
                    </div>
                  </div>
                </div>

                {menuFormData.destination_type === "package" ? (
                  <div className="space-y-2">
                    <Label>Pacote / COMBO</Label>
                    <Select value={menuFormData.package_id} onValueChange={(v) => setMenuFormData({ ...menuFormData, package_id: v })}>
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Selecione um pacote" />
                      </SelectTrigger>
                      <SelectContent>
                        {menuPackagesSorted.map((p) => {
                          const isCombo = String(p.package_type || "").toLowerCase().includes("combo");
                          return (
                            <SelectItem key={p.id} value={p.id}>
                              {isCombo ? "[COMBO] " : ""}
                              {p.name}
                            </SelectItem>
                          );
                        })}
                      </SelectContent>
                    </Select>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <Label>Link do Banner</Label>
                    <Input
                      className="w-full"
                      value={menuFormData.target_url}
                      onChange={(e) => setMenuFormData({ ...menuFormData, target_url: e.target.value })}
                      placeholder="https://..."
                    />
                  </div>
                )}

                <div className="flex justify-end gap-2">
                  <Button type="button" variant="outline" onClick={() => setIsMenuDialogOpen(false)}>
                    Cancelar
                  </Button>
                  <Button type="submit" disabled={saveMenuMutation.isPending || hasExternalDatabase()}>
                    {hasExternalDatabase()
                      ? "Troque para o banco padrão"
                      : saveMenuMutation.isPending
                        ? "Salvando..."
                        : "Salvar"}
                  </Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ImageIcon className="w-5 h-5" />
              Banners do menu cadastrados
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="mb-4">
              <Select value={selectedMenuFrontend} onValueChange={setSelectedMenuFrontend}>
                <SelectTrigger className="max-w-xs">
                  <SelectValue placeholder="Todos os frontends" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos os frontends</SelectItem>
                  {frontends.map((f) => (
                    <SelectItem key={f.id} value={f.id}>
                      {f.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {isLoadingMenu ? (
              <div className="flex justify-center py-10">
                <Loader2 className="w-8 h-8 animate-spin text-primary" />
              </div>
            ) : menuBanners.length === 0 ? (
              <div className="text-center py-10 text-muted-foreground">Nenhum banner do menu cadastrado.</div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Preview</TableHead>
                      <TableHead>Título</TableHead>
                      <TableHead>Destino</TableHead>
                      <TableHead className="w-20">Ordem</TableHead>
                      <TableHead className="w-20">Ativo</TableHead>
                      <TableHead className="text-right w-28">Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {menuBanners.map((b) => {
                      const dest = b.package_id ? "Pacote/COMBO" : "Link";
                      return (
                        <TableRow key={b.id}>
                          <TableCell>
                            <img
                              src={b.image_url}
                              alt={b.title || "Banner"}
                              className="w-28 h-14 object-cover rounded-md border border-border"
                              loading="lazy"
                            />
                          </TableCell>
                          <TableCell className="max-w-[280px] truncate">{b.title || "—"}</TableCell>
                          <TableCell className="text-sm text-muted-foreground">{dest}</TableCell>
                          <TableCell>{b.display_order}</TableCell>
                          <TableCell>{b.is_active ? "Sim" : "Não"}</TableCell>
                          <TableCell className="text-right">
                            <div className="flex justify-end gap-2">
                              <Button size="icon" variant="outline" onClick={() => handleEditMenu(b)} title="Editar">
                                <Edit className="w-4 h-4" />
                              </Button>
                              <AlertDialog>
                                <AlertDialogTrigger asChild>
                                  <Button size="icon" variant="destructive" title="Excluir">
                                    <Trash2 className="w-4 h-4" />
                                  </Button>
                                </AlertDialogTrigger>
                                <AlertDialogContent>
                                  <AlertDialogHeader>
                                    <AlertDialogTitle>Excluir banner do menu?</AlertDialogTitle>
                                    <AlertDialogDescription>
                                      Esta ação não pode ser desfeita. O banner será removido do menu.
                                    </AlertDialogDescription>
                                  </AlertDialogHeader>
                                  <AlertDialogFooter>
                                    <AlertDialogCancel type="button">Cancelar</AlertDialogCancel>
                                    <AlertDialogAction
                                      type="button"
                                      className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                      onClick={() => deleteMenuMutation.mutate(b.id)}
                                    >
                                      {deleteMenuMutation.isPending ? (
                                        <>
                                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                          Excluindo...
                                        </>
                                      ) : (
                                        "Excluir"
                                      )}
                                    </AlertDialogAction>
                                  </AlertDialogFooter>
                                </AlertDialogContent>
                              </AlertDialog>
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
    </div>
  );
}
