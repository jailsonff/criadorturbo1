import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getSupabaseClient } from "@/lib/supabaseClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Plus, Edit, Trash2, Store, ExternalLink, Loader2, Copy } from "lucide-react";

interface StoreFrontend {
  id: string;
  name: string;
  slug: string;
  is_active: boolean;
  cta_title: string;
  cta_subtitle: string;
  created_at: string;
}

export default function AdminStoreFrontends() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const supabase = getSupabaseClient();

  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingFrontend, setEditingFrontend] = useState<StoreFrontend | null>(null);

  const [formData, setFormData] = useState({
    name: "",
    slug: "",
    is_active: true,
    cta_title: "Quer ENGAJAMENTO?",
    cta_subtitle: "Escolha os pacotes desejados e impulsione suas redes sociais!",
  });

  const { data: frontends = [], isLoading } = useQuery({
    queryKey: ["admin-store-frontends"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("store_frontends")
        .select("*")
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data as StoreFrontend[];
    },
  });

  const saveMutation = useMutation({
    mutationFn: async (data: typeof formData) => {
      if (editingFrontend) {
        const { error } = await supabase
          .from("store_frontends")
          .update(data)
          .eq("id", editingFrontend.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("store_frontends").insert(data);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-store-frontends"] });
      setIsDialogOpen(false);
      setEditingFrontend(null);
      resetForm();
      toast({
        title: "Sucesso",
        description: editingFrontend ? "Frontend atualizado!" : "Frontend criado!",
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
      const { error } = await supabase.from("store_frontends").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-store-frontends"] });
      toast({ title: "Frontend excluído!" });
    },
    onError: (error: any) => {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
    },
  });

  const resetForm = () => {
    setFormData({
      name: "",
      slug: "",
      is_active: true,
      cta_title: "Quer ENGAJAMENTO?",
      cta_subtitle: "Escolha os pacotes desejados e impulsione suas redes sociais!",
    });
  };

  const handleEdit = (frontend: StoreFrontend) => {
    setEditingFrontend(frontend);
    setFormData({
      name: frontend.name,
      slug: frontend.slug,
      is_active: frontend.is_active,
      cta_title: frontend.cta_title,
      cta_subtitle: frontend.cta_subtitle,
    });
    setIsDialogOpen(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    saveMutation.mutate(formData);
  };

  const generateSlug = (name: string) => {
    return name
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "");
  };

  const getStoreUrl = (slug: string) => {
    // Keep default storefront clean: /loja (instead of /loja/loja)
    return slug === "loja" ? `${window.location.origin}/loja` : `${window.location.origin}/loja/${slug}`;
  };

  const copyUrl = (slug: string) => {
    navigator.clipboard.writeText(getStoreUrl(slug));
    toast({ title: "URL copiada!" });
  };

  return (
    <div className="space-y-6 w-full min-w-0 p-4 md:p-6">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h1 className="text-2xl font-bold">Frontends de Loja</h1>
            <p className="text-muted-foreground">
              Gerencie os frontends de vendas independentes
            </p>
          </div>
          <Dialog
            open={isDialogOpen}
            onOpenChange={(open) => {
              setIsDialogOpen(open);
              if (!open) {
                setEditingFrontend(null);
                resetForm();
              }
            }}
          >
            <DialogTrigger asChild>
              <Button className="gap-2">
                <Plus className="w-4 h-4" />
                Novo Frontend
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>
                  {editingFrontend ? "Editar Frontend" : "Novo Frontend"}
                </DialogTitle>
              </DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <Label>Nome</Label>
                  <Input
                    value={formData.name}
                    onChange={(e) => {
                      setFormData({
                        ...formData,
                        name: e.target.value,
                        slug: editingFrontend ? formData.slug : generateSlug(e.target.value),
                      });
                    }}
                    placeholder="Loja Principal"
                    required
                  />
                </div>

                <div>
                  <Label>Slug (URL)</Label>
                  <Input
                    value={formData.slug}
                    onChange={(e) => setFormData({ ...formData, slug: generateSlug(e.target.value) })}
                    placeholder="loja-principal"
                    required
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    URL: /loja/{formData.slug || "..."}
                  </p>
                </div>

                <div>
                  <Label>Título CTA</Label>
                  <Input
                    value={formData.cta_title}
                    onChange={(e) => setFormData({ ...formData, cta_title: e.target.value })}
                    placeholder="Quer ENGAJAMENTO?"
                  />
                </div>

                <div>
                  <Label>Subtítulo CTA</Label>
                  <Input
                    value={formData.cta_subtitle}
                    onChange={(e) => setFormData({ ...formData, cta_subtitle: e.target.value })}
                    placeholder="Escolha os pacotes desejados..."
                  />
                </div>

                <div className="flex items-center gap-2">
                  <Switch
                    checked={formData.is_active}
                    onCheckedChange={(c) => setFormData({ ...formData, is_active: c })}
                  />
                  <Label>Ativo</Label>
                </div>

                <div className="flex justify-end gap-2">
                  <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)}>
                    Cancelar
                  </Button>
                  <Button type="submit" disabled={saveMutation.isPending}>
                    {saveMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                    Salvar
                  </Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        <Card>
          <CardContent className="pt-6">
            {isLoading ? (
              <div className="flex justify-center py-8">
                <Loader2 className="w-8 h-8 animate-spin text-primary" />
              </div>
            ) : frontends.length === 0 ? (
              <div className="text-center py-8">
                <Store className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
                <p className="text-muted-foreground">Nenhum frontend cadastrado.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Nome</TableHead>
                      <TableHead>Slug</TableHead>
                      <TableHead>CTA</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {frontends.map((frontend) => (
                      <TableRow key={frontend.id}>
                        <TableCell className="font-medium">{frontend.name}</TableCell>
                        <TableCell>
                          <code className="text-xs bg-muted px-2 py-1 rounded">
                            {frontend.slug === "loja" ? "/loja" : `/loja/${frontend.slug}`}
                          </code>
                        </TableCell>
                        <TableCell className="max-w-[200px] truncate text-sm text-muted-foreground">
                          {frontend.cta_title}
                        </TableCell>
                        <TableCell>
                          <Badge variant={frontend.is_active ? "default" : "secondary"}>
                            {frontend.is_active ? "Ativo" : "Inativo"}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-2">
                            <Button
                              size="icon"
                              variant="outline"
                              onClick={() => copyUrl(frontend.slug)}
                              title="Copiar URL"
                            >
                              <Copy className="w-4 h-4" />
                            </Button>
                            <Button
                              size="icon"
                              variant="outline"
                              onClick={() => window.open(frontend.slug === "loja" ? "/loja" : `/loja/${frontend.slug}`, "_blank")}
                              title="Abrir"
                            >
                              <ExternalLink className="w-4 h-4" />
                            </Button>
                            <Button size="icon" variant="outline" onClick={() => handleEdit(frontend)}>
                              <Edit className="w-4 h-4" />
                            </Button>
                            <Button
                              size="icon"
                              variant="destructive"
                              onClick={() => {
                                if (confirm("Excluir este frontend? Os pacotes associados também serão excluídos.")) {
                                  deleteMutation.mutate(frontend.id);
                                }
                              }}
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
    </div>
  );
}
