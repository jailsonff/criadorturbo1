import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { getExternalConfig, getSupabaseClient } from "@/lib/supabaseClient";
import { backendSupabase } from "@/lib/backendClient";
import { useToast } from "@/hooks/use-toast";
import { formatCurrency } from "@/lib/utils";
import { Search, Loader2, Package, Clock, CheckCircle, XCircle, RefreshCw } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  checkStoreCustomerExists,
  normalizePhoneDigits,
  storeCustomerLogin,
  storeCustomerSignup,
  type StoreCustomerSession,
} from "@/lib/storeCustomerAuth";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";

interface StoreOrder {
  id: string;
  service_name: string | null;
  quantity: number;
  total_price: number;
  link: string;
  payment_id?: string | null;
  payment_status: string | null;
  order_status: string | null;
  start_count: string | null;
  remains: string | null;
  created_at: string;
  external_order_ids?: unknown;
  order_payload?: unknown;
}

interface OrderLookupModalProps {
  isOpen: boolean;
  onClose: () => void;
}

type CreditSummary = {
  service_id: number;
  service_name: string;
  quantity: number;
};

export function OrderLookupModal({ isOpen, onClose }: OrderLookupModalProps) {
  const supabase = getSupabaseClient();
  const externalDb = getExternalConfig();
  const { toast } = useToast();
  const [phone, setPhone] = useState("");
  const [pin, setPin] = useState("");
  const [pinForDisplay, setPinForDisplay] = useState("");
  const [authMode, setAuthMode] = useState<"login" | "signup">("login");
  const [authSession, setAuthSession] = useState<StoreCustomerSession | null>(null);
  const [authBusy, setAuthBusy] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [orders, setOrders] = useState<StoreOrder[]>([]);
  const [credits, setCredits] = useState<CreditSummary[]>([]);
  const [creditsLoading, setCreditsLoading] = useState(false);
  const [redeemServiceId, setRedeemServiceId] = useState<number | null>(null);
  const [redeemQty, setRedeemQty] = useState("");
  const [redeemLink, setRedeemLink] = useState("");
  const [redeeming, setRedeeming] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [searchedPhoneDigits, setSearchedPhoneDigits] = useState<string>("");

  const [payOpen, setPayOpen] = useState(false);
  const [payLoading, setPayLoading] = useState(false);
  const [payPaymentId, setPayPaymentId] = useState<string>("");
  const [payData, setPayData] = useState<{
    payment_id: string;
    status?: string | null;
    status_detail?: string | null;
    qr_code?: string | null;
    qr_code_base64?: string | null;
    ticket_url?: string | null;
    expiration_date?: string | null;
  } | null>(null);

  const refreshInFlightRef = useRef(false);
  const lastRefreshAtRef = useRef<number>(0);

  const statusSyncInFlightRef = useRef(false);
  const lastStatusSyncAtRef = useRef<number>(0);

  const fetchOrdersByPhone = useCallback(
    async (phoneDigits: string) => {
      try {
        const { data, error } = await supabase
          .from("store_orders")
          .select("*")
          .eq("phone", phoneDigits)
          .order("created_at", { ascending: false });

        if (error) throw error;
        const list = (data || []) as StoreOrder[];
        setOrders(list);
        return list;
      } catch (error: any) {
        console.error("Error fetching orders:", error);
        toast({
          title: "Erro",
          description: "Não foi possível buscar os pedidos. Tente novamente.",
          variant: "destructive",
        });
        return [] as StoreOrder[];
      }
    },
    [supabase, toast]
  );

  const refreshPendingPayments = useCallback(
    async (phoneDigits: string, currentOrders: StoreOrder[]) => {
      const now = Date.now();
      if (refreshInFlightRef.current) return;
      // throttle to avoid hammering payment API
      if (now - lastRefreshAtRef.current < 12_000) return;

      const pending = (currentOrders || [])
        .filter((o) => o.payment_status === "pending" && o.payment_id)
        .slice(0, 6);

      if (pending.length === 0) return;

      refreshInFlightRef.current = true;
      lastRefreshAtRef.current = now;

      try {
        const results = await Promise.allSettled(
          pending.map((o) =>
            backendSupabase.functions.invoke("mercadopago-pix", {
              body: {
                action: "check_status",
                payment_id: String(o.payment_id),
                order_id: o.id,
                externalDb: externalDb?.serviceRoleKey ? { url: externalDb.url, serviceRoleKey: externalDb.serviceRoleKey } : undefined,
              },
            })
          )
        );

        const anyApproved = results.some(
          (r) => r.status === "fulfilled" && (r.value?.data as any)?.status === "approved"
        );

        if (anyApproved) {
          // re-fetch to reflect the updated payment_status/order processing
          await fetchOrdersByPhone(phoneDigits);
        }
      } catch (e) {
        console.warn("refreshPendingPayments failed:", e);
      } finally {
        refreshInFlightRef.current = false;
      }
    },
    [externalDb?.serviceRoleKey, externalDb?.url, fetchOrdersByPhone]
  );

  const syncProcessingStatuses = useCallback(
    async () => {
      const now = Date.now();
      if (statusSyncInFlightRef.current) return;
      // throttle to avoid hammering provider API
      if (now - lastStatusSyncAtRef.current < 25_000) return;

      statusSyncInFlightRef.current = true;
      lastStatusSyncAtRef.current = now;
      try {
        await backendSupabase.functions.invoke("store-order-process", {
          body: {
            action: "sync_all_processing",
            externalDb: externalDb?.serviceRoleKey
              ? { url: externalDb.url, serviceRoleKey: externalDb.serviceRoleKey }
              : undefined,
          },
        });
      } catch (e) {
        // silent: UX shouldn't break if sync fails
        console.warn("syncProcessingStatuses failed", e);
      } finally {
        statusSyncInFlightRef.current = false;
      }
    },
    [externalDb?.serviceRoleKey, externalDb?.url]
  );

  const formatPhone = (value: string) => {
    const numbers = value.replace(/\D/g, "");
    if (numbers.length <= 11) {
      return numbers.replace(/(\d{2})(\d{5})(\d{4})/, "($1) $2-$3");
    }
    return value;
  };

  const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const formatted = formatPhone(e.target.value);
    setPhone(formatted);
  };

  // Security: for order lookup, ALWAYS require PIN (no auto-session reuse).
  useEffect(() => {
    if (!isOpen) return;
    setAuthSession(null);
    setPin("");
    setPinForDisplay("");
    setAuthMode("login");
    setCredits([]);
    setRedeemServiceId(null);
    setRedeemQty("");
    setRedeemLink("");
    setPayOpen(false);
    setPayLoading(false);
    setPayPaymentId("");
    setPayData(null);
  }, [isOpen, phone]);

  const openPayForOrder = useCallback(
    async (paymentIdRaw: string | null | undefined) => {
      const paymentId = String(paymentIdRaw || "").trim();
      if (!paymentId) return;

      setPayOpen(true);
      setPayPaymentId(paymentId);
      setPayData(null);
      setPayLoading(true);

      try {
        const { data, error } = await backendSupabase.functions.invoke("mercadopago-pix", {
          body: {
            action: "get_qr",
            payment_id: paymentId,
          },
        });
        if (error) throw error;
        setPayData((data || null) as any);
      } catch (e: any) {
        console.error("Failed to resume payment:", e);
        toast({
          title: "Erro",
          description: e?.message || "Não foi possível carregar o QR Code deste pagamento.",
          variant: "destructive",
        });
        setPayOpen(false);
      } finally {
        setPayLoading(false);
      }
    },
    [toast]
  );

  const copyToClipboard = useCallback(
    async (text: string, successMsg: string) => {
      try {
        await navigator.clipboard.writeText(text);
        toast({ title: "Copiado", description: successMsg });
      } catch {
        toast({ title: "Erro", description: "Não foi possível copiar.", variant: "destructive" });
      }
    },
    [toast]
  );

  const creditsByServiceId = useMemo(() => {
    const map = new Map<number, CreditSummary>();
    (credits || []).forEach((c) => {
      map.set(Number(c.service_id), c);
    });
    return map;
  }, [credits]);

  const fetchCredits = useCallback(
    async (phoneDigits: string, token: string) => {
      setCreditsLoading(true);
      try {
        const { data, error } = await backendSupabase.functions.invoke("store-customer-credits", {
          body: {
            action: "list",
            phone: phoneDigits,
            token,
            externalDb: externalDb?.serviceRoleKey
              ? { url: externalDb.url, serviceRoleKey: externalDb.serviceRoleKey }
              : undefined,
          },
        });
        if (error) throw error;
        setCredits(((data as any)?.credits || []) as CreditSummary[]);
      } catch (e: any) {
        // Keep silent to not block order lookup UX
        console.warn("fetchCredits failed", e);
        setCredits([]);
      } finally {
        setCreditsLoading(false);
      }
    },
    [externalDb?.serviceRoleKey, externalDb?.url]
  );

  const handleSearch = async () => {
    const phoneNumbers = normalizePhoneDigits(phone);
    if (phoneNumbers.length < 10) {
      toast({
        title: "Telefone inválido",
        description: "Por favor, insira um número de telefone válido.",
        variant: "destructive",
      });
      return;
    }

    // Require PIN authentication for order lookup (always)
    let sessionToken = "";
    try {
      setAuthBusy(true);

      if (pin.length !== 4) {
        toast({
          title: "Senha inválida",
          description: "Digite sua senha (PIN) de 4 dígitos para consultar seus pedidos.",
          variant: "destructive",
        });
        return;
      }

      const exists = await checkStoreCustomerExists(phoneNumbers);
      if (!exists) {
        if (authMode === "login") {
          toast({
            title: "Não cadastrado",
            description: "Seu WhatsApp ainda não tem cadastro. Clique em Cadastrar para criar sua senha (PIN).",
            variant: "destructive",
          });
          return;
        }

        const s = await storeCustomerSignup(phoneNumbers, pin);
        sessionToken = String(s?.token || "");
        setAuthSession(s);
        setPinForDisplay(pin);
      } else {
        const s = await storeCustomerLogin(phoneNumbers, pin);
        sessionToken = String(s?.token || "");
        setAuthSession(s);
        setPinForDisplay(pin);
      }
    } catch (e: any) {
      toast({
        title: "Erro",
        description: e?.message || "Não foi possível autenticar. Tente novamente.",
        variant: "destructive",
      });
      return;
    } finally {
      setAuthBusy(false);
    }

    setIsLoading(true);
    setHasSearched(true);
    setSearchedPhoneDigits(phoneNumbers);
    try {
      const list = await fetchOrdersByPhone(phoneNumbers);
      await Promise.all([
        refreshPendingPayments(phoneNumbers, list),
        sessionToken ? fetchCredits(phoneNumbers, sessionToken) : Promise.resolve(),
      ]);

      // Also sync provider statuses so completed orders reflect quickly
      await syncProcessingStatuses();
      await fetchOrdersByPhone(phoneNumbers);
    } finally {
      setIsLoading(false);
    }
  };

  // When authSession changes (after login), fetch credits.
  useEffect(() => {
    if (!isOpen) return;
    if (!authSession?.token) return;
    if (!searchedPhoneDigits) return;
    void fetchCredits(searchedPhoneDigits, authSession.token);
  }, [authSession?.token, fetchCredits, isOpen, searchedPhoneDigits]);

  const beginRedeem = (c: CreditSummary) => {
    setRedeemServiceId(c.service_id);
    setRedeemQty(String(c.quantity));
    setRedeemLink("");
  };

  const handleRedeem = async () => {
    if (!authSession?.token || !searchedPhoneDigits) return;
    const serviceId = Number(redeemServiceId) || 0;
    const link = String(redeemLink || "").trim();
    const available = creditsByServiceId.get(serviceId)?.quantity || 0;
    // Security/UX: quantity is always the full available credit for the selected service.
    const qty = Math.max(0, Math.floor(Number(available) || 0));

    if (serviceId <= 0 || qty <= 0 || !link) {
      toast({ title: "Dados inválidos", description: "Preencha o link.", variant: "destructive" });
      return;
    }

    setRedeeming(true);
    try {
      const { error } = await backendSupabase.functions.invoke("store-customer-credits", {
        body: {
          action: "redeem",
          phone: searchedPhoneDigits,
          token: authSession.token,
          service_id: serviceId,
          quantity: qty,
          link,
          externalDb: externalDb?.serviceRoleKey
            ? { url: externalDb.url, serviceRoleKey: externalDb.serviceRoleKey }
            : undefined,
        },
      });
      if (error) throw error;

      toast({ title: "Pedido criado", description: "Seu pedido com crédito foi enviado para processamento." });
      setRedeemServiceId(null);
      setRedeemQty("");
      setRedeemLink("");
      await Promise.all([
        fetchCredits(searchedPhoneDigits, authSession.token),
        fetchOrdersByPhone(searchedPhoneDigits),
      ]);
    } catch (e: any) {
      toast({ title: "Erro", description: e?.message || "Falha ao usar crédito.", variant: "destructive" });
    } finally {
      setRedeeming(false);
    }
  };

  const getStatusBadge = (paymentStatus: string | null, orderStatus: string | null) => {
    if (paymentStatus === "pending") {
      return (
        <Badge variant="outline" className="text-yellow-500 border-yellow-500">
          Aguardando Pagamento
        </Badge>
      );
    }
    if (orderStatus === "completed") {
      return <Badge className="bg-green-500">Concluído</Badge>;
    }
    if (orderStatus === "processing") {
      return <Badge className="bg-blue-500">Processando</Badge>;
    }
    if (orderStatus === "failed" || orderStatus === "error") {
      return <Badge variant="destructive">Erro</Badge>;
    }
    return <Badge variant="outline">Pendente</Badge>;
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

  const calcFinalCount = (startCount: string | null, qty: number) => {
    const s = Number(String(startCount ?? "").replace(/\D/g, ""));
    if (!Number.isFinite(s) || s <= 0) return null;
    const q = Number(qty) || 0;
    if (!Number.isFinite(q) || q <= 0) return null;
    return (s + q).toString();
  };

  const getCreditServiceLabel = (rawServiceName: string) => {
    const s = String(rawServiceName || "").toLowerCase();

    const isViews = s.includes("visual") || s.includes("views") || s.includes("view");
    const isReel = s.includes("reel") || s.includes("reels");
    const isStory = s.includes("story") || s.includes("stories");

    if (isViews && isReel) return "VISUALIZAÇÕES DE REEL";
    if (isViews && isStory) return "VISUALIZAÇÕES DE STORY";
    if (s.includes("curtid") || s.includes("like")) return "CURTIDAS";
    if (s.includes("seguidor") || s.includes("follower")) return "SEGUIDORES";
    if (s.includes("coment")) return "COMENTÁRIOS";
    if (s.includes("salva")) return "SALVAMENTOS";
    if (s.includes("compart")) return "COMPARTILHAMENTOS";
    if (isViews) return "VISUALIZAÇÕES";

    // Fallback: remove provider codes and noisy suffixes
    const cleaned = String(rawServiceName || "")
      .replace(/^[A-Z]{2,}\d+\s*/g, "") // e.g. IGV57
      .replace(/:\s*.*$/g, "") // strip anything after ':'
      .replace(/\[[^\]]*\]/g, "") // strip [CHEAPEST]
      .replace(/\([^)]*\)/g, "") // strip (100/100m)
      .replace(/\s{2,}/g, " ")
      .trim();

    return (cleaned || "CRÉDITO").toUpperCase();
  };

  const getStatusIcon = (paymentStatus: string | null, orderStatus: string | null) => {
    if (paymentStatus === "pending") {
      return <Clock className="w-5 h-5 text-yellow-500" />;
    }
    if (orderStatus === "completed") {
      return <CheckCircle className="w-5 h-5 text-green-500" />;
    }
    if (orderStatus === "processing") {
      return <RefreshCw className="w-5 h-5 text-blue-500 animate-spin" />;
    }
    if (orderStatus === "failed" || orderStatus === "error") {
      return <XCircle className="w-5 h-5 text-red-500" />;
    }
    return <Clock className="w-5 h-5 text-muted-foreground" />;
  };

  // Realtime: when user searched a phone, update the list instantly on any change
  useEffect(() => {
    if (!isOpen || !hasSearched || !searchedPhoneDigits) return;

    const channel = supabase
      .channel(`order-lookup-${searchedPhoneDigits}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "store_orders",
          filter: `phone=eq.${searchedPhoneDigits}`,
        },
        () => {
          fetchOrdersByPhone(searchedPhoneDigits);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [isOpen, hasSearched, searchedPhoneDigits, supabase, fetchOrdersByPhone]);

  // If the customer paid after closing the PIX screen, this will still update the order
  useEffect(() => {
    if (!isOpen || !hasSearched || !searchedPhoneDigits) return;

    const intervalId = window.setInterval(() => {
      void refreshPendingPayments(searchedPhoneDigits, orders);
    }, 15_000);

    return () => window.clearInterval(intervalId);
  }, [isOpen, hasSearched, searchedPhoneDigits, orders, refreshPendingPayments]);

  // Keep order progress/status synced with provider while modal is open
  useEffect(() => {
    if (!isOpen || !hasSearched || !searchedPhoneDigits) return;
    const intervalId = window.setInterval(() => {
      void (async () => {
        await syncProcessingStatuses();
        await fetchOrdersByPhone(searchedPhoneDigits);
      })();
    }, 30_000);
    return () => window.clearInterval(intervalId);
  }, [fetchOrdersByPhone, hasSearched, isOpen, searchedPhoneDigits, syncProcessingStatuses]);

  const handleClose = () => {
    setPhone("");
    setPin("");
    setPinForDisplay("");
    setAuthSession(null);
    setAuthBusy(false);
    setOrders([]);
    setCredits([]);
    setPayOpen(false);
    setPayLoading(false);
    setPayPaymentId("");
    setPayData(null);
    setHasSearched(false);
    setSearchedPhoneDigits("");
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-lg max-h-[80vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
            <span className="flex items-center gap-2 justify-self-start">
              {hasSearched ? <Package className="w-5 h-5 text-primary" /> : <Search className="w-5 h-5 text-primary" />}
              {hasSearched ? "PEDIDOS" : "Consultar Pedidos"}
            </span>

            <span className="justify-self-center inline-flex items-center gap-2">
              <span className="text-sm font-extrabold tracking-wide text-foreground">Senha:</span>
              <span className="inline-flex items-center gap-1.5" aria-label={`Senha: ${pin || ""}`.trim()}>
                {Array.from({ length: 4 }).map((_, i) => (
                  <span
                    key={i}
                    className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-primary/40 bg-primary/15 text-sm font-extrabold text-foreground shadow-sm shadow-primary/10"
                  >
                    {pinForDisplay[i] ?? pin[i] ?? ""}
                  </span>
                ))}
              </span>
            </span>

            {/* Spacer to keep the centered "Senha" truly centered even with the close (X) button */}
            <span aria-hidden className="w-8 justify-self-end" />
          </DialogTitle>
        </DialogHeader>

        {/* Reabrir QR do PIX para pedidos com pagamento pendente */}
        <Dialog open={payOpen} onOpenChange={setPayOpen}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Pagamento PIX</DialogTitle>
            </DialogHeader>

            {payLoading ? (
              <div className="flex items-center justify-center py-10 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin mr-2" /> Carregando QR Code…
              </div>
            ) : payData ? (
              <div className="space-y-4">
                <div className="text-xs text-muted-foreground">
                  <div>
                    Pagamento: <span className="text-foreground/80">#{payPaymentId}</span>
                  </div>
                  {payData?.expiration_date ? (
                    <div>
                      Expira em:{" "}
                      <span className="text-foreground/80">
                        {format(new Date(payData.expiration_date), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                      </span>
                    </div>
                  ) : null}
                </div>

                {payData?.qr_code_base64 ? (
                  <div className="flex items-center justify-center">
                    <img
                      src={`data:image/png;base64,${payData.qr_code_base64}`}
                      alt="QR Code PIX"
                      className="h-56 w-56 rounded-md border border-border"
                      loading="lazy"
                    />
                  </div>
                ) : null}

                {payData?.qr_code ? (
                  <div className="space-y-2">
                    <Label className="text-xs">Copia e cola</Label>
                    <div className="flex gap-2">
                      <Input value={String(payData.qr_code)} readOnly />
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => copyToClipboard(String(payData.qr_code), "Código PIX copiado.")}
                      >
                        Copiar
                      </Button>
                    </div>
                  </div>
                ) : null}

                {payData?.ticket_url ? (
                  <Button asChild className="w-full">
                    <a href={String(payData.ticket_url)} target="_blank" rel="noreferrer">
                      Abrir link do pagamento
                    </a>
                  </Button>
                ) : null}

                {!payData?.qr_code && !payData?.qr_code_base64 ? (
                  <div className="text-sm text-muted-foreground">
                    Este pagamento não possui QR Code disponível no momento.
                  </div>
                ) : null}
              </div>
            ) : (
              <div className="text-sm text-muted-foreground">Nenhum dado de pagamento.</div>
            )}
          </DialogContent>
        </Dialog>

        <div className="space-y-4">
          {!hasSearched ? (
            <div className="space-y-3">
              <div className="flex gap-2">
                <div className="flex-1">
                  <Label className="sr-only">Número de telefone</Label>
                  <Input
                    placeholder="(00) 00000-0000"
                    value={phone}
                    onChange={handlePhoneChange}
                    maxLength={15}
                  />
                </div>

                <Button
                  onClick={handleSearch}
                  disabled={isLoading || authBusy || pin.length !== 4 || normalizePhoneDigits(phone).length < 10}
                >
                  {isLoading || authBusy ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Search className="w-4 h-4" />
                  )}
                </Button>
              </div>

              <div className="rounded-2xl border border-primary/25 bg-card/50 p-4 shadow-sm shadow-primary/10">
                <div className="flex items-center justify-between">
                  <Label className="font-semibold">Senha (4 dígitos)</Label>
                  {authSession ? <span className="text-xs text-muted-foreground">Logado</span> : null}
                </div>
                <div className="mt-2 flex justify-center">
                  <InputOTP
                    maxLength={4}
                    value={pin}
                    onChange={(v) => setPin(String(v || "").replace(/\D/g, "").slice(0, 4))}
                    containerClassName="justify-center gap-3"
                  >
                    <InputOTPGroup className="gap-3">
                      <InputOTPSlot
                        index={0}
                        className="h-12 w-12 rounded-xl border border-primary/30 bg-primary/10 text-base font-semibold text-foreground shadow-sm shadow-primary/10 transition-colors"
                      />
                      <InputOTPSlot
                        index={1}
                        className="h-12 w-12 rounded-xl border border-primary/30 bg-primary/10 text-base font-semibold text-foreground shadow-sm shadow-primary/10 transition-colors"
                      />
                      <InputOTPSlot
                        index={2}
                        className="h-12 w-12 rounded-xl border border-primary/30 bg-primary/10 text-base font-semibold text-foreground shadow-sm shadow-primary/10 transition-colors"
                      />
                      <InputOTPSlot
                        index={3}
                        className="h-12 w-12 rounded-xl border border-primary/30 bg-primary/10 text-base font-semibold text-foreground shadow-sm shadow-primary/10 transition-colors"
                      />
                    </InputOTPGroup>
                  </InputOTP>
                </div>
                <p className="mt-2 text-center text-xs text-muted-foreground">
                  Digite sua senha para consultar seus pedidos.
                </p>
              </div>

              <Button
                className="w-full"
                onClick={handleSearch}
                disabled={isLoading || authBusy || pin.length !== 4 || normalizePhoneDigits(phone).length < 10}
              >
                {isLoading || authBusy ? (
                  <span className="inline-flex items-center">
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Consultando...
                  </span>
                ) : (
                  "Consultar"
                )}
              </Button>

              <div className="flex items-center justify-center gap-2">
                <Button
                  type="button"
                  variant={authMode === "login" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setAuthMode("login")}
                  disabled={isLoading || authBusy}
                >
                  Entrar
                </Button>
                <Button
                  type="button"
                  variant={authMode === "signup" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setAuthMode("signup")}
                  disabled={isLoading || authBusy}
                >
                  Cadastrar
                </Button>
              </div>
            </div>
          ) : null}

          {hasSearched && (
            <div className="overflow-y-auto max-h-[50vh] space-y-3 pr-1">
              {/* Credits */}
              {authSession && credits.length > 0 ? (
                <div className="rounded-lg border border-border bg-card p-4 space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-base font-extrabold tracking-wide uppercase">CRÉDITOS DISPONÍVEIS</p>
                  </div>

                  <div className="space-y-2">
                    {credits.map((c) => {
                        const isRedeemOpen = redeemServiceId === c.service_id;
                        return (
                          <div key={c.service_id} className="rounded-md border border-border p-3">
                            <div className="flex items-start justify-between gap-2">
                              <div>
                                <p className="text-sm font-semibold">
                                  <span className="text-primary">{c.quantity.toLocaleString()}</span> disponíveis
                                </p>
                                <p className="mt-0.5 text-xs text-muted-foreground">{getCreditServiceLabel(c.service_name)}</p>
                              </div>
                              <Button variant="outline" size="sm" onClick={() => beginRedeem(c)} disabled={redeeming}>
                                Usar
                              </Button>
                            </div>

                            {isRedeemOpen ? (
                              <div className="mt-3 grid grid-cols-1 gap-2">
                                <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                                  <div className="sm:col-span-1">
                                    <Label className="text-xs">Quantidade</Label>
                                    <Input
                                      inputMode="numeric"
                                      value={redeemQty}
                                      readOnly
                                      disabled
                                      placeholder="Ex: 5000"
                                    />
                                  </div>
                                  <div className="sm:col-span-2">
                                    <Label className="text-xs">Link</Label>
                                    <Input value={redeemLink} onChange={(e) => setRedeemLink(e.target.value)} placeholder="Cole o link" />
                                  </div>
                                </div>

                                <div className="flex items-center justify-end gap-2">
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => {
                                      setRedeemServiceId(null);
                                      setRedeemQty("");
                                      setRedeemLink("");
                                    }}
                                    disabled={redeeming}
                                  >
                                    Cancelar
                                  </Button>
                                  <Button size="sm" onClick={handleRedeem} disabled={redeeming}>
                                    {redeeming ? "Enviando…" : "Confirmar"}
                                  </Button>
                                </div>
                              </div>
                            ) : null}
                          </div>
                        );
                    })}
                  </div>
                </div>
              ) : null}

              {orders.length === 0 ? (
                <div className="text-center py-8">
                  <Package className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
                  <p className="text-muted-foreground">
                    Nenhum pedido encontrado para este número.
                  </p>
                </div>
              ) : (
                orders.map((order) => {
                  const isCombo =
                    order.link === "combo" ||
                    String((order.order_payload as any)?.type || "").toLowerCase() === "combo";

                  const payloadLinksRaw = (order.order_payload as any)?.links;
                  const payloadLinks: string[] = Array.isArray(payloadLinksRaw)
                    ? payloadLinksRaw.map((l: any) => String(l || "").trim()).filter(Boolean)
                    : [];

                  const externalRows = (() => {
                    const raw = order.external_order_ids as any;
                    const rows: Array<{
                      link: string;
                      quantity: number;
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

                  const linksCount = isCombo ? externalRows.length : Math.max(externalRows.length, payloadLinks.length);
                  const isMultiLinkPackage = !isCombo && linksCount > 1;

                  const allPayloadLinks = (() => {
                    // For pending COMBO orders, external rows might be empty (not processed yet).
                    // In that case, show the links from the payload so the user can confirm what they ordered.
                    const links = new Set<string>();

                    payloadLinks.forEach((l) => links.add(String(l || "").trim()));

                    const payloadItems = (order.order_payload as any)?.items;
                    const items: Array<{ links?: unknown }> = Array.isArray(payloadItems) ? payloadItems : [];
                    items.forEach((it) => {
                      const ls = (it as any)?.links;
                      if (Array.isArray(ls)) {
                        ls.forEach((l: any) => {
                          const v = String(l || "").trim();
                          if (v) links.add(v);
                        });
                      }
                    });

                    return Array.from(links).filter(Boolean);
                  })();

                  const comboItems = (() => {
                    const payloadItems = (order.order_payload as any)?.items;
                    const items: Array<{ service_id: number; quantity: number; links: string[] }> = Array.isArray(payloadItems)
                      ? payloadItems
                      : [];

                    return items
                      .map((it) => ({
                        label:
                          (Number(it.service_id) || 0) === 3140
                            ? "CURTIDAS"
                            : (Number(it.service_id) || 0) === 2519
                              ? "VISUALIZAÇÕES"
                              : `Serviço ${it.service_id}`,
                        quantity: Number(it.quantity) || 0,
                        linksCount: Array.isArray(it.links) ? it.links.filter(Boolean).length : 0,
                      }))
                      .filter((it) => it.quantity > 0 || it.linksCount > 0);
                  })();

                  return (
                    <div key={order.id} className="p-4 rounded-lg bg-card border border-border space-y-2">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-2">
                          {getStatusIcon(order.payment_status, order.order_status)}
                          <div>
                            <p className="font-medium text-sm line-clamp-1">
                              {isCombo
                                ? `COMBO • ${order.service_name || "Serviço"}`
                                : order.service_name || "Serviço"}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {format(new Date(order.created_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                            </p>
                          </div>
                        </div>
                        {getStatusBadge(order.payment_status, order.order_status)}
                      </div>

                      {order.payment_status === "pending" && order.payment_id ? (
                        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 rounded-md border border-border/60 bg-muted/20 p-2">
                          <div className="text-xs text-muted-foreground">
                            Pagamento pendente • <span className="text-foreground/80">#{String(order.payment_id)}</span>
                          </div>
                          <Button
                            size="sm"
                            onClick={() => openPayForOrder(String(order.payment_id))}
                            disabled={payLoading && payOpen && payPaymentId === String(order.payment_id)}
                          >
                            {payLoading && payOpen && payPaymentId === String(order.payment_id) ? (
                              <>
                                <Loader2 className="h-4 w-4 animate-spin mr-2" /> Carregando…
                              </>
                            ) : (
                              "Ver QRCode"
                            )}
                          </Button>
                        </div>
                      ) : null}

                      <div className="grid grid-cols-2 gap-2 text-sm">
                        <div>
                          <span className="text-muted-foreground">Quantidade:</span>{" "}
                          <span className="font-medium">{isCombo ? "1 (combo)" : order.quantity.toLocaleString()}</span>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Valor:</span>{" "}
                          <span className="font-medium text-primary">{formatCurrency(order.total_price)}</span>
                        </div>
                      </div>

                      {isCombo && comboItems.length > 0 && (
                        <div className="space-y-1 bg-muted/20 rounded p-2">
                          {comboItems.map((it, idx) => (
                            <div key={idx} className="text-xs text-muted-foreground">
                              <span className="font-medium text-foreground/80">{it.label}:</span>{" "}
                              Qtd {it.quantity.toLocaleString()} • {it.linksCount} link(s)
                            </div>
                          ))}
                        </div>
                      )}

                       {isCombo && externalRows.length > 0 && (
                        <div className="space-y-1">
                          <p className="text-xs text-muted-foreground">Links do combo:</p>
                          {externalRows.slice(0, 6).map((r, idx) => {
                            const linkStatus = r.order_status || order.order_status;
                              const finalCount = calcFinalCount(r.start_count ?? null, r.quantity);

                            return (
                              <div key={idx} className="space-y-0.5">
                                <div className="flex items-center gap-2 text-[11px]">
                                  <span className="text-muted-foreground">Qtd {r.quantity.toLocaleString()}:</span>
                                  {linkStatus ? (
                                    <Badge variant="outline" className="text-[10px] px-2 py-0">
                                      {mapStatusLabel(String(linkStatus))}
                                    </Badge>
                                  ) : (
                                    <Badge variant="outline" className="text-[10px] px-2 py-0 text-muted-foreground">
                                      —
                                    </Badge>
                                  )}
                                </div>
                                  {(r.start_count || r.remains || finalCount) ? (
                                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
                                      <span>Início: <span className="text-foreground/80">{r.start_count ?? "—"}</span></span>
                                      <span>Vai ficar: <span className="text-foreground/80">{finalCount ?? "—"}</span></span>
                                      <span>Restam: <span className="text-foreground/80">{r.remains ?? "—"}</span></span>
                                    </div>
                                  ) : null}
                                <p className="text-[11px] text-primary break-all">{r.link}</p>
                              </div>
                            );
                          })}
                          {externalRows.length > 6 && (
                            <p className="text-[11px] text-muted-foreground">+{externalRows.length - 6} link(s)…</p>
                          )}
                        </div>
                      )}

                      {isMultiLinkPackage && (
                        <div className="space-y-1">
                          <p className="text-xs text-muted-foreground">Links do pacote:</p>
                          {(externalRows.length > 0
                            ? externalRows
                            : payloadLinks.map((l) => ({ link: l, quantity: 0, order_status: order.order_status } as any))
                          )
                            .slice(0, 6)
                            .map((r: any, idx: number) => {
                              const linkStatus = r?.order_status || order.order_status;
                              const qty = Number(r?.quantity) || 0;
                               const finalCount = calcFinalCount(r?.start_count ?? null, qty);
                              return (
                                <div key={idx} className="space-y-0.5">
                                  <div className="flex items-center gap-2 text-[11px]">
                                    {qty > 0 && <span className="text-muted-foreground">Qtd {qty.toLocaleString()}:</span>}
                                    {linkStatus ? (
                                      <Badge variant="outline" className="text-[10px] px-2 py-0">
                                        {mapStatusLabel(String(linkStatus))}
                                      </Badge>
                                    ) : (
                                      <Badge variant="outline" className="text-[10px] px-2 py-0 text-muted-foreground">
                                        —
                                      </Badge>
                                    )}
                                  </div>
                                    {(r?.start_count || r?.remains || finalCount) ? (
                                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
                                        <span>Início: <span className="text-foreground/80">{r?.start_count ?? "—"}</span></span>
                                        <span>Vai ficar: <span className="text-foreground/80">{finalCount ?? "—"}</span></span>
                                        <span>Restam: <span className="text-foreground/80">{r?.remains ?? "—"}</span></span>
                                      </div>
                                    ) : null}
                                  <p className="text-[11px] text-primary break-all">{String(r?.link || "").trim()}</p>
                                </div>
                              );
                            })}
                          {linksCount > 6 && (
                            <p className="text-[11px] text-muted-foreground">+{linksCount - 6} link(s)…</p>
                          )}
                        </div>
                      )}

                      {/* Progress info - show for processing/completed orders */}
                      {order.order_status && ["processing", "completed", "partial"].includes(order.order_status) && (
                        <div className="grid grid-cols-3 gap-2 text-sm bg-muted/30 rounded p-2">
                          <div>
                            <span className="text-muted-foreground">Início:</span>{" "}
                            <span className="font-medium">{order.start_count ?? "—"}</span>
                          </div>
                          <div>
                            <span className="text-muted-foreground">Vai ficar:</span>{" "}
                            <span className="font-medium">{calcFinalCount(order.start_count ?? null, Number(order.quantity) || 0) ?? "—"}</span>
                          </div>
                          <div>
                            <span className="text-muted-foreground">Restam:</span>{" "}
                            <span
                              className={`font-medium ${order.remains === "0" ? "text-green-500" : "text-yellow-500"}`}
                            >
                              {order.remains ?? "—"}
                            </span>
                          </div>
                        </div>
                      )}

                      {!isCombo && !isMultiLinkPackage && (
                        <p className="text-xs text-muted-foreground truncate">Link: {order.link}</p>
                      )}

                      {isCombo && externalRows.length === 0 && allPayloadLinks.length > 0 ? (
                        <div className="space-y-1">
                          <p className="text-xs text-muted-foreground">Link(s):</p>
                          {allPayloadLinks.slice(0, 3).map((l, idx) => (
                            <p key={idx} className="text-[11px] text-primary break-all">
                              {l}
                            </p>
                          ))}
                          {allPayloadLinks.length > 3 ? (
                            <p className="text-[11px] text-muted-foreground">+{allPayloadLinks.length - 3} link(s)…</p>
                          ) : null}
                        </div>
                      ) : null}
                    </div>
                  );
                })
              )}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

