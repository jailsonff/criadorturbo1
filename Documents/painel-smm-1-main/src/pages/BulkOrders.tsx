import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Layers, Loader2, AlertCircle, CheckCircle, Info, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { createOrder } from "@/lib/api";
import { getSupabaseClient } from "@/lib/supabaseClient";
import { useAuth } from "@/contexts/AuthContext";
import { formatCurrency } from "@/lib/utils";
import { Link } from "react-router-dom";

interface OrderResult {
  line: number;
  serviceId: number;
  link: string;
  quantity: number;
  success: boolean;
  orderId?: number;
  charge?: number;
  error?: string;
}

const BulkOrders = () => {
  const [ordersText, setOrdersText] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [results, setResults] = useState<OrderResult[]>([]);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { user } = useAuth();

  // Fetch user balance
  const { data: userProfile } = useQuery({
    queryKey: ["user-profile", user?.id],
    queryFn: async () => {
      if (!user) return { balance: 0 };
      const supabase = getSupabaseClient();
      const { data, error } = await supabase
        .from("profiles")
        .select("balance")
        .eq("id", user.id)
        .single();
      if (error) throw error;
      return { balance: data?.balance || 0 };
    },
    enabled: !!user,
  });

  const userBalance = userProfile?.balance || 0;

  const parseOrders = (text: string) => {
    const lines = text.trim().split("\n").filter(line => line.trim());
    const orders: { serviceId: number; link: string; quantity: number; line: number }[] = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      const parts = line.split("|").map(p => p.trim());

      if (parts.length >= 3) {
        const serviceId = parseInt(parts[0]);
        const link = parts[1];
        const quantity = parseInt(parts[2]);

        if (!isNaN(serviceId) && link && !isNaN(quantity) && quantity > 0) {
          orders.push({ serviceId, link, quantity, line: i + 1 });
        }
      }
    }

    return orders;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Check if user has any balance at all
    if (userBalance <= 0) {
      toast({
        title: "Saldo insuficiente",
        description: "Você precisa adicionar saldo para realizar pedidos.",
        variant: "destructive",
      });
      return;
    }

    const parsedOrders = parseOrders(ordersText);

    if (parsedOrders.length === 0) {
      toast({
        title: "Nenhum pedido válido",
        description: "Verifique o formato: ID do serviço | link | quantidade",
        variant: "destructive",
      });
      return;
    }

    // Pre-calculate total cost to validate balance
    const supabase = getSupabaseClient();
    let totalCost = 0;
    
    for (const order of parsedOrders) {
      const { data: serviceData } = await supabase
        .from("imported_services")
        .select("rate")
        .eq("external_service_id", order.serviceId)
        .maybeSingle();
      
      if (serviceData) {
        const rate = parseFloat(serviceData.rate || "0");
        totalCost += (rate / 1000) * order.quantity;
      }
    }

    if (totalCost > userBalance) {
      toast({
        title: "Saldo insuficiente",
        description: `Custo total: ${formatCurrency(totalCost)}. Seu saldo: ${formatCurrency(userBalance)}`,
        variant: "destructive",
      });
      return;
    }

    setIsProcessing(true);
    setResults([]);

    const orderResults: OrderResult[] = [];

    for (const order of parsedOrders) {
      try {
        // Get service info for name and rate
        const supabase = getSupabaseClient();
        const { data: serviceData } = await supabase
          .from("imported_services")
          .select("name, rate")
          .eq("external_service_id", order.serviceId)
          .maybeSingle();

        const serviceName = serviceData?.name || `Serviço #${order.serviceId}`;
        const rate = parseFloat(serviceData?.rate || "0");
        const charge = (rate / 1000) * order.quantity;

        const response = await createOrder(order.serviceId, order.link, order.quantity);

        // Save to database
        if (user) {
          await supabase.from("orders").insert({
            order_id: response.order,
            user_id: user.id,
            service_id: order.serviceId,
            service_name: serviceName,
            link: order.link,
            quantity: order.quantity,
            charge: charge,
            status: "pending",
          });

          // Deduct balance from user profile
          const { data: profileData } = await supabase
            .from("profiles")
            .select("balance")
            .eq("id", user.id)
            .single();

          if (profileData) {
            const newBalance = Math.max(0, (profileData.balance || 0) - charge);
            await supabase
              .from("profiles")
              .update({ balance: newBalance })
              .eq("id", user.id);
          }
        }

        orderResults.push({
          line: order.line,
          serviceId: order.serviceId,
          link: order.link,
          quantity: order.quantity,
          success: true,
          orderId: response.order,
          charge: charge,
        });
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : "Erro desconhecido";
        orderResults.push({
          line: order.line,
          serviceId: order.serviceId,
          link: order.link,
          quantity: order.quantity,
          success: false,
          error: message,
        });
      }
    }

    setResults(orderResults);
    setIsProcessing(false);

    const successCount = orderResults.filter(r => r.success).length;
    const errorCount = orderResults.filter(r => !r.success).length;

    // Invalidate queries to refresh data
    queryClient.invalidateQueries({ queryKey: ["user-orders"] });
    queryClient.invalidateQueries({ queryKey: ["user-profile"] });

    if (successCount > 0) {
      toast({
        title: "Pedidos em massa processados!",
        description: `${successCount} criado(s) com sucesso${errorCount > 0 ? `, ${errorCount} com erro` : ""}.`,
      });
      setOrdersText("");
    } else {
      toast({
        title: "Erro ao processar pedidos",
        description: "Nenhum pedido foi criado. Verifique os dados.",
        variant: "destructive",
      });
    }
  };


  return (
    <div className="min-h-screen">
      <main className="container mx-auto px-4 py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold mb-2">Pedidos em Massa</h1>
          <p className="text-muted-foreground">
            Crie múltiplos pedidos de uma só vez
          </p>
        </div>

        <div className="max-w-3xl">
          {/* Balance Warning */}
          {userBalance <= 0 && (
            <div className="flex items-center gap-3 p-4 rounded-xl bg-destructive/10 border border-destructive/30 mb-6">
              <Wallet className="w-5 h-5 text-destructive flex-shrink-0" />
              <div className="flex-1">
                <p className="font-medium text-destructive">Saldo insuficiente</p>
                <p className="text-sm text-muted-foreground">
                  Adicione fundos à sua conta para realizar pedidos em massa.
                </p>
              </div>
              <Button variant="outline" size="sm" asChild>
                <Link to="/add-balance">Adicionar Saldo</Link>
              </Button>
            </div>
          )}

          {/* Balance Display */}
          {userBalance > 0 && (
            <div className="flex items-center gap-3 p-4 rounded-xl glass border border-border/50 mb-6">
              <Wallet className="w-5 h-5 text-primary flex-shrink-0" />
              <div className="flex-1">
                <p className="text-sm text-muted-foreground">Seu saldo disponível</p>
                <p className="font-bold text-primary">{formatCurrency(userBalance)}</p>
              </div>
            </div>
          )}

          {/* Instructions */}
          <div className="glass rounded-xl p-6 border border-border/50 mb-6">
            <div className="flex items-start gap-3">
              <Info className="w-5 h-5 text-primary flex-shrink-0 mt-0.5" />
              <div className="text-sm">
                <p className="font-medium mb-2">Um pedido por linha, no formato:</p>
                <code className="block bg-muted/50 px-3 py-2 rounded-lg text-muted-foreground">
                  ID do serviço | link | quantidade
                </code>
                <p className="mt-3 text-muted-foreground">
                  Exemplo:
                </p>
                <code className="block bg-muted/50 px-3 py-2 rounded-lg text-muted-foreground mt-1">
                  1234 | https://instagram.com/p/ABC123 | 1000<br />
                  5678 | https://youtube.com/watch?v=XYZ | 500<br />
                  9012 | https://tiktok.com/@user/video/123 | 2000
                </code>
              </div>
            </div>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit}>
            <div className="glass rounded-xl p-6 border border-border/50 space-y-6">
              <div className="space-y-2">
                <Label htmlFor="orders">Pedidos</Label>
                <Textarea
                  id="orders"
                  placeholder="ID do serviço | link | quantidade"
                  value={ordersText}
                  onChange={(e) => setOrdersText(e.target.value)}
                  rows={10}
                  className="font-mono text-sm resize-none"
                />
              </div>

              <Button
                type="submit"
                className="w-full"
                size="lg"
                disabled={isProcessing || !ordersText.trim()}
              >
                {isProcessing ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Processando...
                  </>
                ) : (
                  <>
                    <Layers className="w-4 h-4 mr-2" />
                    Enviar
                  </>
                )}
              </Button>
            </div>
          </form>

          {/* Results */}
          {results.length > 0 && (
            <div className="glass rounded-xl p-4 sm:p-6 border border-border/50 mt-6">
              <h3 className="font-semibold mb-4">Resultados</h3>
              <div className="space-y-2 max-h-[300px] overflow-y-auto">
                {results.map((result, index) => (
                  <div
                    key={index}
                    className={`flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-3 rounded-lg text-sm ${
                      result.success
                        ? "bg-success/10 border border-success/30"
                        : "bg-destructive/10 border border-destructive/30"
                    }`}
                  >
                    <div className="flex items-center gap-2 flex-wrap">
                      {result.success ? (
                        <CheckCircle className="w-4 h-4 text-success shrink-0" />
                      ) : (
                        <AlertCircle className="w-4 h-4 text-destructive shrink-0" />
                      )}
                      <span className="font-medium">Linha {result.line}</span>
                      <span className="text-muted-foreground">
                        Serviço #{result.serviceId}
                      </span>
                    </div>
                    <div className="text-right sm:text-left ml-6 sm:ml-0">
                      {result.success ? (
                        <span className="text-success font-medium">
                          Pedido #{result.orderId}
                        </span>
                      ) : (
                        <span className="text-destructive text-xs sm:text-sm">{result.error}</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              <div className="mt-4 pt-4 border-t border-border/50 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-sm">
                <span className="text-muted-foreground">
                  Total: {results.length} pedido(s)
                </span>
                <div className="flex items-center gap-4">
                  <span className="text-success">
                    ✓ {results.filter(r => r.success).length} sucesso
                  </span>
                  {results.filter(r => !r.success).length > 0 && (
                    <span className="text-destructive">
                      ✗ {results.filter(r => !r.success).length} erro(s)
                    </span>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
};

export default BulkOrders;
