import { useState, useMemo, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Search, Smile, Save, Trash2, Loader2, Image as ImageIcon, X } from "lucide-react";
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
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { getSupabaseClient } from "@/lib/supabaseClient";
import { useToast } from "@/hooks/use-toast";
import { detectPlatformIcon } from "@/lib/platformIcons";

interface CategoryIcon {
  id: string;
  category_name: string;
  icon: string;
  icon_type: 'emoji' | 'image';
}

interface EditingIcon {
  value: string;
  type: 'emoji' | 'image';
  file?: File;
  preview?: string;
}

const AdminCategoryIcons = () => {
  const [search, setSearch] = useState("");
  const [editingIcons, setEditingIcons] = useState<Record<string, EditingIcon>>({});
  const [uploadingCategory, setUploadingCategory] = useState<string | null>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Fetch all category icons
  const { data: categoryIcons, isLoading: iconsLoading } = useQuery({
    queryKey: ["category-icons"],
    queryFn: async () => {
      const supabase = getSupabaseClient();
      const { data, error } = await supabase
        .from("category_icons")
        .select("*")
        .order("category_name");
      if (error) throw error;
      return data as CategoryIcon[];
    },
  });

  // Fetch all unique categories from imported services
  const { data: categories, isLoading: categoriesLoading } = useQuery({
    queryKey: ["all-categories"],
    queryFn: async () => {
      const supabase = getSupabaseClient();
      const { data, error } = await supabase
        .from("imported_services")
        .select("category")
        .order("category");
      if (error) throw error;
      const uniqueCategories = [...new Set(data.map(s => s.category))];
      return uniqueCategories.sort();
    },
  });

  // Map of category to icon
  const iconsMap = useMemo(() => {
    const map: Record<string, CategoryIcon> = {};
    categoryIcons?.forEach((ci) => {
      map[ci.category_name] = ci;
    });
    return map;
  }, [categoryIcons]);

  // Upload image to storage
  const uploadImage = async (file: File, category: string): Promise<string> => {
    const fileExt = file.name.split('.').pop();
    const fileName = `${crypto.randomUUID()}.${fileExt}`;
    const supabase = getSupabaseClient();
    
    const { error: uploadError } = await supabase.storage
      .from('category-icons')
      .upload(fileName, file);
    
    if (uploadError) throw uploadError;
    
    const { data: { publicUrl } } = supabase.storage
      .from('category-icons')
      .getPublicUrl(fileName);
    
    return publicUrl;
  };

  // Delete old image from storage
  const deleteOldImage = async (iconUrl: string) => {
    try {
      const url = new URL(iconUrl);
      const pathParts = url.pathname.split('/');
      const fileName = pathParts[pathParts.length - 1];
      const supabase = getSupabaseClient();
      
      await supabase.storage
        .from('category-icons')
        .remove([fileName]);
    } catch (e) {
      console.error('Error deleting old image:', e);
    }
  };

  // Save icon mutation
  const saveMutation = useMutation({
    mutationFn: async ({ category, icon, iconType }: { category: string; icon: string; iconType: 'emoji' | 'image' }) => {
      const existing = categoryIcons?.find(ci => ci.category_name === category);
      const supabase = getSupabaseClient();
      
      // If there's an existing image icon, delete it from storage
      if (existing?.icon_type === 'image' && iconType !== 'image') {
        await deleteOldImage(existing.icon);
      }
      
      if (existing) {
        const { error } = await supabase
          .from("category_icons")
          .update({ icon, icon_type: iconType })
          .eq("id", existing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("category_icons")
          .insert({ category_name: category, icon, icon_type: iconType });
        if (error) throw error;
      }
    },
    onSuccess: (_, variables) => {
      toast({
        title: "Ícone salvo!",
        description: `Ícone definido para a categoria.`,
      });
      queryClient.invalidateQueries({ queryKey: ["category-icons"] });
      setEditingIcons(prev => {
        const next = { ...prev };
        delete next[variables.category];
        return next;
      });
    },
    onError: (error) => {
      toast({
        title: "Erro ao salvar",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Delete icon mutation
  const deleteMutation = useMutation({
    mutationFn: async (category: string) => {
      const existing = iconsMap[category];
      const supabase = getSupabaseClient();
      
      // Delete image from storage if it's an image
      if (existing?.icon_type === 'image') {
        await deleteOldImage(existing.icon);
      }
      
      const { error } = await supabase
        .from("category_icons")
        .delete()
        .eq("category_name", category);
      if (error) throw error;
    },
    onSuccess: () => {
      toast({
        title: "Ícone removido!",
        description: "O ícone personalizado foi removido.",
      });
      queryClient.invalidateQueries({ queryKey: ["category-icons"] });
    },
    onError: (error) => {
      toast({
        title: "Erro ao remover",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Filter categories
  const filteredCategories = useMemo(() => {
    if (!categories) return [];
    return categories.filter(cat => 
      cat.toLowerCase().includes(search.toLowerCase())
    );
  }, [categories, search]);

  const handleIconChange = (category: string, value: string) => {
    setEditingIcons(prev => ({ 
      ...prev, 
      [category]: { value, type: 'emoji' } 
    }));
  };

  const handlePaste = async (category: string, e: React.ClipboardEvent) => {
    const items = e.clipboardData.items;
    
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      
      if (item.type.startsWith('image/')) {
        e.preventDefault();
        const file = item.getAsFile();
        if (!file) continue;
        
        // Create preview
        const preview = URL.createObjectURL(file);
        setEditingIcons(prev => ({
          ...prev,
          [category]: { value: '', type: 'image', file, preview }
        }));
        
        return;
      }
    }
  };

  const handleFileSelect = (category: string, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    const preview = URL.createObjectURL(file);
    setEditingIcons(prev => ({
      ...prev,
      [category]: { value: '', type: 'image', file, preview }
    }));
  };

  const clearEditingIcon = (category: string) => {
    const editing = editingIcons[category];
    if (editing?.preview) {
      URL.revokeObjectURL(editing.preview);
    }
    setEditingIcons(prev => {
      const next = { ...prev };
      delete next[category];
      return next;
    });
  };

  const handleSave = async (category: string) => {
    const editing = editingIcons[category];
    if (!editing) return;
    
    setUploadingCategory(category);
    
    try {
      if (editing.type === 'image' && editing.file) {
        // Upload image and save URL
        const imageUrl = await uploadImage(editing.file, category);
        await saveMutation.mutateAsync({ category, icon: imageUrl, iconType: 'image' });
        
        // Clean up preview
        if (editing.preview) {
          URL.revokeObjectURL(editing.preview);
        }
      } else if (editing.type === 'emoji' && editing.value?.trim()) {
        await saveMutation.mutateAsync({ category, icon: editing.value.trim(), iconType: 'emoji' });
      } else {
        toast({
          title: "Ícone inválido",
          description: "Cole uma imagem ou digite um emoji.",
          variant: "destructive",
        });
      }
    } catch (error: any) {
      toast({
        title: "Erro ao salvar",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setUploadingCategory(null);
    }
  };

  const [isSavingAll, setIsSavingAll] = useState(false);
  
  const pendingChangesCount = Object.keys(editingIcons).length;

  const handleSaveAll = async () => {
    const categoriesToSave = Object.keys(editingIcons);
    if (categoriesToSave.length === 0) return;
    
    setIsSavingAll(true);
    let successCount = 0;
    let errorCount = 0;
    
    for (const category of categoriesToSave) {
      const editing = editingIcons[category];
      if (!editing) continue;
      
      try {
        if (editing.type === 'image' && editing.file) {
          const imageUrl = await uploadImage(editing.file, category);
          await saveMutation.mutateAsync({ category, icon: imageUrl, iconType: 'image' });
          
          if (editing.preview) {
            URL.revokeObjectURL(editing.preview);
          }
          successCount++;
        } else if (editing.type === 'emoji' && editing.value?.trim()) {
          await saveMutation.mutateAsync({ category, icon: editing.value.trim(), iconType: 'emoji' });
          successCount++;
        }
      } catch (error) {
        errorCount++;
        console.error(`Erro ao salvar ${category}:`, error);
      }
    }
    
    setIsSavingAll(false);
    
    if (successCount > 0) {
      toast({
        title: "Ícones salvos!",
        description: `${successCount} ícone(s) salvo(s) com sucesso.${errorCount > 0 ? ` ${errorCount} erro(s).` : ''}`,
      });
    }
  };

  const handleDelete = (category: string) => {
    deleteMutation.mutate(category);
  };

  const getDisplayIcon = (category: string) => {
    const editing = editingIcons[category];
    
    // Check editing state first
    if (editing) {
      if (editing.type === 'image' && editing.preview) {
        return { type: 'image' as const, value: editing.preview };
      }
      if (editing.type === 'emoji' && editing.value) {
        return { type: 'emoji' as const, value: editing.value };
      }
    }
    
    // Then check saved icons
    const saved = iconsMap[category];
    if (saved) {
      return { type: saved.icon_type, value: saved.icon };
    }
    
    // Then auto-detect
    const autoDetected = detectPlatformIcon(category);
    if (autoDetected) {
      return { type: 'emoji' as const, value: autoDetected.icon };
    }
    
    return null;
  };

  const isLoading = iconsLoading || categoriesLoading;

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold gradient-text flex items-center gap-2">
          <Smile className="w-8 h-8" />
          Ícones das Categorias
        </h1>
        <p className="text-muted-foreground mt-1">
          Personalize os ícones/emojis ou imagens exibidos ao lado de cada categoria
        </p>
      </div>

      {/* Info Card */}
      <Card className="glass-card border-border/50">
        <CardHeader className="pb-3">
          <CardTitle className="text-lg">Como funciona?</CardTitle>
          <CardDescription>
            Os ícones são detectados automaticamente baseado no nome da categoria (Instagram → 📸, TikTok → 🎵, etc). 
            Você pode sobrescrever o ícone automático digitando um emoji ou <strong>colando uma imagem</strong> (Ctrl+V) no campo.
          </CardDescription>
        </CardHeader>
      </Card>

      {/* Search and Save All */}
      <Card className="glass-card border-border/50">
        <CardContent className="pt-6">
          <div className="flex items-center gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
              <Input
                placeholder="Buscar categoria..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-10"
              />
            </div>
            <Button
              onClick={handleSaveAll}
              disabled={pendingChangesCount === 0 || isSavingAll}
              className="gap-2"
            >
              {isSavingAll ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Save className="w-4 h-4" />
              )}
              Salvar Tudo {pendingChangesCount > 0 && `(${pendingChangesCount})`}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Categories Table */}
      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      ) : (
        <Card className="glass-card border-border/50 overflow-hidden">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent border-border/50">
                  <TableHead className="w-24">Ícone Atual</TableHead>
                  <TableHead>Categoria</TableHead>
                  <TableHead className="w-40">Novo Ícone</TableHead>
                  <TableHead className="w-24 text-center">Status</TableHead>
                  <TableHead className="w-32 text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredCategories.map((category) => {
                  const saved = iconsMap[category];
                  const autoIcon = detectPlatformIcon(category)?.icon;
                  const currentIcon = getDisplayIcon(category);
                  const editing = editingIcons[category];
                  const isEditing = editing !== undefined;
                  const isUploading = uploadingCategory === category;
                  
                  return (
                    <TableRow key={category} className="border-border/50">
                      <TableCell>
                        {currentIcon ? (
                          currentIcon.type === 'image' ? (
                            <img 
                              src={currentIcon.value} 
                              alt="icon" 
                              className="w-8 h-8 object-contain rounded"
                            />
                          ) : (
                            <span className="text-2xl">{currentIcon.value}</span>
                          )
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell className="font-medium">{category}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          {editing?.type === 'image' && editing.preview ? (
                            <div className="relative">
                              <img 
                                src={editing.preview} 
                                alt="preview" 
                                className="w-10 h-10 object-contain rounded border border-border"
                              />
                              <button
                                onClick={() => clearEditingIcon(category)}
                                className="absolute -top-1 -right-1 w-4 h-4 bg-destructive rounded-full flex items-center justify-center"
                              >
                                <X className="w-3 h-3 text-white" />
                              </button>
                            </div>
                          ) : saved?.icon_type === 'image' && !editing ? (
                            <div className="flex items-center gap-2">
                              <img 
                                src={saved.icon} 
                                alt="icon" 
                                className="w-10 h-10 object-contain rounded border border-border"
                              />
                              <label className="cursor-pointer">
                                <Button variant="ghost" size="sm" className="h-8 px-2" asChild>
                                  <span>
                                    <ImageIcon className="w-4 h-4" />
                                  </span>
                                </Button>
                                <input
                                  type="file"
                                  accept="image/*"
                                  className="hidden"
                                  onChange={(e) => handleFileSelect(category, e)}
                                />
                              </label>
                            </div>
                          ) : (
                            <div className="relative flex-1">
                              <Input
                                value={editing?.value ?? (saved?.icon_type === 'emoji' ? saved.icon : "") ?? ""}
                                onChange={(e) => handleIconChange(category, e.target.value)}
                                onPaste={(e) => handlePaste(category, e)}
                                placeholder={autoIcon || "Cole 🖼️ ou emoji"}
                                className="w-28 text-center text-lg pr-8"
                                maxLength={8}
                              />
                              <label className="absolute right-2 top-1/2 -translate-y-1/2 cursor-pointer">
                                <ImageIcon className="w-4 h-4 text-muted-foreground hover:text-foreground" />
                                <input
                                  type="file"
                                  accept="image/*"
                                  className="hidden"
                                  onChange={(e) => handleFileSelect(category, e)}
                                />
                              </label>
                            </div>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-center">
                        {saved ? (
                          <span className={`inline-flex items-center gap-1 text-xs px-2 py-1 rounded-full ${
                            saved.icon_type === 'image' 
                              ? 'text-violet-400 bg-violet-500/20'
                              : 'text-emerald-400 bg-emerald-500/20'
                          }`}>
                            {saved.icon_type === 'image' ? 'Imagem' : 'Personalizado'}
                          </span>
                        ) : autoIcon ? (
                          <span className="inline-flex items-center gap-1 text-xs text-cyan-400 bg-cyan-500/20 px-2 py-1 rounded-full">
                            Auto
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-xs text-muted-foreground bg-muted px-2 py-1 rounded-full">
                            Nenhum
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-2">
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => handleSave(category)}
                            disabled={!isEditing || isUploading}
                            className="h-8 w-8 p-0"
                          >
                            {isUploading ? (
                              <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                              <Save className="w-4 h-4" />
                            )}
                          </Button>
                          {saved && (
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => handleDelete(category)}
                              disabled={deleteMutation.isPending}
                              className="h-8 w-8 p-0 text-destructive hover:text-destructive"
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
          <div className="p-4 border-t border-border/50 text-sm text-muted-foreground">
            Mostrando {filteredCategories.length} categorias
          </div>
        </Card>
      )}
    </div>
  );
};

export default AdminCategoryIcons;
