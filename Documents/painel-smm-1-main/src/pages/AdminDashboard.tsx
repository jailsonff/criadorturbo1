import { useEffect, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { getSupabaseClient } from "@/lib/supabaseClient";
import { useToast } from "@/hooks/use-toast";
import { formatCurrency } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Users,
  TicketCheck,
  Wallet,
  TrendingUp,
  Clock,
  CheckCircle,
  AlertCircle,
  Settings,
  ArrowRight,
  RefreshCw,
  UserPlus,
  DollarSign,
  LayoutDashboard,
} from "lucide-react";

interface DashboardStats {
  totalUsers: number;
  totalBalance: number;
  ticketsOpen: number;
  ticketsInProgress: number;
  ticketsResolved: number;
}

interface RecentUser {
  id: string;
  email: string | null;
  full_name: string | null;
  balance: number | null;
  created_at: string;
}

interface RecentTicket {
  id: string;
  subject: string;
  status: "open" | "in_progress" | "resolved";
  created_at: string;
  user_email?: string;
}

const AdminDashboard = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { toast } = useToast();
  const supabase = getSupabaseClient();
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [stats, setStats] = useState<DashboardStats>({
    totalUsers: 0,
    totalBalance: 0,
    ticketsOpen: 0,
    ticketsInProgress: 0,
    ticketsResolved: 0,
  });
  const [recentUsers, setRecentUsers] = useState<RecentUser[]>([]);
  const [recentTickets, setRecentTickets] = useState<RecentTicket[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const fetchDashboardData = async () => {
    try {
      // Fetch users stats
      const { data: usersData, error: usersError } = await supabase
        .from("profiles")
        .select("id, email, full_name, balance, created_at")
        .order("created_at", { ascending: false });

      if (usersError) throw usersError;

      const totalBalance = usersData?.reduce((sum, u) => sum + (u.balance || 0), 0) || 0;
      setRecentUsers(usersData?.slice(0, 5) || []);

      // Fetch tickets stats
      const { data: ticketsData, error: ticketsError } = await supabase
        .from("support_tickets")
        .select("*")
        .order("created_at", { ascending: false });

      if (ticketsError) throw ticketsError;

      // Get user emails for tickets
      const userIds = [...new Set(ticketsData?.map(t => t.user_id) || [])];
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, email")
        .in("id", userIds);

      const profileMap = new Map(profiles?.map(p => [p.id, p.email]) || []);

      const ticketsWithEmail = ticketsData?.map(ticket => ({
        ...ticket,
        user_email: profileMap.get(ticket.user_id) || "Desconhecido"
      })) || [];

      setRecentTickets(ticketsWithEmail.slice(0, 5));

      const ticketsOpen = ticketsData?.filter(t => t.status === "open").length || 0;
      const ticketsInProgress = ticketsData?.filter(t => t.status === "in_progress").length || 0;
      const ticketsResolved = ticketsData?.filter(t => t.status === "resolved").length || 0;

      setStats({
        totalUsers: usersData?.length || 0,
        totalBalance,
        ticketsOpen,
        ticketsInProgress,
        ticketsResolved,
      });
    } catch (error) {
      console.error("Error fetching dashboard data:", error);
      toast({
        title: "Erro",
        description: "Erro ao carregar dados do dashboard.",
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
      await fetchDashboardData();
      setLoading(false);
    };

    checkAdminAndFetch();
  }, [user, navigate, toast]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchDashboardData();
    setRefreshing(false);
    toast({
      title: "Atualizado",
      description: "Dados do dashboard atualizados.",
    });
  };

  // Using centralized formatCurrency from utils

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "open":
        return (
          <Badge variant="outline" className="border-yellow-500/50 text-yellow-500">
            <AlertCircle className="w-3 h-3 mr-1" />
            Aberto
          </Badge>
        );
      case "in_progress":
        return (
          <Badge variant="outline" className="border-blue-500/50 text-blue-500">
            <Clock className="w-3 h-3 mr-1" />
            Em andamento
          </Badge>
        );
      case "resolved":
        return (
          <Badge variant="outline" className="border-green-500/50 text-green-500">
            <CheckCircle className="w-3 h-3 mr-1" />
            Resolvido
          </Badge>
        );
    }
  };

  if (!isAdmin && !loading) {
    return null;
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold gradient-text flex items-center gap-2">
            <LayoutDashboard className="w-8 h-8" />
            Dashboard Admin
          </h1>
          <p className="text-muted-foreground mt-1">
            Visão geral e controle total do sistema
          </p>
        </div>
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

      {/* Stats Cards */}
      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <Skeleton key={i} className="h-32 w-full" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card className="relative overflow-hidden border-0 bg-gradient-to-br from-cyan-500/40 via-cyan-600/25 to-cyan-900/10 shadow-xl shadow-cyan-500/25">
            <div className="absolute top-0 right-0 w-32 h-32 bg-cyan-400/30 rounded-full blur-2xl -translate-y-1/2 translate-x-1/2" />
            <CardContent className="pt-6 relative">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Total de Usuários</p>
                  <p className="text-3xl font-bold text-cyan-300">{stats.totalUsers}</p>
                </div>
                <div className="w-12 h-12 rounded-xl bg-cyan-500/50 flex items-center justify-center">
                  <Users className="w-6 h-6 text-cyan-200" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="relative overflow-hidden border-0 bg-gradient-to-br from-emerald-500/40 via-emerald-600/25 to-emerald-900/10 shadow-xl shadow-emerald-500/25">
            <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-400/30 rounded-full blur-2xl -translate-y-1/2 translate-x-1/2" />
            <CardContent className="pt-6 relative">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Saldo Total</p>
                  <p className="text-3xl font-bold text-emerald-300">{formatCurrency(stats.totalBalance)}</p>
                </div>
                <div className="w-12 h-12 rounded-xl bg-emerald-500/50 flex items-center justify-center">
                  <DollarSign className="w-6 h-6 text-emerald-200" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="relative overflow-hidden border-0 bg-gradient-to-br from-amber-500/40 via-amber-600/25 to-amber-900/10 shadow-xl shadow-amber-500/25">
            <div className="absolute top-0 right-0 w-32 h-32 bg-amber-400/30 rounded-full blur-2xl -translate-y-1/2 translate-x-1/2" />
            <CardContent className="pt-6 relative">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Tickets Pendentes</p>
                  <p className="text-3xl font-bold text-amber-300">
                    {stats.ticketsOpen + stats.ticketsInProgress}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {stats.ticketsOpen} abertos · {stats.ticketsInProgress} em andamento
                  </p>
                </div>
                <div className="w-12 h-12 rounded-xl bg-amber-500/50 flex items-center justify-center">
                  <TicketCheck className="w-6 h-6 text-amber-200" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="relative overflow-hidden border-0 bg-gradient-to-br from-violet-500/40 via-violet-600/25 to-violet-900/10 shadow-xl shadow-violet-500/25">
            <div className="absolute top-0 right-0 w-32 h-32 bg-violet-400/30 rounded-full blur-2xl -translate-y-1/2 translate-x-1/2" />
            <CardContent className="pt-6 relative">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Tickets Resolvidos</p>
                  <p className="text-3xl font-bold text-violet-300">{stats.ticketsResolved}</p>
                </div>
                <div className="w-12 h-12 rounded-xl bg-violet-500/50 flex items-center justify-center">
                  <CheckCircle className="w-6 h-6 text-violet-200" />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Quick Actions */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Link to="/users">
          <Card className="relative overflow-hidden border-0 bg-gradient-to-br from-cyan-500/15 to-transparent hover:from-cyan-500/25 transition-all cursor-pointer group shadow-md">
            <CardContent className="pt-6 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-cyan-500/30 flex items-center justify-center">
                  <Users className="w-5 h-5 text-cyan-400" />
                </div>
                <div>
                  <p className="font-medium">Gerenciar Usuários</p>
                  <p className="text-xs text-muted-foreground">Editar saldo e dados</p>
                </div>
              </div>
              <ArrowRight className="w-5 h-5 text-muted-foreground group-hover:text-cyan-400 transition-colors" />
            </CardContent>
          </Card>
        </Link>

        <Link to="/admin-tickets">
          <Card className="relative overflow-hidden border-0 bg-gradient-to-br from-amber-500/15 to-transparent hover:from-amber-500/25 transition-all cursor-pointer group shadow-md">
            <CardContent className="pt-6 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-amber-500/30 flex items-center justify-center">
                  <TicketCheck className="w-5 h-5 text-amber-400" />
                </div>
                <div>
                  <p className="font-medium">Gerenciar Tickets</p>
                  <p className="text-xs text-muted-foreground">Responder suporte</p>
                </div>
              </div>
              <ArrowRight className="w-5 h-5 text-muted-foreground group-hover:text-amber-400 transition-colors" />
            </CardContent>
          </Card>
        </Link>

        <Link to="/settings">
          <Card className="relative overflow-hidden border-0 bg-gradient-to-br from-violet-500/15 to-transparent hover:from-violet-500/25 transition-all cursor-pointer group shadow-md">
            <CardContent className="pt-6 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-violet-500/30 flex items-center justify-center">
                  <Settings className="w-5 h-5 text-violet-400" />
                </div>
                <div>
                  <p className="font-medium">Configurações</p>
                  <p className="text-xs text-muted-foreground">API e sistema</p>
                </div>
              </div>
              <ArrowRight className="w-5 h-5 text-muted-foreground group-hover:text-violet-400 transition-colors" />
            </CardContent>
          </Card>
        </Link>
      </div>

      {/* Recent Data Tables */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Users */}
        <Card className="relative overflow-hidden border-0 bg-gradient-to-br from-cyan-500/10 via-transparent to-transparent shadow-md">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <UserPlus className="w-5 h-5 text-primary" />
              Usuários Recentes
            </CardTitle>
            <Link to="/users">
              <Button variant="ghost" size="sm" className="text-primary">
                Ver todos
                <ArrowRight className="w-4 h-4 ml-1" />
              </Button>
            </Link>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="space-y-2">
                {[...Array(5)].map((_, i) => (
                  <Skeleton key={i} className="h-10 w-full" />
                ))}
              </div>
            ) : recentUsers.length === 0 ? (
              <p className="text-muted-foreground text-center py-4">
                Nenhum usuário cadastrado.
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow className="border-border/50">
                    <TableHead>Usuário</TableHead>
                    <TableHead>Saldo</TableHead>
                    <TableHead>Data</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {recentUsers.map((user) => (
                    <TableRow key={user.id} className="border-border/30">
                      <TableCell>
                        <div>
                          <p className="font-medium text-sm">
                            {user.full_name || "Sem nome"}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {user.email}
                          </p>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="border-primary/50 text-primary">
                          {formatCurrency(user.balance || 0)}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {formatDate(user.created_at)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        {/* Recent Tickets */}
        <Card className="relative overflow-hidden border-0 bg-gradient-to-br from-amber-500/10 via-transparent to-transparent shadow-md">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <TicketCheck className="w-5 h-5 text-yellow-500" />
              Tickets Recentes
            </CardTitle>
            <Link to="/admin-tickets">
              <Button variant="ghost" size="sm" className="text-primary">
                Ver todos
                <ArrowRight className="w-4 h-4 ml-1" />
              </Button>
            </Link>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="space-y-2">
                {[...Array(5)].map((_, i) => (
                  <Skeleton key={i} className="h-10 w-full" />
                ))}
              </div>
            ) : recentTickets.length === 0 ? (
              <p className="text-muted-foreground text-center py-4">
                Nenhum ticket encontrado.
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow className="border-border/50">
                    <TableHead>Assunto</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Data</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {recentTickets.map((ticket) => (
                    <TableRow key={ticket.id} className="border-border/30">
                      <TableCell>
                        <div>
                          <p className="font-medium text-sm truncate max-w-[150px]">
                            {ticket.subject}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {ticket.user_email}
                          </p>
                        </div>
                      </TableCell>
                      <TableCell>{getStatusBadge(ticket.status)}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {formatDate(ticket.created_at)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default AdminDashboard;
