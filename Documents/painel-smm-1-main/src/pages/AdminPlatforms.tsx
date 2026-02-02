import { useState, useMemo, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { 
  Search, 
  Plus, 
  Save, 
  Trash2, 
  Loader2, 
  Image as ImageIcon, 
  X,
  GripVertical,
  Link as LinkIcon,
  Unlink
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { 
  Card, 
  CardContent, 
  CardHeader, 
  CardTitle, 
  CardDescription 
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { getSupabaseClient } from "@/lib/supabaseClient";
import { useToast } from "@/hooks/use-toast";

interface Platform {
  id: string;
  name: string;
  icon_url: string;
  bg_color: string;
  keywords: string[];
  display_order: number;
  is_active: boolean;
}

interface PlatformCategoryLink {
  id: string;
  platform_id: string;
  category_name: string;
}

const BG_COLOR_OPTIONS = [
  { value: "bg-gradient-to-br from-purple-600 via-pink-500 to-orange-400", label: "Instagram" },
  { value: "bg-red-600", label: "Vermelho" },
  { value: "bg-gradient-to-br from-cyan-400 via-black to-pink-500", label: "TikTok" },
  { value: "bg-blue-600", label: "Azul (Facebook)" },
  { value: "bg-sky-500", label: "Azul claro (Twitter)" },
  { value: "bg-green-500", label: "Verde (Spotify)" },
  { value: "bg-purple-600", label: "Roxo (Twitch)" },
  { value: "bg-blue-700", label: "Azul escuro (LinkedIn)" },
  { value: "bg-indigo-500", label: "Índigo (Discord)" },
  { value: "bg-orange-500", label: "Laranja (SoundCloud)" },
  { value: "bg-gray-700", label: "Cinza" },
];

const AdminPlatforms = () => {
  const [search, setSearch] = useState("");
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [editingPlatform, setEditingPlatform] = useState<Platform | null>(null);
  const [linkDialogPlatform, setLinkDialogPlatform] = useState<Platform | null>(null);
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const { toast } = useToast();
  const supabase = getSupabaseClient();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Form state
  const [formData, setFormData] = useState({
    name: "",
    icon_url: "",
    bg_color: "bg-gray-700",
    keywords: "",
    is_active: true,
  });
  const [formSelectedCategories, setFormSelectedCategories] = useState<string[]>([]);
  const [categorySearch, setCategorySearch] = useState("");
  const [iconFile, setIconFile] = useState<File | null>(null);
  const [iconPreview, setIconPreview] = useState<string>("");

  // Fetch platforms
  const { data: platforms, isLoading: platformsLoading } = useQuery({
    queryKey: ["platform-icons"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("platform_icons")
        .select("*")
        .order("display_order");
      if (error) throw error;
      return data as Platform[];
    },
  });

  // Fetch platform-category links
  const { data: categoryLinks } = useQuery({
    queryKey: ["platform-category-links"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("platform_category_links")
        .select("*");
      if (error) throw error;
      return data as PlatformCategoryLink[];
    },
  });

  // Fetch all categories
  const { data: allCategories } = useQuery({
    queryKey: ["all-categories"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("imported_services")
        .select("category")
        .order("category");
      if (error) throw error;
      const uniqueCategories = [...new Set(data.map(s => s.category))];
      return uniqueCategories.sort();
    },
  });

  // Upload image to storage
  const uploadImage = async (file: File): Promise<string> => {
    const fileExt = file.name.split('.').pop();
    const fileName = `platform-${crypto.randomUUID()}.${fileExt}`;
    
    const { error: uploadError } = await supabase.storage
      .from('category-icons')
      .upload(fileName, file);
    
    if (uploadError) throw uploadError;
    
    const { data: { publicUrl } } = supabase.storage
      .from('category-icons')
      .getPublicUrl(fileName);
    
    return publicUrl;
  };

  // Delete image from storage
  const deleteImage = async (iconUrl: string) => {
    try {
      const url = new URL(iconUrl);
      const pathParts = url.pathname.split('/');
      const fileName = pathParts[pathParts.length - 1];
      
      await supabase.storage
        .from('category-icons')
        .remove([fileName]);
    } catch (e) {
      console.error('Error deleting image:', e);
    }
  };

  // Save platform mutation
  const saveMutation = useMutation({
    mutationFn: async (data: { 
      id?: string;
      name: string; 
      icon_url: string; 
      bg_color: string;
      keywords: string[];
      is_active: boolean;
      categories: string[];
    }) => {
      let platformId = data.id;
      
      if (data.id) {
        const { error } = await supabase
          .from("platform_icons")
          .update({
            name: data.name,
            icon_url: data.icon_url,
            bg_color: data.bg_color,
            keywords: data.keywords,
            is_active: data.is_active,
          })
          .eq("id", data.id);
        if (error) throw error;
      } else {
        const maxOrder = platforms?.reduce((max, p) => Math.max(max, p.display_order), 0) || 0;
        const { data: newPlatform, error } = await supabase
          .from("platform_icons")
          .insert({
            name: data.name,
            icon_url: data.icon_url,
            bg_color: data.bg_color,
            keywords: data.keywords,
            is_active: data.is_active,
            display_order: maxOrder + 1,
          })
          .select()
          .single();
        if (error) throw error;
        platformId = newPlatform.id;
      }

      // Save category links
      if (platformId) {
        await supabase
          .from("platform_category_links")
          .delete()
          .eq("platform_id", platformId);
        
        if (data.categories.length > 0) {
          const { error: linkError } = await supabase
            .from("platform_category_links")
            .insert(data.categories.map(cat => ({
              platform_id: platformId,
              category_name: cat,
            })));
          if (linkError) throw linkError;
        }
      }
    },
    onSuccess: () => {
      toast({ title: "Plataforma salva!" });
      queryClient.invalidateQueries({ queryKey: ["platform-icons"] });
      queryClient.invalidateQueries({ queryKey: ["platform-category-links"] });
      resetForm();
      setIsAddDialogOpen(false);
      setEditingPlatform(null);
    },
    onError: (error: any) => {
      toast({ title: "Erro ao salvar", description: error.message, variant: "destructive" });
    },
  });

  // Delete platform mutation
  const deleteMutation = useMutation({
    mutationFn: async (platform: Platform) => {
      await deleteImage(platform.icon_url);
      const { error } = await supabase
        .from("platform_icons")
        .delete()
        .eq("id", platform.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast({ title: "Plataforma removida!" });
      queryClient.invalidateQueries({ queryKey: ["platform-icons"] });
    },
    onError: (error: any) => {
      toast({ title: "Erro ao remover", description: error.message, variant: "destructive" });
    },
  });

  // Save category links mutation
  const saveLinksMutation = useMutation({
    mutationFn: async ({ platformId, categories }: { platformId: string; categories: string[] }) => {
      // Delete existing links
      await supabase
        .from("platform_category_links")
        .delete()
        .eq("platform_id", platformId);
      
      // Insert new links
      if (categories.length > 0) {
        const { error } = await supabase
          .from("platform_category_links")
          .insert(categories.map(cat => ({
            platform_id: platformId,
            category_name: cat,
          })));
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast({ title: "Categorias vinculadas!" });
      queryClient.invalidateQueries({ queryKey: ["platform-category-links"] });
      setLinkDialogPlatform(null);
    },
    onError: (error: any) => {
      toast({ title: "Erro ao vincular", description: error.message, variant: "destructive" });
    },
  });

  const resetForm = () => {
    setFormData({
      name: "",
      icon_url: "",
      bg_color: "bg-gray-700",
      keywords: "",
      is_active: true,
    });
    setIconFile(null);
    setIconPreview("");
    setFormSelectedCategories([]);
    setCategorySearch("");
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    setIconFile(file);
    setIconPreview(URL.createObjectURL(file));
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    const items = e.clipboardData.items;
    for (let i = 0; i < items.length; i++) {
      if (items[i].type.startsWith('image/')) {
        e.preventDefault();
        const file = items[i].getAsFile();
        if (file) {
          setIconFile(file);
          setIconPreview(URL.createObjectURL(file));
        }
        return;
      }
    }
  };

  const handleSave = async () => {
    if (!formData.name.trim()) {
      toast({ title: "Nome obrigatório", variant: "destructive" });
      return;
    }

    let iconUrl = formData.icon_url;
    
    if (iconFile) {
      iconUrl = await uploadImage(iconFile);
    }

    if (!iconUrl) {
      toast({ title: "Ícone obrigatório", variant: "destructive" });
      return;
    }

    const keywords = formData.keywords
      .split(",")
      .map(k => k.trim().toLowerCase())
      .filter(k => k);

    saveMutation.mutate({
      id: editingPlatform?.id,
      name: formData.name.trim(),
      icon_url: iconUrl,
      bg_color: formData.bg_color,
      keywords,
      is_active: formData.is_active,
      categories: formSelectedCategories,
    });
  };

  const openEditDialog = (platform: Platform) => {
    setEditingPlatform(platform);
    setFormData({
      name: platform.name,
      icon_url: platform.icon_url,
      bg_color: platform.bg_color,
      keywords: platform.keywords.join(", "),
      is_active: platform.is_active,
    });
    setIconPreview(platform.icon_url);
    // Load linked categories for this platform
    const linkedCategories = categoryLinks
      ?.filter(link => link.platform_id === platform.id)
      .map(link => link.category_name) || [];
    setFormSelectedCategories(linkedCategories);
    setIsAddDialogOpen(true);
  };

  const openLinkDialog = (platform: Platform) => {
    const linkedCategories = categoryLinks
      ?.filter(link => link.platform_id === platform.id)
      .map(link => link.category_name) || [];
    setSelectedCategories(linkedCategories);
    setLinkDialogPlatform(platform);
  };

  const toggleCategory = (category: string) => {
    setSelectedCategories(prev => 
      prev.includes(category)
        ? prev.filter(c => c !== category)
        : [...prev, category]
    );
  };

  const filteredPlatforms = useMemo(() => {
    if (!platforms) return [];
    return platforms.filter(p => 
      p.name.toLowerCase().includes(search.toLowerCase())
    );
  }, [platforms, search]);

  const getLinkedCategoriesCount = (platformId: string) => {
    return categoryLinks?.filter(link => link.platform_id === platformId).length || 0;
  };

  return (
    <div className="space-y-6 p-4 sm:p-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold gradient-text flex items-center gap-2">
            <ImageIcon className="w-6 h-6 sm:w-8 sm:h-8" />
            Plataformas
          </h1>
          <p className="text-muted-foreground mt-1 text-sm sm:text-base">
            Gerencie as plataformas exibidas no filtro
          </p>
        </div>
        
        <Dialog open={isAddDialogOpen} onOpenChange={(open) => {
          setIsAddDialogOpen(open);
          if (!open) {
            resetForm();
            setEditingPlatform(null);
          }
        }}>
          <DialogTrigger asChild>
            <Button className="gap-2 text-sm" size="sm">
              <Plus className="w-4 h-4" />
              Nova Plataforma
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>
                {editingPlatform ? "Editar Plataforma" : "Nova Plataforma"}
              </DialogTitle>
              <DialogDescription>
                Configure o nome, ícone e cor de fundo da plataforma.
              </DialogDescription>
            </DialogHeader>
            
            <div className="space-y-4 py-4">
              {/* Name */}
              <div className="space-y-2">
                <Label>Nome</Label>
                <Input
                  value={formData.name}
                  onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                  placeholder="Ex: Instagram"
                />
              </div>

              {/* Icon */}
              <div className="space-y-2">
                <Label>Ícone</Label>
                <div className="flex items-center gap-4">
                  {iconPreview ? (
                    <div className="relative">
                      <div className={`w-16 h-16 rounded-xl overflow-hidden ${formData.bg_color} p-2 flex items-center justify-center`}>
                        <img 
                          src={iconPreview} 
                          alt="preview" 
                          className="w-10 h-10 object-contain"
                        />
                      </div>
                      <button
                        onClick={() => {
                          setIconFile(null);
                          setIconPreview("");
                          setFormData(prev => ({ ...prev, icon_url: "" }));
                        }}
                        className="absolute -top-1 -right-1 w-5 h-5 bg-destructive rounded-full flex items-center justify-center"
                      >
                        <X className="w-3 h-3 text-white" />
                      </button>
                    </div>
                  ) : (
                    <div 
                      className={`w-16 h-16 rounded-xl ${formData.bg_color} flex items-center justify-center cursor-pointer border-2 border-dashed border-muted-foreground/50`}
                      onClick={() => fileInputRef.current?.click()}
                    >
                      <ImageIcon className="w-6 h-6 text-white/50" />
                    </div>
                  )}
                  <div className="flex-1">
                    <Input
                      placeholder="Cole uma imagem (Ctrl+V) ou clique para selecionar"
                      onPaste={handlePaste}
                      onClick={() => fileInputRef.current?.click()}
                      readOnly
                      className="cursor-pointer"
                    />
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={handleFileSelect}
                    />
                  </div>
                </div>
              </div>

              {/* Background Color */}
              <div className="space-y-2">
                <Label>Cor de Fundo</Label>
                <Select
                  value={formData.bg_color}
                  onValueChange={(value) => setFormData(prev => ({ ...prev, bg_color: value }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {BG_COLOR_OPTIONS.map(option => (
                      <SelectItem key={option.value} value={option.value}>
                        <div className="flex items-center gap-2">
                          <div className={`w-4 h-4 rounded ${option.value}`} />
                          {option.label}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Keywords */}
              <div className="space-y-2">
                <Label>Palavras-chave (separadas por vírgula)</Label>
                <Input
                  value={formData.keywords}
                  onChange={(e) => setFormData(prev => ({ ...prev, keywords: e.target.value }))}
                  placeholder="Ex: instagram, ig, insta"
                />
                <p className="text-xs text-muted-foreground">
                  Palavras usadas para detectar automaticamente a plataforma nas categorias
                </p>
              </div>

              {/* Categories */}
              <div className="space-y-2">
                <Label>Categorias Vinculadas</Label>
                <div className="relative mb-2">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    value={categorySearch}
                    onChange={(e) => setCategorySearch(e.target.value)}
                    placeholder="Buscar categorias..."
                    className="pl-9"
                  />
                </div>
                
                {formSelectedCategories.length > 0 && (
                  <div className="flex flex-wrap gap-1 mb-2 p-2 bg-muted/50 rounded-lg">
                    {formSelectedCategories.map(cat => (
                      <Badge key={cat} variant="default" className="gap-1">
                        {cat.length > 30 ? cat.substring(0, 30) + "..." : cat}
                        <button 
                          onClick={() => setFormSelectedCategories(prev => prev.filter(c => c !== cat))}
                          className="ml-1 hover:bg-white/20 rounded-full"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </Badge>
                    ))}
                  </div>
                )}

                <div className="max-h-48 overflow-y-auto border rounded-lg p-2 space-y-1">
                  {allCategories
                    ?.filter(cat => cat.toLowerCase().includes(categorySearch.toLowerCase()))
                    .slice(0, 50)
                    .map(category => (
                      <button
                        key={category}
                        type="button"
                        onClick={() => {
                          setFormSelectedCategories(prev => 
                            prev.includes(category) 
                              ? prev.filter(c => c !== category)
                              : [...prev, category]
                          );
                        }}
                        className={`w-full text-left px-3 py-2 rounded-md text-sm transition-colors flex items-center gap-2 ${
                          formSelectedCategories.includes(category)
                            ? "bg-primary/20 text-primary"
                            : "hover:bg-muted"
                        }`}
                      >
                        <div className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 ${
                          formSelectedCategories.includes(category)
                            ? "bg-primary border-primary"
                            : "border-muted-foreground"
                        }`}>
                          {formSelectedCategories.includes(category) && (
                            <span className="text-white text-xs">✓</span>
                          )}
                        </div>
                        <span className="truncate">{category}</span>
                      </button>
                    ))}
                  {allCategories?.filter(cat => cat.toLowerCase().includes(categorySearch.toLowerCase())).length === 0 && (
                    <p className="text-center text-muted-foreground text-sm py-4">
                      Nenhuma categoria encontrada
                    </p>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">
                  {formSelectedCategories.length} categoria(s) selecionada(s)
                </p>
              </div>

              {/* Active */}
              <div className="flex items-center justify-between">
                <Label>Ativo</Label>
                <Switch
                  checked={formData.is_active}
                  onCheckedChange={(checked) => setFormData(prev => ({ ...prev, is_active: checked }))}
                />
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => {
                setIsAddDialogOpen(false);
                resetForm();
                setEditingPlatform(null);
              }}>
                Cancelar
              </Button>
              <Button onClick={handleSave} disabled={saveMutation.isPending}>
                {saveMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                Salvar
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* Search */}
      <Card className="glass-card border-border/50">
        <CardContent className="pt-6">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
            <Input
              placeholder="Buscar plataforma..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-10"
            />
          </div>
        </CardContent>
      </Card>

      {/* Platforms Table */}
      {platformsLoading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      ) : (
        <Card className="glass-card border-border/50 overflow-hidden">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent border-border/50">
                  <TableHead className="w-20">Ícone</TableHead>
                  <TableHead>Nome</TableHead>
                  <TableHead>Palavras-chave</TableHead>
                  <TableHead className="text-center">Categorias</TableHead>
                  <TableHead className="text-center">Status</TableHead>
                  <TableHead className="w-32 text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredPlatforms.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-10 text-muted-foreground">
                      Nenhuma plataforma cadastrada
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredPlatforms.map((platform) => (
                    <TableRow key={platform.id} className="border-border/50">
                      <TableCell>
                        <div className={`w-12 h-12 rounded-xl ${platform.bg_color} p-2 flex items-center justify-center`}>
                          <img 
                            src={platform.icon_url} 
                            alt={platform.name} 
                            className="w-8 h-8 object-contain"
                          />
                        </div>
                      </TableCell>
                      <TableCell className="font-medium">{platform.name}</TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          {platform.keywords.slice(0, 3).map(kw => (
                            <Badge key={kw} variant="secondary" className="text-xs">
                              {kw}
                            </Badge>
                          ))}
                          {platform.keywords.length > 3 && (
                            <Badge variant="outline" className="text-xs">
                              +{platform.keywords.length - 3}
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-center">
                        <Badge variant={getLinkedCategoriesCount(platform.id) > 0 ? "default" : "outline"}>
                          {getLinkedCategoriesCount(platform.id)} vinculadas
                        </Badge>
                      </TableCell>
                      <TableCell className="text-center">
                        <Badge variant={platform.is_active ? "default" : "secondary"}>
                          {platform.is_active ? "Ativo" : "Inativo"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => openLinkDialog(platform)}
                            title="Vincular categorias"
                          >
                            <LinkIcon className="w-4 h-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => openEditDialog(platform)}
                          >
                            <Save className="w-4 h-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => deleteMutation.mutate(platform)}
                            className="text-destructive hover:text-destructive"
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </Card>
      )}

      {/* Link Categories Dialog */}
      <Dialog open={!!linkDialogPlatform} onOpenChange={(open) => !open && setLinkDialogPlatform(null)}>
        <DialogContent className="max-w-2xl max-h-[80vh]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-3">
              {linkDialogPlatform && (
                <div className={`w-10 h-10 rounded-lg ${linkDialogPlatform.bg_color} p-1.5 flex items-center justify-center`}>
                  <img 
                    src={linkDialogPlatform.icon_url} 
                    alt={linkDialogPlatform.name} 
                    className="w-6 h-6 object-contain"
                  />
                </div>
              )}
              Vincular Categorias - {linkDialogPlatform?.name}
            </DialogTitle>
            <DialogDescription>
              Selecione as categorias que pertencem a esta plataforma.
            </DialogDescription>
          </DialogHeader>

          <div className="py-4 max-h-96 overflow-y-auto">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {allCategories?.map((category) => (
                <button
                  key={category}
                  onClick={() => toggleCategory(category)}
                  className={`text-left p-3 rounded-lg border transition-colors ${
                    selectedCategories.includes(category)
                      ? "bg-primary/10 border-primary"
                      : "border-border/50 hover:border-primary/50"
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <div className={`w-5 h-5 rounded border flex items-center justify-center ${
                      selectedCategories.includes(category)
                        ? "bg-primary border-primary"
                        : "border-muted-foreground"
                    }`}>
                      {selectedCategories.includes(category) && (
                        <span className="text-white text-xs">✓</span>
                      )}
                    </div>
                    <span className="text-sm truncate">{category}</span>
                  </div>
                </button>
              ))}
            </div>
          </div>

          <DialogFooter className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              {selectedCategories.length} categorias selecionadas
            </p>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setLinkDialogPlatform(null)}>
                Cancelar
              </Button>
              <Button 
                onClick={() => {
                  if (linkDialogPlatform) {
                    saveLinksMutation.mutate({
                      platformId: linkDialogPlatform.id,
                      categories: selectedCategories,
                    });
                  }
                }}
                disabled={saveLinksMutation.isPending}
              >
                {saveLinksMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                Salvar
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AdminPlatforms;
