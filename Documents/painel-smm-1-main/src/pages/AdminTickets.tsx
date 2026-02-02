import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { getSupabaseClient, getExternalConfig } from "@/lib/supabaseClient";
import { useToast } from "@/hooks/use-toast";
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
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { 
  HeadphonesIcon, 
  Search, 
  MessageSquare, 
  Clock,
  CheckCircle,
  AlertCircle,
  Bot,
  Loader2,
  Zap
} from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

type TicketStatus = "open" | "in_progress" | "resolved";

interface SupportTicket {
  id: string;
  subject: string;
  message: string;
  order_id: string | null;
  status: TicketStatus;
  admin_response: string | null;
  user_id: string;
  created_at: string;
  updated_at: string;
  user_email?: string;
}

const AdminTickets = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { toast } = useToast();
  const supabase = getSupabaseClient();
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [selectedTicket, setSelectedTicket] = useState<SupportTicket | null>(null);
  const [adminResponse, setAdminResponse] = useState("");
  const [newStatus, setNewStatus] = useState<TicketStatus>("open");
  const [isUpdating, setIsUpdating] = useState(false);
  
  // AI Batch Response State
  const [concurrency, setConcurrency] = useState(3);
  const [isProcessingBatch, setIsProcessingBatch] = useState(false);
  const [processedCount, setProcessedCount] = useState(0);
  const [totalToProcess, setTotalToProcess] = useState(0);

  useEffect(() => {
    const checkAdminAndFetchTickets = async () => {
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

      // Fetch all tickets with user info
      const { data: ticketsData, error } = await supabase
        .from("support_tickets")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) {
        console.error("Error fetching tickets:", error);
        toast({
          title: "Erro",
          description: "Erro ao carregar tickets.",
          variant: "destructive",
        });
      } else {
        // Fetch user emails
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

        setTickets(ticketsWithEmail);
      }

      setLoading(false);
    };

    checkAdminAndFetchTickets();
  }, [user, navigate, toast]);

  // Real-time subscription for new tickets
  useEffect(() => {
    if (!isAdmin) return;

    const channel = supabase
      .channel('admin-tickets')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'support_tickets'
        },
        async (payload) => {
          console.log('New ticket received:', payload);
          const newTicket = payload.new as SupportTicket;
          
          // Fetch user email for the new ticket
          const { data: profile } = await supabase
            .from("profiles")
            .select("email")
            .eq("id", newTicket.user_id)
            .maybeSingle();

          const ticketWithEmail = {
            ...newTicket,
            user_email: profile?.email || "Desconhecido"
          };

          setTickets((prev) => [ticketWithEmail, ...prev]);
          
          toast({
            title: "🎫 Novo Ticket!",
            description: `${ticketWithEmail.user_email}: ${newTicket.subject}`,
          });
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'support_tickets'
        },
        (payload) => {
          const updatedTicket = payload.new as SupportTicket;
          setTickets((prev) =>
            prev.map((t) =>
              t.id === updatedTicket.id 
                ? { ...t, ...updatedTicket }
                : t
            )
          );
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [isAdmin, toast]);

  const filteredTickets = tickets.filter((ticket) => {
    const query = searchQuery.toLowerCase().trim();
    const matchesSearch = !query || 
      ticket.subject.toLowerCase().includes(query) ||
      ticket.user_email?.toLowerCase().includes(query) ||
      ticket.order_id?.toLowerCase().includes(query);
    
    const matchesStatus = statusFilter === "all" || ticket.status === statusFilter;
    
    return matchesSearch && matchesStatus;
  });

  const handleOpenTicket = (ticket: SupportTicket) => {
    setSelectedTicket(ticket);
    setAdminResponse(ticket.admin_response || "");
    setNewStatus(ticket.status);
  };

  const handleUpdateTicket = async () => {
    if (!selectedTicket) return;

    setIsUpdating(true);
    const { error } = await supabase
      .from("support_tickets")
      .update({ 
        admin_response: adminResponse || null,
        status: newStatus
      })
      .eq("id", selectedTicket.id);

    if (error) {
      console.error("Error updating ticket:", error);
      toast({
        title: "Erro",
        description: "Erro ao atualizar ticket.",
        variant: "destructive",
      });
    } else {
      setTickets((prev) =>
        prev.map((t) =>
          t.id === selectedTicket.id 
            ? { ...t, admin_response: adminResponse || null, status: newStatus } 
            : t
        )
      );
      toast({
        title: "Sucesso",
        description: "Ticket atualizado com sucesso.",
      });
      setSelectedTicket(null);
    }
    setIsUpdating(false);
  };

  // Trigger AI response for a single ticket
  const triggerAIResponse = async (ticket: SupportTicket): Promise<boolean> => {
    try {
      const externalConfig = getExternalConfig();
      
      const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ai-ticket-response`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
        },
        body: JSON.stringify({
          ticketId: ticket.id,
          subject: ticket.subject,
          message: ticket.message,
          orderId: ticket.order_id,
          externalDbUrl: externalConfig?.url,
          externalDbKey: externalConfig?.serviceRoleKey || externalConfig?.anonKey,
        }),
      });

      const data = await response.json();
      return data.success === true;
    } catch (error) {
      console.error("Error triggering AI response for ticket:", ticket.id, error);
      return false;
    }
  };

  // Process tickets in batches with concurrency limit
  const processTicketsBatch = async () => {
    const openTickets = tickets.filter(t => t.status === "open" && !t.admin_response);
    
    if (openTickets.length === 0) {
      toast({
        title: "Nenhum ticket pendente",
        description: "Não há tickets abertos sem resposta para processar.",
      });
      return;
    }

    setIsProcessingBatch(true);
    setProcessedCount(0);
    setTotalToProcess(openTickets.length);

    let successCount = 0;
    let failCount = 0;

    // Process in chunks based on concurrency
    for (let i = 0; i < openTickets.length; i += concurrency) {
      const batch = openTickets.slice(i, i + concurrency);
      
      const results = await Promise.all(
        batch.map(ticket => triggerAIResponse(ticket))
      );

      results.forEach((success) => {
        if (success) successCount++;
        else failCount++;
      });

      setProcessedCount(Math.min(i + concurrency, openTickets.length));
      
      // Small delay between batches to avoid overwhelming the API
      if (i + concurrency < openTickets.length) {
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }

    setIsProcessingBatch(false);
    
    // Refresh tickets
    const { data: refreshedTickets } = await supabase
      .from("support_tickets")
      .select("*")
      .order("created_at", { ascending: false });

    if (refreshedTickets) {
      const userIds = [...new Set(refreshedTickets.map(t => t.user_id))];
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, email")
        .in("id", userIds);

      const profileMap = new Map(profiles?.map(p => [p.id, p.email]) || []);
      
      const ticketsWithEmail = refreshedTickets.map(ticket => ({
        ...ticket,
        user_email: profileMap.get(ticket.user_id) || "Desconhecido"
      }));

      setTickets(ticketsWithEmail);
    }

    toast({
      title: "Processamento concluído",
      description: `${successCount} respondidos, ${failCount} falharam.`,
    });
  };

  const getStatusBadge = (status: TicketStatus) => {
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

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const getStatusCounts = () => {
    return {
      open: tickets.filter(t => t.status === "open").length,
      in_progress: tickets.filter(t => t.status === "in_progress").length,
      resolved: tickets.filter(t => t.status === "resolved").length,
    };
  };

  const statusCounts = getStatusCounts();

  if (!isAdmin && !loading) {
    return null;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold gradient-text">Tickets de Suporte</h1>
        <p className="text-muted-foreground mt-1">
          Gerencie e responda aos tickets de suporte dos usuários
        </p>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="glass-card border-border/50">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Abertos</p>
                <p className="text-2xl font-bold text-yellow-500">{statusCounts.open}</p>
              </div>
              <AlertCircle className="w-8 h-8 text-yellow-500/50" />
            </div>
          </CardContent>
        </Card>
        <Card className="glass-card border-border/50">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Em Andamento</p>
                <p className="text-2xl font-bold text-blue-500">{statusCounts.in_progress}</p>
              </div>
              <Clock className="w-8 h-8 text-blue-500/50" />
            </div>
          </CardContent>
        </Card>
        <Card className="glass-card border-border/50">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Resolvidos</p>
                <p className="text-2xl font-bold text-green-500">{statusCounts.resolved}</p>
              </div>
              <CheckCircle className="w-8 h-8 text-green-500/50" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* AI Batch Response Card */}
      <Card className="glass-card border-primary/30">
        <CardContent className="pt-6">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-primary/20 flex items-center justify-center">
                <Bot className="w-5 h-5 text-primary" />
              </div>
              <div>
                <h3 className="font-semibold">Resposta IA em Lote</h3>
                <p className="text-sm text-muted-foreground">
                  {tickets.filter(t => t.status === "open" && !t.admin_response).length} tickets aguardando resposta
                </p>
              </div>
            </div>
            
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 w-full sm:w-auto">
              <div className="flex items-center gap-2">
                <Label htmlFor="concurrency" className="text-sm whitespace-nowrap">Simultâneos:</Label>
                <Select 
                  value={String(concurrency)} 
                  onValueChange={(v) => setConcurrency(Number(v))}
                  disabled={isProcessingBatch}
                >
                  <SelectTrigger id="concurrency" className="w-20 bg-background/50 border-border/50">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(n => (
                      <SelectItem key={n} value={String(n)}>{n}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              
              <Button 
                onClick={processTicketsBatch}
                disabled={isProcessingBatch || tickets.filter(t => t.status === "open" && !t.admin_response).length === 0}
                className="gap-2"
              >
                {isProcessingBatch ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Processando {processedCount}/{totalToProcess}
                  </>
                ) : (
                  <>
                    <Zap className="w-4 h-4" />
                    Responder Todos com IA
                  </>
                )}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="glass-card border-border/50">
        <CardHeader className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <CardTitle className="flex items-center gap-2">
            <HeadphonesIcon className="w-5 h-5 text-primary" />
            Tickets
            <Badge variant="secondary" className="ml-2">
              {filteredTickets.length} de {tickets.length}
            </Badge>
          </CardTitle>
          <div className="flex flex-col sm:flex-row gap-3">
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-full sm:w-40 bg-background/50 border-border/50">
                <SelectValue placeholder="Filtrar status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                <SelectItem value="open">Abertos</SelectItem>
                <SelectItem value="in_progress">Em andamento</SelectItem>
                <SelectItem value="resolved">Resolvidos</SelectItem>
              </SelectContent>
            </Select>
            <div className="relative w-full sm:w-72">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Buscar por assunto, email..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 bg-background/50 border-border/50"
              />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-3">
              {[...Array(5)].map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : filteredTickets.length === 0 ? (
            <p className="text-muted-foreground text-center py-8">
              {searchQuery || statusFilter !== "all" 
                ? "Nenhum ticket encontrado com esses filtros." 
                : "Nenhum ticket encontrado."}
            </p>
          ) : (
            <div className="overflow-x-auto scrollbar-hide">
              <Table>
                <TableHeader>
                  <TableRow className="border-border/50">
                    <TableHead className="text-xs sm:text-sm">Assunto</TableHead>
                    <TableHead className="text-xs sm:text-sm hidden md:table-cell">Usuário</TableHead>
                    <TableHead className="text-xs sm:text-sm hidden lg:table-cell">Pedido</TableHead>
                    <TableHead className="text-xs sm:text-sm">Status</TableHead>
                    <TableHead className="text-xs sm:text-sm hidden sm:table-cell">Data</TableHead>
                    <TableHead className="text-right text-xs sm:text-sm">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredTickets.map((ticket) => (
                    <TableRow key={ticket.id} className="border-border/30">
                      <TableCell className="font-medium max-w-[120px] sm:max-w-[200px] truncate text-xs sm:text-sm">
                        {ticket.subject}
                      </TableCell>
                      <TableCell className="text-muted-foreground text-xs sm:text-sm hidden md:table-cell max-w-[150px] truncate">
                        {ticket.user_email}
                      </TableCell>
                      <TableCell className="text-muted-foreground text-xs sm:text-sm hidden lg:table-cell">
                        {ticket.order_id || "—"}
                      </TableCell>
                      <TableCell>{getStatusBadge(ticket.status)}</TableCell>
                      <TableCell className="text-muted-foreground text-xs sm:text-sm hidden sm:table-cell whitespace-nowrap">
                        {formatDate(ticket.created_at)}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleOpenTicket(ticket)}
                          className="hover:bg-primary/10 hover:text-primary h-8 w-8 sm:h-9 sm:w-auto p-0 sm:px-3"
                        >
                          <MessageSquare className="w-4 h-4 sm:mr-1" />
                          <span className="hidden sm:inline">Responder</span>
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Ticket Detail Dialog */}
      <Dialog open={!!selectedTicket} onOpenChange={() => setSelectedTicket(null)}>
        <DialogContent className="glass-card border-border/50 max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <MessageSquare className="w-5 h-5 text-primary" />
              Detalhes do Ticket
            </DialogTitle>
          </DialogHeader>
          {selectedTicket && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-muted-foreground text-xs">Usuário</Label>
                  <p className="font-medium">{selectedTicket.user_email}</p>
                </div>
                <div>
                  <Label className="text-muted-foreground text-xs">Data</Label>
                  <p className="font-medium">{formatDate(selectedTicket.created_at)}</p>
                </div>
              </div>

              {selectedTicket.order_id && (
                <div>
                  <Label className="text-muted-foreground text-xs">ID do Pedido</Label>
                  <p className="font-medium">{selectedTicket.order_id}</p>
                </div>
              )}

              <div>
                <Label className="text-muted-foreground text-xs">Assunto</Label>
                <p className="font-medium">{selectedTicket.subject}</p>
              </div>

              <div>
                <Label className="text-muted-foreground text-xs">Mensagem do Usuário</Label>
                <div className="mt-1 p-3 bg-muted/30 rounded-lg border border-border/50">
                  <p className="text-sm whitespace-pre-wrap">{selectedTicket.message}</p>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="status">Status</Label>
                <Select value={newStatus} onValueChange={(v) => setNewStatus(v as TicketStatus)}>
                  <SelectTrigger className="bg-background/50 border-border/50">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="open">Aberto</SelectItem>
                    <SelectItem value="in_progress">Em andamento</SelectItem>
                    <SelectItem value="resolved">Resolvido</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="response">Resposta do Admin</Label>
                <Textarea
                  id="response"
                  value={adminResponse}
                  onChange={(e) => setAdminResponse(e.target.value)}
                  placeholder="Digite sua resposta para o usuário..."
                  className="min-h-[120px] bg-background/50 border-border/50"
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setSelectedTicket(null)}
              className="border-border/50"
            >
              Cancelar
            </Button>
            <Button onClick={handleUpdateTicket} disabled={isUpdating}>
              {isUpdating ? "Salvando..." : "Salvar Resposta"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AdminTickets;
