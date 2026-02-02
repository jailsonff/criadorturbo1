import { useState, useEffect, useMemo } from "react";
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
  Loader2
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
import BalanceCard from "@/components/BalanceCard";
import { getSupabaseClient } from "@/lib/supabaseClient";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

interface Refill {
  id: string;
  order_id: number;
  refill_id: string | null;
  link: string | null;
  service_name: string | null;
  status: string;
  created_at: string;
}

const statusFilters = [
  { value: "all", label: "Tudo" },
  { value: "pending", label: "Pendente" },
  { value: "in_progress", label: "Em progresso" },
  { value: "completed", label: "Concluído" },
  { value: "rejected", label: "Rejeitado" },
  { value: "error", label: "Erro" },
];

const Refills = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  const { data: refills, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ["refills", user?.id],
    queryFn: async () => {
      if (!user) return [];
      
      const supabase = getSupabaseClient();
      const { data, error } = await supabase
        .from("refills")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });

      if (error) throw error;
      return data as Refill[];
    },
    enabled: !!user,
  });

  const handleRefresh = async () => {
    await refetch();
    toast({
      title: "Atualizado",
      description: "Lista de reposições atualizada.",
    });
  };

  const formatDate = (dateString: string) => {
    return format(new Date(dateString), "yyyy-MM-dd HH:mm:ss", { locale: ptBR });
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
          refill.service_name?.toLowerCase().includes(query)
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
        <div className="flex flex-col lg:flex-row gap-6 mb-8">
          <div className="flex-1">
            <h1 className="text-3xl font-bold mb-2 flex items-center gap-3">
              <RefreshCw className="w-8 h-8 text-primary" />
              Minhas Reposições
            </h1>
            <p className="text-muted-foreground">
              Histórico de solicitações de reposição (refill)
            </p>
          </div>
          <div className="lg:w-80">
            <BalanceCard />
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
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
              <p className="text-sm text-muted-foreground">Concluídos</p>
              <p className="text-2xl font-bold text-green-500">{stats.completed}</p>
            </CardContent>
          </Card>
          <Card className="glass-card border-border/50">
            <CardContent className="pt-4">
              <p className="text-sm text-muted-foreground">Erros</p>
              <p className="text-2xl font-bold text-red-500">{stats.error}</p>
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
            >
              {filter.label}
            </Button>
          ))}
        </div>

        {/* Search */}
        <Card className="glass-card border-border/50 mb-6">
          <CardContent className="pt-6">
            <div className="flex gap-4">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Procurar por ID, link ou serviço..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10"
                />
              </div>
              <Button
                onClick={handleRefresh}
                variant="outline"
                disabled={isRefetching}
              >
                <RefreshCw className={`w-4 h-4 mr-2 ${isRefetching ? "animate-spin" : ""}`} />
                Atualizar
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Refills Table */}
        <Card className="glass-card border-border/50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Package className="w-5 h-5 text-primary" />
              Reposições ({filteredRefills.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-8 h-8 animate-spin text-primary" />
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
                <p className="text-sm text-muted-foreground mt-2">
                  Solicite reposição na página de pedidos.
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto scrollbar-hide">
                <Table>
                  <TableHeader>
                    <TableRow className="border-border/50">
                      <TableHead className="text-xs sm:text-sm">ID</TableHead>
                      <TableHead className="text-xs sm:text-sm hidden md:table-cell">Data</TableHead>
                      <TableHead className="text-xs sm:text-sm">Pedido</TableHead>
                      <TableHead className="text-xs sm:text-sm hidden lg:table-cell">Link</TableHead>
                      <TableHead className="text-xs sm:text-sm hidden sm:table-cell">Serviço</TableHead>
                      <TableHead className="text-xs sm:text-sm">Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredRefills.map((refill) => (
                      <TableRow key={refill.id} className="border-border/30">
                        <TableCell className="font-mono text-xs sm:text-sm">
                          {refill.refill_id?.slice(0, 8) || "-"}
                        </TableCell>
                        <TableCell className="text-xs sm:text-sm text-muted-foreground whitespace-nowrap hidden md:table-cell">
                          {format(new Date(refill.created_at), "dd/MM/yy HH:mm", { locale: ptBR })}
                        </TableCell>
                        <TableCell className="font-mono text-primary text-xs sm:text-sm">
                          {refill.order_id}
                        </TableCell>
                        <TableCell className="hidden lg:table-cell">
                          {refill.link ? (
                            <div className="max-w-[150px] overflow-x-auto scrollbar-hide">
                              <a
                                href={refill.link}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex items-center gap-1 text-primary hover:underline text-xs sm:text-sm whitespace-nowrap"
                              >
                                <ExternalLink className="w-3 h-3 shrink-0" />
                                <span className="truncate">{refill.link}</span>
                              </a>
                            </div>
                          ) : (
                            <span className="text-muted-foreground text-xs">-</span>
                          )}
                        </TableCell>
                        <TableCell className="hidden sm:table-cell">
                          <p className="text-xs sm:text-sm max-w-[150px] truncate" title={refill.service_name || "-"}>
                            {refill.service_name || "-"}
                          </p>
                        </TableCell>
                        <TableCell>
                          {getStatusBadge(refill.status)}
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

export default Refills;