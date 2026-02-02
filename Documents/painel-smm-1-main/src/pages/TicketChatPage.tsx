import { useParams, useNavigate, Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, MessageCircle, Loader2, Clock, CheckCircle, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/contexts/AuthContext";
import { getSupabaseClient, getExternalConfig } from "@/lib/supabaseClient";
import TicketChat from "@/components/TicketChat";

type TicketStatus = "open" | "in_progress" | "resolved";

interface Ticket {
  id: string;
  subject: string;
  order_id: string | null;
  message: string;
  status: TicketStatus;
  admin_response: string | null;
  created_at: string;
  updated_at: string;
}

const SUBJECT_LABELS: Record<string, string> = {
  acelerar: "Acelerar",
  cancelar: "Cancelar",
  api: "API",
  reposicao: "Reposição",
  "concluiu-sem-entregar": "Concluiu sem entregar",
  outros: "Outros",
};

const getStatusBadge = (status: TicketStatus) => {
  switch (status) {
    case "open":
      return (
        <Badge variant="outline" className="bg-warning/10 text-warning border-warning/30">
          <Clock className="w-3 h-3 mr-1" />
          Aberto
        </Badge>
      );
    case "in_progress":
      return (
        <Badge variant="outline" className="bg-primary/10 text-primary border-primary/30">
          <Loader2 className="w-3 h-3 mr-1 animate-spin" />
          Em andamento
        </Badge>
      );
    case "resolved":
      return (
        <Badge variant="outline" className="bg-success/10 text-success border-success/30">
          <CheckCircle className="w-3 h-3 mr-1" />
          Resolvido
        </Badge>
      );
    default:
      return <Badge variant="outline">{status}</Badge>;
  }
};

const TicketChatPage = () => {
  const { ticketId } = useParams<{ ticketId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const supabase = getSupabaseClient();

  // Fetch ticket data
  const { data: ticket, isLoading, error } = useQuery({
    queryKey: ["ticket-detail", ticketId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("support_tickets")
        .select("*")
        .eq("id", ticketId)
        .eq("user_id", user!.id)
        .single();

      if (error) throw error;
      return data as Ticket;
    },
    enabled: !!ticketId && !!user,
  });

  // Trigger AI response after user sends a message
  const handleMessageSent = async (contextMessage?: string) => {
    if (!ticket) return;

    try {
      const externalConfig = getExternalConfig();

      await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ai-ticket-response`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
        },
        body: JSON.stringify({
          ticketId: ticket.id,
          subject: ticket.subject,
          message: contextMessage || ticket.message,
          orderId: ticket.order_id,
          externalDbUrl: externalConfig?.url,
          externalDbKey: externalConfig?.serviceRoleKey || externalConfig?.anonKey,
        }),
      });
    } catch (error) {
      console.error("Error triggering AI response:", error);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (error || !ticket) {
    return (
      <div className="min-h-screen">
        <main className="container mx-auto px-4 py-8">
          <div className="text-center py-16">
            <AlertCircle className="w-16 h-16 mx-auto text-destructive mb-4" />
            <h2 className="text-xl font-semibold mb-2">Ticket não encontrado</h2>
            <p className="text-muted-foreground mb-6">
              O ticket que você está procurando não existe ou você não tem permissão para visualizá-lo.
            </p>
            <Button asChild>
              <Link to="/support">Voltar ao Suporte</Link>
            </Button>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <main className="container mx-auto px-4 py-8 max-w-4xl">
        {/* Header with back button */}
        <div className="mb-6">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate("/support")}
            className="mb-4 -ml-2"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Voltar ao Suporte
          </Button>

          {/* Ticket info header */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-primary/20 flex items-center justify-center">
                <MessageCircle className="w-5 h-5 text-primary" />
              </div>
              <div>
                <h1 className="text-xl font-bold">
                  {SUBJECT_LABELS[ticket.subject] || ticket.subject}
                </h1>
                {ticket.order_id && (
                  <p className="text-sm text-muted-foreground">
                    Pedido #{ticket.order_id}
                  </p>
                )}
              </div>
            </div>
            {getStatusBadge(ticket.status)}
          </div>
        </div>

        {/* Chat container - full height style like the reference */}
        <div className="glass rounded-xl border border-border/50 overflow-hidden flex flex-col" style={{ minHeight: "calc(100vh - 280px)" }}>
          {/* Chat header */}
          <div className="bg-primary px-6 py-4">
            <h2 className="text-lg font-semibold text-primary-foreground text-center">
              {SUBJECT_LABELS[ticket.subject] || ticket.subject}
            </h2>
          </div>

          {/* Chat content */}
          <div className="flex-1 flex flex-col">
            <TicketChat
              ticketId={ticket.id}
              ticketSubject={SUBJECT_LABELS[ticket.subject] || ticket.subject}
              ticketMessage={ticket.message}
              ticketCreatedAt={ticket.created_at}
              ticketUpdatedAt={ticket.updated_at}
              adminResponse={ticket.admin_response}
              isResolved={ticket.status === "resolved"}
              onMessageSent={handleMessageSent}
            />
          </div>
        </div>
      </main>
    </div>
  );
};

export default TicketChatPage;
