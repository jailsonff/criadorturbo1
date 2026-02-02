import { useState, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowUp, ArrowDown, Loader2, Save, RotateCcw, ListOrdered, GripVertical, CheckSquare, Square, ChevronsUp, ChevronsDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { getSupabaseClient } from "@/lib/supabaseClient";
import { useToast } from "@/hooks/use-toast";

interface CategoryDisplayOrder {
  id: string;
  category_name: string;
  display_order: number;
}

const AdminCategoryOrder = () => {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [localOrder, setLocalOrder] = useState<string[]>([]);
  const [hasChanges, setHasChanges] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [selectedCategories, setSelectedCategories] = useState<Set<string>>(new Set());

  // Fetch category display order
  const { data: categoryOrders, isLoading: ordersLoading } = useQuery({
    queryKey: ["category-display-order"],
    queryFn: async () => {
      const supabase = getSupabaseClient();
      const { data, error } = await supabase
        .from("category_display_order")
        .select("*")
        .order("display_order", { ascending: true });
      
      if (error?.code === "42P01" || error?.message?.includes("does not exist")) {
        return [];
      }
      
      if (error) throw error;
      return data as CategoryDisplayOrder[];
    },
  });

  // Fetch all unique categories from imported services
  const { data: allCategories, isLoading: categoriesLoading } = useQuery({
    queryKey: ["all-categories-for-order"],
    queryFn: async () => {
      const supabase = getSupabaseClient();
      const { data, error } = await supabase
        .from("imported_services")
        .select("category");
      if (error) throw error;
      const uniqueCategories = [...new Set(data.map(s => s.category))];
      return uniqueCategories.sort();
    },
  });

  // Build ordered list: use saved order first, then alphabetically for new categories
  const orderedCategories = useMemo(() => {
    if (!allCategories) return [];
    
    // If we have local changes, use those
    if (localOrder.length > 0) {
      return localOrder;
    }
    
    // Build from saved order + remaining categories
    const orderMap = new Map<string, number>();
    categoryOrders?.forEach((co) => {
      orderMap.set(co.category_name, co.display_order);
    });
    
    // Separate ordered and unordered
    const ordered = allCategories.filter(c => orderMap.has(c));
    const unordered = allCategories.filter(c => !orderMap.has(c));
    
    // Sort ordered by display_order
    ordered.sort((a, b) => (orderMap.get(a) ?? 0) - (orderMap.get(b) ?? 0));
    
    // Append unordered alphabetically
    return [...ordered, ...unordered.sort()];
  }, [allCategories, categoryOrders, localOrder]);

  const displayList = localOrder.length > 0 ? localOrder : orderedCategories;

  // Toggle category selection
  const toggleSelection = (category: string) => {
    const newSelection = new Set(selectedCategories);
    if (newSelection.has(category)) {
      newSelection.delete(category);
    } else {
      newSelection.add(category);
    }
    setSelectedCategories(newSelection);
  };

  // Select all categories
  const selectAll = () => {
    setSelectedCategories(new Set(displayList));
  };

  // Deselect all categories
  const deselectAll = () => {
    setSelectedCategories(new Set());
  };

  // Move single category
  const moveCategory = (index: number, direction: 'up' | 'down') => {
    const newOrder = [...(localOrder.length > 0 ? localOrder : orderedCategories)];
    const newIndex = direction === 'up' ? index - 1 : index + 1;
    
    if (newIndex < 0 || newIndex >= newOrder.length) return;
    
    // Swap
    [newOrder[index], newOrder[newIndex]] = [newOrder[newIndex], newOrder[index]];
    
    setLocalOrder(newOrder);
    setHasChanges(true);
  };

  // Move selected categories in batch
  const moveSelectedCategories = (direction: 'up' | 'down') => {
    if (selectedCategories.size === 0) return;

    const currentOrder = [...(localOrder.length > 0 ? localOrder : orderedCategories)];
    const selectedIndices = currentOrder
      .map((cat, idx) => selectedCategories.has(cat) ? idx : -1)
      .filter(idx => idx !== -1)
      .sort((a, b) => direction === 'up' ? a - b : b - a);

    // Check if movement is possible
    if (direction === 'up' && selectedIndices[0] === 0) return;
    if (direction === 'down' && selectedIndices[selectedIndices.length - 1] === currentOrder.length - 1) return;

    // Move each selected item one position
    for (const idx of selectedIndices) {
      const newIdx = direction === 'up' ? idx - 1 : idx + 1;
      if (newIdx >= 0 && newIdx < currentOrder.length && !selectedCategories.has(currentOrder[newIdx])) {
        [currentOrder[idx], currentOrder[newIdx]] = [currentOrder[newIdx], currentOrder[idx]];
      }
    }

    setLocalOrder(currentOrder);
    setHasChanges(true);
  };

  const resetChanges = () => {
    setLocalOrder([]);
    setHasChanges(false);
    setSelectedCategories(new Set());
  };

  const saveOrder = async () => {
    const orderToSave = localOrder.length > 0 ? localOrder : orderedCategories;
    
    if (orderToSave.length === 0) return;
    
    setIsSaving(true);
    const supabase = getSupabaseClient();
    
    try {
      // Upsert all categories with their new order
      for (let i = 0; i < orderToSave.length; i++) {
        const categoryName = orderToSave[i];
        const { error } = await supabase
          .from("category_display_order")
          .upsert({
            category_name: categoryName,
            display_order: i,
            updated_at: new Date().toISOString(),
          }, { onConflict: 'category_name' });
        
        if (error) throw error;
      }
      
      queryClient.invalidateQueries({ queryKey: ["category-display-order"] });
      
      toast({
        title: "Ordem salva!",
        description: `${orderToSave.length} categorias ordenadas com sucesso.`,
      });
      
      setLocalOrder([]);
      setHasChanges(false);
      setSelectedCategories(new Set());
    } catch (error: any) {
      toast({
        title: "Erro ao salvar",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setIsSaving(false);
    }
  };

  const isLoading = ordersLoading || categoriesLoading;
  const hasSelection = selectedCategories.size > 0;
  const allSelected = selectedCategories.size === displayList.length && displayList.length > 0;

  // Check if batch move is possible
  const canMoveUp = useMemo(() => {
    if (selectedCategories.size === 0) return false;
    const selectedIndices = displayList
      .map((cat, idx) => selectedCategories.has(cat) ? idx : -1)
      .filter(idx => idx !== -1);
    return selectedIndices[0] > 0;
  }, [selectedCategories, displayList]);

  const canMoveDown = useMemo(() => {
    if (selectedCategories.size === 0) return false;
    const selectedIndices = displayList
      .map((cat, idx) => selectedCategories.has(cat) ? idx : -1)
      .filter(idx => idx !== -1);
    return selectedIndices[selectedIndices.length - 1] < displayList.length - 1;
  }, [selectedCategories, displayList]);

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold gradient-text flex items-center gap-2">
          <ListOrdered className="w-8 h-8" />
          Ordem das Categorias
        </h1>
        <p className="text-muted-foreground mt-1">
          Configure a ordem de exibição das categorias nas páginas de serviços
        </p>
      </div>

      {/* Info Card */}
      <Card className="glass-card border-border/50">
        <CardHeader className="pb-3">
          <CardTitle className="text-lg">Como funciona?</CardTitle>
          <CardDescription>
            Use as setas para mover as categorias para cima ou para baixo. 
            <strong className="text-primary"> Selecione várias categorias</strong> usando os checkboxes para movê-las em lote.
            A ordem definida aqui será refletida nas páginas de Serviços e Novo Pedido para todos os usuários.
            Após fazer as alterações, clique em <strong>Salvar Ordem</strong>.
          </CardDescription>
        </CardHeader>
      </Card>

      {/* Actions */}
      <Card className="glass-card border-border/50">
        <CardContent className="pt-6">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-sm text-muted-foreground">
                {displayList.length} categorias 
                {hasSelection && <span className="text-primary font-medium"> • {selectedCategories.size} selecionada(s)</span>}
                {hasChanges && <span className="text-amber-400"> • Alterações não salvas</span>}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {/* Selection controls */}
              <Button
                variant="outline"
                size="sm"
                onClick={allSelected ? deselectAll : selectAll}
                className="gap-2"
              >
                {allSelected ? <Square className="w-4 h-4" /> : <CheckSquare className="w-4 h-4" />}
                {allSelected ? "Desmarcar" : "Selecionar Tudo"}
              </Button>

              {/* Batch move controls */}
              {hasSelection && (
                <>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => moveSelectedCategories('up')}
                    disabled={!canMoveUp || isSaving}
                    className="gap-1"
                  >
                    <ChevronsUp className="w-4 h-4" />
                    Subir ({selectedCategories.size})
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => moveSelectedCategories('down')}
                    disabled={!canMoveDown || isSaving}
                    className="gap-1"
                  >
                    <ChevronsDown className="w-4 h-4" />
                    Descer ({selectedCategories.size})
                  </Button>
                </>
              )}

              <div className="h-6 w-px bg-border hidden sm:block" />

              <Button
                variant="outline"
                onClick={resetChanges}
                disabled={!hasChanges || isSaving}
                className="gap-2"
              >
                <RotateCcw className="w-4 h-4" />
                Resetar
              </Button>
              <Button
                onClick={saveOrder}
                disabled={isSaving}
                className="gap-2"
              >
                {isSaving ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Save className="w-4 h-4" />
                )}
                Salvar Ordem
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Categories List */}
      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      ) : (
        <Card className="glass-card border-border/50 overflow-hidden">
          <div className="divide-y divide-border/50">
            {displayList.map((category, index) => {
              const isSelected = selectedCategories.has(category);
              return (
                <div 
                  key={category} 
                  className={`flex items-center gap-4 px-4 py-3 transition-colors cursor-pointer ${
                    isSelected ? 'bg-primary/10' : 'hover:bg-muted/30'
                  }`}
                  onClick={() => toggleSelection(category)}
                >
                  {/* Checkbox */}
                  <Checkbox
                    checked={isSelected}
                    onCheckedChange={() => toggleSelection(category)}
                    onClick={(e) => e.stopPropagation()}
                    className="data-[state=checked]:bg-primary data-[state=checked]:border-primary"
                  />

                  {/* Position number */}
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${
                    isSelected ? 'bg-primary text-primary-foreground' : 'bg-primary/20 text-primary'
                  }`}>
                    {index + 1}
                  </div>
                  
                  {/* Grip icon (visual only) */}
                  <GripVertical className="w-5 h-5 text-muted-foreground/50" />
                  
                  {/* Category name */}
                  <span className="flex-1 font-medium">{category}</span>
                  
                  {/* Move buttons */}
                  <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => moveCategory(index, 'up')}
                      disabled={index === 0 || isSaving}
                      className="h-8 w-8 p-0"
                    >
                      <ArrowUp className="w-4 h-4" />
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => moveCategory(index, 'down')}
                      disabled={index === displayList.length - 1 || isSaving}
                      className="h-8 w-8 p-0"
                    >
                      <ArrowDown className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
          <div className="p-4 border-t border-border/50 text-sm text-muted-foreground">
            {displayList.length} categorias {hasSelection && `• ${selectedCategories.size} selecionada(s)`}
          </div>
        </Card>
      )}
    </div>
  );
};

export default AdminCategoryOrder;
