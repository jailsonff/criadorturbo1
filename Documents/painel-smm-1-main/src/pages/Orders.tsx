import { useState, useEffect, useCallback } from "react";
import { 
  Search, 
  Loader2, 
  AlertCircle, 
  RefreshCw, 
  CheckCircle2, 
  Clock, 
  XCircle, 
  Package,
  Trash2,
  ExternalLink,
  Play,
  AlertTriangle,
  Plus,
  Download
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import BalanceCard from "@/components/BalanceCard";
import { 
  checkOrderStatus, 
  checkMultipleOrdersStatus,
  createRefill,
  LocalOrder,
  OrderStatus 
} from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { formatCurrency } from "@/lib/utils";
import { Link } from "react-router-dom";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useAuth } from "@/contexts/AuthContext";
import { getSupabaseClient } from "@/lib/supabaseClient";
import ProviderOrderIdCopy from "@/components/orders/ProviderOrderIdCopy";

const Orders = () => {
  const [orders, setOrders] = useState<LocalOrder[]>([]);
  const [loadingOrders, setLoadingOrders] = useState<Set<number>>(new Set());
  const [refillingOrders, setRefillingOrders] = useState<Set<number>>(new Set());
  const [importOrderId, setImportOrderId] = useState("");
  const [isImporting, setIsImporting] = useState(false);
  const [isRefillAllLoading, setIsRefillAllLoading] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [isLoadingOrders, setIsLoadingOrders] = useState(true);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const { toast } = useToast();
  const { user } = useAuth();

  // Fetch orders from database for the current user
  const fetchOrdersFromDatabase = useCallback(async () => {
    if (!user) {
      setOrders([]);
      setIsLoadingOrders(false);
      return;
    }

    try {
      const supabase = getSupabaseClient();
      const { data, error } = await supabase
        .from("orders")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });

      if (error) {
        console.error("Error fetching orders:", error);
        toast({
          title: "Erro ao carregar pedidos",
          description: "Não foi possível carregar seus pedidos.",
          variant: "destructive",
        });
        return;
      }

      // Convert database orders to LocalOrder format
      const dbOrders: LocalOrder[] = (data || []).map((order) => ({
        id: order.order_id,
        serviceId: order.service_id,
        serviceName: order.service_name,
        link: order.link,
        quantity: order.quantity,
        createdAt: order.created_at,
        status: {
          charge: order.charge?.toString() || "0",
          start_count: order.start_count || "0",
          status: order.status || "pending",
          remains: order.remains || "0",
          currency: "BRL",
        },
      }));

      setOrders(dbOrders);
    } catch (error) {
      console.error("Error fetching orders:", error);
    } finally {
      setIsLoadingOrders(false);
    }
  }, [user, toast]);

  // Initial load - fetch from database
  useEffect(() => {
    fetchOrdersFromDatabase();
  }, [fetchOrdersFromDatabase]);

  // Auto-refresh status polling - runs immediately on load and then every 30 seconds
  useEffect(() => {
    if (orders.length === 0 || !user) return;

    const refreshStatuses = async () => {
      const validOrders = orders.filter(o => o && o.id !== undefined && o.id !== null);
      if (validOrders.length === 0) return;
      
      const orderIds = validOrders.map(o => o.id);
      try {
        const statuses = await checkMultipleOrdersStatus(orderIds);
        
        // Update local state
        setOrders(prev => prev.map(order => {
          if (!order || order.id === undefined || order.id === null) return order;
          const newStatus = statuses[order.id.toString()];
          if (newStatus && !newStatus.error) {
            return { ...order, status: newStatus };
          }
          return order;
        }));

        // Update database with new statuses
        for (const order of validOrders) {
          const newStatus = statuses[order.id.toString()];
          if (newStatus && !newStatus.error) {
            const supabase = getSupabaseClient();
            await supabase
              .from("orders")
              .update({
                status: newStatus.status,
                start_count: newStatus.start_count,
                remains: newStatus.remains,
                charge: newStatus.charge ? parseFloat(newStatus.charge) : null,
                updated_at: new Date().toISOString(),
              })
              .eq("order_id", order.id)
              .eq("user_id", user.id);
          }
        }
      } catch (error) {
        console.error("Auto-refresh error:", error);
      }
    };

    // Refresh immediately on mount
    refreshStatuses();

    // Set up interval for continuous updates if autoRefresh is enabled
    if (!autoRefresh) return;

    const intervalId = setInterval(refreshStatuses, 30000);

    return () => clearInterval(intervalId);
  }, [autoRefresh, orders.length, user]);

  const refreshOrderStatus = useCallback(async (orderId: number) => {
    if (!user) return;
    
    try {
      setLoadingOrders((prev) => new Set(prev).add(orderId));
      const status = await checkOrderStatus(orderId);
      
      if (!status.error) {
        // Update database
        const supabase = getSupabaseClient();
        await supabase
          .from("orders")
          .update({
            status: status.status,
            start_count: status.start_count,
            remains: status.remains,
            charge: status.charge ? parseFloat(status.charge) : null,
            updated_at: new Date().toISOString(),
          })
          .eq("order_id", orderId)
          .eq("user_id", user.id);

        setOrders((prev) =>
          prev.map((order) =>
            order.id === orderId ? { ...order, status } : order
          )
        );
      }
      return status;
    } catch (error) {
      console.error("Error refreshing order status:", error);
      throw error;
    } finally {
      setLoadingOrders((prev) => {
        const newSet = new Set(prev);
        newSet.delete(orderId);
        return newSet;
      });
    }
  }, [user]);

  const refreshAllOrders = async () => {
    const orderIds = orders.map((o) => o.id);
    for (const orderId of orderIds) {
      await refreshOrderStatus(orderId);
    }
    toast({
      title: "Pedidos atualizados",
      description: "Todos os status foram atualizados.",
    });
  };

  const handleDeleteOrder = async (orderId: number) => {
    if (!user) return;
    
    // Note: RLS policy doesn't allow DELETE, so we just remove from UI
    // Admin needs to delete from database
    setOrders((prev) => prev.filter((o) => o.id !== orderId));
    toast({
      title: "Pedido removido",
      description: "O pedido foi removido da visualização.",
    });
  };

  const handleImportMultiple = async () => {
    if (!user) {
      toast({
        title: "Erro",
        description: "Você precisa estar logado para importar pedidos.",
        variant: "destructive",
      });
      return;
    }

    const input = importOrderId.trim();
    if (!input) return;

    let orderIds: number[] = [];
    
    if (input.includes("-") && !input.includes(",")) {
      const [start, end] = input.split("-").map((n) => parseInt(n.trim()));
      if (!isNaN(start) && !isNaN(end) && end >= start && end - start <= 50) {
        for (let i = start; i <= end; i++) {
          orderIds.push(i);
        }
      }
    } else {
      orderIds = input
        .split(",")
        .map((n) => parseInt(n.trim()))
        .filter((n) => !isNaN(n));
    }

    if (orderIds.length === 0) {
      toast({
        title: "IDs inválidos",
        description: "Use IDs separados por vírgula (123,456) ou um intervalo (123-130, máx 50).",
        variant: "destructive",
      });
      return;
    }

    const existingIds = new Set(orders.map((o) => o.id));
    orderIds = orderIds.filter((id) => !existingIds.has(id));

    if (orderIds.length === 0) {
      toast({
        title: "Todos já existem",
        description: "Todos os pedidos informados já estão na sua lista.",
      });
      return;
    }

    setIsImporting(true);
    let imported = 0;

    for (const orderId of orderIds) {
      try {
        const status = await checkOrderStatus(orderId);
        
        if (!status.error) {
          const newOrder: LocalOrder = {
            id: orderId,
            serviceId: 0,
            serviceName: "",
            link: "",
            quantity: 0,
            createdAt: new Date().toISOString(),
            status,
          };

          // Save to database
          const supabase = getSupabaseClient();
          const { error } = await supabase.from("orders").insert({
            order_id: orderId,
            user_id: user.id,
            service_id: 0,
            service_name: "Pedido Importado",
            link: "",
            quantity: 0,
            charge: status.charge ? parseFloat(status.charge) : null,
            status: status.status || "pending",
            start_count: status.start_count || null,
            remains: status.remains || null,
          });

          if (!error) {
            setOrders((prev) => [newOrder, ...prev.filter(o => o.id !== orderId)]);
            imported++;
          }
        }
      } catch (error) {
        console.error(`Error importing order ${orderId}:`, error);
      }
    }

    setImportOrderId("");
    setIsImporting(false);

    toast({
      title: "Importação concluída",
      description: `${imported} de ${orderIds.length} pedidos foram importados.`,
    });
  };

  const handleRefillOrder = async (order: LocalOrder) => {
    setRefillingOrders(prev => new Set(prev).add(order.id));
    
    try {
      const result = await createRefill(order.id);
      
      // Save to database
      if (user && result.refill) {
        const supabase = getSupabaseClient();
        await supabase.from("refills").insert({
          user_id: user.id,
          order_id: order.id,
          refill_id: result.refill,
          link: order.link || null,
          service_name: order.serviceName || null,
          status: "pending",
        });
      }
      
      toast({
        title: "Refill solicitado!",
        description: `ID do refill: #${result.refill}`,
      });
    } catch (error) {
      toast({
        title: "Erro ao solicitar refill",
        description: "Este pedido pode não permitir refill.",
        variant: "destructive",
      });
    } finally {
      setRefillingOrders(prev => {
        const newSet = new Set(prev);
        newSet.delete(order.id);
        return newSet;
      });
    }
  };

  // Refill All - triggers refill for all orders
  const handleRefillAll = async () => {
    if (orders.length === 0) {
      toast({
        title: "Nenhum pedido",
        description: "Não há pedidos para solicitar refill.",
        variant: "destructive",
      });
      return;
    }

    setIsRefillAllLoading(true);
    let successCount = 0;
    let errorCount = 0;

    for (const order of orders) {
      try {
        const result = await createRefill(order.id);
        
        // Save to database
        if (user && result.refill) {
          const supabase = getSupabaseClient();
          await supabase.from("refills").insert({
            user_id: user.id,
            order_id: order.id,
            refill_id: result.refill,
            link: order.link || null,
            service_name: order.serviceName || null,
            status: "pending",
          });
        }
        
        successCount++;
      } catch (error) {
        console.error(`Error refilling order ${order.id}:`, error);
        errorCount++;
      }
    }

    setIsRefillAllLoading(false);

    if (successCount > 0) {
      toast({
        title: "Refill em massa concluído!",
        description: `${successCount} pedido(s) com refill solicitado. ${errorCount > 0 ? `${errorCount} não permitiu refill.` : ''}`,
      });
    } else {
      toast({
        title: "Nenhum refill executado",
        description: "Nenhum pedido permite refill no momento.",
        variant: "destructive",
      });
    }
  };

  const getStatusDisplay = (status: string) => {
    const statusLower = status.toLowerCase();
    
    if (statusLower === "completed" || statusLower === "concluído" || statusLower === "concluido") {
      return { label: "Concluído", color: "text-success", bg: "bg-success/10" };
    }
    if (statusLower === "in progress" || statusLower === "inprogress" || statusLower === "em progresso") {
      return { label: "Em progresso", color: "text-warning", bg: "bg-warning/10" };
    }
    if (statusLower === "pending" || statusLower === "pendente") {
      return { label: "Pendente", color: "text-muted-foreground", bg: "bg-muted" };
    }
    if (statusLower === "partial" || statusLower === "parcial") {
      return { label: "Parcial", color: "text-warning", bg: "bg-warning/10" };
    }
    if (statusLower === "processing" || statusLower === "processando") {
      return { label: "Processando", color: "text-primary", bg: "bg-primary/10" };
    }
    if (statusLower === "canceled" || statusLower === "cancelled" || statusLower === "cancelado") {
      return { label: "Cancelado", color: "text-destructive", bg: "bg-destructive/10" };
    }
    if (statusLower === "refunded" || statusLower === "reembolsado") {
      return { label: "Reembolsado", color: "text-destructive", bg: "bg-destructive/10" };
    }
    return { label: status, color: "text-muted-foreground", bg: "bg-muted" };
  };

  // Filter orders
  const filteredOrders = orders.filter((order) => {
    // Search filter
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      const matchesId = order.id.toString().includes(query);
      const matchesLink = order.link?.toLowerCase().includes(query);
      const matchesService = order.serviceName?.toLowerCase().includes(query);
      if (!matchesId && !matchesLink && !matchesService) return false;
    }

    // Status filter
    if (statusFilter === "all") return true;
    if (!order.status) return statusFilter === "pending";
    const statusLower = order.status.status.toLowerCase();
    if (statusFilter === "progress") return statusLower.includes("progress");
    if (statusFilter === "completed") return statusLower.includes("completed") || statusLower.includes("conclu");
    if (statusFilter === "partial") return statusLower.includes("partial") || statusLower.includes("parcial");
    if (statusFilter === "pending") return statusLower.includes("pending") || statusLower.includes("pendente");
    if (statusFilter === "canceled") return statusLower.includes("cancel");
    return true;
  });

  const statusFilters = [
    { value: "all", label: "Tudo" },
    { value: "pending", label: "Pendente" },
    { value: "progress", label: "Em progresso" },
    { value: "completed", label: "Concluído" },
    { value: "partial", label: "Parcial" },
    { value: "canceled", label: "Cancelado" },
  ];


  return (
    <div className="min-h-screen">
      <main className="px-4 lg:px-6 py-8">
        <div className="flex flex-col lg:flex-row gap-6 mb-8">
          <div className="flex-1">
            <h1 className="text-3xl font-bold mb-2">Meus Pedidos</h1>
            <p className="text-muted-foreground">
              Gerencie e acompanhe todos os seus pedidos
            </p>
          </div>
          <div className="lg:w-80">
            <BalanceCard />
          </div>
        </div>

        {/* Import Orders */}
        <div className="glass rounded-xl p-6 border border-border/50 mb-6">
          <div className="flex items-center gap-2 mb-4">
            <Download className="w-5 h-5 text-primary" />
            <h3 className="font-semibold">Importar Pedidos Existentes</h3>
          </div>
          <p className="text-sm text-muted-foreground mb-4">
            Importe seus pedidos feitos no site original. Use IDs separados por vírgula (ex: 2700235, 2700137) ou um intervalo (ex: 2699000-2699050).
          </p>
          <div className="flex gap-4">
            <div className="relative flex-1">
              <Plus className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
              <Input
                placeholder="IDs dos pedidos (ex: 2700235, 2700137)"
                value={importOrderId}
                onChange={(e) => setImportOrderId(e.target.value)}
                className="pl-10"
              />
            </div>
            <Button 
              onClick={handleImportMultiple} 
              disabled={!importOrderId || isImporting}
            >
              {isImporting ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <>
                  <Download className="w-4 h-4 mr-2" />
                  Importar
                </>
              )}
            </Button>
          </div>
        </div>

        {/* Search */}
        <div className="glass rounded-xl p-4 border border-border/50 mb-6">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
            <Input
              placeholder="Procurar por ID, link ou serviço..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>
        </div>

        {/* Status Filters */}
        <div className="flex flex-wrap gap-2 mb-6">
          {statusFilters.map((filter) => (
            <Button
              key={filter.value}
              variant={statusFilter === filter.value ? "default" : "outline"}
              size="sm"
              onClick={() => setStatusFilter(filter.value)}
            >
              {filter.label}
            </Button>
          ))}
        </div>

        {/* Orders List */}
        <div className="glass rounded-xl border border-border/50 overflow-hidden">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 border-b border-border/50">
            <h3 className="font-semibold">
              Histórico de Pedidos
              {orders.length > 0 && (
                <span className="text-muted-foreground font-normal ml-2">
                  ({filteredOrders.length} de {orders.length})
                </span>
              )}
            </h3>
            {orders.length > 0 && (
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  onClick={() => setAutoRefresh(!autoRefresh)}
                  variant={autoRefresh ? "default" : "outline"}
                  size="sm"
                  className={autoRefresh ? "bg-green-600 hover:bg-green-700" : "border-muted-foreground/50"}
                >
                  <RefreshCw className={`w-4 h-4 sm:mr-2 ${autoRefresh ? "animate-spin" : ""}`} />
                  <span className="hidden sm:inline">{autoRefresh ? "Auto: ON" : "Auto: OFF"}</span>
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleRefillAll}
                  disabled={isRefillAllLoading || loadingOrders.size > 0}
                  className="text-primary border-primary/30 hover:bg-primary/10"
                >
                  {isRefillAllLoading ? (
                    <Loader2 className="w-4 h-4 sm:mr-2 animate-spin" />
                  ) : (
                    <Play className="w-4 h-4 sm:mr-2" />
                  )}
                  <span className="hidden sm:inline">Refill Todos</span>
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={refreshAllOrders}
                  disabled={loadingOrders.size > 0}
                >
                  <RefreshCw className={`w-4 h-4 sm:mr-2 ${loadingOrders.size > 0 ? 'animate-spin' : ''}`} />
                  <span className="hidden sm:inline">Atualizar</span>
                </Button>
              </div>
            )}
          </div>

          {isLoadingOrders ? (
            <div className="text-center py-12 px-4">
              <Loader2 className="w-12 h-12 text-primary mx-auto mb-4 animate-spin" />
              <p className="text-muted-foreground">
                Carregando seus pedidos...
              </p>
            </div>
          ) : orders.length === 0 ? (
            <div className="text-center py-12 px-4">
              <Package className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
              <p className="text-muted-foreground mb-2">
                Nenhum pedido encontrado.
              </p>
              <p className="text-sm text-muted-foreground mb-4">
                Importe seus pedidos existentes ou faça um novo pedido.
              </p>
              <Link to="/new-order">
                <Button>Fazer Primeiro Pedido</Button>
              </Link>
            </div>
          ) : filteredOrders.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-muted-foreground">
                Nenhum pedido encontrado.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto scrollbar-hide">
              <table className="w-full table-auto">
                <thead className="bg-muted/30">
                  <tr>
                    <th className="text-left py-3 px-2 text-xs font-medium text-muted-foreground whitespace-nowrap">ID</th>
                    <th className="text-left py-3 px-2 text-xs font-medium text-muted-foreground hidden md:table-cell whitespace-nowrap">Data</th>
                    <th className="text-left py-3 px-2 text-xs font-medium text-muted-foreground min-w-[200px]">Link</th>
                    <th className="text-left py-3 px-2 text-xs font-medium text-muted-foreground whitespace-nowrap">Valor</th>
                    <th className="text-left py-3 px-2 text-xs font-medium text-muted-foreground hidden lg:table-cell whitespace-nowrap">Início</th>
                    <th className="text-left py-3 px-2 text-xs font-medium text-muted-foreground hidden sm:table-cell whitespace-nowrap">Qtd</th>
                    <th className="text-left py-3 px-2 text-xs font-medium text-muted-foreground hidden xl:table-cell whitespace-nowrap">Serviço</th>
                    <th className="text-left py-3 px-2 text-xs font-medium text-muted-foreground whitespace-nowrap">Status</th>
                    <th className="text-left py-3 px-2 text-xs font-medium text-muted-foreground hidden sm:table-cell whitespace-nowrap">Restam</th>
                    <th className="text-right py-3 px-2 text-xs font-medium text-muted-foreground whitespace-nowrap">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredOrders.map((order) => {
                    const statusDisplay = order.status ? getStatusDisplay(order.status.status) : null;

                    return (
                      <tr key={order.id} className="border-b border-border/30 hover:bg-muted/10 transition-colors">
                        <td className="py-2 px-2">
                          <span className="font-bold text-xs">{order.id}</span>
                        </td>
                        <td className="py-2 px-2 text-xs text-muted-foreground whitespace-nowrap hidden md:table-cell">
                          {format(new Date(order.createdAt), "dd/MM/yy HH:mm", { locale: ptBR })}
                        </td>
                        <td className="py-2 px-2">
                          {order.link ? (
                            <div className="flex flex-col gap-1">
                              <a
                                href={order.link}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-primary hover:underline break-all text-xs"
                              >
                                {order.link}
                              </a>
                              <ProviderOrderIdCopy id={order.id} className="text-[11px] inline-flex items-center" />
                            </div>
                          ) : (
                            <span className="text-muted-foreground text-xs">-</span>
                          )}
                        </td>
                        <td className="py-2 px-2">
                          {order.status ? (
                            <span className="font-medium text-xs whitespace-nowrap">{formatCurrency(parseFloat(order.status.charge), 4)}</span>
                          ) : (
                            <span className="text-muted-foreground text-xs">-</span>
                          )}
                        </td>
                        <td className="py-2 px-2 hidden lg:table-cell text-xs">
                          {order.status?.start_count || "-"}
                        </td>
                        <td className="py-2 px-2 hidden sm:table-cell text-xs">
                          {order.quantity > 0 ? order.quantity : "-"}
                        </td>
                        <td className="py-2 px-2 hidden xl:table-cell">
                          {order.serviceName ? (
                            <span className="truncate block text-xs" title={order.serviceName}>
                              {order.serviceName}
                            </span>
                          ) : (
                            <span className="text-muted-foreground text-xs">-</span>
                          )}
                        </td>
                        <td className="py-2 px-2">
                          {statusDisplay ? (
                            <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium whitespace-nowrap ${statusDisplay.color}`}>
                              {statusDisplay.label}
                            </span>
                          ) : (
                            <span className="text-muted-foreground text-[10px]">Aguardando</span>
                          )}
                        </td>
                        <td className="py-2 px-2 font-medium text-xs hidden sm:table-cell">
                          {order.status?.remains || "-"}
                        </td>
                        <td className="py-2 px-2">
                          <div className="flex items-center justify-end gap-0">
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => refreshOrderStatus(order.id)}
                              disabled={loadingOrders.has(order.id)}
                              className="h-7 w-7"
                            >
                              <RefreshCw className={`w-3.5 h-3.5 ${loadingOrders.has(order.id) ? 'animate-spin' : ''}`} />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleRefillOrder(order)}
                              disabled={refillingOrders.has(order.id)}
                              className="h-7 text-[10px] px-2"
                            >
                              {refillingOrders.has(order.id) ? (
                                <Loader2 className="w-3 h-3 animate-spin" />
                              ) : (
                                "Refill"
                              )}
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleDeleteOrder(order.id)}
                              className="h-7 w-7 text-destructive hover:text-destructive"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Info Note */}
        <div className="mt-6 p-4 glass rounded-lg border border-border/50">
          <div className="flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-muted-foreground flex-shrink-0 mt-0.5" />
            <div className="text-sm text-muted-foreground">
              <p className="font-medium mb-1">Nota sobre pedidos importados:</p>
              <p>A API só retorna informações de status (valor, início, restante). Link, quantidade e serviço só aparecem para pedidos feitos pelo nosso painel. Para ver todas as informações, faça novos pedidos pelo painel.</p>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
};

export default Orders;
