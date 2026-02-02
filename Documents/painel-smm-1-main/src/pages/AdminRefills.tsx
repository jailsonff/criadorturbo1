import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { 
  Search, 
  RefreshCw, 
  ExternalLink, 
  Clock, 
  CheckCircle, 
  XCircle, 
  AlertCircle,
  Package,
  Loader2,
  User,
  Zap,
  Timer,
  TimerOff
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { getSupabaseClient } from "@/lib/supabaseClient";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { checkRefillStatus } from "@/lib/api";

interface Refill {
  id: string;
  order_id: number;
  refill_id: string | null;
  link: string | null;
  service_name: string | null;
  status: string;
  created_at: string;
  user_id: string;
  user_email?: string;
}

const statusFilters = [
  { value: "all", label: "Tudo" },
  { value: "pending", label: "Pendente" },
  { value: "in_progress", label: "Em progresso" },
  { value: "completed", label: "Concluído" },
  { value: "rejected", label: "Rejeitado" },
  { value: "error", label: "Erro" },
];

const autoSyncIntervals = [
  { value: "0", label: "Desativado" },
  { value: "1", label: "1 minuto" },
  { value: "2", label: "2 minutos" },
  { value: "5", label: "5 minutos" },
  { value: "10", label: "10 minutos" },
  { value: "15", label: "15 minutos" },
];

const AdminRefills = () => {
  const { toast } = useToast();
  const supabase = getSupabaseClient();
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [syncingRefills, setSyncingRefills] = useState<Set<string>>(new Set());
  const [isSyncingAll, setIsSyncingAll] = useState(false);
  const [autoSyncInterval, setAutoSyncInterval] = useState("0");
  const [nextSyncIn, setNextSyncIn] = useState<number | null>(null);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const countdownRef = useRef<NodeJS.Timeout | null>(null);

  const { data: refills, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ["admin-refills"],
    queryFn: async () => {
      // Fetch refills with user profiles
      const { data: refillsData, error: refillsError } = await supabase
        .from("refills")
        .select("*")
        .order("created_at", { ascending: false });

      if (refillsError) throw refillsError;

      // Fetch user emails from profiles
      const userIds = [...new Set(refillsData?.map(r => r.user_id) || [])];
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, email")
        .in("id", userIds);

      const profileMap = new Map(profiles?.map(p => [p.id, p.email]) || []);

      return (refillsData || []).map(refill => ({
        ...refill,
        user_email: profileMap.get(refill.user_id) || "Desconhecido"
      })) as Refill[];
    },
  });

  const handleRefresh = async () => {
    await refetch();
    toast({
      title: "Atualizado",
      description: "Lista de reposições atualizada.",
    });
  };

  const handleUpdateStatus = async (refillId: string, newStatus: string) => {
    const { error } = await supabase
      .from("refills")
      .update({ status: newStatus, updated_at: new Date().toISOString() })
      .eq("id", refillId);

    if (error) {
      toast({
        title: "Erro",
        description: "Falha ao atualizar status.",
        variant: "destructive",
      });
    } else {
      toast({
        title: "Sucesso",
        description: `Status atualizado para ${newStatus}.`,
      });
      refetch();
    }
  };

  const syncRefillStatus = useCallback(async (refill: Refill) => {
    if (!refill.refill_id) return;

    setSyncingRefills(prev => new Set(prev).add(refill.id));

    try {
      const statusData = await checkRefillStatus(refill.refill_id, refill.order_id);
      
      // Map API status to our status format
      let newStatus = refill.status;
      const apiStatus = statusData.status?.toLowerCase() || "";
      
      if (apiStatus.includes("completed") || apiStatus.includes("complete")) {
        newStatus = "completed";
      } else if (apiStatus.includes("progress") || apiStatus.includes("processing")) {
        newStatus = "in_progress";
      } else if (apiStatus.includes("reject") || apiStatus.includes("cancel")) {
        newStatus = "rejected";
      } else if (apiStatus.includes("error") || statusData.error) {
        newStatus = "error";
      } else if (apiStatus.includes("pending")) {
        newStatus = "pending";
      }

      if (newStatus !== refill.status) {
        await supabase
          .from("refills")
          .update({ status: newStatus, updated_at: new Date().toISOString() })
          .eq("id", refill.id);
      }

      return newStatus;
    } catch (error) {
      console.error(`Error syncing refill ${refill.refill_id}:`, error);
      return null;
    } finally {
      setSyncingRefills(prev => {
        const newSet = new Set(prev);
        newSet.delete(refill.id);
        return newSet;
      });
    }
  }, []);

  const handleSyncAll = async () => {
    if (!refills || refills.length === 0) return;

    const pendingRefills = refills.filter(r => 
      r.refill_id && (r.status === "pending" || r.status === "in_progress")
    );

    if (pendingRefills.length === 0) {
      toast({
        title: "Nenhum para sincronizar",
        description: "Não há reposições pendentes com ID de refill.",
      });
      return;
    }

    setIsSyncingAll(true);
    let syncedCount = 0;
    let updatedCount = 0;

    for (const refill of pendingRefills) {
      const newStatus = await syncRefillStatus(refill);
      if (newStatus) {
        syncedCount++;
        if (newStatus !== refill.status) updatedCount++;
      }
    }

    setIsSyncingAll(false);
    await refetch();

    toast({
      title: "Sincronização concluída",
      description: `${syncedCount} verificados, ${updatedCount} atualizados.`,
    });
  };

  // Auto-sync effect
  useEffect(() => {
    // Clear existing intervals
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    if (countdownRef.current) {
      clearInterval(countdownRef.current);
      countdownRef.current = null;
    }

    const intervalMinutes = parseInt(autoSyncInterval, 10);
    if (intervalMinutes === 0 || !refills) {
      setNextSyncIn(null);
      return;
    }

    const intervalMs = intervalMinutes * 60 * 1000;
    setNextSyncIn(intervalMinutes * 60);

    // Countdown timer
    countdownRef.current = setInterval(() => {
      setNextSyncIn(prev => {
        if (prev === null || prev <= 1) {
          return intervalMinutes * 60;
        }
        return prev - 1;
      });
    }, 1000);

    // Auto-sync interval
    intervalRef.current = setInterval(async () => {
      const pendingRefills = refills.filter(r => 
        r.refill_id && (r.status === "pending" || r.status === "in_progress")
      );

      if (pendingRefills.length > 0) {
        setIsSyncingAll(true);
        for (const refill of pendingRefills) {
          await syncRefillStatus(refill);
        }
        setIsSyncingAll(false);
        await refetch();
      }
      
      setNextSyncIn(intervalMinutes * 60);
    }, intervalMs);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      if (countdownRef.current) clearInterval(countdownRef.current);
    };
  }, [autoSyncInterval, refills, syncRefillStatus, refetch]);

  const formatCountdown = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  const getStatusBadge = (status: string) => {
    const statusConfig: Record<string, { color: string; icon: React.ReactNode; label: string }> = {
      pending: { color: "border-yellow-500/50 text-yellow-500", icon: <Clock className="w-3 h-3 mr-1" />, label: "Pendente" },
      in_progress: { color: "border-blue-500/50 text-blue-500", icon: <RefreshCw className="w-3 h-3 mr-1" />, label: "Em progresso" },
      completed: { color: "border-green-500/50 text-green-500", icon: <CheckCircle className="w-3 h-3 mr-1" />, label: "Concluído" },
      rejected: { color: "border-red-500/50 text-red-500", icon: <XCircle className="w-3 h-3 mr-1" />, label: "Rejeitado" },
      error: { color: "border-red-500/50 text-red-500", icon: <AlertCircle className="w-3 h-3 mr-1" />, label: "Erro" },
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

  const filteredRefills = useMemo(() => {
    if (!refills) return [];
    
    return refills.filter(refill => {
      // Status filter
      if (statusFilter !== "all" && refill.status.toLowerCase() !== statusFilter) {
        return false;
      }

      // Search filter
      if (searchQuery) {
        const query = searchQuery.toLowerCase();
        return (
          refill.order_id.toString().includes(query) ||
          refill.refill_id?.toLowerCase().includes(query) ||
          refill.link?.toLowerCase().includes(query) ||
          refill.service_name?.toLowerCase().includes(query) ||
          refill.user_email?.toLowerCase().includes(query)
        );
      }

      return true;
    });
  }, [refills, statusFilter, searchQuery]);

  const stats = useMemo(() => {
    if (!refills) return { total: 0, pending: 0, completed: 0, error: 0 };
    
    return {
      total: refills.length,
      pending: refills.filter(r => r.status === "pending" || r.status === "in_progress").length,
      completed: refills.filter(r => r.status === "completed").length,
      error: refills.filter(r => r.status === "error" || r.status === "rejected").length,
    };
  }, [refills]);

  return (
    <div className="min-h-screen">
      <main className="container mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex flex-col gap-4 mb-8">
          <div className="flex-1">
            <h1 className="text-2xl sm:text-3xl font-bold mb-2 flex items-center gap-3">
              <RefreshCw className="w-6 h-6 sm:w-8 sm:h-8 text-amber-500" />
              Solicitações de Reposição
            </h1>
            <p className="text-sm sm:text-base text-muted-foreground">
              Gerencie todas as solicitações de reposição (refill) dos usuários
            </p>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <Card className="glass-card border-border/50">
            <CardContent className="pt-4">
              <p className="text-xs sm:text-sm text-muted-foreground">Total</p>
              <p className="text-xl sm:text-2xl font-bold text-amber-500">{stats.total}</p>
            </CardContent>
          </Card>
          <Card className="glass-card border-border/50">
            <CardContent className="pt-4">
              <p className="text-xs sm:text-sm text-muted-foreground">Pendentes</p>
              <p className="text-xl sm:text-2xl font-bold text-yellow-500">{stats.pending}</p>
            </CardContent>
          </Card>
          <Card className="glass-card border-border/50">
            <CardContent className="pt-4">
              <p className="text-xs sm:text-sm text-muted-foreground">Concluídos</p>
              <p className="text-xl sm:text-2xl font-bold text-green-500">{stats.completed}</p>
            </CardContent>
          </Card>
          <Card className="glass-card border-border/50">
            <CardContent className="pt-4">
              <p className="text-xs sm:text-sm text-muted-foreground">Erros</p>
              <p className="text-xl sm:text-2xl font-bold text-red-500">{stats.error}</p>
            </CardContent>
          </Card>
        </div>

        {/* Status Filters */}
        <div className="flex flex-wrap gap-2 mb-6">
          {statusFilters.map((filter) => (
            <Button
              key={filter.value}
              variant={statusFilter === filter.value ? "default" : "outline"}
              size="sm"
              onClick={() => setStatusFilter(filter.value)}
              className={statusFilter === filter.value ? "bg-amber-500 hover:bg-amber-600" : ""}
            >
              {filter.label}
            </Button>
          ))}
        </div>

        {/* Search */}
        <Card className="glass-card border-border/50 mb-6">
          <CardContent className="pt-4 sm:pt-6">
            <div className="flex flex-col sm:flex-row gap-3 sm:gap-4">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Procurar por ID, link, serviço ou email..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10 text-sm"
                />
              </div>
              <div className="flex flex-wrap gap-2 items-center">
                {/* Auto-sync selector */}
                <div className="flex items-center gap-2">
                  {autoSyncInterval !== "0" ? (
                    <Timer className="w-4 h-4 text-green-500" />
                  ) : (
                    <TimerOff className="w-4 h-4 text-muted-foreground" />
                  )}
                  <Select value={autoSyncInterval} onValueChange={setAutoSyncInterval}>
                    <SelectTrigger className="w-[130px] h-9 text-xs">
                      <SelectValue placeholder="Auto-sync" />
                    </SelectTrigger>
                    <SelectContent>
                      {autoSyncIntervals.map((interval) => (
                        <SelectItem key={interval.value} value={interval.value}>
                          {interval.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {nextSyncIn !== null && (
                    <Badge variant="outline" className="text-xs border-green-500/50 text-green-500">
                      {formatCountdown(nextSyncIn)}
                    </Badge>
                  )}
                </div>
                <Button
                  onClick={handleSyncAll}
                  variant="default"
                  disabled={isSyncingAll || isRefetching}
                  className="flex-1 sm:flex-none bg-amber-500 hover:bg-amber-600"
                >
                  <Zap className={`w-4 h-4 mr-2 ${isSyncingAll ? "animate-pulse" : ""}`} />
                  {isSyncingAll ? "Sincronizando..." : "Sincronizar API"}
                </Button>
                <Button
                  onClick={handleRefresh}
                  variant="outline"
                  disabled={isRefetching}
                  className="flex-1 sm:flex-none"
                >
                  <RefreshCw className={`w-4 h-4 mr-2 ${isRefetching ? "animate-spin" : ""}`} />
                  Atualizar
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Refills Table */}
        <Card className="glass-card border-border/50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Package className="w-5 h-5 text-amber-500" />
              Reposições ({filteredRefills.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-8 h-8 animate-spin text-amber-500" />
              </div>
            ) : filteredRefills.length === 0 ? (
              <div className="text-center py-12">
                <RefreshCw className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                <p className="text-muted-foreground">
                  {refills?.length === 0 
                    ? "Nenhuma solicitação de reposição ainda."
                    : "Nenhuma reposição corresponde aos filtros."
                  }
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto scrollbar-hide">
                <Table>
                  <TableHeader>
                    <TableRow className="border-border/50">
                      <TableHead className="text-xs sm:text-sm">ID</TableHead>
                      <TableHead className="text-xs sm:text-sm hidden sm:table-cell">Data</TableHead>
                      <TableHead className="text-xs sm:text-sm hidden md:table-cell">Usuário</TableHead>
                      <TableHead className="text-xs sm:text-sm">Pedido</TableHead>
                      <TableHead className="text-xs sm:text-sm hidden lg:table-cell">Link</TableHead>
                      <TableHead className="text-xs sm:text-sm hidden xl:table-cell">Serviço</TableHead>
                      <TableHead className="text-xs sm:text-sm">Status</TableHead>
                      <TableHead className="text-xs sm:text-sm">Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredRefills.map((refill) => (
                      <TableRow key={refill.id} className="border-border/30">
                        <TableCell className="font-mono text-xs sm:text-sm">
                          {refill.refill_id?.slice(0, 8) || "-"}
                        </TableCell>
                        <TableCell className="text-xs sm:text-sm text-muted-foreground whitespace-nowrap hidden sm:table-cell">
                          {format(new Date(refill.created_at), "dd/MM/yy HH:mm", { locale: ptBR })}
                        </TableCell>
                        <TableCell className="hidden md:table-cell">
                          <div className="flex items-center gap-1 text-xs sm:text-sm">
                            <User className="w-3 h-3 text-muted-foreground shrink-0" />
                            <span className="truncate max-w-[100px]" title={refill.user_email}>
                              {refill.user_email}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell className="font-mono text-amber-500 text-xs sm:text-sm">
                          {refill.order_id}
                        </TableCell>
                        <TableCell className="hidden lg:table-cell">
                          {refill.link ? (
                            <div className="max-w-[100px] overflow-x-auto scrollbar-hide">
                              <a
                                href={refill.link}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex items-center gap-1 text-primary hover:underline text-xs whitespace-nowrap"
                              >
                                <ExternalLink className="w-3 h-3 shrink-0" />
                                <span className="truncate">{refill.link}</span>
                              </a>
                            </div>
                          ) : (
                            <span className="text-muted-foreground text-xs">-</span>
                          )}
                        </TableCell>
                        <TableCell className="hidden xl:table-cell">
                          <p className="text-xs max-w-[100px] truncate" title={refill.service_name || "-"}>
                            {refill.service_name || "-"}
                          </p>
                        </TableCell>
                        <TableCell>
                          {getStatusBadge(refill.status)}
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-1">
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-7 w-7 p-0 text-amber-500 hover:text-amber-600 hover:bg-amber-500/10"
                              onClick={() => refill.refill_id && syncRefillStatus(refill).then(() => refetch())}
                              disabled={!refill.refill_id || syncingRefills.has(refill.id)}
                              title="Verificar status na API"
                            >
                              {syncingRefills.has(refill.id) ? (
                                <Loader2 className="w-4 h-4 animate-spin" />
                              ) : (
                                <Zap className="w-4 h-4" />
                              )}
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-7 w-7 p-0 text-green-500 hover:text-green-600 hover:bg-green-500/10"
                              onClick={() => handleUpdateStatus(refill.id, "completed")}
                              title="Marcar como concluído"
                            >
                              <CheckCircle className="w-4 h-4" />
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-7 w-7 p-0 text-red-500 hover:text-red-600 hover:bg-red-500/10"
                              onClick={() => handleUpdateStatus(refill.id, "rejected")}
                              title="Rejeitar"
                            >
                              <XCircle className="w-4 h-4" />
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
      </main>
    </div>
  );
};

export default AdminRefills;
