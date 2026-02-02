import { useMemo, useState, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { Json, Tables } from "@/integrations/supabase/types";
import { clearExternalConfig, getExternalConfig, getSupabaseClient } from "@/lib/supabaseClient";
import { backendSupabase } from "@/lib/backendClient";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";
import { formatCurrency } from "@/lib/utils";
import { Search, Loader2, ShoppingCart, Phone, RefreshCw, Trash2, Copy, ExternalLink, AlertCircle } from "lucide-react";
import { format, subHours } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import ProviderOrderIdCopy from "@/components/orders/ProviderOrderIdCopy";

type StoreOrderRow = Tables<"store_orders">;

type StoreOrder = StoreOrderRow & {
  store_frontends?: { name: string } | null;
  store_packages?: { package_type?: string | null; combo_items?: Json | null } | null;
};

const mapStatusLabel = (status: string | null | undefined) => {
  const s = String(status || "").toLowerCase();
  if (s === "completed") return "Concluído";
  if (s === "processing" || s === "in progress" || s === "pending") return "Processando";
  if (s === "partial") return "Parcial";
  if (s === "cancelled" || s === "canceled" || s === "refunded") return "Cancelado";
  if (s === "error" || s === "failed") return "Erro";
  return "—";
};

export default function AdminStoreOrders() {
  const { user } = useAuth();
  const supabase = getSupabaseClient();
  const externalDb = getExternalConfig();

  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<number>(25);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isCleaningPending, setIsCleaningPending] = useState(false);
  const [updatingStatusId, setUpdatingStatusId] = useState<string | null>(null);
  const [retryingOrderId, setRetryingOrderId] = useState<string | null>(null);
  const statusSelectValue = statusFilter || "all";
  const pageSizeSelectValue = String(pageSize);

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast({ title: "Link copiado!", duration: 1500 });
  };

  const { data: orders = [], isLoading } = useQuery<StoreOrder[]>({
    queryKey: ["admin-store-orders"],
    queryFn: async () => {
      // Include pending-payment orders so admins can review/clean them.
      const { data, error } = await supabase
        .from("store_orders")
        .select(
          `
          *,
          store_frontends(name),
          store_packages(package_type, combo_items)
        `,
        )
        .or(
          "payment_status.eq.pending,payment_status.eq.approved,order_status.eq.processing,order_status.eq.completed",
        )
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return (data ?? []) as unknown as StoreOrder[];
    },
    // Realtime subscription (below) is the primary way we keep UI fresh.
    // This is just a safety net in case the client misses events.
    refetchInterval: 30000,
  });

  // Clean up old pending orders (older than 1 hour)
  const cleanupOldPendingOrders = async () => {
    const oneHourAgo = subHours(new Date(), 1).toISOString();
    try {
      const { error } = await supabase
        .from("store_orders")
        .delete()
        .eq("payment_status", "pending")
        .lt("created_at", oneHourAgo);
      
      if (error) {
        console.error("Error cleaning old pending orders:", error);
      }
    } catch (err) {
      console.error("Cleanup error:", err);
    }
  };

  // Run cleanup on mount
  useEffect(() => {
    cleanupOldPendingOrders();
  }, []);

  // Manual cleanup button handler
  const handleCleanupPending = async () => {
    setIsCleaningPending(true);
    try {
      const { error } = await supabase
        .from("store_orders")
        .delete()
        .eq("payment_status", "pending");
      
      if (error) throw error;
      
      await queryClient.invalidateQueries({ queryKey: ["admin-store-orders"] });
      toast({
        title: "Limpeza concluída",
        description: "Pedidos pendentes não pagos foram removidos.",
      });
    } catch (error: any) {
      toast({
        title: "Erro",
        description: error.message || "Falha ao limpar pedidos pendentes.",
        variant: "destructive",
      });
    } finally {
      setIsCleaningPending(false);
    }
  };

  // Sync processing orders on page load and periodically
  const syncProcessingOrders = async () => {
    // Sync when we have at least one paid order that already has provider ids.
    // Include 'error' because transient provider/network errors can be recovered by resync.
    const hasSyncableProcessing = orders.some((o) => {
      const st = String(o.order_status || "").toLowerCase();
      const isTrackable = ["processing", "pending", "partial", "error"].includes(st);
      const hasExternal =
        Boolean(o.external_order_id) || (Array.isArray(o.external_order_ids) && o.external_order_ids.length > 0);
      return isTrackable && hasExternal;
    });

    if (!hasSyncableProcessing) return;

    setIsSyncing(true);
    try {
      await backendSupabase.functions.invoke("store-order-process", {
        body: {
          action: "sync_all_processing",
          externalDb: externalDb?.serviceRoleKey
            ? { url: externalDb.url, serviceRoleKey: externalDb.serviceRoleKey }
            : undefined,
        },
      });
      queryClient.invalidateQueries({ queryKey: ["admin-store-orders"] });
    } catch (error) {
      console.error("Error syncing orders:", error);
    } finally {
      setIsSyncing(false);
    }
  };

  // Realtime: update UI instantly when any order row changes
  useEffect(() => {
    const channel = supabase
      .channel("admin-store-orders")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "store_orders" },
        () => {
          queryClient.invalidateQueries({ queryKey: ["admin-store-orders"] });
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [supabase, queryClient]);

  // Sync on mount and whenever the tab regains focus
  useEffect(() => {
    const onFocus = () => {
      if (
        !isSyncing &&
        orders.some((o) => ["processing", "pending", "partial", "error"].includes(String(o.order_status)))
      ) {
        syncProcessingOrders();
      }
    };
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [orders, isSyncing]);

  // Sync on mount (once, right after orders load)
  useEffect(() => {
    if (orders.length > 0) syncProcessingOrders();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orders.length]);

  // Keep syncing in-progress orders frequently (API side)
  useEffect(() => {
    const interval = setInterval(() => {
      if (
        !isSyncing &&
        orders.some((o) => ["processing", "pending", "partial", "error"].includes(String(o.order_status)))
      ) {
        syncProcessingOrders();
      }
    }, 10000);
    return () => clearInterval(interval);
  }, [orders, isSyncing]);


  const handleManualSync = async () => {
    setIsSyncing(true);
    try {
      await backendSupabase.functions.invoke("store-order-process", {
        body: {
          action: "sync_all_processing",
          externalDb: externalDb?.serviceRoleKey
            ? { url: externalDb.url, serviceRoleKey: externalDb.serviceRoleKey }
            : undefined,
        },
      });
      await queryClient.invalidateQueries({ queryKey: ["admin-store-orders"] });
      toast({
        title: "Sincronizado",
        description: "Status dos pedidos atualizados com sucesso.",
      });
    } catch (error) {
      toast({
        title: "Erro",
        description: "Falha ao sincronizar status dos pedidos.",
        variant: "destructive",
      });
    } finally {
      setIsSyncing(false);
    }
  };

  const extractOrderLinksForSearch = (order: StoreOrder): string[] => {
    const out: string[] = [];

    const push = (v: unknown) => {
      const s = String(v || "").trim();
      if (s) out.push(s);
    };

    // Direct link for single orders
    if (order.link && String(order.link).toLowerCase() !== "combo") {
      push(order.link);
    }

    // order_payload.links (single or multi-link)
    const payload: any = order.order_payload as any;
    const payloadLinks = payload?.links;
    if (Array.isArray(payloadLinks)) {
      for (const l of payloadLinks) push(l);
    }

    // order_payload.items[].links (combo)
    const payloadItems = payload?.items;
    if (Array.isArray(payloadItems)) {
      for (const it of payloadItems) {
        if (Array.isArray(it?.links)) {
          for (const l of it.links) push(l);
        }
      }
    }

    // external_order_ids[].link (after being sent)
    const ext: any = order.external_order_ids as any;
    if (Array.isArray(ext)) {
      for (const row of ext) push(row?.link);
    }

    // De-dupe
    return Array.from(new Set(out));
  };

  const filteredOrders = orders.filter((order) => {
    const q = String(search || "").trim().toLowerCase();
    const matchesSearch =
      !q ||
      order.phone.includes(search) ||
      order.service_name?.toLowerCase().includes(q) ||
      // direct link column (single orders)
      order.link.toLowerCase().includes(q) ||
      // payload/external links (combo + multi-link)
      extractOrderLinksForSearch(order).some((l) => l.toLowerCase().includes(q));

    const matchesStatus =
      !statusFilter ||
      (statusFilter === "awaiting_payment"
        ? order.payment_status === "pending"
        : order.order_status === statusFilter);

    return matchesSearch && matchesStatus;
  });

  // Reset page when filters change
  useEffect(() => {
    setPage(1);
  }, [search, statusFilter, pageSize]);

  const totalPages = Math.max(1, Math.ceil(filteredOrders.length / pageSize));
  const safePage = Math.min(Math.max(1, page), totalPages);

  useEffect(() => {
    if (safePage !== page) setPage(safePage);
  }, [safePage, page]);

  const paginatedOrders = useMemo(() => {
    const start = (safePage - 1) * pageSize;
    return filteredOrders.slice(start, start + pageSize);
  }, [filteredOrders, pageSize, safePage]);

  const pageItems = useMemo(() => {
    // Show: 1 ... (p-1) p (p+1) ... last
    const last = totalPages;
    if (last <= 7) return Array.from({ length: last }, (_, i) => i + 1);

    const items: Array<number | "ellipsis"> = [];
    const push = (v: number | "ellipsis") => items.push(v);

    push(1);
    const start = Math.max(2, safePage - 1);
    const end = Math.min(last - 1, safePage + 1);
    if (start > 2) push("ellipsis");
    for (let p = start; p <= end; p++) push(p);
    if (end < last - 1) push("ellipsis");
    push(last);
    return items;
  }, [safePage, totalPages]);

  const handleSetManualOrderStatus = async (order: StoreOrder, nextStatus: string) => {
    const allowed = new Set(["pending", "processing", "partial", "completed", "cancelled", "error"]);
    if (!allowed.has(String(nextStatus))) {
      toast({
        title: "Status inválido",
        description: "Selecione um status válido.",
        variant: "destructive",
      });
      return;
    }

    // Se existir status por link (external_order_ids), manter a UI consistente ao atualizar todos os sub-status.
    const maybeExternalRows = order.external_order_ids as any;
    const nextExternalOrderIds = Array.isArray(maybeExternalRows)
      ? maybeExternalRows.map((r: any) => ({ ...r, order_status: nextStatus }))
      : undefined;

    setUpdatingStatusId(order.id);
    try {
      const patch: any = { order_status: nextStatus };
      if (nextExternalOrderIds !== undefined) patch.external_order_ids = nextExternalOrderIds;

      const { error } = await supabase.from("store_orders").update(patch).eq("id", order.id);

      if (error) throw error;

      toast({
        title: "Status atualizado",
        description: `Pedido marcado como: ${mapStatusLabel(nextStatus)}`,
      });

      await queryClient.invalidateQueries({ queryKey: ["admin-store-orders"] });
    } catch (e: any) {
      toast({
        title: "Erro",
        description: e?.message || "Falha ao atualizar o status.",
        variant: "destructive",
      });
    } finally {
      setUpdatingStatusId(null);
    }
  };

  const canResendToApi = (order: StoreOrder) => {
    const paid = order.payment_status === "approved";
    const hasExternalSingle = Boolean(order.external_order_id);
    const hasExternalCombo = Array.isArray(order.external_order_ids) && order.external_order_ids.length > 0;
    const alreadySent = hasExternalSingle || hasExternalCombo;
   const hasError = order.order_status === "error" || order.order_status === "failed";
   // Allow resend if: paid AND (not sent yet OR has error status)
   return paid && (!alreadySent || hasError);
  };

  const handleResendToApi = async (order: StoreOrder) => {
    if (!canResendToApi(order)) {
      toast({
        title: "Não é possível reenviar",
        description: "Só é possível reenviar pedidos pagos que ainda não foram enviados para o provedor.",
        variant: "destructive",
      });
      return;
    }

    setRetryingOrderId(order.id);
    try {
      // Reset order to a processable state (the backend claims only pending+paid+no external ids)
      const { error: resetError } = await supabase
        .from("store_orders")
        .update({
          order_status: "pending",
          external_order_id: null,
          external_order_ids: null,
        })
        .eq("id", order.id)
        .eq("payment_status", "approved");

      if (resetError) throw resetError;

      const { data, error } = await backendSupabase.functions.invoke("store-order-process", {
        body: {
          order_id: order.id,
          action: "process_paid_order",
          externalDb: externalDb?.serviceRoleKey
            ? { url: externalDb.url, serviceRoleKey: externalDb.serviceRoleKey }
            : undefined,
        },
      });

      if (error) throw error;

      toast({
        title: "Reenvio iniciado",
        description: "Pedido reenviado para processamento. Atualize o status em alguns segundos.",
      });

      await queryClient.invalidateQueries({ queryKey: ["admin-store-orders"] });
      // If the function returned something useful, keep it in console only.
      console.log("[admin-store-orders] resend result", data);
    } catch (e: any) {
      toast({
        title: "Erro ao reenviar",
        description: e?.message || "Falha ao reenviar o pedido para a API.",
        variant: "destructive",
      });
    } finally {
      setRetryingOrderId(null);
    }
  };

  const isComboOrder = (order: StoreOrder) => {
    const pkgType = String(order.store_packages?.package_type || "").toLowerCase();
    const payloadType = String((order.order_payload as any)?.type || "").toLowerCase();
    return pkgType === "combo" || payloadType === "combo" || order.link === "combo";
  };

  const getComboItemsSummary = (order: StoreOrder) => {
    const payloadItems = (order.order_payload as any)?.items;
    const items: Array<{ service_id: number; quantity: number; links: string[] }> = Array.isArray(payloadItems)
      ? payloadItems
      : [];

    const comboConfig: Array<{ service_id: number; link_label?: string }> = Array.isArray(order.store_packages?.combo_items)
      ? (order.store_packages?.combo_items as any)
      : [];

    const labelByServiceId = new Map<number, string>();
    for (const it of comboConfig) {
      const sid = Number((it as any)?.service_id);
      if (!sid) continue;
      const lbl = String((it as any)?.link_label || "").trim();
      if (lbl) labelByServiceId.set(sid, lbl);
    }

    return items
      .map((it) => {
        const serviceId = Number(it.service_id) || 0;
        const label = labelByServiceId.get(serviceId) || `Serviço ${serviceId}`;
        const linksCount = Array.isArray(it.links) ? it.links.filter(Boolean).length : 0;
        return {
          serviceId,
          label,
          quantity: Number(it.quantity) || 0,
          linksCount,
        };
      })
      .filter((it) => it.serviceId > 0 && (it.quantity > 0 || it.linksCount > 0));
  };

  const getComboExternalIds = (order: StoreOrder) => {
    const idsRaw = order.external_order_ids as any;
    const rows: Array<{ external_order_id: number }> = Array.isArray(idsRaw) ? idsRaw : [];
    return rows
      .map((r) => Number((r as any)?.external_order_id) || 0)
      .filter((n) => n > 0);
  };

  const getComboLinksCount = (order: StoreOrder) => {
    const items = getComboItemsSummary(order);
    return items.reduce((sum, it) => sum + (it.linksCount || 0), 0);
  };

  const getPaymentBadge = (status: string | null) => {
    switch (status) {
      case "approved":
        return <Badge className="bg-green-500">Pago</Badge>;
      case "pending":
        return <Badge variant="outline" className="text-yellow-500 border-yellow-500">Aguardando</Badge>;
      default:
        return <Badge variant="secondary">{status || "—"}</Badge>;
    }
  };

  const getOrderBadge = (status: string | null) => {
    switch (status) {
      case "completed":
        return <Badge className="bg-green-500">Concluído</Badge>;
      case "processing":
        return <Badge className="bg-blue-500">Processando</Badge>;
      case "pending":
        return <Badge variant="outline">Pendente</Badge>;
      case "failed":
      case "error":
        return <Badge variant="destructive">Erro</Badge>;
      default:
        return <Badge variant="secondary">{status || "—"}</Badge>;
    }
  };

  const stats = {
    total: orders.length,
    pending: orders.filter((o) => o.payment_status === "pending").length,
    paid: orders.filter((o) => o.payment_status === "approved").length,
    completed: orders.filter((o) => o.order_status === "completed").length,
    revenue: orders
      .filter((o) => o.payment_status === "approved")
      .reduce((sum, o) => sum + o.total_price, 0),
  };

  return (
      <div className="space-y-6 p-4 md:p-6 w-full min-w-0">
        {externalDb?.url && (
          <Alert>
            <AlertTitle>Você está usando banco externo</AlertTitle>
            <AlertDescription className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <span className="text-sm text-muted-foreground">
                Atual: <span className="font-medium">{new URL(externalDb.url).hostname}</span>. Se seus pedidos sumiram,
                é porque este banco não tem os dados do banco padrão.
              </span>
              <Button
                variant="outline"
                onClick={async () => {
                  try {
                    if (user?.id) {
                      // Remove server-side backup of external DB config to prevent auto-restore
                      await backendSupabase.from("external_database_configs").delete().eq("user_id", user.id);
                    }
                  } catch (e) {
                    // Non-blocking: localStorage clear is still enough to switch in this browser.
                    console.warn("Could not clear backend external DB config", e);
                  } finally {
                    clearExternalConfig();
                    window.location.reload();
                  }
                }}
              >
                Voltar para Lovable Cloud
              </Button>
            </AlertDescription>
          </Alert>
        )}

        <div>
          <h1 className="text-2xl font-bold">Pedidos da Loja</h1>
          <p className="text-muted-foreground">
            Todos os pedidos recebidos via frontend de vendas
          </p>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <Card>
            <CardContent className="pt-4">
              <p className="text-sm text-muted-foreground">Total</p>
              <p className="text-2xl font-bold">{stats.total}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <p className="text-sm text-muted-foreground">Aguardando</p>
              <p className="text-2xl font-bold text-yellow-500">{stats.pending}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <p className="text-sm text-muted-foreground">Pagos</p>
              <p className="text-2xl font-bold text-green-500">{stats.paid}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <p className="text-sm text-muted-foreground">Concluídos</p>
              <p className="text-2xl font-bold text-blue-500">{stats.completed}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <p className="text-sm text-muted-foreground">Receita</p>
              <p className="text-2xl font-bold text-primary">{formatCurrency(stats.revenue)}</p>
            </CardContent>
          </Card>
        </div>

        {/* Filters */}
        <Card>
          <CardHeader>
            <div className="flex flex-col sm:flex-row gap-4">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder="Buscar por telefone, serviço ou link..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-9"
                />
              </div>
              <Select
                value={statusSelectValue}
                onValueChange={(v) => setStatusFilter(v === "all" ? "" : v)}
              >
                <SelectTrigger className="w-full sm:w-48">
                  <SelectValue placeholder="Filtrar status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  <SelectItem value="awaiting_payment">Aguardando Pagamento</SelectItem>
                  <SelectItem value="pending">Pendente</SelectItem>
                  <SelectItem value="processing">Processando</SelectItem>
                  <SelectItem value="completed">Concluído</SelectItem>
                  <SelectItem value="failed">Erro</SelectItem>
                </SelectContent>
              </Select>

              <Select
                value={pageSizeSelectValue}
                onValueChange={(v) => setPageSize(Number(v))}
              >
                <SelectTrigger className="w-full sm:w-44">
                  <SelectValue placeholder="Por página" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="10">10 / página</SelectItem>
                  <SelectItem value="25">25 / página</SelectItem>
                  <SelectItem value="50">50 / página</SelectItem>
                  <SelectItem value="100">100 / página</SelectItem>
                </SelectContent>
              </Select>

              <Button
                variant="outline"
                onClick={handleManualSync}
                disabled={isSyncing}
                className="gap-2"
              >
                <RefreshCw className={`w-4 h-4 ${isSyncing ? "animate-spin" : ""}`} />
                Atualizar Status
              </Button>
              <Button
                variant="outline"
                onClick={handleCleanupPending}
                disabled={isCleaningPending}
                className="gap-2 text-destructive hover:text-destructive"
              >
                {isCleaningPending ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Trash2 className="w-4 h-4" />
                )}
                Limpar Pendentes
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="flex justify-center py-8">
                <Loader2 className="w-8 h-8 animate-spin text-primary" />
              </div>
            ) : filteredOrders.length === 0 ? (
              <div className="text-center py-8">
                <ShoppingCart className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
                <p className="text-muted-foreground">Nenhum pedido encontrado.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Data</TableHead>
                      <TableHead>Frontend</TableHead>
                      <TableHead>Telefone</TableHead>
                      <TableHead>Serviço</TableHead>
                      <TableHead>Qtd</TableHead>
                      <TableHead>Início</TableHead>
                      <TableHead>Restam</TableHead>
                      <TableHead>Valor</TableHead>
                      <TableHead>Pagamento</TableHead>
                      <TableHead>Pedido</TableHead>
                      <TableHead>Ação</TableHead>
                      <TableHead>Link</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {paginatedOrders.map((order) => (
                      <TableRow key={order.id}>
                        <TableCell className="whitespace-nowrap text-sm">
                          {format(new Date(order.created_at), "dd/MM/yy HH:mm", { locale: ptBR })}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline">
                            {order.store_frontends?.name || "—"}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1">
                            <Phone className="w-3 h-3" />
                            <span className="text-sm">{order.phone}</span>
                          </div>
                        </TableCell>
                        <TableCell className="min-w-[260px] max-w-[360px]">
                          {(() => {
                            const combo = isComboOrder(order);
                            const comboItems = combo ? getComboItemsSummary(order) : [];

                            const payloadLinksRaw = (order.order_payload as any)?.links;
                            const payloadLinks: string[] = Array.isArray(payloadLinksRaw)
                              ? payloadLinksRaw.map((l: any) => String(l || "").trim()).filter(Boolean)
                              : [];

                            const externalRows = (() => {
                              const raw = order.external_order_ids as any;
                              const rows: Array<{ link: string }> = Array.isArray(raw) ? raw : [];
                              return rows
                                .map((r) => String((r as any)?.link || "").trim())
                                .filter(Boolean);
                            })();

                            const linksCount = combo
                              ? getComboLinksCount(order)
                              : Math.max(payloadLinks.length, externalRows.length);

                            const perLinkQty = !combo && linksCount > 1
                              ? Math.floor((Number(order.quantity) || 0) / linksCount)
                              : null;

                            return (
                              <div className="space-y-1">
                                <div className="flex items-center gap-2">
                                  <Badge variant={combo ? "secondary" : "outline"}>
                                    {combo ? "COMBO" : "PACOTE"}
                                  </Badge>
                                  <span className="text-sm font-medium truncate">
                                    {order.service_name || "—"}
                                  </span>
                                </div>

                                {combo && comboItems.length > 0 && (
                                  <div className="space-y-0.5">
                                    {comboItems.map((it) => (
                                      <div
                                        key={it.serviceId}
                                        className="text-xs text-muted-foreground flex flex-wrap gap-x-2"
                                      >
                                        <span className="font-medium text-foreground/80">{it.label}:</span>
                                        <span>Qtd {it.quantity.toLocaleString()}</span>
                                        <span>•</span>
                                        <span>{it.linksCount} link(s)</span>
                                      </div>
                                    ))}
                                  </div>
                                )}

                                {!combo && linksCount > 1 && (
                                  <div className="text-xs text-muted-foreground flex flex-wrap gap-x-2">
                                    <span>{linksCount} link(s)</span>
                                    {perLinkQty !== null && (
                                      <>
                                        <span>•</span>
                                        <span>{perLinkQty.toLocaleString()} por link</span>
                                      </>
                                    )}
                                  </div>
                                )}
                              </div>
                            );
                          })()}
                        </TableCell>
                        <TableCell>{order.quantity.toLocaleString()}</TableCell>
                        <TableCell className="text-muted-foreground">
                          {order.start_count ?? "—"}
                        </TableCell>
                        <TableCell>
                          {order.remains !== null && order.remains !== undefined ? (
                            <span className={order.remains === "0" ? "text-green-500 font-medium" : "text-yellow-500"}>
                              {order.remains}
                            </span>
                          ) : (
                            "—"
                          )}
                        </TableCell>
                        <TableCell className="font-medium text-primary">
                          {formatCurrency(order.total_price)}
                        </TableCell>
                        <TableCell>{getPaymentBadge(order.payment_status)}</TableCell>
                        <TableCell>
                          {(() => {
                            const combo = isComboOrder(order);
                            const comboExternalIds = combo ? getComboExternalIds(order) : [];
                            const firstId = combo ? comboExternalIds[0] : order.external_order_id;
                            const extra = combo ? Math.max(0, comboExternalIds.length - 1) : 0;
                            
                            // Extract error message from external_order_ids
                            const externalRows = order.external_order_ids as any;
                            const errorMsg = Array.isArray(externalRows) && externalRows.length > 0
                              ? (externalRows[0] as any)?.error
                              : null;
                            const isBalanceError = errorMsg && String(errorMsg).toLowerCase().includes('not enough funds');
                            const isDuplicateError = errorMsg && String(errorMsg).toLowerCase().includes('active order with this link');

                            return (
                              <div className="flex flex-col gap-1">
                                {getOrderBadge(order.order_status)}
                                {firstId ? (
                                  <span className="text-xs text-muted-foreground">
                                    #{firstId}
                                    {combo && extra > 0 ? ` +${extra}` : ""}
                                  </span>
                                ) : combo && comboExternalIds.length > 0 ? (
                                  <span className="text-xs text-muted-foreground">
                                    {comboExternalIds.length} pedidos
                                  </span>
                                ) : null}
                                
                                {isBalanceError && (
                                  <span className="text-[10px] text-orange-400 flex items-center gap-1">
                                    <AlertCircle className="w-3 h-3" />
                                    Saldo insuficiente no fornecedor
                                  </span>
                                )}
                                
                                {isDuplicateError && (
                                  <span className="text-[10px] text-amber-400 flex items-center gap-1">
                                    <AlertCircle className="w-3 h-3" />
                                    Link com pedido ativo no fornecedor
                                  </span>
                                )}
                              </div>
                            );
                          })()}
                        </TableCell>
                        <TableCell className="min-w-[240px]">
                          <div className="flex items-center gap-2">
                            <Select
                              value={String(order.order_status || "pending")}
                              onValueChange={(v) => handleSetManualOrderStatus(order, v)}
                              disabled={updatingStatusId === order.id}
                            >
                              <SelectTrigger className="h-9 flex-1">
                                <SelectValue placeholder="Mudar status" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="pending">Pendente</SelectItem>
                                <SelectItem value="processing">Processando</SelectItem>
                                <SelectItem value="partial">Parcial</SelectItem>
                                <SelectItem value="completed">Concluído</SelectItem>
                                <SelectItem value="cancelled">Cancelado</SelectItem>
                                <SelectItem value="error">Erro</SelectItem>
                              </SelectContent>
                            </Select>

                            <Button
                              type="button"
                              variant="outline"
                              size="icon"
                              onClick={() => handleResendToApi(order)}
                              disabled={!canResendToApi(order) || retryingOrderId === order.id}
                              title={
                                canResendToApi(order)
                                  ? "Reenviar este pedido para o provedor"
                                  : "Apenas pedidos pagos e ainda não enviados podem ser reenviados"
                              }
                              aria-label="Reenviar pedido"
                            >
                              {retryingOrderId === order.id ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <RefreshCw className="h-4 w-4" />
                              )}
                            </Button>
                          </div>

                          {updatingStatusId === order.id ? (
                            <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                              <Loader2 className="h-3 w-3 animate-spin" />
                              Salvando…
                            </div>
                          ) : null}
                        </TableCell>
                        <TableCell className="min-w-[300px]">
                          {(() => {
                            const combo = isComboOrder(order);
                            const linksCount = combo ? getComboLinksCount(order) : 0;

                            const payloadLinksRaw = (order.order_payload as any)?.links;
                            const payloadLinks: string[] = Array.isArray(payloadLinksRaw)
                              ? payloadLinksRaw.map((l: any) => String(l || "").trim()).filter(Boolean)
                              : [];

                            const showExternalLink = !combo && Boolean(order.link);

                            const externalRows = (() => {
                              const raw = order.external_order_ids as any;
                              const rows: Array<{
                                link: string;
                                quantity: number;
                                external_order_id?: number | null;
                                order_status?: string | null;
                                remains?: string | null;
                                start_count?: string | null;
                              }> = Array.isArray(raw) ? raw : [];

                              return rows
                                .map((r) => {
                                  const statusFromRow = (r as any)?.order_status ? String((r as any)?.order_status) : null;
                                  const status = statusFromRow || (order.order_status ? String(order.order_status) : null);

                                  return {
                                    link: String((r as any)?.link || "").trim(),
                                    quantity: Number((r as any)?.quantity) || 0,
                                    external_order_id:
                                      (r as any)?.external_order_id !== undefined && (r as any)?.external_order_id !== null
                                        ? Number((r as any)?.external_order_id)
                                        : null,
                                    order_status: status,
                                    remains:
                                      (r as any)?.remains !== undefined && (r as any)?.remains !== null
                                        ? String((r as any)?.remains)
                                        : null,
                                    start_count:
                                      (r as any)?.start_count !== undefined && (r as any)?.start_count !== null
                                        ? String((r as any)?.start_count)
                                        : null,
                                  };
                                })
                                .filter((r) => r.link);
                            })();

                            // Single package with multiple links (stored in order_payload.links and/or external_order_ids)
                            const multiLinksCount = !combo
                              ? Math.max(externalRows.length, payloadLinks.length)
                              : 0;
                            const isMultiLinkSingle = !combo && multiLinksCount > 1;

                            return (
                              <div className="flex flex-col gap-1">
                                <div className="flex items-center gap-2">
                                  <button
                                    onClick={() => copyToClipboard(combo ? String(order.id) : order.link)}
                                    className="text-muted-foreground hover:text-foreground p-0.5"
                                    title={combo ? "Copiar ID do pedido" : "Copiar link"}
                                  >
                                    <Copy className="w-3 h-3" />
                                  </button>

                                  {showExternalLink && (
                                    <a
                                      href={order.link}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="text-muted-foreground hover:text-foreground p-0.5"
                                      title="Abrir link"
                                    >
                                      <ExternalLink className="w-3 h-3" />
                                    </a>
                                  )}
                                </div>

                                {combo ? (
                                  <div className="space-y-0.5">
                                    <span className="text-xs text-primary">combo • {linksCount} link(s)</span>
                                    {externalRows.length > 0 ? (
                                      <div className="space-y-1">
                                        {externalRows.slice(0, 6).map((r, idx) => {
                                          const linkStatus = r.order_status || order.order_status;

                                          return (
                                            <div key={idx} className="text-[11px] text-muted-foreground break-all">
                                              <div className="flex items-center gap-2">
                                                <span className="text-foreground/80">Qtd {r.quantity.toLocaleString()}:</span>
                                                {linkStatus ? (
                                                  <Badge variant="outline" className="text-[10px] px-2 py-0">
                                                    {mapStatusLabel(String(linkStatus))}
                                                  </Badge>
                                                ) : (
                                                  <Badge
                                                    variant="outline"
                                                    className="text-[10px] px-2 py-0 text-muted-foreground"
                                                  >
                                                    —
                                                  </Badge>
                                                )}
                                              </div>
                                              <div className="space-y-0.5">
                                                <div>{r.link}</div>
                                                <ProviderOrderIdCopy
                                                  id={r.external_order_id}
                                                  className="text-[10px] inline-flex items-center"
                                                />
                                              </div>
                                            </div>
                                          );
                                        })}
                                        {externalRows.length > 6 && (
                                          <div className="text-[11px] text-muted-foreground">
                                            +{externalRows.length - 6} link(s)…
                                          </div>
                                        )}
                                      </div>
                                    ) : (
                                      <span className="text-[11px] text-muted-foreground">Links ainda não processados…</span>
                                    )}
                                  </div>
                                ) : isMultiLinkSingle ? (
                                  <div className="space-y-0.5">
                                    <span className="text-xs text-primary">multi • {multiLinksCount} link(s)</span>
                                    <div className="space-y-1">
                                      {(externalRows.length > 0 ? externalRows : payloadLinks.map((l) => ({ link: l, quantity: 0, order_status: order.order_status })))
                                        .slice(0, 6)
                                        .map((r: any, idx: number) => {
                                          const linkStatus = r?.order_status || order.order_status;
                                          const qty = Number(r?.quantity) || 0;
                                          return (
                                            <div key={idx} className="text-[11px] text-muted-foreground break-all">
                                              <div className="flex items-center gap-2">
                                                {qty > 0 && <span className="text-foreground/80">Qtd {qty.toLocaleString()}:</span>}
                                                {linkStatus ? (
                                                  <Badge variant="outline" className="text-[10px] px-2 py-0">
                                                    {mapStatusLabel(String(linkStatus))}
                                                  </Badge>
                                                ) : (
                                                  <Badge
                                                    variant="outline"
                                                    className="text-[10px] px-2 py-0 text-muted-foreground"
                                                  >
                                                    —
                                                  </Badge>
                                                )}
                                              </div>
                                              <div className="space-y-0.5">
                                                <div>{String(r?.link || "").trim()}</div>
                                                <ProviderOrderIdCopy
                                                  id={(r as any)?.external_order_id}
                                                  className="text-[10px] inline-flex items-center"
                                                />
                                              </div>
                                            </div>
                                          );
                                        })}
                                      {multiLinksCount > 6 && (
                                        <div className="text-[11px] text-muted-foreground">+{multiLinksCount - 6} link(s)…</div>
                                      )}
                                    </div>
                                  </div>
                                ) : (
                                  <div className="space-y-0.5">
                                    <span className="text-xs text-primary break-all">{order.link}</span>
                                    <ProviderOrderIdCopy
                                      id={order.external_order_id}
                                      className="text-[10px] inline-flex items-center"
                                    />
                                  </div>
                                )}
                              </div>
                            );
                          })()}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>

                <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="text-sm text-muted-foreground">
                    Página <span className="font-medium text-foreground">{safePage}</span> de{" "}
                    <span className="font-medium text-foreground">{totalPages}</span> •{" "}
                    <span className="font-medium text-foreground">{filteredOrders.length}</span> pedidos
                  </div>

                  <Pagination className="justify-end sm:justify-center">
                    <PaginationContent>
                      <PaginationItem>
                        <PaginationPrevious
                          href="#"
                          onClick={(e) => {
                            e.preventDefault();
                            setPage((p) => Math.max(1, p - 1));
                          }}
                          className={safePage <= 1 ? "pointer-events-none opacity-50" : ""}
                        />
                      </PaginationItem>

                      {pageItems.map((it, idx) =>
                        it === "ellipsis" ? (
                          <PaginationItem key={`el-${idx}`}>
                            <PaginationEllipsis />
                          </PaginationItem>
                        ) : (
                          <PaginationItem key={it}>
                            <PaginationLink
                              href="#"
                              isActive={it === safePage}
                              onClick={(e) => {
                                e.preventDefault();
                                setPage(it);
                              }}
                            >
                              {it}
                            </PaginationLink>
                          </PaginationItem>
                        ),
                      )}

                      <PaginationItem>
                        <PaginationNext
                          href="#"
                          onClick={(e) => {
                            e.preventDefault();
                            setPage((p) => Math.min(totalPages, p + 1));
                          }}
                          className={safePage >= totalPages ? "pointer-events-none opacity-50" : ""}
                        />
                      </PaginationItem>
                    </PaginationContent>
                  </Pagination>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
  );
}
