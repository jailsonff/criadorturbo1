import { useState, useEffect, useRef } from "react";
import { Wallet, Copy, CheckCircle, Loader2, X, QrCode, PartyPopper, History } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { formatCurrency } from "@/lib/utils";
import { getSupabaseClient } from "@/lib/supabaseClient";
import { backendSupabase } from "@/lib/backendClient";
import { useQueryClient } from "@tanstack/react-query";
import { addPendingPixTopUp } from "@/lib/balanceAdjustments";
import { useAuth } from "@/contexts/AuthContext";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { safeGetItem } from "@/lib/safeStorage";

interface PixPaymentData {
  id: number;
  status: string;
  qr_code: string;
  qr_code_base64: string;
  ticket_url: string;
  expiration_date: string;
}

interface BalanceHistoryItem {
  id: string;
  amount: number;
  payment_method: string;
  payment_id: string | null;
  status: string;
  created_at: string;
}

const AddBalance = () => {
  const { user } = useAuth();
  const [amount, setAmount] = useState("");
  const [copied, setCopied] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [pixData, setPixData] = useState<PixPaymentData | null>(null);
  const [showPixModal, setShowPixModal] = useState(false);
  const [paymentStatus, setPaymentStatus] = useState<string>("pending");
  const [showSuccess, setShowSuccess] = useState(false);
  const pollingRef = useRef<NodeJS.Timeout | null>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Balance history state
  const [history, setHistory] = useState<BalanceHistoryItem[]>([]);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);
  const [totalItems, setTotalItems] = useState(0);

  // Deposit configuration
  const [predefinedAmounts, setPredefinedAmounts] = useState<number[]>([10, 25, 50, 100, 250, 500]);
  const [minimumDeposit, setMinimumDeposit] = useState<number>(5);
  const [configLoading, setConfigLoading] = useState(true);

  // Fetch deposit configuration
  useEffect(() => {
    const fetchConfig = async () => {
      try {
        const supabase = getSupabaseClient();
        const { data, error } = await supabase
          .from("site_settings")
          .select("deposit_predefined_values, deposit_minimum")
          .order("updated_at", { ascending: false })
          .limit(1)
          .single();

        if (error && error.code !== "PGRST116") throw error;

        if (data) {
          if (data.deposit_predefined_values) {
            setPredefinedAmounts(data.deposit_predefined_values.map((v: string) => parseFloat(v)));
          }
          if (data.deposit_minimum !== null) {
            setMinimumDeposit(data.deposit_minimum);
          }
        }
      } catch (error) {
        console.error("Error fetching deposit config:", error);
      } finally {
        setConfigLoading(false);
      }
    };

    fetchConfig();
  }, []);

  const getMercadoPagoAccessToken = () => {
    return safeGetItem("mp_access_token");
  };

  // Fetch balance history
  const fetchHistory = async () => {
    if (!user) return;
    
    const supabase = getSupabaseClient();
    setHistoryLoading(true);
    try {
      // Get total count
      const { count } = await supabase
        .from("balance_history")
        .select("*", { count: "exact", head: true })
        .eq("user_id", user.id);

      setTotalItems(count || 0);

      // Get paginated data
      const from = (currentPage - 1) * itemsPerPage;
      const to = from + itemsPerPage - 1;

      const { data, error } = await supabase
        .from("balance_history")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .range(from, to);

      if (error) throw error;
      setHistory(data || []);
    } catch (error) {
      console.error("Error fetching balance history:", error);
    } finally {
      setHistoryLoading(false);
    }
  };

  useEffect(() => {
    fetchHistory();
  }, [user, currentPage, itemsPerPage]);

  const updateUserBalance = async (amount: number) => {
    if (!user) return;

    const supabase = getSupabaseClient();
    try {
      // First get current balance
      const { data: profile, error: fetchError } = await supabase
        .from("profiles")
        .select("balance")
        .eq("id", user.id)
        .single();
      
      if (fetchError) throw fetchError;

      const currentBalance = profile?.balance || 0;
      const newBalance = currentBalance + amount;

      // Update balance
      const { error: updateError } = await supabase
        .from("profiles")
        .update({ balance: newBalance })
        .eq("id", user.id);

      if (updateError) throw updateError;

      console.log(`Balance updated: ${currentBalance} -> ${newBalance}`);
    } catch (error) {
      console.error("Error updating balance:", error);
      throw error;
    }
  };

  const saveBalanceHistory = async (paymentId: number, amount: number) => {
    if (!user) return;

    const supabase = getSupabaseClient();
    try {
      // Update user balance in profiles table
      await updateUserBalance(amount);

      // Save to balance history
      await supabase.from("balance_history").insert({
        user_id: user.id,
        amount: amount,
        payment_method: "pix",
        payment_id: paymentId.toString(),
        status: "approved",
      });
      
      // Refresh history
      fetchHistory();
    } catch (error) {
      console.error("Error saving balance history:", error);
    }
  };

  const checkPaymentStatus = async (paymentId: number) => {
    const accessToken = getMercadoPagoAccessToken();
    if (!accessToken || !paymentId) return;

    try {
      const response = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
        headers: {
          "Authorization": `Bearer ${accessToken}`,
        },
      });
      
      if (response.ok) {
        const data = await response.json();
        setPaymentStatus(data.status);
        
        if (data.status === "approved") {
          // Payment approved - show success
          if (pollingRef.current) {
            clearInterval(pollingRef.current);
            pollingRef.current = null;
          }
          setShowSuccess(true);

          // Add PIX top-up locally so the UI balance updates immediately
          const paidAmount = parseFloat(amount || "0");
          if (paidAmount > 0) {
            addPendingPixTopUp(paidAmount);
            // Save to balance history
            await saveBalanceHistory(paymentId, paidAmount);
          }

          // Invalidate balance query to refresh balance across the app
          queryClient.invalidateQueries({ queryKey: ["user-balance"] });

          toast({
            title: "Pagamento confirmado!",
            description: "Seu saldo foi adicionado com sucesso.",
          });
          
          // Auto close after 3 seconds
          setTimeout(() => {
            setShowPixModal(false);
            setShowSuccess(false);
            setPixData(null);
            setAmount("");
            // Force a refetch of the balance across the app
            queryClient.invalidateQueries({ queryKey: ["user-balance"] });
          }, 3000);
        }
      }
    } catch (error) {
      console.error("Error checking payment status:", error);
    }
  };

  // Start polling when modal opens with payment data
  useEffect(() => {
    if (showPixModal && pixData?.id && paymentStatus !== "approved") {
      pollingRef.current = setInterval(() => {
        checkPaymentStatus(pixData.id);
      }, 5000); // Check every 5 seconds
    }

    return () => {
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
        pollingRef.current = null;
      }
    };
  }, [showPixModal, pixData?.id]);

  const handleCloseModal = () => {
    if (pollingRef.current) {
      clearInterval(pollingRef.current);
      pollingRef.current = null;
    }
    setShowPixModal(false);
    setPaymentStatus("pending");
  };

  const handleCopyPixCode = () => {
    if (pixData?.qr_code) {
      navigator.clipboard.writeText(pixData.qr_code);
      setCopied(true);
      toast({
        title: "Código PIX copiado!",
        description: "Cole no seu aplicativo de pagamento.",
      });
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleGeneratePix = async () => {
    const accessToken = getMercadoPagoAccessToken();
    
    if (!accessToken) {
      toast({
        title: "MercadoPago não configurado",
        description: "Configure suas credenciais do MercadoPago em Configurações.",
        variant: "destructive",
      });
      return;
    }

    const amountValue = parseFloat(amount);
    if (!amountValue || amountValue < minimumDeposit) {
      toast({
        title: "Valor inválido",
        description: `O valor mínimo para depósito é R$ ${minimumDeposit.toFixed(2)}.`,
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);
    setPaymentStatus("pending");

    try {
      // Use backend function (runs on Lovable Cloud)
      const { data, error } = await backendSupabase.functions.invoke("mercadopago-pix", {
        body: {
          accessToken,
          amount: amountValue,
          description: `Adição de saldo - R$ ${amountValue.toFixed(2)}`,
          email: "cliente@upmidias.com",
        },
      });

      if (error) {
        throw error;
      }

      if (data.error) {
        throw new Error(data.error);
      }

      setPixData(data);
      setShowPixModal(true);
      toast({
        title: "PIX gerado com sucesso!",
        description: "Escaneie o QR Code ou copie o código para pagar.",
      });
    } catch (error: any) {
      console.error("Error generating PIX:", error);
      toast({
        title: "Erro ao gerar PIX",
        description: error.message || "Tente novamente mais tarde.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const totalPages = Math.ceil(totalItems / itemsPerPage);

  return (
    <div className="min-h-screen">
      <main className="container mx-auto px-4 py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold mb-2">Adicionar Saldo</h1>
          <p className="text-muted-foreground">
            Adicione créditos à sua conta para fazer pedidos
          </p>
        </div>

        <div className="max-w-2xl">
          <div className="glass rounded-xl p-6 md:p-8 border border-border/50 space-y-6">
            {/* Amount Selection */}
            <div className="space-y-4">
              <Label>Selecione o valor</Label>
              <div className="grid grid-cols-3 gap-3">
                {predefinedAmounts.map((value) => (
                  <Button
                    key={value}
                    variant={amount === value.toString() ? "default" : "outline"}
                    onClick={() => setAmount(value.toString())}
                    className="h-14 text-lg"
                  >
                    R$ {value}
                  </Button>
                ))}
              </div>
            </div>

            {/* Custom Amount */}
            <div className="space-y-2">
              <Label htmlFor="custom-amount">Ou digite um valor personalizado</Label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                  R$
                </span>
                <Input
                  id="custom-amount"
                  type="number"
                  placeholder="0,00"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className="pl-10"
                  min={minimumDeposit}
                />
              </div>
              <p className="text-xs text-muted-foreground">
                Valor mínimo: R$ {minimumDeposit.toFixed(2)}
              </p>
            </div>

            {/* Payment Methods */}
            <div className="space-y-4">
              <Label>Método de pagamento</Label>
              
              {/* PIX */}
              <div className="glass rounded-lg p-4 border border-primary/30">
                <div className="flex items-center gap-3 mb-2">
                  <div className="w-10 h-10 rounded-lg bg-primary/20 flex items-center justify-center">
                    <Wallet className="w-5 h-5 text-primary" />
                  </div>
                  <div>
                    <p className="font-semibold">PIX</p>
                    <p className="text-sm text-muted-foreground">Pagamento instantâneo via MercadoPago</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Submit */}
            {amount && parseFloat(amount) > 0 && (
              <div className="glass rounded-lg p-4 border border-primary/30">
                <div className="flex items-center justify-between mb-4">
                  <span className="text-muted-foreground">Total a pagar:</span>
                  <span className="text-2xl font-bold text-primary">
                    {formatCurrency(parseFloat(amount || "0"))}
                  </span>
                </div>
                <Button 
                  className="w-full" 
                  size="lg" 
                  onClick={handleGeneratePix}
                  disabled={isLoading}
                >
                  {isLoading ? (
                    <>
                      <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                      Gerando PIX...
                    </>
                  ) : (
                    <>
                      <QrCode className="w-5 h-5 mr-2" />
                      Gerar Pagamento PIX
                    </>
                  )}
                </Button>
              </div>
            )}
          </div>
        </div>

        {/* Balance History Section */}
        <div className="mt-10">
          <div className="flex items-center gap-2 mb-4">
            <History className="w-5 h-5 text-primary" />
            <h2 className="text-xl font-bold">Histórico de Recargas</h2>
          </div>
          
          <div className="glass rounded-xl border border-border/50 overflow-hidden">
            {/* Items per page selector */}
            <div className="flex items-center justify-between p-4 border-b border-border/30">
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">Exibir</span>
                <Select
                  value={itemsPerPage.toString()}
                  onValueChange={(value) => {
                    setItemsPerPage(parseInt(value));
                    setCurrentPage(1);
                  }}
                >
                  <SelectTrigger className="w-20 h-8">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="5">5</SelectItem>
                    <SelectItem value="10">10</SelectItem>
                    <SelectItem value="25">25</SelectItem>
                    <SelectItem value="50">50</SelectItem>
                  </SelectContent>
                </Select>
                <span className="text-sm text-muted-foreground">por página</span>
              </div>
              <span className="text-sm text-muted-foreground">
                Total: {totalItems} registro{totalItems !== 1 ? "s" : ""}
              </span>
            </div>

            {/* Table */}
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="border-border/30">
                    <TableHead className="text-xs">ID</TableHead>
                    <TableHead className="text-xs">Data</TableHead>
                    <TableHead className="text-xs">Valor</TableHead>
                    <TableHead className="text-xs">Método</TableHead>
                    <TableHead className="text-xs">Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {historyLoading ? (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center py-8">
                        <Loader2 className="w-6 h-6 animate-spin mx-auto text-muted-foreground" />
                      </TableCell>
                    </TableRow>
                  ) : history.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                        Nenhuma recarga encontrada
                      </TableCell>
                    </TableRow>
                  ) : (
                    history.map((item) => (
                      <TableRow key={item.id} className="border-border/30">
                        <TableCell className="font-mono text-xs">
                          #{item.payment_id || item.id.slice(0, 8)}
                        </TableCell>
                        <TableCell className="text-xs">
                          {format(new Date(item.created_at), "dd/MM/yyyy HH:mm", { locale: ptBR })}
                        </TableCell>
                        <TableCell className="text-xs font-medium text-success">
                          {formatCurrency(item.amount)}
                        </TableCell>
                        <TableCell className="text-xs uppercase">
                          <Badge variant="outline" className="text-[10px]">
                            {item.payment_method}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Badge className="bg-success/20 text-success border-success/30 text-[10px]">
                            Aprovado
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="p-4 border-t border-border/30">
                <Pagination>
                  <PaginationContent>
                    <PaginationItem>
                      <PaginationPrevious 
                        onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                        className={currentPage === 1 ? "pointer-events-none opacity-50" : "cursor-pointer"}
                      />
                    </PaginationItem>
                    
                    {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                      let pageNum;
                      if (totalPages <= 5) {
                        pageNum = i + 1;
                      } else if (currentPage <= 3) {
                        pageNum = i + 1;
                      } else if (currentPage >= totalPages - 2) {
                        pageNum = totalPages - 4 + i;
                      } else {
                        pageNum = currentPage - 2 + i;
                      }
                      
                      return (
                        <PaginationItem key={pageNum}>
                          <PaginationLink
                            onClick={() => setCurrentPage(pageNum)}
                            isActive={currentPage === pageNum}
                            className="cursor-pointer"
                          >
                            {pageNum}
                          </PaginationLink>
                        </PaginationItem>
                      );
                    })}
                    
                    <PaginationItem>
                      <PaginationNext 
                        onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                        className={currentPage === totalPages ? "pointer-events-none opacity-50" : "cursor-pointer"}
                      />
                    </PaginationItem>
                  </PaginationContent>
                </Pagination>
              </div>
            )}
          </div>
        </div>
      </main>

      {/* PIX QR Code Modal */}
      <Dialog open={showPixModal} onOpenChange={() => {}}>
        <DialogContent 
          className="sm:max-w-md"
          onPointerDownOutside={(e) => e.preventDefault()}
          onEscapeKeyDown={(e) => e.preventDefault()}
          onInteractOutside={(e) => e.preventDefault()}
        >
          <DialogHeader>
            <div className="flex items-center justify-between">
              <DialogTitle className="flex items-center gap-2">
                {showSuccess ? (
                  <>
                    <PartyPopper className="w-5 h-5 text-success" />
                    Pagamento Confirmado!
                  </>
                ) : (
                  <>
                    <QrCode className="w-5 h-5 text-primary" />
                    Pagamento PIX
                  </>
                )}
              </DialogTitle>
              {!showSuccess && (
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={handleCloseModal}
                  className="h-8 w-8"
                >
                  <X className="w-4 h-4" />
                </Button>
              )}
            </div>
          </DialogHeader>
          
          {showSuccess ? (
            <div className="space-y-6 py-8 text-center">
              <div className="w-20 h-20 rounded-full bg-success/20 flex items-center justify-center mx-auto">
                <CheckCircle className="w-10 h-10 text-success" />
              </div>
              <div>
                <h3 className="text-2xl font-bold mb-2">Obrigado!</h3>
                <p className="text-muted-foreground">
                  Seu saldo de{" "}
                  <span className="text-primary font-semibold">
                    {formatCurrency(parseFloat(amount || "0"))}
                  </span>{" "}
                  foi adicionado com sucesso.
                </p>
              </div>
              <p className="text-sm text-muted-foreground">
                Esta janela fechará automaticamente...
              </p>
            </div>
          ) : pixData && (
            <div className="space-y-6">
              {/* QR Code Image */}
              {pixData.qr_code_base64 && (
                <div className="flex justify-center">
                  <div className="p-4 bg-white rounded-xl">
                    <img 
                      src={`data:image/png;base64,${pixData.qr_code_base64}`}
                      alt="QR Code PIX"
                      className="w-64 h-64"
                    />
                  </div>
                </div>
              )}

              {/* Amount */}
              <div className="text-center">
                <p className="text-sm text-muted-foreground">Valor a pagar</p>
                <p className="text-3xl font-bold text-primary">
                  {formatCurrency(parseFloat(amount || "0"))}
                </p>
              </div>

              {/* PIX Copy Code */}
              {pixData.qr_code && (
                <div className="space-y-2">
                  <Label>Código PIX (Copia e Cola)</Label>
                  <div className="flex gap-2">
                    <Input
                      value={pixData.qr_code}
                      readOnly
                      className="bg-muted/50 text-xs font-mono"
                    />
                    <Button 
                      onClick={handleCopyPixCode} 
                      variant="outline" 
                      size="icon"
                      className="shrink-0"
                    >
                      {copied ? (
                        <CheckCircle className="w-4 h-4 text-success" />
                      ) : (
                        <Copy className="w-4 h-4" />
                      )}
                    </Button>
                  </div>
                </div>
              )}

              {/* Status */}
              <div className="glass rounded-lg p-4 border border-border/50">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Status:</span>
                  <div className="flex items-center gap-2">
                    <Loader2 className="w-3 h-3 animate-spin text-warning" />
                    <span className="font-medium text-warning">Aguardando pagamento</span>
                  </div>
                </div>
                <div className="flex items-center justify-between text-sm mt-2">
                  <span className="text-muted-foreground">ID do pagamento:</span>
                  <span className="font-mono">#{pixData.id}</span>
                </div>
              </div>

              {/* Instructions */}
              <div className="text-sm text-muted-foreground text-center space-y-1">
                <p>1. Abra o app do seu banco</p>
                <p>2. Escaneie o QR Code ou use o código Copia e Cola</p>
                <p>3. Confirme o pagamento</p>
              </div>

              <Button 
                variant="outline" 
                className="w-full"
                onClick={handleCloseModal}
              >
                <X className="w-4 h-4 mr-2" />
                Fechar
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AddBalance;
