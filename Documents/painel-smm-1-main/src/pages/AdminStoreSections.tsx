import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { clearExternalConfig, getCurrentDatabaseInfo, getSupabaseClient, hasExternalDatabase } from "@/lib/supabaseClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { Plus, Edit, Trash2, GripVertical, Layers } from "lucide-react";

interface StoreFrontend {
  id: string;
  name: string;
  slug: string;
}

interface PackageSection {
  id: string;
  frontend_id: string;
  name: string;
  display_order: number;
  is_active: boolean;
}

export default function AdminStoreSections() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const supabase = getSupabaseClient();

  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingSection, setEditingSection] = useState<PackageSection | null>(null);
  const [selectedFrontend, setSelectedFrontend] = useState<string>("all");

  const [formData, setFormData] = useState({
    frontend_id: "",
    name: "",
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
      return data as StoreFrontend[];
    },
  });

  const { data: sections = [], isLoading } = useQuery({
    queryKey: ["admin-store-package-sections", selectedFrontend],
    queryFn: async () => {
      let query = supabase.from("store_package_sections").select("*");
      if (selectedFrontend && selectedFrontend !== "all") {
        query = query.eq("frontend_id", selectedFrontend);
      }
      const { data, error } = await query.order("display_order", { ascending: true });
      if (error) throw error;
      return data as PackageSection[];
    },
  });

  const saveMutation = useMutation({
    mutationFn: async (data: typeof formData) => {
      if (editingSection) {
        const { error } = await supabase
          .from("store_package_sections")
          .update(data)
          .eq("id", editingSection.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("store_package_sections").insert(data);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-store-package-sections"] });
      setIsDialogOpen(false);
      setEditingSection(null);
      resetForm();
      toast({
        title: "Sucesso",
        description: editingSection ? "Seção atualizada!" : "Seção criada!",
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
      const { error } = await supabase.from("store_package_sections").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-store-package-sections"] });
      toast({ title: "Seção excluída!" });
    },
    onError: (error: any) => {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
    },
  });

  const resetForm = () => {
    setFormData({
      frontend_id: frontends[0]?.id || "",
      name: "",
      display_order: 0,
      is_active: true,
    });
  };

  const handleEdit = (section: PackageSection) => {
    setEditingSection(section);
    setFormData({
      frontend_id: section.frontend_id,
      name: section.name,
      display_order: section.display_order,
      is_active: section.is_active,
    });
    setIsDialogOpen(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    saveMutation.mutate(formData);
  };

  const dbInfo = getCurrentDatabaseInfo();

  return (
    <div className="space-y-6 w-full min-w-0 p-4 md:p-6">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h1 className="text-2xl font-bold">Sessões de Pacotes</h1>
            <p className="text-muted-foreground">Organize pacotes em seções (Engajamento, Combos, etc.)</p>
          </div>
          <Dialog open={isDialogOpen} onOpenChange={(open) => {
            setIsDialogOpen(open);
            if (!open) {
              setEditingSection(null);
              resetForm();
            }
          }}>
            <DialogTrigger asChild>
              <Button className="gap-2">
                <Plus className="w-4 h-4" />
                Nova Seção
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle>{editingSection ? "Editar Seção" : "Nova Seção"}</DialogTitle>
              </DialogHeader>

              {hasExternalDatabase() && (
                <div className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm">
                  <div className="font-medium">Você está no banco externo</div>
                  <div className="text-muted-foreground">
                    Para criar seções aqui, primeiro clique em <b>Usar banco padrão</b>.
                  </div>
                  <div className="mt-3">
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
                  </div>
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <Label>Frontend</Label>
                  <Select
                    value={formData.frontend_id}
                    onValueChange={(v) => setFormData({ ...formData, frontend_id: v })}
                    disabled={!!editingSection}
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

                <div>
                  <Label>Nome da Seção</Label>
                  <Input
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    placeholder="Ex: Combos Promocionais"
                    required
                  />
                </div>

                <div>
                  <Label>Ordem de Exibição</Label>
                  <Input
                    type="number"
                    value={formData.display_order}
                    onChange={(e) => setFormData({ ...formData, display_order: parseInt(e.target.value) || 0 })}
                    min="0"
                  />
                </div>

                <div className="flex items-center justify-between">
                  <Label>Ativo</Label>
                  <Switch
                    checked={formData.is_active}
                    onCheckedChange={(checked) => setFormData({ ...formData, is_active: checked })}
                  />
                </div>

                <div className="flex justify-end gap-2">
                  <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)}>
                    Cancelar
                  </Button>
                  <Button type="submit" disabled={saveMutation.isPending || hasExternalDatabase()}>
                    {hasExternalDatabase()
                      ? "Troque para o banco padrão"
                      : saveMutation.isPending
                        ? "Salvando..."
                        : editingSection
                          ? "Atualizar"
                          : "Criar"}
                  </Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        {hasExternalDatabase() && (
          <Card>
            <CardHeader>
              <CardTitle>Banco de dados externo ativo</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-sm text-muted-foreground">
                Você está usando um banco <b>externo</b>. Se ele não tiver a tabela de seções,
                vai aparecer o erro “Could not find the table ... in the schema cache”.
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

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Layers className="w-5 h-5" />
              Filtrar por Frontend
            </CardTitle>
          </CardHeader>
          <CardContent>
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
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Sessões Cadastradas</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="text-center py-8 text-muted-foreground">Carregando...</div>
            ) : sections.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                Nenhuma seção cadastrada. Clique em "Nova Seção" para começar.
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-12"></TableHead>
                    <TableHead>Nome</TableHead>
                    <TableHead>Frontend</TableHead>
                    <TableHead className="w-24">Ordem</TableHead>
                    <TableHead className="w-24">Status</TableHead>
                    <TableHead className="w-32">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sections.map((section) => (
                    <TableRow key={section.id}>
                      <TableCell>
                        <GripVertical className="w-4 h-4 text-muted-foreground" />
                      </TableCell>
                      <TableCell className="font-medium">{section.name}</TableCell>
                      <TableCell>
                        {frontends.find((f) => f.id === section.frontend_id)?.name || "—"}
                      </TableCell>
                      <TableCell>{section.display_order}</TableCell>
                      <TableCell>
                        {section.is_active ? (
                          <span className="text-green-500">Ativo</span>
                        ) : (
                          <span className="text-muted-foreground">Inativo</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-2">
                          <Button size="sm" variant="ghost" onClick={() => handleEdit(section)}>
                            <Edit className="w-4 h-4" />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="text-destructive"
                            onClick={() => {
                              if (confirm(`Excluir a seção "${section.name}"?`)) {
                                deleteMutation.mutate(section.id);
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
            )}
          </CardContent>
        </Card>
    </div>
  );
}
