import { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { MessageCircle, Mail, HelpCircle, ExternalLink, Send, Loader2, Hash, Clock, CheckCircle, AlertCircle, MessageSquare } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { getSupabaseClient, getExternalConfig } from "@/lib/supabaseClient";

// Contact Sidebar Component
const ContactSidebar = () => {
  const { data: contactSettings } = useQuery({
    queryKey: ["contact-settings-public"],
    queryFn: async () => {
      const supabaseClient = getSupabaseClient();
      const { data, error } = await supabaseClient
        .from("site_settings")
        .select("whatsapp_number, support_email, business_hours")
        .single();
      
      if (error && error.code !== "PGRST116") throw error;
      return data;
    },
  });

  const formatWhatsAppLink = (number: string) => {
    const cleanNumber = number.replace(/\D/g, "");
    return `https://wa.me/${cleanNumber}`;
  };

  const whatsappNumber = contactSettings?.whatsapp_number;
  const supportEmail = contactSettings?.support_email;
  const businessHours = contactSettings?.business_hours || "Segunda a Sexta: 9h às 18h\nSábado: 9h às 14h";

  return (
    <div className="lg:col-span-1 space-y-4">
      <div className="glass rounded-xl p-6 border border-border/50">
        <div className="flex items-center gap-4 mb-4">
          <div className="w-12 h-12 rounded-xl bg-success/20 flex items-center justify-center">
            <MessageCircle className="w-6 h-6 text-success" />
          </div>
          <div>
            <h3 className="font-semibold">WhatsApp</h3>
            <p className="text-sm text-muted-foreground">Resposta rápida</p>
          </div>
        </div>
        {whatsappNumber ? (
          <Button className="w-full bg-success hover:bg-success/90" asChild>
            <a href={formatWhatsAppLink(whatsappNumber)} target="_blank" rel="noopener noreferrer" className="gap-2">
              <MessageCircle className="w-4 h-4" />
              Abrir WhatsApp
              <ExternalLink className="w-3 h-3" />
            </a>
          </Button>
        ) : (
          <Button className="w-full bg-success hover:bg-success/90" disabled>
            <MessageCircle className="w-4 h-4 mr-2" />
            Não configurado
          </Button>
        )}
      </div>

      <div className="glass rounded-xl p-6 border border-border/50">
        <div className="flex items-center gap-4 mb-4">
          <div className="w-12 h-12 rounded-xl bg-primary/20 flex items-center justify-center">
            <Mail className="w-6 h-6 text-primary" />
          </div>
          <div>
            <h3 className="font-semibold">E-mail</h3>
            <p className="text-sm text-muted-foreground">Suporte detalhado</p>
          </div>
        </div>
        {supportEmail ? (
          <Button variant="outline" className="w-full" asChild>
            <a href={`mailto:${supportEmail}`} className="gap-2">
              <Mail className="w-4 h-4" />
              {supportEmail}
            </a>
          </Button>
        ) : (
          <Button variant="outline" className="w-full" disabled>
            <Mail className="w-4 h-4 mr-2" />
            Não configurado
          </Button>
        )}
      </div>

      <div className="glass rounded-xl p-6 border border-primary/30">
        <div className="flex items-center gap-2 mb-2">
          <HelpCircle className="w-5 h-5 text-primary" />
          <h3 className="font-semibold">Horário de Atendimento</h3>
        </div>
        <p className="text-sm text-muted-foreground whitespace-pre-line">
          {businessHours}
        </p>
      </div>
    </div>
  );
};

const SUBJECT_OPTIONS = [
  { value: "acelerar", label: "Acelerar" },
  { value: "cancelar", label: "Cancelar" },
  { value: "api", label: "API" },
  { value: "reposicao", label: "Reposição" },
  { value: "concluiu-sem-entregar", label: "Concluiu sem entregar" },
  { value: "servicos", label: "Serviços" },
  { value: "outros", label: "Outros" },
];

const SUBJECT_LABELS: Record<string, string> = {
  acelerar: "Acelerar",
  cancelar: "Cancelar",
  api: "API",
  reposicao: "Reposição",
  "concluiu-sem-entregar": "Concluiu sem entregar",
  servicos: "Serviços",
  outros: "Outros",
};

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

const Support = () => {
  const [subject, setSubject] = useState("");
  const [orderId, setOrderId] = useState("");
  const [message, setMessage] = useState("");
  const { toast } = useToast();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  // Fetch user tickets
  const { data: tickets, isLoading: ticketsLoading } = useQuery({
    queryKey: ["support-tickets", user?.id],
    queryFn: async () => {
      const supabaseClient = getSupabaseClient();
      const { data, error } = await supabaseClient
        .from("support_tickets")
        .select("*")
        .eq("user_id", user!.id)
        .order("created_at", { ascending: false });

      if (error) throw error;
      return data as Ticket[];
    },
    enabled: !!user,
  });

  // Real-time subscription for ticket updates
  useEffect(() => {
    if (!user) return;

    const supabaseClient = getSupabaseClient();
    const channel = supabaseClient
      .channel('user-tickets')
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'support_tickets',
          filter: `user_id=eq.${user.id}`
        },
        (payload) => {
          console.log('Ticket updated:', payload);
          const updatedTicket = payload.new as Ticket;
          
          if (updatedTicket.admin_response && payload.old && !(payload.old as Ticket).admin_response) {
            toast({
              title: "📩 Nova resposta!",
              description: `O suporte respondeu ao seu ticket "${SUBJECT_LABELS[updatedTicket.subject] || updatedTicket.subject}".`,
            });
          }

          queryClient.invalidateQueries({ queryKey: ["support-tickets"] });
        }
      )
      .subscribe();

    return () => {
      supabaseClient.removeChannel(channel);
    };
  }, [user, queryClient, toast]);

  // Trigger AI response for the ticket
  const triggerAIResponse = async (ticketId: string, subject: string, message: string, orderId: string | null) => {
    try {
      const externalConfig = getExternalConfig();
      
      const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ai-ticket-response`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
        },
        body: JSON.stringify({
          ticketId,
          subject,
          message,
          orderId,
          externalDbUrl: externalConfig?.url,
          externalDbKey: externalConfig?.serviceRoleKey || externalConfig?.anonKey,
        }),
      });

      const data = await response.json();
      
      if (data.success) {
        console.log("AI response generated by agent:", data.agentName);
        queryClient.invalidateQueries({ queryKey: ["support-tickets"] });
      }
    } catch (error) {
      console.error("Error triggering AI response:", error);
    }
  };

  // Create ticket mutation
  const createTicketMutation = useMutation({
    mutationFn: async (ticketData: { subject: string; order_id: string | null; message: string }) => {
      const supabaseClient = getSupabaseClient();
      
      // Create the ticket
      const { data: ticket, error } = await supabaseClient
        .from("support_tickets")
        .insert({
          user_id: user!.id,
          subject: ticketData.subject,
          order_id: ticketData.order_id || null,
          message: ticketData.message,
        })
        .select()
        .single();

      if (error) throw error;

       // Insert the first message (new chat mode). If table doesn't exist in this database, fall back to legacy mode.
       try {
         await supabaseClient
           .from("ticket_messages")
           .insert({
             ticket_id: ticket.id,
             sender_type: "user",
             message: ticketData.message,
           });
       } catch (e) {
         console.log("ticket_messages not available; using legacy ticket message field.", e);
       }

      return ticket;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["support-tickets"] });
      toast({
        title: "Ticket enviado!",
        description: "Recebemos sua solicitação. A IA está processando sua resposta...",
      });
      
      triggerAIResponse(data.id, data.subject, data.message, data.order_id);
      
      setSubject("");
      setOrderId("");
      setMessage("");
    },
    onError: (error) => {
      console.error("Error creating ticket:", error);
      toast({
        title: "Erro ao enviar ticket",
        description: "Tente novamente mais tarde.",
        variant: "destructive",
      });
    },
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!subject) {
      toast({
        title: "Selecione um assunto",
        description: "Por favor, selecione o tipo de solicitação.",
        variant: "destructive",
      });
      return;
    }

    if (!message.trim()) {
      toast({
        title: "Mensagem obrigatória",
        description: "Por favor, descreva sua solicitação.",
        variant: "destructive",
      });
      return;
    }

    createTicketMutation.mutate({
      subject,
      order_id: orderId || null,
      message: message.trim(),
    });
  };

  const faqs = [
    {
      question: "Como funciona o sistema de pedidos?",
      answer: "Após configurar sua API Key, você pode selecionar um serviço, inserir o link da publicação e a quantidade desejada. O pedido será processado automaticamente.",
    },
    {
      question: "Quanto tempo leva para entregar?",
      answer: "O tempo de entrega varia de acordo com o serviço escolhido. Alguns serviços são instantâneos, enquanto outros podem levar algumas horas ou dias.",
    },
    {
      question: "O que fazer se meu pedido não for entregue?",
      answer: "Se seu pedido não for entregue dentro do prazo estimado, abra um ticket de suporte informando o ID do pedido. Analisaremos o caso e providenciaremos a solução.",
    },
    {
      question: "Como adicionar saldo na minha conta?",
      answer: "Você pode adicionar saldo através da página 'Adicionar Saldo' no menu lateral. Aceitamos pagamentos via PIX com crédito instantâneo.",
    },
    {
      question: "Posso cancelar um pedido?",
      answer: "Alguns serviços permitem cancelamento antes do início do processamento. Abra um ticket com o assunto 'Cancelar' informando o ID do pedido.",
    },
    {
      question: "O que é reposição (refill)?",
      answer: "Reposição é quando solicitamos a reentrega de seguidores/curtidas que foram perdidos. Nem todos os serviços oferecem reposição. Verifique na descrição do serviço.",
    },
  ];

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  return (
    <div className="min-h-screen">
      <main className="container mx-auto px-4 py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold mb-2">Suporte</h1>
          <p className="text-muted-foreground">
            Precisa de ajuda? Envie um ticket ou consulte as perguntas frequentes
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
            {/* Instructions */}
            <div className="glass rounded-xl p-6 border border-border/50">
              <h2 className="text-lg font-semibold mb-4">Instruções para abrir ticket</h2>
              <div className="space-y-3 text-sm text-muted-foreground">
                <p>Use os seguintes assuntos de acordo com sua necessidade:</p>
                <ul className="list-disc list-inside space-y-1 ml-2">
                  <li><span className="text-foreground font-medium">Acelerar</span> - Solicitar aceleração do pedido</li>
                  <li><span className="text-foreground font-medium">Cancelar</span> - Solicitar cancelamento do pedido</li>
                  <li><span className="text-foreground font-medium">API</span> - Dúvidas sobre integração API</li>
                  <li><span className="text-foreground font-medium">Reposição</span> - Solicitar reposição de perdas</li>
                  <li><span className="text-foreground font-medium">Concluiu sem entregar</span> - Pedido marcado como concluído mas não entregou</li>
                  <li><span className="text-foreground font-medium">Serviços</span> - Dúvidas sobre serviços disponíveis (informe o ID ou nome do serviço)</li>
                  <li><span className="text-foreground font-medium">Outros</span> - Outras solicitações</li>
                </ul>
                <p className="pt-2">
                  Coloque na mensagem o número de <span className="text-primary font-medium">ID do pedido</span>. 
                  Nós vamos verificar todo o processo do pedido e lhe responder o mais rápido possível.
                </p>
                <p>
                  Você pode ver o ID do seu pedido em:{" "}
                  <Link to="/orders" className="text-primary hover:underline font-medium">
                    Meus Pedidos
                  </Link>
                </p>
              </div>
            </div>

            {/* Ticket Form */}
            <div className="glass rounded-xl p-6 border border-border/50">
              <h2 className="text-xl font-bold mb-6 flex items-center gap-2">
                <Send className="w-5 h-5 text-primary" />
                Abrir Ticket
              </h2>

              <form onSubmit={handleSubmit} className="space-y-5">
                <div className="space-y-2">
                  <Label htmlFor="subject">Assunto *</Label>
                  <Select value={subject} onValueChange={setSubject}>
                    <SelectTrigger className="w-full bg-background">
                      <SelectValue placeholder="Selecione o tipo de solicitação" />
                    </SelectTrigger>
                    <SelectContent className="bg-card border-border">
                      {SUBJECT_OPTIONS.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="orderId">ID do Pedido (opcional)</Label>
                  <div className="relative">
                    <Hash className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input
                      id="orderId"
                      type="text"
                      placeholder="Ex: 12345678"
                      value={orderId}
                      onChange={(e) => setOrderId(e.target.value)}
                      className="pl-10"
                    />
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Informe o ID do pedido relacionado à sua solicitação
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="message">Mensagem *</Label>
                  <Textarea
                    id="message"
                    placeholder="Descreva sua solicitação em detalhes..."
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    rows={4}
                    className="resize-none"
                  />
                </div>

                <Button
                  type="submit"
                  className="w-full"
                  size="lg"
                  disabled={createTicketMutation.isPending}
                >
                  {createTicketMutation.isPending ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Enviando...
                    </>
                  ) : (
                    <>
                      <Send className="w-4 h-4 mr-2" />
                      Enviar Ticket
                    </>
                  )}
                </Button>
              </form>
            </div>

            {/* Tickets List */}
            <div className="glass rounded-xl p-6 border border-border/50">
              <h2 className="text-xl font-bold mb-6 flex items-center gap-2">
                <AlertCircle className="w-5 h-5 text-primary" />
                Meus Tickets
              </h2>

              {ticketsLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="w-6 h-6 animate-spin text-primary" />
                </div>
              ) : tickets && tickets.length > 0 ? (
                <div className="space-y-3">
                  {tickets.map((ticket) => (
                    <div 
                      key={ticket.id} 
                      className="border border-border/50 rounded-lg overflow-hidden hover:border-primary/50 transition-colors cursor-pointer"
                      onClick={() => navigate(`/support/ticket/${ticket.id}`)}
                    >
                      <div className="flex items-center justify-between p-4">
                        <div className="flex items-center gap-4 flex-wrap">
                          <span className="font-mono text-xs text-muted-foreground">
                            #{ticket.id.slice(0, 8)}
                          </span>
                          <span className="font-medium">
                            {SUBJECT_LABELS[ticket.subject] || ticket.subject}
                          </span>
                          {ticket.order_id && (
                            <span className="text-xs text-muted-foreground">
                              Pedido: #{ticket.order_id}
                            </span>
                          )}
                          {getStatusBadge(ticket.status)}
                          {ticket.admin_response && (
                            <Badge variant="outline" className="bg-primary/10 text-primary border-primary/30">
                              <MessageSquare className="w-3 h-3 mr-1" />
                              Respondido
                            </Badge>
                          )}
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="text-xs text-muted-foreground hidden sm:block">
                            {formatDate(ticket.created_at)}
                          </span>
                          <MessageCircle className="w-4 h-4 text-primary" />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  <AlertCircle className="w-12 h-12 mx-auto mb-4 opacity-50" />
                  <p>Você ainda não abriu nenhum ticket.</p>
                </div>
              )}
            </div>
          </div>

          <ContactSidebar />
        </div>

        {/* FAQ Section */}
        <div className="mt-8">
          <div className="glass rounded-xl p-6 border border-border/50">
            <h2 className="text-xl font-bold mb-6 flex items-center gap-2">
              <HelpCircle className="w-5 h-5 text-primary" />
              Perguntas Frequentes
            </h2>
            <Accordion type="single" collapsible className="space-y-2">
              {faqs.map((faq, index) => (
                <AccordionItem
                  key={index}
                  value={`item-${index}`}
                  className="border border-border/50 rounded-lg px-4"
                >
                  <AccordionTrigger className="text-left hover:no-underline">
                    {faq.question}
                  </AccordionTrigger>
                  <AccordionContent className="text-muted-foreground">
                    {faq.answer}
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </div>
        </div>
      </main>

    </div>
  );
};

export default Support;
