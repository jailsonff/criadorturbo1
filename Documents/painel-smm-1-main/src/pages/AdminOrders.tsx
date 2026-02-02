import { useState, useEffect, useMemo, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { getSupabaseClient } from "@/lib/supabaseClient";
import { useToast } from "@/hooks/use-toast";
import { formatCurrency } from "@/lib/utils";
import { useOrderStatusSync } from "@/hooks/useOrderStatusSync";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { 
  ShoppingCart, 
  Search, 
  RefreshCw, 
  ExternalLink,
  Clock,
  CheckCircle,
  XCircle,
  AlertCircle,
  Play,
  Package,
  Zap
} from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

interface Order {
  id: string;
  order_id: number;
  user_id: string;
  service_id: number;
  service_name: string;
  link: string;
  quantity: number;
  charge: number | null;
  status: string;
  start_count: string | null;
  remains: string | null;
  created_at: string;
  user_email?: string;
}

const AdminOrders = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [orders, setOrders] = useState<Order[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [refreshing, setRefreshing] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(true);

  const fetchOrders = async () => {
    const supabase = getSupabaseClient();
    try {
      const { data: ordersData, error: ordersError } = await supabase
        .from("orders")
        .select("*")
        .order("created_at", { ascending: false });

      if (ordersError) throw ordersError;

      // Get user emails
      const userIds = [...new Set(ordersData?.map(o => o.user_id) || [])];
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, email")
        .in("id", userIds);

      const profileMap = new Map(profiles?.map(p => [p.id, p.email]) || []);

      const ordersWithEmail = ordersData?.map(order => ({
        ...order,
        user_email: profileMap.get(order.user_id) || "Desconhecido"
      })) || [];

      setOrders(ordersWithEmail);
    } catch (error) {
      console.error("Error fetching orders:", error);
      toast({
        title: "Erro",
        description: "Erro ao carregar pedidos.",
        variant: "destructive",
      });
    }
  };

  useEffect(() => {
    const checkAdminAndFetch = async () => {
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
      await fetchOrders();
      setLoading(false);
    };

    checkAdminAndFetch();
  }, [user, navigate, toast]);

  // Real-time status sync with API
  const orderIds = useMemo(() => orders.map(o => o.order_id), [orders]);
  
  const handleStatusUpdate = useCallback((orderId: number, status: { status?: string; start_count?: string; remains?: string; charge?: string }) => {
    setOrders(prev => prev.map(order => 
      order.order_id === orderId 
        ? { 
            ...order, 
            status: status.status || order.status,
            start_count: status.start_count || order.start_count,
            remains: status.remains || order.remains,
            charge: status.charge ? parseFloat(status.charge) : order.charge
          } 
        : order
    ));
  }, []);

  const { syncNow } = useOrderStatusSync(orderIds, {
    enabled: autoRefresh && isAdmin && !loading,
    intervalMs: 30000, // Sync every 30 seconds
    onStatusUpdate: handleStatusUpdate,
  });

  const handleRefresh = async () => {
    setRefreshing(true);
    await syncNow();
    await fetchOrders();
    setRefreshing(false);
    toast({
      title: "Atualizado",
      description: "Status dos pedidos atualizados via API.",
    });
  };

  const formatDate = (dateString: string) => {
    return format(new Date(dateString), "dd/MM/yyyy, HH:mm", { locale: ptBR });
  };

  const getStatusBadge = (status: string) => {
    const statusConfig: Record<string, { color: string; icon: React.ReactNode; label: string }> = {
      pending: { color: "border-yellow-500/50 text-yellow-500", icon: <Clock className="w-3 h-3 mr-1" />, label: "Pendente" },
      processing: { color: "border-blue-500/50 text-blue-500", icon: <Play className="w-3 h-3 mr-1" />, label: "Processando" },
      in_progress: { color: "border-blue-500/50 text-blue-500", icon: <Play className="w-3 h-3 mr-1" />, label: "Em andamento" },
      completed: { color: "border-green-500/50 text-green-500", icon: <CheckCircle className="w-3 h-3 mr-1" />, label: "Completo" },
      partial: { color: "border-orange-500/50 text-orange-500", icon: <AlertCircle className="w-3 h-3 mr-1" />, label: "Parcial" },
      canceled: { color: "border-red-500/50 text-red-500", icon: <XCircle className="w-3 h-3 mr-1" />, label: "Cancelado" },
      refunded: { color: "border-purple-500/50 text-purple-500", icon: <RefreshCw className="w-3 h-3 mr-1" />, label: "Reembolsado" },
    };

    const config = statusConfig[status.toLowerCase()] || { 
      color: "border-muted-foreground/50 text-muted-foreground", 
      icon: <Package className="w-3 h-3 mr-1" />, 
      label: status 
    };

    return (
      <Badge variant="outline" className={config.color}>
        {config.icon}
        {config.label}
      </Badge>
    );
  };

  const filteredOrders = useMemo(() => {
    return orders.filter(order => {
      // Status filter
      if (statusFilter !== "all" && order.status.toLowerCase() !== statusFilter) {
        return false;
      }

      // Search filter
      if (searchQuery) {
        const query = searchQuery.toLowerCase();
        return (
          order.order_id.toString().includes(query) ||
          order.link.toLowerCase().includes(query) ||
          order.service_name.toLowerCase().includes(query) ||
          order.user_email?.toLowerCase().includes(query) ||
          order.service_id.toString().includes(query)
        );
      }

      return true;
    });
  }, [orders, statusFilter, searchQuery]);

  const stats = useMemo(() => {
    const total = orders.length;
    const pending = orders.filter(o => o.status.toLowerCase() === "pending").length;
    const processing = orders.filter(o => ["processing", "in_progress"].includes(o.status.toLowerCase())).length;
    const completed = orders.filter(o => o.status.toLowerCase() === "completed").length;
    return { total, pending, processing, completed };
  }, [orders]);

  if (!isAdmin && !loading) {
    return null;
  }

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold gradient-text flex items-center gap-2">
            <ShoppingCart className="w-8 h-8" />
            Todos os Pedidos
          </h1>
          <p className="text-muted-foreground mt-1">
            Visualize e gerencie todos os pedidos dos usuários
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            onClick={() => setAutoRefresh(!autoRefresh)}
            variant={autoRefresh ? "default" : "outline"}
            className={autoRefresh ? "bg-green-600 hover:bg-green-700" : "border-muted-foreground/50"}
            size="sm"
          >
            <Zap className={`w-4 h-4 mr-2 ${autoRefresh ? "animate-pulse" : ""}`} />
            {autoRefresh ? "Tempo Real: ON" : "Tempo Real: OFF"}
          </Button>
          <Button
            onClick={handleRefresh}
            variant="outline"
            className="border-primary/50 hover:bg-primary/10"
            disabled={refreshing}
          >
            <RefreshCw className={`w-4 h-4 mr-2 ${refreshing ? "animate-spin" : ""}`} />
            Atualizar
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="glass-card border-border/50">
          <CardContent className="pt-4">
            <p className="text-sm text-muted-foreground">Total</p>
            <p className="text-2xl font-bold text-primary">{stats.total}</p>
          </CardContent>
        </Card>
        <Card className="glass-card border-border/50">
          <CardContent className="pt-4">
            <p className="text-sm text-muted-foreground">Pendentes</p>
            <p className="text-2xl font-bold text-yellow-500">{stats.pending}</p>
          </CardContent>
        </Card>
        <Card className="glass-card border-border/50">
          <CardContent className="pt-4">
            <p className="text-sm text-muted-foreground">Processando</p>
            <p className="text-2xl font-bold text-blue-500">{stats.processing}</p>
          </CardContent>
        </Card>
        <Card className="glass-card border-border/50">
          <CardContent className="pt-4">
            <p className="text-sm text-muted-foreground">Completos</p>
            <p className="text-2xl font-bold text-green-500">{stats.completed}</p>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card className="glass-card border-border/50">
        <CardContent className="pt-6">
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar por ID, link, serviço ou usuário..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-full sm:w-48">
                <SelectValue placeholder="Filtrar por status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os status</SelectItem>
                <SelectItem value="pending">Pendente</SelectItem>
                <SelectItem value="processing">Processando</SelectItem>
                <SelectItem value="in_progress">Em andamento</SelectItem>
                <SelectItem value="completed">Completo</SelectItem>
                <SelectItem value="partial">Parcial</SelectItem>
                <SelectItem value="canceled">Cancelado</SelectItem>
                <SelectItem value="refunded">Reembolsado</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Orders Table */}
      <Card className="glass-card border-border/50">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Package className="w-5 h-5 text-primary" />
            Pedidos ({filteredOrders.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-2">
              {[...Array(5)].map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : filteredOrders.length === 0 ? (
            <div className="text-center py-12">
              <ShoppingCart className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
              <p className="text-muted-foreground">
                {orders.length === 0 
                  ? "Nenhum pedido encontrado no sistema."
                  : "Nenhum pedido corresponde aos filtros aplicados."
                }
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto scrollbar-hide">
              <Table>
                <TableHeader>
                  <TableRow className="border-border/50">
                    <TableHead className="text-xs sm:text-sm">ID</TableHead>
                    <TableHead className="text-xs sm:text-sm hidden md:table-cell">Usuário</TableHead>
                    <TableHead className="text-xs sm:text-sm">Serviço</TableHead>
                    <TableHead className="text-xs sm:text-sm hidden lg:table-cell min-w-[400px]">Link</TableHead>
                    <TableHead className="text-center text-xs sm:text-sm hidden sm:table-cell">Qtd</TableHead>
                    <TableHead className="text-right text-xs sm:text-sm">Valor</TableHead>
                    <TableHead className="text-xs sm:text-sm">Status</TableHead>
                    <TableHead className="text-center text-xs sm:text-sm hidden sm:table-cell">Restam</TableHead>
                    <TableHead className="text-xs sm:text-sm hidden xl:table-cell">Data</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredOrders.map((order) => (
                    <TableRow key={order.id} className="border-border/30">
                      <TableCell className="font-mono text-xs sm:text-sm">
                        {order.order_id}
                      </TableCell>
                      <TableCell className="hidden md:table-cell">
                        <span className="text-xs sm:text-sm text-muted-foreground max-w-[150px] truncate block">
                          {order.user_email}
                        </span>
                      </TableCell>
                      <TableCell>
                        <div className="max-w-[120px] sm:max-w-[200px]">
                          <p className="font-medium text-xs sm:text-sm truncate" title={order.service_name}>
                            {order.service_name}
                          </p>
                          <p className="text-[10px] sm:text-xs text-muted-foreground">
                            ID: {order.service_id}
                          </p>
                        </div>
                      </TableCell>
                      <TableCell className="hidden lg:table-cell min-w-[400px]">
                        <a
                          href={order.link}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-1 text-primary hover:underline text-xs sm:text-sm"
                        >
                          <ExternalLink className="w-3 h-3 shrink-0" />
                          {order.link}
                        </a>
                      </TableCell>
                      <TableCell className="text-center text-xs sm:text-sm hidden sm:table-cell">
                        {order.quantity.toLocaleString()}
                      </TableCell>
                      <TableCell className="text-right text-xs sm:text-sm">
                        {order.charge ? formatCurrency(order.charge, 2) : "-"}
                      </TableCell>
                      <TableCell>
                        {getStatusBadge(order.status)}
                      </TableCell>
                      <TableCell className="text-center font-mono text-xs sm:text-sm hidden sm:table-cell">
                        {order.remains !== null && order.remains !== undefined ? order.remains : "-"}
                      </TableCell>
                      <TableCell className="text-xs sm:text-sm text-muted-foreground whitespace-nowrap hidden xl:table-cell">
                        {formatDate(order.created_at)}
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
};

export default AdminOrders;
