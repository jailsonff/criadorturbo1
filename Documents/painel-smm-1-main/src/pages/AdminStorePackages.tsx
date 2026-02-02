import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  clearExternalConfig,
  getCurrentDatabaseInfo,
  getSupabaseClient,
  getExternalConfig,
  hasExternalDatabase,
} from "@/lib/supabaseClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { useToast } from "@/hooks/use-toast";
import { formatCurrency, cn } from "@/lib/utils";
import { Plus, Edit, Trash2, Package, Image, Loader2, Check, ChevronsUpDown, Upload, X, Link2, Copy } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { backendSupabase } from "@/lib/backendClient";
interface StoreFrontend {
  id: string;
  name: string;
  slug: string;
}

interface PredefinedQuantity {
  quantity: number;
  price: number;
  // optional: define how many link fields to show for this option
  link_fields?: number;
}
type PackageType = "single" | "combo";

type LinkTutorialRule = {
  service: string;
  allowed: string;
};

interface ComboItem {
  id: string; // client-only id for list rendering
  service_id: number;
  quantity: number;
  links_count: number;
  link_label: string;
}

interface StorePackage {
  id: string;
  frontend_id: string;
  section_id: string | null;
  name: string;
  description: string | null;
  cover_image_url: string | null;
  hidden_from_storefront?: boolean | null;
  // legacy/single package fields
  service_id: number;
  base_quantity: number;
  base_price: number;
  price_per_thousand: number;
  allow_custom_quantity: boolean | null;
  min_quantity: number | null;
  max_quantity: number | null;
  default_link_fields?: number | null;
  // common
  sales_count: number | null;
  display_order: number | null;
  is_active: boolean | null;
  badge_text: string | null;
  predefined_quantities: PredefinedQuantity[] | null;
  usage_notes: string | null;
  link_label: string | null;
  link_tutorial_rules?: any;
  // combo
  package_type?: PackageType;
  combo_items?: Omit<ComboItem, "id">[] | null;
}

interface PackageSection {
  id: string;
  frontend_id: string;
  name: string;
  display_order: number;
  is_active: boolean;
}

export default function AdminStorePackages() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const supabase = getSupabaseClient();

  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingPackage, setEditingPackage] = useState<StorePackage | null>(null);
  const [selectedFrontend, setSelectedFrontend] = useState<string>("");
  const [serviceSearch, setServiceSearch] = useState("");
  const [servicePopoverOpen, setServicePopoverOpen] = useState(false);

  // Combo service picker (search by ID or title)
  const [comboServiceSearch, setComboServiceSearch] = useState("");
  const [comboServicePopoverOpenId, setComboServicePopoverOpenId] = useState<string | null>(null);

  const [uploadingImage, setUploadingImage] = useState(false);
  const [imageInputMode, setImageInputMode] = useState<"url" | "upload">("url");

  const [formData, setFormData] = useState({
    frontend_id: "",
    section_id: "",
    package_type: "single" as PackageType,
    combo_items: [] as ComboItem[],
    name: "",
    description: "",
    cover_image_url: "",
    hidden_from_storefront: false,
    service_id: 0,
    base_quantity: 100,
    base_price: 0,
    price_per_thousand: 0,
    allow_custom_quantity: true,
    min_quantity: 10,
    max_quantity: 100000,
    default_link_fields: 1,
    display_order: 0,
    is_active: true,
    badge_text: "",
    predefined_quantities: [] as PredefinedQuantity[],
    usage_notes: "",
    link_label: "",
    link_tutorial_rules: [] as LinkTutorialRule[],
  });

  const [newPredefQty, setNewPredefQty] = useState({ quantity: "", price: "", link_fields: "" });
  const [editingPredefIndex, setEditingPredefIndex] = useState<number | null>(null);

  const { data: frontends = [] } = useQuery({
    queryKey: ["admin-store-frontends"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("store_frontends")
        .select("id, name, slug")
        .order("created_at", { ascending: true});
      if (error) throw error;
      return data as StoreFrontend[];
    },
  });

  const { data: sections = [] } = useQuery({
    queryKey: ["admin-store-package-sections", formData.frontend_id],
    queryFn: async () => {
      if (!formData.frontend_id) return [];
      const { data, error } = await supabase
        .from("store_package_sections")
        .select("*")
        .eq("frontend_id", formData.frontend_id)
        .order("display_order", { ascending: true });
      if (error) throw error;
      return data as PackageSection[];
    },
    enabled: !!formData.frontend_id,
  });

  const { data: packagesData = [], isLoading } = useQuery<any[]>({
    queryKey: ["admin-store-packages", selectedFrontend],
    queryFn: async () => {
      let query: any = supabase.from("store_packages").select("*");
      if (selectedFrontend) {
        query = query.eq("frontend_id", selectedFrontend);
      }
      const { data, error } = await query.order("display_order", { ascending: true });
      if (error) throw error;

       return (data || []).map((pkg: any) => ({
         ...pkg,
         predefined_quantities: pkg.predefined_quantities as PredefinedQuantity[] | null,
         combo_items: pkg.combo_items as any,
         link_tutorial_rules: pkg.link_tutorial_rules,
         default_link_fields: pkg.default_link_fields,
       }));
    },
  });

  // Used for listing/grouping packages by Sessão (store_package_sections)
  const { data: listSections = [] } = useQuery({
    queryKey: ["admin-store-package-sections-list", selectedFrontend],
    queryFn: async () => {
      let query: any = supabase
        .from("store_package_sections")
        .select("*")
        .order("display_order", { ascending: true });
      if (selectedFrontend) query = query.eq("frontend_id", selectedFrontend);
      const { data, error } = await query;
      if (error) throw error;
      return data as PackageSection[];
    },
  });

  const packages = packagesData as unknown as unknown as StorePackage[];

  const sectionsById = useMemo(() => {
    const map = new Map<string, PackageSection>();
    for (const s of listSections) map.set(s.id, s);
    return map;
  }, [listSections]);

  const groupPackagesBySection = useMemo(() => {
    const build = (pkgs: StorePackage[]) => {
      const byKey = new Map<string, StorePackage[]>();
      for (const pkg of pkgs) {
        const key = pkg.section_id ?? "__none__";
        const arr = byKey.get(key) ?? [];
        arr.push(pkg);
        byKey.set(key, arr);
      }

      const ordered: Array<{ key: string; label: string; items: StorePackage[] }> = [];

      // First: known sections in order
      for (const s of listSections) {
        const items = byKey.get(s.id);
        if (items?.length) ordered.push({ key: s.id, label: s.name, items });
      }

      // Then: unknown section_ids (if any)
      for (const [key, items] of byKey.entries()) {
        if (key === "__none__") continue;
        if (sectionsById.has(key)) continue;
        if (items?.length) ordered.push({ key, label: "Sessão (não encontrada)", items });
      }

      // Finally: packages without section
      const noneItems = byKey.get("__none__") ?? [];
      if (noneItems.length) ordered.push({ key: "__none__", label: "Sem Sessão", items: noneItems });

      return ordered;
    };

    return {
      single: (pkgs: StorePackage[]) => build(pkgs),
      combo: (pkgs: StorePackage[]) => build(pkgs),
    };
  }, [listSections, sectionsById]);

  const { singlePackages, comboPackages } = useMemo(() => {
    const single: StorePackage[] = [];
    const combo: StorePackage[] = [];

    for (const pkg of packages) {
      const type = (pkg.package_type as PackageType | undefined) || "single";
      if (type === "combo") combo.push(pkg);
      else single.push(pkg);
    }

    return { singlePackages: single, comboPackages: combo };
  }, [packages]);

  const { data: services = [] } = useQuery({
    queryKey: ["admin-services-for-packages"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("imported_services")
        .select("external_service_id, name, rate")
        .eq("is_active", true)
        .order("name");
      if (error) throw error;
      return data;
    },
  });

  const saveMutation = useMutation({
    mutationFn: async (data: typeof formData) => {
      const isCombo = data.package_type === "combo";

      const comboItemsToSave = isCombo
        ? data.combo_items
            .filter((it) => Number(it.service_id) > 0)
            .map((it) => ({
              service_id: Number(it.service_id),
              quantity: Math.max(0, Number(it.quantity) || 0),
              links_count: Math.max(1, Number(it.links_count) || 1),
              link_label: String(it.link_label || "Link"),
            }))
        : null;

      const legacyServiceId = isCombo
        ? (comboItemsToSave?.[0]?.service_id ?? data.service_id)
        : data.service_id;

       const saveData = {
         ...data,
         service_id: legacyServiceId,
         allow_custom_quantity: isCombo ? false : data.allow_custom_quantity,
         price_per_thousand: isCombo ? 0 : data.price_per_thousand,
         base_quantity: isCombo ? 0 : data.base_quantity,
         default_link_fields: isCombo ? 1 : Math.max(1, Number((data as any).default_link_fields) || 1),
         predefined_quantities:
           !isCombo && data.predefined_quantities.length > 0
             ? JSON.parse(JSON.stringify(data.predefined_quantities))
             : null,
         combo_items: isCombo ? comboItemsToSave : null,
       };

      if (editingPackage) {
        const { error } = await supabase.from("store_packages").update(saveData).eq("id", editingPackage.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("store_packages").insert(saveData);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-store-packages"] });
      setIsDialogOpen(false);
      setEditingPackage(null);
      resetForm();
      toast({
        title: "Sucesso",
        description: editingPackage ? "Pacote atualizado!" : "Pacote criado!",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Erro",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("store_packages").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-store-packages"] });
      toast({ title: "Pacote excluído!" });
    },
    onError: (error: any) => {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
    },
  });

  const resetForm = () => {
    setFormData({
      frontend_id: frontends[0]?.id || "",
      section_id: "",
      package_type: "single",
      combo_items: [],
      name: "",
      description: "",
      cover_image_url: "",
      hidden_from_storefront: false,
      service_id: 0,
      base_quantity: 100,
      base_price: 0,
      price_per_thousand: 0,
      allow_custom_quantity: true,
      min_quantity: 10,
      max_quantity: 100000,
      default_link_fields: 1,
      display_order: 0,
      is_active: true,
      badge_text: "",
      predefined_quantities: [],
      usage_notes: "",
      link_label: "",
      link_tutorial_rules: [],
    });
    setNewPredefQty({ quantity: "", price: "", link_fields: "" });
    setEditingPredefIndex(null);
  };

  const handleEdit = (pkg: StorePackage) => {
    setEditingPackage(pkg);

    const pkgType: PackageType = (pkg.package_type as PackageType) || "single";
    const comboItems: ComboItem[] = Array.isArray(pkg.combo_items)
      ? (pkg.combo_items as any[]).map((it, idx) => ({
          id: `ci_${idx}_${Date.now()}`,
          service_id: Number(it.service_id) || 0,
          quantity: Number(it.quantity) || 0,
          links_count: Number(it.links_count) || 1,
          link_label: String(it.link_label || "Link"),
        }))
      : [];

    setFormData({
      frontend_id: pkg.frontend_id,
      section_id: pkg.section_id || "",
      package_type: pkgType,
      combo_items: comboItems,
      name: pkg.name,
      description: pkg.description || "",
      cover_image_url: pkg.cover_image_url || "",
      hidden_from_storefront: Boolean((pkg as any).hidden_from_storefront),
      service_id: pkg.service_id,
      base_quantity: pkg.base_quantity,
      base_price: pkg.base_price,
      price_per_thousand: pkg.price_per_thousand,
      allow_custom_quantity: pkg.allow_custom_quantity,
      min_quantity: pkg.min_quantity,
      max_quantity: pkg.max_quantity,
      default_link_fields: Math.max(1, Number((pkg as any).default_link_fields) || 1),
      display_order: pkg.display_order,
      is_active: pkg.is_active,
      badge_text: pkg.badge_text || "",
      predefined_quantities: pkg.predefined_quantities || [],
      usage_notes: pkg.usage_notes || "",
      link_label: pkg.link_label || "",
      link_tutorial_rules: (pkg.link_tutorial_rules as any) || [],
    });
    setNewPredefQty({ quantity: "", price: "", link_fields: "" });
    setEditingPredefIndex(null);
    setIsDialogOpen(true);
  };

  const handleClone = (pkg: StorePackage) => {
    // Clone opens the same form, but creates a NEW package on save
    setEditingPackage(null);

    const pkgType: PackageType = (pkg.package_type as PackageType) || "single";
    const comboItems: ComboItem[] = Array.isArray(pkg.combo_items)
      ? (pkg.combo_items as any[]).map((it, idx) => ({
          id: `ci_clone_${idx}_${Date.now()}`,
          service_id: Number(it.service_id) || 0,
          quantity: Number(it.quantity) || 0,
          links_count: Number(it.links_count) || 1,
          link_label: String(it.link_label || "Link"),
        }))
      : [];

    const nextDisplayOrder =
      (packages.reduce((max, p) => Math.max(max, Number(p.display_order) || 0), 0) || 0) + 1;

    setFormData({
      frontend_id: pkg.frontend_id,
      section_id: pkg.section_id || "",
      package_type: pkgType,
      combo_items: comboItems,
      name: `${pkg.name} (Cópia)`,
      description: pkg.description || "",
      cover_image_url: pkg.cover_image_url || "",
      hidden_from_storefront: Boolean((pkg as any).hidden_from_storefront),
      service_id: pkg.service_id,
      base_quantity: pkg.base_quantity,
      base_price: pkg.base_price,
      price_per_thousand: pkg.price_per_thousand,
      allow_custom_quantity: pkg.allow_custom_quantity,
      min_quantity: pkg.min_quantity,
      max_quantity: pkg.max_quantity,
      default_link_fields: Math.max(1, Number((pkg as any).default_link_fields) || 1),
      display_order: nextDisplayOrder,
      is_active: pkg.is_active,
      badge_text: pkg.badge_text || "",
      predefined_quantities: pkg.predefined_quantities ? [...pkg.predefined_quantities] : [],
      usage_notes: pkg.usage_notes || "",
      link_label: pkg.link_label || "",
      link_tutorial_rules: (pkg.link_tutorial_rules as any) || [],
    });

    setNewPredefQty({ quantity: "", price: "", link_fields: "" });
    setEditingPredefIndex(null);
    setIsDialogOpen(true);

    toast({
      title: "Clonando",
      description: "Edite os campos e clique em Salvar para criar a cópia.",
    });
  };

  const addPredefinedQuantity = () => {
    const qty = parseInt(newPredefQty.quantity) || 0;
    // Parse price allowing comma as decimal separator
    const priceStr = newPredefQty.price.replace(",", ".");
    const price = parseFloat(priceStr) || 0;

    const linkFieldsRaw = parseInt(String(newPredefQty.link_fields || "")) || 0;
    const linkFields = linkFieldsRaw > 0 ? Math.max(1, linkFieldsRaw) : undefined;

    if (!(qty > 0 && price > 0)) return;

    const nextItem: PredefinedQuantity = {
      quantity: qty,
      price,
      ...(linkFields ? { link_fields: linkFields } : {}),
    };

    // If editing, replace item; otherwise add
    const nextList = [...formData.predefined_quantities];
    if (editingPredefIndex !== null && nextList[editingPredefIndex]) {
      nextList[editingPredefIndex] = nextItem;
    } else {
      nextList.push(nextItem);
    }

    setFormData({
      ...formData,
      predefined_quantities: nextList.sort((a, b) => a.quantity - b.quantity),
    });

    setNewPredefQty({ quantity: "", price: "", link_fields: "" });
    setEditingPredefIndex(null);
  };

  const removePredefinedQuantity = (index: number) => {
    setFormData({
      ...formData,
      predefined_quantities: formData.predefined_quantities.filter((_, i) => i !== index),
    });

    if (editingPredefIndex === index) {
      setEditingPredefIndex(null);
      setNewPredefQty({ quantity: "", price: "", link_fields: "" });
    }
  };

  const selectPredefinedQuantityForEdit = (index: number) => {
    const pq = formData.predefined_quantities[index];
    if (!pq) return;

    setEditingPredefIndex(index);
    setNewPredefQty({
      quantity: String(pq.quantity),
      price: String(pq.price).replace(".", ","),
      link_fields: pq.link_fields ? String(pq.link_fields) : "",
    });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (formData.package_type === "combo") {
      const items = formData.combo_items.filter((it) => Number(it.service_id) > 0);
      if (items.length === 0) {
        toast({ title: "Erro", description: "Adicione pelo menos 1 serviço no COMBO.", variant: "destructive" });
        return;
      }
      const hasInvalid = items.some((it) => !it.quantity || it.quantity <= 0 || !it.links_count || it.links_count < 1);
      if (hasInvalid) {
        toast({ title: "Erro", description: "Verifique quantidade e nº de links de cada item do COMBO.", variant: "destructive" });
        return;
      }
    }

    saveMutation.mutate({
      ...formData,
      default_link_fields: Math.max(1, Number((formData as any).default_link_fields) || 1),
    } as any);
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
                Você está usando um banco <b>externo</b>. Se ele não tiver as tabelas da loja
                (seções/pacotes), os selects podem ficar vazios e aparecer erro de “schema cache”.
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
                <div className="text-xs text-muted-foreground sm:self-center">
                  Atual: {dbInfo.type}
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h1 className="text-2xl font-bold">Pacotes da Loja</h1>
            <p className="text-muted-foreground">Gerencie os pacotes exibidos no frontend de vendas</p>
          </div>
          <Dialog open={isDialogOpen} onOpenChange={(open) => {
            setIsDialogOpen(open);
            if (!open) {
              setEditingPackage(null);
              resetForm();
            }
          }}>
            <DialogTrigger asChild>
              <Button className="gap-2">
                <Plus className="w-4 h-4" />
                Novo Pacote
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>{editingPackage ? "Editar Pacote" : "Novo Pacote"}</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="col-span-2">
                    <Label>Frontend</Label>
                    <Select
                      value={formData.frontend_id}
                      onValueChange={(v) => setFormData({ ...formData, frontend_id: v, section_id: "" })}
                    >
                      <SelectTrigger>
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

                  <div className="col-span-2">
                    <div className="flex items-end gap-2">
                      <div className="flex-1">
                        <Label>Seção</Label>
                        <Select
                          value={formData.section_id}
                          onValueChange={(v) => setFormData({ ...formData, section_id: v })}
                          disabled={!formData.frontend_id}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Selecione a seção..." />
                          </SelectTrigger>
                          <SelectContent>
                            {sections.length === 0 && formData.frontend_id && (
                              <div className="p-2 text-sm text-muted-foreground">
                                Nenhuma seção disponível para este frontend
                              </div>
                            )}
                            {sections.map((s) => (
                              <SelectItem key={s.id} value={s.id}>
                                {s.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        onClick={() => window.open('/admin-store-sections', '_blank')}
                        title="Gerenciar Sessões"
                      >
                        <Plus className="w-4 h-4" />
                      </Button>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      Selecione em qual seção (Engajamento, Combos, etc.) este pacote aparecerá na loja.
                    </p>
                  </div>

                  <div className="col-span-2">
                    <Label>Tipo do pacote</Label>
                    <Select
                      value={formData.package_type}
                      onValueChange={(v) => {
                        const nextType = (v as PackageType) || "single";
                        setFormData({
                          ...formData,
                          package_type: nextType,
                          // reset some fields when switching
                          predefined_quantities: nextType === "combo" ? [] : formData.predefined_quantities,
                          allow_custom_quantity: nextType === "combo" ? false : formData.allow_custom_quantity,
                        });
                      }}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Selecione..." />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="single">Normal (1 serviço)</SelectItem>
                        <SelectItem value="combo">COMBO (vários serviços)</SelectItem>
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground mt-1">
                      COMBO permite vários serviços com quantidade fixa e múltiplos links por item.
                    </p>
                  </div>

                  <div className="col-span-2">
                    <Label>Nome do Pacote</Label>
                    <Input
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      placeholder="100 Curtidas Instagram"
                      required
                    />
                  </div>

                  <div className="col-span-2">
                    <Label>Descrição</Label>
                    <Textarea
                      value={formData.description}
                      onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                      placeholder="Descrição do pacote..."
                    />
                  </div>

                  <div className="col-span-2">
                    <Label className="flex items-center gap-2">
                      Informações de Uso
                      <span className="text-xs text-muted-foreground font-normal">
                        (Ex: "Funciona para fotos e vídeos/reels")
                      </span>
                    </Label>
                    <Input
                      value={formData.usage_notes}
                      onChange={(e) => setFormData({ ...formData, usage_notes: e.target.value })}
                      placeholder="Ex: Válido para fotos e vídeos/reels"
                    />
                  </div>

                  <div className="col-span-2">
                    <Label className="flex items-center gap-2">
                      Rótulo do Campo Link
                      <span className="text-xs text-muted-foreground font-normal">
                        (Ex: "Link do Post / Foto / Vídeo")
                      </span>
                    </Label>
                    <Input
                      value={formData.link_label}
                      onChange={(e) => setFormData({ ...formData, link_label: e.target.value })}
                      placeholder="Link do Post / Foto / Vídeo"
                    />

                    {formData.package_type === "single" && (
                      <div className="mt-3 grid grid-cols-2 gap-4">
                        <div className="col-span-2 sm:col-span-1">
                          <Label className="flex items-center gap-2">
                            Campos de Link (padrão)
                            <span className="text-xs text-muted-foreground font-normal">
                              (quantos campos aparecem no checkout)
                            </span>
                          </Label>
                          <Input
                            type="number"
                            min={1}
                            value={formData.default_link_fields}
                            onChange={(e) =>
                              setFormData({
                                ...formData,
                                default_link_fields: Math.max(1, parseInt(e.target.value) || 1),
                              })
                            }
                          />
                          <p className="text-xs text-muted-foreground mt-1">
                            Você pode sobrescrever isso por opção em “Quantidades Predefinidas”.
                          </p>
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="col-span-2">
                    <div className="flex items-center justify-between gap-2">
                      <Label>Regras do Tutorial (modal de links)</Label>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() =>
                          setFormData({
                            ...formData,
                            link_tutorial_rules: [...(formData.link_tutorial_rules || []), { service: "", allowed: "" }],
                          })
                        }
                      >
                        <Plus className="w-4 h-4 mr-2" />
                        Adicionar regra
                      </Button>
                    </div>

                    <div className="mt-2 rounded-lg border border-border overflow-hidden">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Serviço</TableHead>
                            <TableHead>O que pode colocar</TableHead>
                            <TableHead className="w-12"></TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {(formData.link_tutorial_rules || []).length === 0 ? (
                            <TableRow>
                              <TableCell colSpan={3} className="text-sm text-muted-foreground">
                                Nenhuma regra cadastrada. Clique em “Adicionar regra”.
                              </TableCell>
                            </TableRow>
                          ) : (
                            (formData.link_tutorial_rules || []).map((rule, idx) => (
                              <TableRow key={idx}>
                                <TableCell className="align-top">
                                  <Input
                                    value={rule.service}
                                    onChange={(e) => {
                                      const next = [...(formData.link_tutorial_rules || [])];
                                      next[idx] = { ...next[idx], service: e.target.value };
                                      setFormData({ ...formData, link_tutorial_rules: next });
                                    }}
                                    placeholder="Ex: CURTIDAS / VISUALIZAÇÕES"
                                  />
                                </TableCell>
                                <TableCell className="align-top">
                                  <Textarea
                                    value={rule.allowed}
                                    onChange={(e) => {
                                      const next = [...(formData.link_tutorial_rules || [])];
                                      next[idx] = { ...next[idx], allowed: e.target.value };
                                      setFormData({ ...formData, link_tutorial_rules: next });
                                    }}
                                    placeholder="Ex: Link do post / link do reels / link do perfil..."
                                    rows={2}
                                  />
                                </TableCell>
                                <TableCell className="align-top">
                                  <Button
                                    type="button"
                                    variant="destructive"
                                    size="icon"
                                    onClick={() => {
                                      const next = (formData.link_tutorial_rules || []).filter((_, i) => i !== idx);
                                      setFormData({ ...formData, link_tutorial_rules: next });
                                    }}
                                    aria-label="Remover regra"
                                  >
                                    <Trash2 className="w-4 h-4" />
                                  </Button>
                                </TableCell>
                              </TableRow>
                            ))
                          )}
                        </TableBody>
                      </Table>
                    </div>

                    <p className="text-xs text-muted-foreground mt-2">
                      Essas regras aparecem no botão “TUTORIAL APRENDA” dentro do modal de compra.
                    </p>
                  </div>

                  <div className="col-span-2">
                    <Label className="flex items-center gap-2">
                      Imagem de Capa
                      <span className="text-xs text-muted-foreground font-normal">
                        (Recomendado: 400x500px ou proporção 4:5)
                      </span>
                    </Label>
                    
                    <Tabs value={imageInputMode} onValueChange={(v) => setImageInputMode(v as "url" | "upload")} className="mt-2">
                      <TabsList className="grid w-full grid-cols-2 h-9">
                        <TabsTrigger value="url" className="gap-1.5 text-xs">
                          <Link2 className="w-3.5 h-3.5" />
                          URL
                        </TabsTrigger>
                        <TabsTrigger value="upload" className="gap-1.5 text-xs">
                          <Upload className="w-3.5 h-3.5" />
                          Upload
                        </TabsTrigger>
                      </TabsList>
                      
                      <TabsContent value="url" className="mt-2">
                        <Input
                          value={formData.cover_image_url}
                          onChange={(e) => setFormData({ ...formData, cover_image_url: e.target.value })}
                          placeholder="https://..."
                        />
                      </TabsContent>
                      
                      <TabsContent value="upload" className="mt-2">
                        <div className="space-y-2">
                          <div className="flex items-center gap-2">
                            <Input
                              type="file"
                              accept="image/*"
                              onChange={async (e) => {
                                const file = e.target.files?.[0];
                                if (!file) return;

                                // Validate file size (max 5MB)
                                if (file.size > 5 * 1024 * 1024) {
                                  toast({
                                    title: "Arquivo muito grande",
                                    description: "O tamanho máximo é 5MB",
                                    variant: "destructive",
                                  });
                                  return;
                                }

                                setUploadingImage(true);
                                try {
                                  const fileExt = file.name.split(".").pop();
                                  const fileName = `package-cover-${Date.now()}.${fileExt}`;
                                  const filePath = `packages/${fileName}`;

                                  const dataUrl = await new Promise<string>((resolve, reject) => {
                                    const reader = new FileReader();
                                    reader.onload = () => resolve(String(reader.result || ""));
                                    reader.onerror = () => reject(new Error("Falha ao ler o arquivo"));
                                    reader.readAsDataURL(file);
                                  });

                                  const base64 = dataUrl.split(",")[1] || "";
                                  if (!base64) throw new Error("Falha ao processar a imagem");


                                   const external = hasExternalDatabase() ? getExternalConfig() : null;

                                   // When using external database/auth, the admin is logged in there.
                                   // We still invoke the backend function on Lovable Cloud, but we must
                                   // pass the *external* JWT via Authorization so the function can validate it.
                                   const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
                                   if (sessionError) throw sessionError;
                                   const accessToken = sessionData.session?.access_token;
                                   if (!accessToken) {
                                     throw new Error("Sua sessão expirou. Faça login novamente.");
                                   }

                                   const { data, error } = await backendSupabase.functions.invoke("storage-upload", {
                                     headers: {
                                       Authorization: `Bearer ${accessToken}`,
                                     },
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

                                  setFormData({ ...formData, cover_image_url: data.publicUrl });
                                  toast({
                                    title: "Imagem enviada!",
                                    description: "A imagem foi carregada com sucesso.",
                                  });
                                } catch (error: any) {
                                  toast({
                                    title: "Erro no upload",
                                    description: error.message,
                                    variant: "destructive",
                                  });
                                } finally {
                                  setUploadingImage(false);
                                }
                              }}
                              disabled={uploadingImage}
                              className="flex-1"
                            />
                            {uploadingImage && <Loader2 className="w-4 h-4 animate-spin" />}
                          </div>
                          <p className="text-xs text-muted-foreground">
                            Formatos: JPG, PNG, WEBP • Tamanho máximo: 5MB
                          </p>
                        </div>
                      </TabsContent>
                    </Tabs>
                    
                    {/* Image Preview */}
                    {formData.cover_image_url && (
                      <div className="mt-3 relative inline-block">
                        <img
                          src={formData.cover_image_url}
                          alt="Preview"
                          className="w-24 h-30 object-cover rounded-lg border border-border"
                          onError={(e) => {
                            (e.target as HTMLImageElement).style.display = 'none';
                          }}
                        />
                        <Button
                          type="button"
                          variant="destructive"
                          size="icon"
                          className="absolute -top-2 -right-2 w-6 h-6"
                          onClick={() => setFormData({ ...formData, cover_image_url: "" })}
                        >
                          <X className="w-3 h-3" />
                        </Button>
                      </div>
                    )}
                  </div>

                  {formData.package_type === "single" ? (
                    <>
                      <div className="col-span-2">
                        <Label>Serviço (API)</Label>
                        <Popover open={servicePopoverOpen} onOpenChange={setServicePopoverOpen}>
                          <PopoverTrigger asChild>
                            <Button
                              variant="outline"
                              role="combobox"
                              aria-expanded={servicePopoverOpen}
                              className="w-full justify-between font-normal"
                            >
                              {formData.service_id
                                ? (() => {
                                    const selectedService = services.find(
                                      (s) => s.external_service_id === formData.service_id
                                    );
                                    return selectedService
                                      ? `${selectedService.external_service_id} - ${selectedService.name}`
                                      : "Selecione o serviço...";
                                  })()
                                : "Selecione o serviço..."}
                              <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                            </Button>
                          </PopoverTrigger>
                          <PopoverContent className="w-[500px] p-0" align="start">
                            <Command shouldFilter={false}>
                              <CommandInput
                                placeholder="Buscar por ID ou título..."
                                value={serviceSearch}
                                onValueChange={setServiceSearch}
                              />
                              <CommandList>
                                <CommandEmpty>Nenhum serviço encontrado.</CommandEmpty>
                                <CommandGroup>
                                  {services
                                    .filter((s) => {
                                      if (!serviceSearch) return true;
                                      const search = serviceSearch.toLowerCase().replace("#", "");
                                      const idMatch = s.external_service_id.toString().includes(search);
                                      const nameMatch = s.name.toLowerCase().includes(search);
                                      return idMatch || nameMatch;
                                    })
                                    .slice(0, 50)
                                    .map((s) => (
                                      <CommandItem
                                        key={s.external_service_id}
                                        value={s.external_service_id.toString()}
                                        onSelect={() => {
                                          // Use functional updates to avoid stale-state overwrites (important when editing existing packages)
                                          setFormData((prev) => ({ ...prev, service_id: Number(s.external_service_id) }));
                                          setServicePopoverOpen(false);
                                          setServiceSearch("");
                                        }}
                                      >
                                        <Check
                                          className={cn(
                                            "mr-2 h-4 w-4",
                                            formData.service_id === s.external_service_id ? "opacity-100" : "opacity-0"
                                          )}
                                        />
                                        <span className="text-muted-foreground mr-2">{s.external_service_id}</span>
                                        <span className="truncate">{s.name}</span>
                                      </CommandItem>
                                    ))}
                                </CommandGroup>
                              </CommandList>
                            </Command>
                          </PopoverContent>
                        </Popover>
                      </div>

                      <div>
                        <Label>Quantidade Base</Label>
                        <Input
                          type="number"
                          value={formData.base_quantity}
                          onChange={(e) =>
                            setFormData({ ...formData, base_quantity: parseInt(e.target.value) || 0 })
                          }
                        />
                      </div>

                      <div>
                        <Label>Preço Base (R$)</Label>
                        <Input
                          type="number"
                          step="0.01"
                          value={formData.base_price}
                          onChange={(e) =>
                            setFormData({ ...formData, base_price: parseFloat(e.target.value) || 0 })
                          }
                        />
                      </div>

                      <div>
                        <Label>Preço por 1000</Label>
                        <Input
                          type="number"
                          step="0.01"
                          value={formData.price_per_thousand}
                          onChange={(e) =>
                            setFormData({
                              ...formData,
                              price_per_thousand: parseFloat(e.target.value) || 0,
                            })
                          }
                        />
                      </div>

                      <div>
                        <Label>Ordem de Exibição</Label>
                        <Input
                          type="number"
                          value={formData.display_order}
                          onChange={(e) =>
                            setFormData({ ...formData, display_order: parseInt(e.target.value) || 0 })
                          }
                        />
                      </div>

                      <div>
                        <Label>Quantidade Mínima</Label>
                        <Input
                          type="number"
                          value={formData.min_quantity}
                          onChange={(e) =>
                            setFormData({ ...formData, min_quantity: parseInt(e.target.value) || 0 })
                          }
                        />
                      </div>

                      <div>
                        <Label>Quantidade Máxima</Label>
                        <Input
                          type="number"
                          value={formData.max_quantity}
                          onChange={(e) =>
                            setFormData({ ...formData, max_quantity: parseInt(e.target.value) || 0 })
                          }
                        />
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="col-span-2">
                        <Label className="text-base font-semibold">Itens do COMBO</Label>
                        <p className="text-xs text-muted-foreground mb-3">
                          Adicione vários serviços, definindo a quantidade e quantos links o cliente deverá informar
                          para cada serviço.
                        </p>

                        <div className="space-y-3">
                          {formData.combo_items.map((item, idx) => (
                            <div key={item.id} className="rounded-lg border border-border p-3">
                              <div className="grid grid-cols-12 gap-2 items-end">
                                <div className="col-span-12 md:col-span-6">
                                  <Label className="text-xs">Serviço</Label>
                                  <Popover
                                    open={comboServicePopoverOpenId === item.id}
                                    onOpenChange={(open) => {
                                      setComboServicePopoverOpenId(open ? item.id : null);
                                      if (!open) setComboServiceSearch("");
                                    }}
                                  >
                                    <PopoverTrigger asChild>
                                      <Button
                                        variant="outline"
                                        role="combobox"
                                        aria-expanded={comboServicePopoverOpenId === item.id}
                                        className="w-full justify-between font-normal"
                                      >
                                        {item.service_id
                                          ? (() => {
                                              const selectedService = services.find(
                                                (s) => s.external_service_id === item.service_id
                                              );
                                              return selectedService
                                                ? `${selectedService.external_service_id} - ${selectedService.name}`
                                                : "Selecione...";
                                            })()
                                          : "Selecione..."}
                                        <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                                      </Button>
                                    </PopoverTrigger>
                                    <PopoverContent className="w-[520px] p-0" align="start">
                                      <Command shouldFilter={false}>
                                        <CommandInput
                                          placeholder="Buscar por ID ou título..."
                                          value={comboServiceSearch}
                                          onValueChange={setComboServiceSearch}
                                        />
                                        <CommandList>
                                          <CommandEmpty>Nenhum serviço encontrado.</CommandEmpty>
                                          <CommandGroup>
                                            {services
                                              .filter((s) => {
                                                if (!comboServiceSearch) return true;
                                                const search = comboServiceSearch.toLowerCase().replace("#", "");
                                                const idMatch = s.external_service_id
                                                  .toString()
                                                  .includes(search);
                                                const nameMatch = s.name.toLowerCase().includes(search);
                                                return idMatch || nameMatch;
                                              })
                                              .slice(0, 50)
                                              .map((s) => (
                                                <CommandItem
                                                  key={s.external_service_id}
                                                  value={s.external_service_id.toString()}
                                                  onSelect={() => {
                                                    // Use functional updates to avoid stale-state overwrites
                                                    setFormData((prev) => {
                                                      const next = [...prev.combo_items];
                                                      next[idx] = {
                                                        ...next[idx],
                                                        service_id: Number(s.external_service_id),
                                                      };
                                                      return { ...prev, combo_items: next };
                                                    });
                                                    setComboServicePopoverOpenId(null);
                                                    setComboServiceSearch("");
                                                  }}
                                                >
                                                  <Check
                                                    className={cn(
                                                      "mr-2 h-4 w-4",
                                                      item.service_id === s.external_service_id
                                                        ? "opacity-100"
                                                        : "opacity-0"
                                                    )}
                                                  />
                                                  <span className="text-muted-foreground mr-2">{s.external_service_id}</span>
                                                  <span className="truncate">{s.name}</span>
                                                </CommandItem>
                                              ))}
                                          </CommandGroup>
                                        </CommandList>
                                      </Command>
                                    </PopoverContent>
                                  </Popover>
                                </div>

                                <div className="col-span-6 md:col-span-2">
                                  <Label className="text-xs">Qtd</Label>
                                  <Input
                                    type="number"
                                    value={item.quantity}
                                    onChange={(e) => {
                                      const next = [...formData.combo_items];
                                      next[idx] = { ...next[idx], quantity: parseInt(e.target.value) || 0 };
                                      setFormData({ ...formData, combo_items: next });
                                    }}
                                  />
                                </div>

                                <div className="col-span-6 md:col-span-2">
                                  <Label className="text-xs">Nº links</Label>
                                  <Input
                                    type="number"
                                    min={1}
                                    value={item.links_count}
                                    onChange={(e) => {
                                      const next = [...formData.combo_items];
                                      next[idx] = { ...next[idx], links_count: Math.max(1, parseInt(e.target.value) || 1) };
                                      setFormData({ ...formData, combo_items: next });
                                    }}
                                  />
                                </div>

                                <div className="col-span-12 md:col-span-2">
                                  <Button
                                    type="button"
                                    variant="destructive"
                                    size="sm"
                                    className="w-full"
                                    onClick={() => {
                                      setFormData({
                                        ...formData,
                                        combo_items: formData.combo_items.filter((_, i) => i !== idx),
                                      });
                                    }}
                                  >
                                    Remover
                                  </Button>
                                </div>

                                <div className="col-span-12">
                                  <Label className="text-xs">Rótulo do link deste item</Label>
                                  <Input
                                    value={item.link_label}
                                    onChange={(e) => {
                                      const next = [...formData.combo_items];
                                      next[idx] = { ...next[idx], link_label: e.target.value };
                                      setFormData({ ...formData, combo_items: next });
                                    }}
                                    placeholder="Ex: Link do Reels"
                                  />
                                </div>
                              </div>
                            </div>
                          ))}

                          <Button
                            type="button"
                            variant="outline"
                            onClick={() => {
                              setFormData({
                                ...formData,
                                combo_items: [
                                  ...formData.combo_items,
                                  {
                                    id: `ci_${Date.now()}`,
                                    service_id: 0,
                                    quantity: 0,
                                    links_count: 1,
                                    link_label: "Link",
                                  },
                                ],
                              });
                            }}
                          >
                            <Plus className="w-4 h-4 mr-2" />
                            Adicionar serviço
                          </Button>
                        </div>
                      </div>

                      <div className="col-span-2">
                        <Label>Preço do COMBO (R$)</Label>
                        <Input
                          type="number"
                          step="0.01"
                          value={formData.base_price}
                          onChange={(e) =>
                            setFormData({ ...formData, base_price: parseFloat(e.target.value) || 0 })
                          }
                        />
                      </div>

                      <div className="col-span-2">
                        <Label>Ordem de Exibição</Label>
                        <Input
                          type="number"
                          value={formData.display_order}
                          onChange={(e) =>
                            setFormData({ ...formData, display_order: parseInt(e.target.value) || 0 })
                          }
                        />
                      </div>
                    </>
                  )}

                  <div>
                    <Label>Badge (ex: OFERTA)</Label>
                    <Input
                      value={formData.badge_text}
                      onChange={(e) => setFormData({ ...formData, badge_text: e.target.value })}
                      placeholder="OFERTA"
                    />
                  </div>

                  <div className="flex flex-wrap items-center gap-4">
                    <div className="flex items-center gap-2 whitespace-nowrap">
                      <Switch
                        checked={formData.is_active}
                        onCheckedChange={(c) => setFormData({ ...formData, is_active: c })}
                      />
                      <Label>Ativo</Label>
                    </div>

                    <div className="flex items-center gap-2 whitespace-nowrap">
                      <Switch
                        checked={formData.hidden_from_storefront}
                        onCheckedChange={(c) => setFormData({ ...formData, hidden_from_storefront: c })}
                      />
                      <Label>Ocultar na Loja</Label>
                    </div>

                    {formData.package_type === "single" && (
                      <div className="flex items-center gap-2 whitespace-nowrap">
                        <Switch
                          checked={formData.allow_custom_quantity}
                          onCheckedChange={(c) => setFormData({ ...formData, allow_custom_quantity: c })}
                        />
                        <Label>Personalizar Qtd</Label>
                      </div>
                    )}
                  </div>

                  {formData.package_type === "single" && (
                    <>
                      {/* Predefined Quantities Section */}
                      <div className="col-span-2 border-t pt-4 mt-2">
                        <Label className="text-base font-semibold">Quantidades Predefinidas</Label>
                        <p className="text-xs text-muted-foreground mb-3">
                          Adicione opções de quantidade com preço fixo para o cliente escolher rapidamente.
                        </p>

                        {formData.predefined_quantities.length > 0 && (
                          <div className="flex flex-wrap gap-2 mb-3">
                            {formData.predefined_quantities.map((pq, index) => (
                              <Badge
                                key={index}
                                variant={editingPredefIndex === index ? "default" : "secondary"}
                                className="gap-2 py-1.5 pl-3 pr-2 cursor-pointer select-none"
                                onClick={() => selectPredefinedQuantityForEdit(index)}
                                title="Clique para editar"
                              >
                                <span>
                                  {pq.quantity.toLocaleString()} = {formatCurrency(pq.price)}
                                </span>
                                {pq.link_fields ? (
                                  <span className="ml-1 text-xs text-muted-foreground">• {pq.link_fields} links</span>
                                ) : null}
                                <button
                                  type="button"
                                  className="ml-1 inline-flex h-5 w-5 items-center justify-center rounded-sm text-destructive hover:bg-destructive/10"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    removePredefinedQuantity(index);
                                  }}
                                  aria-label="Remover opção"
                                  title="Remover"
                                >
                                  ×
                                </button>
                              </Badge>
                            ))}
                          </div>
                        )}

                        <div className="flex flex-col sm:flex-row gap-2 sm:items-end">
                          <div className="flex-1">
                            <Label className="text-xs">Quantidade</Label>
                            <Input
                              type="text"
                              inputMode="numeric"
                              placeholder="Ex: 100"
                              value={newPredefQty.quantity}
                              onChange={(e) =>
                                setNewPredefQty({
                                  ...newPredefQty,
                                  quantity: e.target.value.replace(/[^0-9]/g, ""),
                                })
                              }
                            />
                          </div>
                          <div className="flex-1">
                            <Label className="text-xs">Preço (R$)</Label>
                            <Input
                              type="text"
                              inputMode="decimal"
                              placeholder="Ex: 0,60"
                              value={newPredefQty.price}
                              onChange={(e) =>
                                setNewPredefQty({
                                  ...newPredefQty,
                                  price: e.target.value.replace(/[^0-9,\.]/g, ""),
                                })
                              }
                            />
                          </div>
                          <div className="sm:w-44">
                            <Label className="text-xs">Campos de Link</Label>
                            <Input
                              type="text"
                              inputMode="numeric"
                              placeholder={`Padrão: ${formData.default_link_fields}`}
                              value={newPredefQty.link_fields}
                              onChange={(e) =>
                                setNewPredefQty({
                                  ...newPredefQty,
                                  link_fields: e.target.value.replace(/[^0-9]/g, ""),
                                })
                              }
                            />
                          </div>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={addPredefinedQuantity}
                            disabled={!newPredefQty.quantity || !newPredefQty.price}
                            title={editingPredefIndex !== null ? "Atualizar opção" : "Adicionar opção"}
                          >
                            {editingPredefIndex !== null ? <Check className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
                          </Button>
                        </div>
                      </div>
                    </>
                  )}
                </div>

                <div className="flex items-center justify-between gap-2">
                  {editingPackage ? (
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button type="button" variant="destructive" className="hidden sm:inline-flex">
                          Excluir
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Excluir pacote?</AlertDialogTitle>
                          <AlertDialogDescription>
                            Esta ação não pode ser desfeita. O pacote será removido do sistema.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel type="button">Cancelar</AlertDialogCancel>
                          <AlertDialogAction
                            type="button"
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                            onClick={() => {
                              if (editingPackage?.id) deleteMutation.mutate(editingPackage.id);
                              setIsDialogOpen(false);
                            }}
                          >
                            Excluir
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  ) : (
                    <div />
                  )}

                  <div className="flex justify-end gap-2">
                    <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)}>
                      Cancelar
                    </Button>
                    <Button type="submit" disabled={saveMutation.isPending}>
                      {saveMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                      Salvar
                    </Button>
                  </div>
                </div>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        <Card>
          <CardHeader>
            <div className="flex items-center gap-4">
              <Select value={selectedFrontend || "all"} onValueChange={(v) => setSelectedFrontend(v === "all" ? "" : v)}>
                <SelectTrigger className="w-64">
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
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="flex justify-center py-8">
                <Loader2 className="w-8 h-8 animate-spin text-primary" />
              </div>
            ) : singlePackages.length === 0 && comboPackages.length === 0 ? (
              <div className="text-center py-8">
                <Package className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
                <p className="text-muted-foreground">Nenhum pacote cadastrado.</p>
              </div>
            ) : (
              <div className="space-y-8">
                <section className="space-y-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="space-y-0.5">
                      <h2 className="text-sm font-semibold tracking-wide">PACOTES</h2>
                      <p className="text-xs text-muted-foreground">Pacotes normais (não-combo)</p>
                    </div>
                    <Badge variant="secondary">{singlePackages.length}</Badge>
                  </div>

                  {singlePackages.length === 0 ? (
                    <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
                      Nenhum pacote normal cadastrado.
                    </div>
                  ) : (
                    <div className="space-y-6">
                      {groupPackagesBySection.single(singlePackages).map((group) => (
                        <div key={group.key} className="space-y-2">
                          <div className="flex items-center justify-between gap-3">
                            <h3 className="text-xs font-semibold tracking-wide text-muted-foreground">{group.label}</h3>
                            <Badge variant="secondary">{group.items.length}</Badge>
                          </div>

                          <div className="overflow-x-auto">
                            <Table>
                              <TableHeader>
                                <TableRow>
                                  <TableHead>Capa</TableHead>
                                  <TableHead>Nome</TableHead>
                                  <TableHead>Service ID</TableHead>
                                  <TableHead>Qtd Base</TableHead>
                                  <TableHead>Preço</TableHead>
                                  <TableHead>Status</TableHead>
                                  <TableHead className="text-right">Ações</TableHead>
                                </TableRow>
                              </TableHeader>
                              <TableBody>
                                {group.items.map((pkg) => (
                                  <TableRow
                                    key={pkg.id}
                                    onClick={() => handleEdit(pkg)}
                                    className="cursor-pointer hover:bg-muted/40"
                                  >
                                    <TableCell>
                                      {pkg.cover_image_url ? (
                                        <img src={pkg.cover_image_url} alt="" className="w-12 h-12 rounded object-cover" />
                                      ) : (
                                        <div className="w-12 h-12 rounded bg-muted flex items-center justify-center">
                                          <Image className="w-5 h-5 text-muted-foreground" />
                                        </div>
                                      )}
                                    </TableCell>
                                    <TableCell className="font-medium max-w-[200px] truncate">
                                      {pkg.name}
                                      {pkg.badge_text && <Badge className="ml-2 bg-red-500 text-xs">{pkg.badge_text}</Badge>}
                                      {(pkg as any).hidden_from_storefront ? (
                                        <Badge variant="secondary" className="ml-2 text-xs">
                                          Oculto
                                        </Badge>
                                      ) : null}
                                    </TableCell>
                                    <TableCell>{pkg.service_id}</TableCell>
                                    <TableCell>{pkg.base_quantity}</TableCell>
                                    <TableCell className="text-primary font-medium">{formatCurrency(pkg.base_price)}</TableCell>
                                    <TableCell>
                                      <Badge variant={pkg.is_active ? "default" : "secondary"}>
                                        {pkg.is_active ? "Ativo" : "Inativo"}
                                      </Badge>
                                    </TableCell>
                                    <TableCell className="text-right">
                                      <div
                                        className="flex justify-end gap-2"
                                        onClick={(e) => e.stopPropagation()}
                                        onPointerDown={(e) => e.stopPropagation()}
                                      >
                                        <Button
                                          size="icon"
                                          variant="outline"
                                          type="button"
                                          onPointerDown={(e) => e.stopPropagation()}
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            handleEdit(pkg);
                                          }}
                                          title="Editar"
                                        >
                                          <Edit className="w-4 h-4" />
                                        </Button>
                                        <Button
                                          size="icon"
                                          variant="outline"
                                          type="button"
                                          onPointerDown={(e) => e.stopPropagation()}
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            handleClone(pkg);
                                          }}
                                          title="Clonar"
                                        >
                                          <Copy className="w-4 h-4" />
                                        </Button>
                                        <AlertDialog>
                                          <AlertDialogTrigger asChild>
                                            <Button
                                              size="icon"
                                              variant="destructive"
                                              type="button"
                                              className="hidden md:inline-flex"
                                              onPointerDown={(e) => e.stopPropagation()}
                                              onClick={(e) => e.stopPropagation()}
                                              title="Excluir"
                                            >
                                              <Trash2 className="w-4 h-4" />
                                            </Button>
                                          </AlertDialogTrigger>
                                          <AlertDialogContent
                                            onPointerDown={(e) => e.stopPropagation()}
                                            onClick={(e) => e.stopPropagation()}
                                          >
                                            <AlertDialogHeader>
                                              <AlertDialogTitle>Excluir pacote?</AlertDialogTitle>
                                              <AlertDialogDescription>
                                                Esta ação não pode ser desfeita. O pacote será removido do sistema.
                                              </AlertDialogDescription>
                                            </AlertDialogHeader>
                                            <AlertDialogFooter>
                                              <AlertDialogCancel type="button">Cancelar</AlertDialogCancel>
                                              <AlertDialogAction
                                                type="button"
                                                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                                onClick={() => deleteMutation.mutate(pkg.id)}
                                              >
                                                Excluir
                                              </AlertDialogAction>
                                            </AlertDialogFooter>
                                          </AlertDialogContent>
                                        </AlertDialog>
                                      </div>
                                    </TableCell>
                                  </TableRow>
                                ))}
                              </TableBody>
                            </Table>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </section>

                <section className="space-y-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="space-y-0.5">
                      <h2 className="text-sm font-semibold tracking-wide">COMBOS</h2>
                      <p className="text-xs text-muted-foreground">Todos os combos cadastrados</p>
                    </div>
                    <Badge variant="secondary">{comboPackages.length}</Badge>
                  </div>

                  {comboPackages.length === 0 ? (
                    <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
                      Nenhum combo cadastrado.
                    </div>
                  ) : (
                    <div className="space-y-6">
                      {groupPackagesBySection.combo(comboPackages).map((group) => (
                        <div key={group.key} className="space-y-2">
                          <div className="flex items-center justify-between gap-3">
                            <h3 className="text-xs font-semibold tracking-wide text-muted-foreground">{group.label}</h3>
                            <Badge variant="secondary">{group.items.length}</Badge>
                          </div>

                          <div className="overflow-x-auto">
                            <Table>
                              <TableHeader>
                                <TableRow>
                                  <TableHead>Capa</TableHead>
                                  <TableHead>Nome</TableHead>
                                  <TableHead>Service ID</TableHead>
                                  <TableHead>Qtd Base</TableHead>
                                  <TableHead>Preço</TableHead>
                                  <TableHead>Status</TableHead>
                                  <TableHead className="text-right">Ações</TableHead>
                                </TableRow>
                              </TableHeader>
                              <TableBody>
                                {group.items.map((pkg) => (
                                  <TableRow
                                    key={pkg.id}
                                    onClick={() => handleEdit(pkg)}
                                    className="cursor-pointer hover:bg-muted/40"
                                  >
                                    <TableCell>
                                      {pkg.cover_image_url ? (
                                        <img src={pkg.cover_image_url} alt="" className="w-12 h-12 rounded object-cover" />
                                      ) : (
                                        <div className="w-12 h-12 rounded bg-muted flex items-center justify-center">
                                          <Image className="w-5 h-5 text-muted-foreground" />
                                        </div>
                                      )}
                                    </TableCell>
                                    <TableCell className="font-medium max-w-[200px] truncate">
                                      {pkg.name}
                                      {pkg.badge_text && <Badge className="ml-2 bg-red-500 text-xs">{pkg.badge_text}</Badge>}
                                      {(pkg as any).hidden_from_storefront ? (
                                        <Badge variant="secondary" className="ml-2 text-xs">
                                          Oculto
                                        </Badge>
                                      ) : null}
                                    </TableCell>
                                    <TableCell>{pkg.service_id}</TableCell>
                                    <TableCell>{pkg.base_quantity}</TableCell>
                                    <TableCell className="text-primary font-medium">{formatCurrency(pkg.base_price)}</TableCell>
                                    <TableCell>
                                      <Badge variant={pkg.is_active ? "default" : "secondary"}>
                                        {pkg.is_active ? "Ativo" : "Inativo"}
                                      </Badge>
                                    </TableCell>
                                    <TableCell className="text-right">
                                      <div
                                        className="flex justify-end gap-2"
                                        onClick={(e) => e.stopPropagation()}
                                        onPointerDown={(e) => e.stopPropagation()}
                                      >
                                        <Button
                                          size="icon"
                                          variant="outline"
                                          type="button"
                                          onPointerDown={(e) => e.stopPropagation()}
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            handleEdit(pkg);
                                          }}
                                          title="Editar"
                                        >
                                          <Edit className="w-4 h-4" />
                                        </Button>
                                        <Button
                                          size="icon"
                                          variant="outline"
                                          type="button"
                                          onPointerDown={(e) => e.stopPropagation()}
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            handleClone(pkg);
                                          }}
                                          title="Clonar"
                                        >
                                          <Copy className="w-4 h-4" />
                                        </Button>
                                        <AlertDialog>
                                          <AlertDialogTrigger asChild>
                                            <Button
                                              size="icon"
                                              variant="destructive"
                                              type="button"
                                              className="hidden md:inline-flex"
                                              onPointerDown={(e) => e.stopPropagation()}
                                              onClick={(e) => e.stopPropagation()}
                                              title="Excluir"
                                            >
                                              <Trash2 className="w-4 h-4" />
                                            </Button>
                                          </AlertDialogTrigger>
                                          <AlertDialogContent
                                            onPointerDown={(e) => e.stopPropagation()}
                                            onClick={(e) => e.stopPropagation()}
                                          >
                                            <AlertDialogHeader>
                                              <AlertDialogTitle>Excluir pacote?</AlertDialogTitle>
                                              <AlertDialogDescription>
                                                Esta ação não pode ser desfeita. O pacote será removido do sistema.
                                              </AlertDialogDescription>
                                            </AlertDialogHeader>
                                            <AlertDialogFooter>
                                              <AlertDialogCancel type="button">Cancelar</AlertDialogCancel>
                                              <AlertDialogAction
                                                type="button"
                                                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                                onClick={() => deleteMutation.mutate(pkg.id)}
                                              >
                                                Excluir
                                              </AlertDialogAction>
                                            </AlertDialogFooter>
                                          </AlertDialogContent>
                                        </AlertDialog>
                                      </div>
                                    </TableCell>
                                  </TableRow>
                                ))}
                              </TableBody>
                            </Table>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </section>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
  );
}
