import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { getSupabaseClient } from "@/lib/supabaseClient";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Switch } from "@/components/ui/switch";
import {
  Search,
  Save,
  Image,
  Upload,
  Trash2,
  Globe,
  Share2,
  FileCode,
  Loader2,
  ExternalLink,
  Package,
  Sparkles,
} from "lucide-react";

interface SiteSettings {
  id: string;
  site_title: string;
  site_description: string;
  meta_keywords: string | null;
  og_title: string | null;
  og_description: string | null;
  og_image_url: string | null;
  twitter_card: string | null;
  twitter_title: string | null;
  twitter_description: string | null;
  favicon_url: string | null;
  robots_content: string | null;
  canonical_url: string | null;
  google_analytics_id: string | null;
  services_page_public: boolean;
  updated_at: string;
}

const AdminSEO = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isAdmin, setIsAdmin] = useState(false);
  const [formData, setFormData] = useState<SiteSettings | null>(null);
  const [uploadingFavicon, setUploadingFavicon] = useState(false);
  const [uploadingOgImage, setUploadingOgImage] = useState(false);
  const [generatingTitle, setGeneratingTitle] = useState(false);
  const [generatingDescription, setGeneratingDescription] = useState(false);
  const [generatingKeywords, setGeneratingKeywords] = useState(false);
  const [generatingAll, setGeneratingAll] = useState(false);
  const faviconInputRef = useRef<HTMLInputElement>(null);
  const ogImageInputRef = useRef<HTMLInputElement>(null);

  // Check admin status
  useEffect(() => {
    const checkAdmin = async () => {
      if (!user) {
        navigate("/auth");
        return;
      }

      const supabase = getSupabaseClient();
      const { data: roleData } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", user.id)
        .eq("role", "admin")
        .maybeSingle();

      if (!roleData) {
        toast({
          title: "Acesso negado",
          description: "Você não tem permissão para acessar esta página.",
          variant: "destructive",
        });
        navigate("/");
        return;
      }

      setIsAdmin(true);
    };

    checkAdmin();
  }, [user, navigate, toast]);

  // Fetch site settings
  const { data: settings, isLoading } = useQuery({
    queryKey: ["site-settings"],
    queryFn: async () => {
      const supabase = getSupabaseClient();
      const { data, error } = await supabase
        .from("site_settings")
        .select("*")
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data as SiteSettings;
    },
    enabled: isAdmin,
  });

  // Update form data when settings load
  useEffect(() => {
    if (settings) {
      setFormData(settings);
    }
  }, [settings]);

  // Save mutation
  const saveMutation = useMutation({
    mutationFn: async (data: Partial<SiteSettings>) => {
      if (!formData?.id) throw new Error("No settings ID");

      const supabase = getSupabaseClient();
      const { error } = await supabase
        .from("site_settings")
        .update({
          ...data,
          updated_at: new Date().toISOString(),
          updated_by: user?.id,
        })
        .eq("id", formData.id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["site-settings"] });
      // Keep branding + SEO in sync across the app (Auth/Header/Sidebars/SEOHead)
      queryClient.invalidateQueries({ queryKey: ["site-name"] });
      queryClient.invalidateQueries({ queryKey: ["site-settings-seo"] });
      toast({
        title: "Salvo com sucesso!",
        description: "As configurações de SEO foram atualizadas.",
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

  const handleInputChange = (field: keyof SiteSettings, value: string | boolean | number | null) => {
    if (formData) {
      setFormData({ ...formData, [field]: value });
    }
  };

  const handleSave = () => {
    if (formData) {
      saveMutation.mutate(formData);
    }
  };

  const uploadImage = async (file: File, type: "favicon" | "og-image") => {
    const setUploading = type === "favicon" ? setUploadingFavicon : setUploadingOgImage;
    setUploading(true);

    const supabase = getSupabaseClient();
    try {
      const fileExt = file.name.split(".").pop();
      const fileName = `${type}-${Date.now()}.${fileExt}`;
      const filePath = fileName;

      const { error: uploadError } = await supabase.storage
        .from("site-assets")
        .upload(filePath, file, { upsert: true });

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from("site-assets")
        .getPublicUrl(filePath);

      // Update form data
      if (type === "favicon") {
        handleInputChange("favicon_url", publicUrl);
      } else {
        handleInputChange("og_image_url", publicUrl);
      }

      toast({
        title: "Upload concluído!",
        description: `${type === "favicon" ? "Favicon" : "Imagem de preview"} enviada com sucesso.`,
      });
    } catch (error: any) {
      toast({
        title: "Erro no upload",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setUploading(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>, type: "favicon" | "og-image") => {
    const file = e.target.files?.[0];
    if (file) {
      uploadImage(file, type);
    }
  };

  const removeImage = (type: "favicon" | "og-image") => {
    if (type === "favicon") {
      handleInputChange("favicon_url", "");
    } else {
      handleInputChange("og_image_url", "");
    }
  };

  const generateWithAI = async (type: "title" | "description" | "keywords" | "all") => {
    const setLoading = {
      title: setGeneratingTitle,
      description: setGeneratingDescription,
      keywords: setGeneratingKeywords,
      all: setGeneratingAll,
    }[type];

    setLoading(true);

    const supabase = getSupabaseClient();
    try {
      const { data, error } = await supabase.functions.invoke("seo-generate", {
        body: {
          type,
          currentTitle: formData?.site_title,
          currentDescription: formData?.site_description,
          siteName: formData?.site_title?.split(" - ")[0] || formData?.site_title,
        },
      });

      if (error) throw error;

      if (data.error) {
        throw new Error(data.error);
      }

      if (type === "all" && data.title && data.description && data.keywords) {
        setFormData((prev) => prev ? {
          ...prev,
          site_title: data.title,
          site_description: data.description,
          meta_keywords: data.keywords,
        } : null);
        toast({
          title: "Conteúdo SEO gerado!",
          description: "Título, descrição e palavras-chave foram atualizados.",
        });
      } else if (type === "title" && data.title) {
        handleInputChange("site_title", data.title);
        toast({ title: "Título gerado!", description: data.title });
      } else if (type === "description" && data.description) {
        handleInputChange("site_description", data.description);
        toast({ title: "Descrição gerada!", description: data.description });
      } else if (type === "keywords" && data.keywords) {
        handleInputChange("meta_keywords", data.keywords);
        toast({ title: "Palavras-chave geradas!", description: data.keywords });
      }
    } catch (error: any) {
      console.error("AI generation error:", error);
      toast({
        title: "Erro ao gerar",
        description: error.message || "Não foi possível gerar o conteúdo.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  if (!isAdmin) {
    return null;
  }

  if (isLoading || !formData) {
    return (
      <div className="space-y-6 p-6">
        <Skeleton className="h-10 w-64" />
        <div className="grid gap-4">
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-32 w-full" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold gradient-text flex items-center gap-2">
            <Search className="w-8 h-8" />
            SEO & Marketing
          </h1>
          <p className="text-muted-foreground mt-1">
            Configure título, descrição, favicon e imagens de compartilhamento
          </p>
        </div>
        <Button onClick={handleSave} disabled={saveMutation.isPending}>
          <Save className="w-4 h-4 mr-2" />
          {saveMutation.isPending ? "Salvando..." : "Salvar Alterações"}
        </Button>
      </div>

      <Accordion type="multiple" defaultValue={["basic", "images", "social", "advanced"]} className="space-y-4">
        {/* Basic SEO */}
        <AccordionItem value="basic" className="border rounded-lg overflow-hidden">
          <AccordionTrigger className="px-4 py-3 bg-gradient-to-r from-cyan-500/20 to-transparent hover:no-underline">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-cyan-500/30 flex items-center justify-center">
                <Globe className="w-4 h-4 text-cyan-300" />
              </div>
              <span className="font-semibold">SEO Básico</span>
            </div>
          </AccordionTrigger>
          <AccordionContent className="px-4 py-4">
            <div className="grid gap-4">
              {/* AI Generate All Button */}
              <div className="flex justify-end">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => generateWithAI("all")}
                  disabled={generatingAll}
                  className="gap-2 border-primary/50 text-primary hover:bg-primary/10"
                >
                  {generatingAll ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Sparkles className="w-4 h-4" />
                  )}
                  {generatingAll ? "Gerando..." : "Gerar tudo com IA"}
                </Button>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <Label>Título do Site (aparece na aba do navegador)</Label>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => generateWithAI("title")}
                    disabled={generatingTitle}
                    className="h-7 gap-1 text-xs text-primary hover:text-primary"
                  >
                    {generatingTitle ? (
                      <Loader2 className="w-3 h-3 animate-spin" />
                    ) : (
                      <Sparkles className="w-3 h-3" />
                    )}
                    Gerar
                  </Button>
                </div>
                <Input
                  value={formData.site_title}
                  onChange={(e) => handleInputChange("site_title", e.target.value)}
                  placeholder="UpMidias - Painel SMM"
                  maxLength={60}
                />
                <p className="text-xs text-muted-foreground mt-1">
                  {formData.site_title.length}/60 caracteres (recomendado: até 60)
                </p>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <Label>Descrição do Site (meta description)</Label>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => generateWithAI("description")}
                    disabled={generatingDescription}
                    className="h-7 gap-1 text-xs text-primary hover:text-primary"
                  >
                    {generatingDescription ? (
                      <Loader2 className="w-3 h-3 animate-spin" />
                    ) : (
                      <Sparkles className="w-3 h-3" />
                    )}
                    Gerar
                  </Button>
                </div>
                <Textarea
                  value={formData.site_description}
                  onChange={(e) => handleInputChange("site_description", e.target.value)}
                  placeholder="A melhor plataforma SMM do Brasil..."
                  rows={3}
                  maxLength={160}
                />
                <p className="text-xs text-muted-foreground mt-1">
                  {formData.site_description.length}/160 caracteres (recomendado: até 160)
                </p>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <Label>Palavras-chave (separadas por vírgula)</Label>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => generateWithAI("keywords")}
                    disabled={generatingKeywords}
                    className="h-7 gap-1 text-xs text-primary hover:text-primary"
                  >
                    {generatingKeywords ? (
                      <Loader2 className="w-3 h-3 animate-spin" />
                    ) : (
                      <Sparkles className="w-3 h-3" />
                    )}
                    Gerar
                  </Button>
                </div>
                <Input
                  value={formData.meta_keywords || ""}
                  onChange={(e) => handleInputChange("meta_keywords", e.target.value)}
                  placeholder="smm, social media, seguidores, curtidas"
                />
              </div>
            </div>
          </AccordionContent>
        </AccordionItem>

        {/* Images */}
        <AccordionItem value="images" className="border rounded-lg overflow-hidden">
          <AccordionTrigger className="px-4 py-3 bg-gradient-to-r from-emerald-500/20 to-transparent hover:no-underline">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-emerald-500/30 flex items-center justify-center">
                <Image className="w-4 h-4 text-emerald-300" />
              </div>
              <span className="font-semibold">Imagens do Site</span>
            </div>
          </AccordionTrigger>
          <AccordionContent className="px-4 py-4">
            <div className="grid gap-6 md:grid-cols-2">
              {/* Favicon */}
              <Card className="border-cyan-500/30">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm">Favicon</CardTitle>
                  <CardDescription>
                    Ícone que aparece ao lado do título na aba do navegador
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {formData.favicon_url ? (
                    <div className="flex items-center gap-4">
                      <div className="w-16 h-16 rounded-lg border border-border/50 flex items-center justify-center bg-muted overflow-hidden">
                        <img
                          src={formData.favicon_url}
                          alt="Favicon"
                          className="w-10 h-10 object-contain"
                        />
                      </div>
                      <div className="flex-1">
                        <p className="text-xs text-muted-foreground truncate max-w-[200px]">
                          {formData.favicon_url}
                        </p>
                        <Button
                          variant="destructive"
                          size="sm"
                          className="mt-2"
                          onClick={() => removeImage("favicon")}
                        >
                          <Trash2 className="w-4 h-4 mr-1" />
                          Remover
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div
                      className="border-2 border-dashed border-border/50 rounded-lg p-6 text-center cursor-pointer hover:border-primary/50 transition-colors"
                      onClick={() => faviconInputRef.current?.click()}
                    >
                      {uploadingFavicon ? (
                        <Loader2 className="w-8 h-8 mx-auto animate-spin text-primary" />
                      ) : (
                        <>
                          <Upload className="w-8 h-8 mx-auto text-muted-foreground mb-2" />
                          <p className="text-sm text-muted-foreground">
                            Clique para enviar (PNG, ICO - 32x32 ou 64x64)
                          </p>
                        </>
                      )}
                    </div>
                  )}
                  <input
                    ref={faviconInputRef}
                    type="file"
                    accept="image/png,image/x-icon,image/ico"
                    className="hidden"
                    onChange={(e) => handleFileChange(e, "favicon")}
                  />
                </CardContent>
              </Card>

              {/* OG Image */}
              <Card className="border-violet-500/30">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm">Imagem de Preview (OG Image)</CardTitle>
                  <CardDescription>
                    Imagem exibida ao compartilhar o link em redes sociais
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {formData.og_image_url ? (
                    <div className="space-y-3">
                      <div className="aspect-video rounded-lg border border-border/50 overflow-hidden bg-muted">
                        <img
                          src={formData.og_image_url}
                          alt="OG Image Preview"
                          className="w-full h-full object-cover"
                        />
                      </div>
                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          className="flex-1"
                          onClick={() => ogImageInputRef.current?.click()}
                        >
                          <Upload className="w-4 h-4 mr-1" />
                          Alterar
                        </Button>
                        <Button
                          variant="destructive"
                          size="sm"
                          onClick={() => removeImage("og-image")}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div
                      className="border-2 border-dashed border-border/50 rounded-lg p-8 text-center cursor-pointer hover:border-primary/50 transition-colors"
                      onClick={() => ogImageInputRef.current?.click()}
                    >
                      {uploadingOgImage ? (
                        <Loader2 className="w-8 h-8 mx-auto animate-spin text-primary" />
                      ) : (
                        <>
                          <Upload className="w-8 h-8 mx-auto text-muted-foreground mb-2" />
                          <p className="text-sm text-muted-foreground">
                            Clique para enviar (1200x630 recomendado)
                          </p>
                        </>
                      )}
                    </div>
                  )}
                  <input
                    ref={ogImageInputRef}
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    className="hidden"
                    onChange={(e) => handleFileChange(e, "og-image")}
                  />
                </CardContent>
              </Card>
            </div>
          </AccordionContent>
        </AccordionItem>

        {/* Social Sharing */}
        <AccordionItem value="social" className="border rounded-lg overflow-hidden">
          <AccordionTrigger className="px-4 py-3 bg-gradient-to-r from-violet-500/20 to-transparent hover:no-underline">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-violet-500/30 flex items-center justify-center">
                <Share2 className="w-4 h-4 text-violet-300" />
              </div>
              <span className="font-semibold">Compartilhamento Social (Open Graph)</span>
            </div>
          </AccordionTrigger>
          <AccordionContent className="px-4 py-4">
            <div className="grid gap-4">
              <div>
                <Label>Título para Compartilhamento</Label>
                <Input
                  value={formData.og_title || ""}
                  onChange={(e) => handleInputChange("og_title", e.target.value)}
                  placeholder="UpMidias - Impulsione suas Redes Sociais"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Se vazio, será usado o título do site
                </p>
              </div>
              <div>
                <Label>Descrição para Compartilhamento</Label>
                <Textarea
                  value={formData.og_description || ""}
                  onChange={(e) => handleInputChange("og_description", e.target.value)}
                  placeholder="A melhor plataforma SMM do Brasil..."
                  rows={2}
                />
              </div>
              <div className="border-t border-border/50 pt-4 mt-2">
                <Label className="text-muted-foreground">Twitter/X</Label>
                <div className="grid gap-4 mt-2">
                  <div>
                    <Label>Título para Twitter</Label>
                    <Input
                      value={formData.twitter_title || ""}
                      onChange={(e) => handleInputChange("twitter_title", e.target.value)}
                      placeholder="Se vazio, usa o título OG"
                    />
                  </div>
                  <div>
                    <Label>Descrição para Twitter</Label>
                    <Textarea
                      value={formData.twitter_description || ""}
                      onChange={(e) => handleInputChange("twitter_description", e.target.value)}
                      placeholder="Se vazio, usa a descrição OG"
                      rows={2}
                    />
                  </div>
                </div>
              </div>
            </div>
          </AccordionContent>
        </AccordionItem>

        {/* Advanced */}
        <AccordionItem value="advanced" className="border rounded-lg overflow-hidden">
          <AccordionTrigger className="px-4 py-3 bg-gradient-to-r from-amber-500/20 to-transparent hover:no-underline">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-amber-500/30 flex items-center justify-center">
                <FileCode className="w-4 h-4 text-amber-300" />
              </div>
              <span className="font-semibold">Configurações Avançadas</span>
            </div>
          </AccordionTrigger>
          <AccordionContent className="px-4 py-4">
            <div className="grid gap-4">
              <div>
                <Label>Robots (indexação)</Label>
                <Input
                  value={formData.robots_content || ""}
                  onChange={(e) => handleInputChange("robots_content", e.target.value)}
                  placeholder="index, follow"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Ex: "index, follow" para permitir indexação, "noindex, nofollow" para bloquear
                </p>
              </div>
              <div>
                <Label>URL Canônica</Label>
                <Input
                  value={formData.canonical_url || ""}
                  onChange={(e) => handleInputChange("canonical_url", e.target.value)}
                  placeholder="https://seusite.com"
                />
              </div>
              <div>
                <Label>Google Analytics ID</Label>
                <Input
                  value={formData.google_analytics_id || ""}
                  onChange={(e) => handleInputChange("google_analytics_id", e.target.value)}
                  placeholder="G-XXXXXXXXXX ou UA-XXXXXXXXX-X"
                />
              </div>
            </div>
          </AccordionContent>
        </AccordionItem>
      </Accordion>

      {/* Public Pages Settings */}
      <Card className="border-amber-500/30">
        <CardHeader>
          <CardTitle className="text-sm flex items-center gap-2">
            <Package className="w-4 h-4 text-amber-500" />
            Páginas Públicas
          </CardTitle>
          <CardDescription>
            Configure quais páginas devem ser visíveis sem login
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between p-4 rounded-lg border border-border/50 bg-muted/30">
            <div className="space-y-1">
              <p className="font-medium">Página de Serviços Pública</p>
              <p className="text-sm text-muted-foreground">
                Permite que visitantes vejam a lista de serviços sem precisar fazer login
              </p>
            </div>
            <Switch
              checked={formData.services_page_public}
              onCheckedChange={(checked) => handleInputChange("services_page_public", checked)}
            />
          </div>
        </CardContent>
      </Card>


      {/* Preview Card */}
      <Card className="border-primary/30">
        <CardHeader>
          <CardTitle className="text-sm flex items-center gap-2">
            <ExternalLink className="w-4 h-4" />
            Prévia do Compartilhamento
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="bg-muted rounded-lg p-4 max-w-md">
            {formData.og_image_url && (
              <div className="aspect-video rounded-lg overflow-hidden mb-3 bg-background">
                <img
                  src={formData.og_image_url}
                  alt="Preview"
                  className="w-full h-full object-cover"
                />
              </div>
            )}
            <p className="text-xs text-muted-foreground uppercase mb-1">seusite.com</p>
            <p className="font-semibold text-sm mb-1">
              {formData.og_title || formData.site_title}
            </p>
            <p className="text-xs text-muted-foreground line-clamp-2">
              {formData.og_description || formData.site_description}
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Fixed Save Button for Mobile */}
      <div className="fixed bottom-4 right-4 md:hidden">
        <Button size="lg" onClick={handleSave} disabled={saveMutation.isPending} className="shadow-xl">
          <Save className="w-5 h-5 mr-2" />
          Salvar
        </Button>
      </div>
    </div>
  );
};

export default AdminSEO;
