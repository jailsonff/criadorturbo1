import { useState, useEffect, useRef } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Send, Loader2, MessageCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { getSupabaseClient } from "@/lib/supabaseClient";

interface TicketMessage {
  id: string;
  ticket_id: string;
  sender_type: "user" | "support" | "admin" | "ai";
  message: string;
  created_at: string;
}

interface TicketChatProps {
  ticketId: string;
  ticketSubject: string;
  ticketMessage?: string;
  ticketCreatedAt?: string;
  ticketUpdatedAt?: string;
  adminResponse?: string | null;
  isResolved?: boolean;
  onMessageSent?: (contextMessage?: string) => void;
  isAdmin?: boolean;
}

const TicketChat = ({
  ticketId,
  ticketSubject,
  ticketMessage,
  ticketCreatedAt,
  ticketUpdatedAt,
  adminResponse,
  isResolved = false,
  onMessageSent,
  isAdmin = false,
}: TicketChatProps) => {
  const [messages, setMessages] = useState<TicketMessage[]>([]);
  const [newMessage, setNewMessage] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const supabase = getSupabaseClient();

  // Scroll to bottom when messages change
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Fetch messages from ticket_messages table and merge with legacy admin_response when needed
  useEffect(() => {
    const buildLegacyAdminMessages = (): TicketMessage[] => {
      if (!adminResponse) return [];

      const adminParts: { message: string; timestamp?: Date }[] = [];
      const rawParts = adminResponse
        .split(/\r?\n\s*---\s*\r?\n/g)
        .map((p) => p.trim())
        .filter(Boolean);

      rawParts.forEach((part) => {
        const timestampMatch = part.match(/^\[([^\]]+)\]\s*/);
        let message = part;
        let timestamp: Date | undefined;

        if (timestampMatch) {
          message = part.replace(timestampMatch[0], "").trim();
          try {
            const parsed = new Date(
              timestampMatch[1].replace(/(\d{2})\/(\d{2})\/(\d{4})/, "$3-$2-$1")
            );
            if (!isNaN(parsed.getTime())) timestamp = parsed;
          } catch {
            // ignore
          }
        }

        adminParts.push({ message, timestamp });
      });

      const baseTime = new Date(ticketUpdatedAt || ticketCreatedAt || new Date().toISOString()).getTime();

      return adminParts
        .map((item, i) => ({
          id: `legacy-admin-${ticketId}-${i}`,
          ticket_id: ticketId,
          sender_type: "support" as const,
          message: item.message,
          created_at: (item.timestamp || new Date(baseTime + i * 1000)).toISOString(),
        }))
        .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
    };

    // Full legacy interleaving (for environments without ticket_messages)
    const buildLegacyMessages = (): TicketMessage[] => {
      if (!ticketMessage && !adminResponse) return [];

      const userParts = ticketMessage
        ? ticketMessage
            .split(/\r?\n\s*---\s*\r?\n/g)
            .map((p) => p.trim())
            .filter(Boolean)
        : [];

      const adminParts: { message: string; timestamp?: Date }[] = [];
      if (adminResponse) {
        const rawParts = adminResponse
          .split(/\r?\n\s*---\s*\r?\n/g)
          .map((p) => p.trim())
          .filter(Boolean);

        rawParts.forEach((part) => {
          const timestampMatch = part.match(/^\[([^\]]+)\]\s*/);
          let message = part;
          let timestamp: Date | undefined;

          if (timestampMatch) {
            message = part.replace(timestampMatch[0], "").trim();
            try {
              const parsed = new Date(
                timestampMatch[1].replace(/(\d{2})\/(\d{2})\/(\d{4})/, "$3-$2-$1")
              );
              if (!isNaN(parsed.getTime())) timestamp = parsed;
            } catch {
              // ignore
            }
          }

          adminParts.push({ message, timestamp });
        });
      }

      const result: TicketMessage[] = [];
      const baseTime = new Date(ticketCreatedAt || new Date().toISOString()).getTime();

      const maxLen = Math.max(userParts.length, adminParts.length);
      let timeOffset = 0;

      for (let i = 0; i < maxLen; i++) {
        if (i < userParts.length) {
          result.push({
            id: `legacy-user-${ticketId}-${i}`,
            ticket_id: ticketId,
            sender_type: "user" as const,
            message: userParts[i],
            created_at: new Date(baseTime + timeOffset).toISOString(),
          });
          timeOffset += 1000;
        }

        if (i < adminParts.length) {
          const adminItem = adminParts[i];
          const adminTimestamp = adminItem.timestamp
            ? adminItem.timestamp.toISOString()
            : new Date(baseTime + timeOffset + 60000).toISOString();

          result.push({
            id: `legacy-admin-${ticketId}-${i}`,
            ticket_id: ticketId,
            sender_type: "support" as const,
            message: adminItem.message,
            created_at: adminTimestamp,
          });
          timeOffset += 120000;
        }
      }

      return result.sort(
        (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
      );
    };

    const isSystemMessage = (m: TicketMessage) => m.sender_type !== "user";

    const stableKey = (m: Pick<TicketMessage, "sender_type" | "message" | "created_at">) =>
      `${m.sender_type}|${m.created_at}|${m.message}`;

    const fetchMessages = async () => {
      setIsLoading(true);

      const legacyAll = buildLegacyMessages();
      const legacyAdminOnly = buildLegacyAdminMessages();

      try {
        const { data, error } = await supabase
          .from("ticket_messages")
          .select("*")
          .eq("ticket_id", ticketId)
          .order("created_at", { ascending: true });

        if (error) {
          console.log("ticket_messages table may not exist, using legacy data:", error.message);
          setMessages(legacyAll);
        } else if (data && data.length > 0) {
          const dbMessages = data as TicketMessage[];

          // Merge in legacy admin_response if the DB only has user messages (common when a constraint blocks support inserts)
          const hasAnySystem = dbMessages.some(isSystemMessage);
          if (!hasAnySystem && legacyAdminOnly.length > 0) {
            const merged = [...dbMessages, ...legacyAdminOnly];
            const seen = new Set<string>();
            const deduped = merged.filter((m) => {
              const k = stableKey(m);
              if (seen.has(k)) return false;
              seen.add(k);
              return true;
            });
            deduped.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
            setMessages(deduped);
          } else {
            setMessages(dbMessages);
          }
        } else {
          setMessages(legacyAll);
        }
      } catch (err) {
        console.log("Error fetching ticket_messages, using legacy data:", err);
        setMessages(legacyAll);
      }

      setIsLoading(false);
    };

    fetchMessages();
  }, [ticketId, ticketMessage, ticketCreatedAt, ticketUpdatedAt, adminResponse, supabase]);

  // Real-time subscription
  useEffect(() => {
    const channel = supabase
      .channel(`ticket-chat-${ticketId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "ticket_messages",
          filter: `ticket_id=eq.${ticketId}`,
        },
        (payload) => {
          const newMsg = payload.new as TicketMessage;
          setMessages((prev) => {
            // Avoid duplicates
            if (prev.find(m => m.id === newMsg.id)) return prev;
            return [...prev, newMsg];
          });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [ticketId, supabase]);

  // Send message mutation
  const sendMessageMutation = useMutation({
    mutationFn: async (message: string): Promise<{ messageRow: TicketMessage; contextMessage?: string }> => {
      const trimmed = message.trim();

      // Try to insert into ticket_messages
      try {
        const { data, error } = await supabase
          .from("ticket_messages")
          .insert({
            ticket_id: ticketId,
            sender_type: isAdmin ? "support" : "user",
            message: trimmed,
          })
          .select()
          .single();

        if (error) throw error;

        // If user is sending a message, reopen the ticket
        if (!isAdmin) {
          await supabase
            .from("support_tickets")
            .update({ status: "open", updated_at: new Date().toISOString() })
            .eq("id", ticketId);
        }

        return { messageRow: data as TicketMessage };
      } catch (err: any) {
        // Legacy mode: append to support_tickets.message so conversation stays continuous
        console.log("Using legacy mode for message:", err?.message || err);

        const updatedTicketMessage = `${ticketMessage || ""}\n\n---\n${trimmed}`.trim();

        await supabase
          .from("support_tickets")
          .update({
            message: updatedTicketMessage,
            status: "open",
            updated_at: new Date().toISOString(),
          })
          .eq("id", ticketId);

        const uiMessage: TicketMessage = {
          id: `temp-${Date.now()}`,
          ticket_id: ticketId,
          sender_type: isAdmin ? "support" : "user",
          message: trimmed,
          created_at: new Date().toISOString(),
        };

        return { messageRow: uiMessage, contextMessage: updatedTicketMessage };
      }
    },
    onSuccess: (result) => {
      setNewMessage("");

      if (result?.messageRow) {
        setMessages((prev) => {
          if (prev.find((m) => m.id === result.messageRow.id)) return prev;
          return [...prev, result.messageRow];
        });
      }

      onMessageSent?.(result?.contextMessage);
      queryClient.invalidateQueries({ queryKey: ["support-tickets"] });
    },
    onError: (error) => {
      console.error("Error sending message:", error);
      toast({
        title: "Erro ao enviar mensagem",
        description: "Tente novamente.",
        variant: "destructive",
      });
    },
  });

  const handleSend = () => {
    if (!newMessage.trim()) return;
    sendMessageMutation.mutate(newMessage);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const formatTime = (dateString: string) => {
    return new Date(dateString).toLocaleString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Messages Area - scrollable */}
      <ScrollArea className="flex-1 p-4 sm:p-6 min-h-[500px] h-[calc(100vh-280px)]">
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-6 h-6 animate-spin text-primary" />
          </div>
        ) : messages.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <MessageCircle className="w-12 h-12 mx-auto mb-4 opacity-50" />
            <p>Nenhuma mensagem ainda.</p>
            <p className="text-sm">Envie uma mensagem para iniciar a conversa.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {messages.map((msg) => {
              const isUser = msg.sender_type === "user";
              const isSystem = !isUser;
              const senderLabel = isSystem
                ? msg.sender_type === "ai"
                  ? "IA"
                  : "Suporte"
                : isAdmin
                  ? "Cliente"
                  : "Você";

              return (
                <div
                  key={msg.id}
                  className={`flex ${isUser ? "justify-end" : "justify-start"}`}
                >
                  <div
                    className={`max-w-[85%] sm:max-w-[75%] rounded-2xl px-4 py-3 ${
                      isUser
                        ? "bg-success/90 text-success-foreground rounded-br-md"
                        : "bg-muted text-foreground rounded-bl-md"
                    }`}
                  >
                    <p className="text-sm whitespace-pre-wrap break-words">{msg.message}</p>
                    <p
                      className={`text-xs mt-2 text-right ${
                        isUser ? "text-success-foreground/70" : "text-muted-foreground"
                      }`}
                    >
                      {senderLabel} • {formatTime(msg.created_at)}
                    </p>
                  </div>
                </div>
              );
            })}
            <div ref={messagesEndRef} />
          </div>
        )}
      </ScrollArea>

      {/* Input Area */}
      {!isResolved ? (
        <div className="border-t border-border/50 p-4 bg-muted/30 rounded-b-lg">
          <div className="flex gap-2">
            <Textarea
              placeholder="Digite sua mensagem..."
              value={newMessage}
              onChange={(e) => setNewMessage(e.target.value)}
              onKeyDown={handleKeyDown}
              rows={2}
              className="resize-none flex-1"
              disabled={sendMessageMutation.isPending}
            />
            <Button
              onClick={handleSend}
              disabled={!newMessage.trim() || sendMessageMutation.isPending}
              size="icon"
              className="h-auto"
            >
              {sendMessageMutation.isPending ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Send className="w-4 h-4" />
              )}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground mt-2">
            Pressione Enter para enviar ou Shift+Enter para nova linha
          </p>
        </div>
      ) : (
        <div className="border-t border-border/50 p-4 bg-success/10 rounded-b-lg">
          <div className="flex items-center justify-center gap-2 text-success">
            <Badge variant="outline" className="border-success/50 text-success">
              Ticket Resolvido
            </Badge>
          </div>
        </div>
      )}
    </div>
  );
};

export default TicketChat;
