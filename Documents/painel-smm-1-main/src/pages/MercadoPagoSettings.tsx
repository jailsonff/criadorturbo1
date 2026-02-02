import { useState, useEffect } from "react";
import { CreditCard, Save, Trash2, CheckCircle, ExternalLink, ArrowLeft, Shield, Zap, QrCode, Plus, X, Wallet, RefreshCw } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { Link } from "react-router-dom";
import { getExternalConfig, getSupabaseClient } from "@/lib/supabaseClient";
import { backendSupabase } from "@/lib/backendClient";
import { Badge } from "@/components/ui/badge";

const getMercadoPagoKeys = () => {
  const publicKey = localStorage.getItem("mp_public_key");
  const accessToken = localStorage.getItem("mp_access_token");
  return { publicKey, accessToken };
};

const setMercadoPagoKeys = (publicKey: string, accessToken: string) => {
  localStorage.setItem("mp_public_key", publicKey);
  localStorage.setItem("mp_access_token", accessToken);
};

const removeMercadoPagoKeys = () => {
  localStorage.removeItem("mp_public_key");
  localStorage.removeItem("mp_access_token");
};

const MercadoPagoSettings = () => {
  const supabase = getSupabaseClient();
  const externalDb = getExternalConfig();

  const [mpPublicKey, setMpPublicKey] = useState("");
  const [mpAccessToken, setMpAccessToken] = useState("");
  const [hasMpKeys, setHasMpKeys] = useState(false);
  const [predefinedValues, setPredefinedValues] = useState<string[]>(["10", "25", "50", "100", "250", "500"]);
  const [minimumDeposit, setMinimumDeposit] = useState("5");
  const [newValue, setNewValue] = useState("");
  const [loadingDeposit, setLoadingDeposit] = useState(true);
  const [savingDeposit, setSavingDeposit] = useState(false);
  const [reconciling, setReconciling] = useState(false);
  const [reconcileSummary, setReconcileSummary] = useState<{ checked: number; approved: number; updated: number } | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    const mpKeys = getMercadoPagoKeys();
    if (mpKeys.publicKey && mpKeys.accessToken) {
      setHasMpKeys(true);
      setMpPublicKey(mpKeys.publicKey);
      setMpAccessToken(mpKeys.accessToken);
    }
    fetchDepositSettings();
  }, []);

  const fetchDepositSettings = async () => {
    try {
      const { data, error } = await supabase
        .from("site_settings")
        .select("deposit_predefined_values, deposit_minimum")
        .order("updated_at", { ascending: false })
        .limit(1)
        .single();

      if (error && error.code !== "PGRST116") throw error;

      if (data) {
        if (data.deposit_predefined_values) {
          setPredefinedValues(data.deposit_predefined_values);
        }
        if (data.deposit_minimum !== null) {
          setMinimumDeposit(data.deposit_minimum.toString());
        }
      }
    } catch (error) {
      console.error("Error fetching deposit settings:", error);
    } finally {
      setLoadingDeposit(false);
    }
  };

  const handleSaveDepositSettings = async () => {
    setSavingDeposit(true);
    try {
      const { data: settingsRow, error: settingsRowError } = await supabase
        .from("site_settings")
        .select("id")
        .order("updated_at", { ascending: false })
        .limit(1)
        .single();

      if (settingsRowError) throw settingsRowError;

      const { error } = await supabase
        .from("site_settings")
        .update({
          deposit_predefined_values: predefinedValues,
          deposit_minimum: parseFloat(minimumDeposit) || 5,
        })
        .eq("id", settingsRow.id);

      if (error) throw error;

      toast({
        title: "Configurações salvas!",
        description: "Os valores de depósito foram atualizados.",
      });
    } catch (error) {
      console.error("Error saving deposit settings:", error);
      toast({
        title: "Erro",
        description: "Não foi possível salvar as configurações.",
        variant: "destructive",
      });
    } finally {
      setSavingDeposit(false);
    }
  };

  const handleAddValue = () => {
    const value = parseFloat(newValue);
    if (!value || value <= 0) {
      toast({
        title: "Valor inválido",
        description: "Digite um valor maior que zero.",
        variant: "destructive",
      });
      return;
    }

    if (predefinedValues.includes(value.toString())) {
      toast({
        title: "Valor já existe",
        description: "Este valor já está na lista.",
        variant: "destructive",
      });
      return;
    }

    const newValues = [...predefinedValues, value.toString()].sort((a, b) => parseFloat(a) - parseFloat(b));
    setPredefinedValues(newValues);
    setNewValue("");
  };

  const handleRemoveValue = (value: string) => {
    setPredefinedValues(predefinedValues.filter(v => v !== value));
  };

  const handleSaveMercadoPago = () => {
    if (!mpPublicKey.trim() || !mpAccessToken.trim()) {
      toast({
        title: "Erro",
        description: "Por favor, preencha ambas as credenciais do MercadoPago.",
        variant: "destructive",
      });
      return;
    }

    setMercadoPagoKeys(mpPublicKey.trim(), mpAccessToken.trim());
    setHasMpKeys(true);
    toast({
      title: "MercadoPago configurado!",
      description: "Suas credenciais foram salvas com sucesso.",
    });
  };

  const handleRemoveMercadoPago = () => {
    removeMercadoPagoKeys();
    setMpPublicKey("");
    setMpAccessToken("");
    setHasMpKeys(false);
    toast({
      title: "Credenciais removidas",
      description: "Suas credenciais do MercadoPago foram removidas.",
    });
  };

  const handleReconcilePending = async () => {
    setReconciling(true);
    try {
      const { data, error } = await backendSupabase.functions.invoke("mercadopago-reconcile", {
        body: {
          hours: 48,
          limit: 80,
          externalDb: externalDb?.serviceRoleKey ? { url: externalDb.url, serviceRoleKey: externalDb.serviceRoleKey } : undefined,
        },
      });

      if (error) throw error;

      setReconcileSummary({
        checked: Number((data as any)?.checked) || 0,
        approved: Number((data as any)?.approved) || 0,
        updated: Number((data as any)?.updated) || 0,
      });

      toast({
        title: "Revalidação concluída",
        description: `Checados: ${(data as any)?.checked ?? 0} • Aprovados: ${(data as any)?.approved ?? 0} • Atualizados: ${(data as any)?.updated ?? 0}`,
      });
    } catch (e: any) {
      console.error("reconcile error:", e);
      toast({
        title: "Erro",
        description: e?.message || "Não foi possível revalidar os pagamentos pendentes.",
        variant: "destructive",
      });
    } finally {
      setReconciling(false);
    }
  };

  return (
    <div className="min-h-screen">
      <main className="container mx-auto px-4 py-8">
        <div className="max-w-3xl mx-auto">
          {/* Header */}
          <div className="flex items-center gap-4 mb-8">
            <Link to="/settings">
              <Button variant="ghost" size="icon">
                <ArrowLeft className="w-5 h-5" />
              </Button>
            </Link>
            <div>
              <h1 className="text-3xl font-bold flex items-center gap-3">
                <div className="w-12 h-12 rounded-xl bg-blue-500/10 flex items-center justify-center">
                  <CreditCard className="w-6 h-6 text-blue-500" />
                </div>
                MercadoPago
              </h1>
              <p className="text-muted-foreground mt-1">
                Configure suas credenciais para receber pagamentos via PIX
              </p>
            </div>
          </div>

          {/* Status Card */}
          <Card className={`glass-card mb-6 ${hasMpKeys ? 'border-green-500/50' : 'border-yellow-500/50'}`}>
            <CardContent className="py-4">
              <div className="flex items-center gap-4">
                <div className={`w-12 h-12 rounded-full flex items-center justify-center ${hasMpKeys ? 'bg-green-500/20' : 'bg-yellow-500/20'}`}>
                  {hasMpKeys ? (
                    <CheckCircle className="w-6 h-6 text-green-500" />
                  ) : (
                    <CreditCard className="w-6 h-6 text-yellow-500" />
                  )}
                </div>
                <div className="flex-1">
                  <h3 className="font-semibold">
                    {hasMpKeys ? 'MercadoPago Configurado' : 'Configuração Pendente'}
                  </h3>
                  <p className="text-sm text-muted-foreground">
                    {hasMpKeys 
                      ? 'Suas credenciais estão ativas e prontas para receber pagamentos.'
                      : 'Configure suas credenciais para habilitar pagamentos via PIX.'
                    }
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Deposit Values Configuration */}
          <Card className="glass-card mb-6">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Wallet className="w-5 h-5 text-primary" />
                Configuração de Depósitos
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Minimum Deposit */}
              <div className="space-y-2">
                <Label htmlFor="minDeposit">Valor Mínimo de Depósito</Label>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                      R$
                    </span>
                    <Input
                      id="minDeposit"
                      type="number"
                      value={minimumDeposit}
                      onChange={(e) => setMinimumDeposit(e.target.value)}
                      className="pl-10"
                      min="1"
                    />
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">
                  O valor mínimo que os usuários podem depositar
                </p>
              </div>

              {/* Predefined Values */}
              <div className="space-y-2">
                <Label>Valores Predefinidos</Label>
                <div className="flex flex-wrap gap-2 mb-3">
                  {predefinedValues.map((value) => (
                    <Badge
                      key={value}
                      variant="secondary"
                      className="px-3 py-1.5 text-sm flex items-center gap-2"
                    >
                      R$ {parseFloat(value).toFixed(0)}
                      <button
                        onClick={() => handleRemoveValue(value)}
                        className="hover:text-destructive transition-colors"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </Badge>
                  ))}
                </div>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                      R$
                    </span>
                    <Input
                      type="number"
                      placeholder="Novo valor"
                      value={newValue}
                      onChange={(e) => setNewValue(e.target.value)}
                      className="pl-10"
                      min="1"
                      onKeyDown={(e) => e.key === "Enter" && handleAddValue()}
                    />
                  </div>
                  <Button onClick={handleAddValue} variant="outline">
                    <Plus className="w-4 h-4 mr-1" />
                    Adicionar
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  Valores que aparecem como opções rápidas na página de adicionar saldo
                </p>
              </div>

              <Button 
                onClick={handleSaveDepositSettings} 
                disabled={savingDeposit || loadingDeposit}
                className="w-full"
              >
                <Save className="w-4 h-4 mr-2" />
                {savingDeposit ? "Salvando..." : "Salvar Configurações de Depósito"}
              </Button>
            </CardContent>
          </Card>

          {/* Credentials Form */}
          <Card className="glass-card mb-6">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Shield className="w-5 h-5 text-blue-500" />
                Credenciais de Acesso
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="rounded-lg border border-border bg-muted/20 p-3 text-sm text-muted-foreground">
                Seus pagamentos PIX estão sendo processados automaticamente pelas credenciais configuradas no <strong>backend</strong> (segredo <code>MERCADOPAGO_ACCESS_TOKEN</code>).
                Estes campos abaixo são apenas informativos/legado e não são usados no processamento atual.
              </div>
              <div className="space-y-2">
                <Label htmlFor="mpPublicKey">Public Key</Label>
                <Input
                  id="mpPublicKey"
                  type="text"
                  placeholder="APP_USR-xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                  value={mpPublicKey}
                  onChange={(e) => setMpPublicKey(e.target.value)}
                  className="font-mono text-sm"
                />
                <p className="text-xs text-muted-foreground">
                  Chave pública para identificação do checkout
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="mpAccessToken">Access Token</Label>
                <Input
                  id="mpAccessToken"
                  type="password"
                  placeholder="APP_USR-xxxxxxxxxxxxxxxx-xxxxxx-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx-xxxxxxxxx"
                  value={mpAccessToken}
                  onChange={(e) => setMpAccessToken(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  Token de acesso para processar pagamentos (mantenha em segredo)
                </p>
              </div>

              <div className="flex gap-4 pt-4">
                <Button onClick={handleSaveMercadoPago} className="flex-1 bg-blue-500 hover:bg-blue-600">
                  <Save className="w-4 h-4 mr-2" />
                  Salvar Credenciais
                </Button>
                {hasMpKeys && (
                  <Button
                    variant="outline"
                    onClick={handleRemoveMercadoPago}
                    className="text-destructive hover:text-destructive hover:bg-destructive/10"
                  >
                    <Trash2 className="w-4 h-4 mr-2" />
                    Remover
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Reconcile Pending Payments */}
          <Card className="glass-card mb-6">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <RefreshCw className="w-5 h-5 text-primary" />
                Revalidar pagamentos pendentes
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-sm text-muted-foreground">
                Use quando o cliente pagou o PIX, mas o pedido ainda aparece como “Aguardando Pagamento”.
              </p>

              <Button onClick={handleReconcilePending} disabled={reconciling} className="w-full">
                <RefreshCw className={`w-4 h-4 mr-2 ${reconciling ? "animate-spin" : ""}`} />
                {reconciling ? "Revalidando..." : "Revalidar últimos 2 dias"}
              </Button>

              {reconcileSummary && (
                <div className="text-sm text-muted-foreground">
                  Última execução: checados <strong>{reconcileSummary.checked}</strong> • aprovados{" "}
                  <strong>{reconcileSummary.approved}</strong> • atualizados <strong>{reconcileSummary.updated}</strong>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Features Card */}
          <Card className="glass-card mb-6">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Zap className="w-5 h-5 text-amber-500" />
                Recursos Disponíveis
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="flex items-start gap-3 p-4 rounded-lg bg-muted/30">
                  <QrCode className="w-5 h-5 text-primary mt-0.5" />
                  <div>
                    <h4 className="font-medium">Pagamento PIX</h4>
                    <p className="text-sm text-muted-foreground">
                      QR Code gerado automaticamente para pagamentos instantâneos
                    </p>
                  </div>
                </div>
                <div className="flex items-start gap-3 p-4 rounded-lg bg-muted/30">
                  <CheckCircle className="w-5 h-5 text-green-500 mt-0.5" />
                  <div>
                    <h4 className="font-medium">Confirmação Automática</h4>
                    <p className="text-sm text-muted-foreground">
                      Saldo atualizado automaticamente após pagamento
                    </p>
                  </div>
                </div>
                <div className="flex items-start gap-3 p-4 rounded-lg bg-muted/30">
                  <Shield className="w-5 h-5 text-blue-500 mt-0.5" />
                  <div>
                    <h4 className="font-medium">Segurança</h4>
                    <p className="text-sm text-muted-foreground">
                      Processamento seguro via API oficial do MercadoPago
                    </p>
                  </div>
                </div>
                <div className="flex items-start gap-3 p-4 rounded-lg bg-muted/30">
                  <Zap className="w-5 h-5 text-amber-500 mt-0.5" />
                  <div>
                    <h4 className="font-medium">Instantâneo</h4>
                    <p className="text-sm text-muted-foreground">
                      Pagamentos processados em segundos
                    </p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Help Card */}
          <Card className="glass-card border-blue-500/30">
            <CardContent className="py-6">
              <div className="flex items-start gap-4">
                <div className="w-10 h-10 rounded-lg bg-blue-500/10 flex items-center justify-center shrink-0">
                  <CreditCard className="w-5 h-5 text-blue-500" />
                </div>
                <div>
                  <h3 className="font-semibold mb-2">Como obter suas credenciais?</h3>
                  <ol className="text-sm text-muted-foreground space-y-2 mb-4">
                    <li className="flex gap-2">
                      <span className="text-blue-500 font-medium">1.</span>
                      Acesse o painel de desenvolvedores do MercadoPago
                    </li>
                    <li className="flex gap-2">
                      <span className="text-blue-500 font-medium">2.</span>
                      Crie uma aplicação ou selecione uma existente
                    </li>
                    <li className="flex gap-2">
                      <span className="text-blue-500 font-medium">3.</span>
                      Copie as credenciais de <strong>produção</strong>
                    </li>
                    <li className="flex gap-2">
                      <span className="text-blue-500 font-medium">4.</span>
                      Cole nos campos acima e salve
                    </li>
                  </ol>
                  <a
                    href="https://www.mercadopago.com.br/developers/panel/app"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 text-sm text-blue-500 hover:underline font-medium"
                  >
                    Acessar Painel de Desenvolvedores
                    <ExternalLink className="w-4 h-4" />
                  </a>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
};

export default MercadoPagoSettings;