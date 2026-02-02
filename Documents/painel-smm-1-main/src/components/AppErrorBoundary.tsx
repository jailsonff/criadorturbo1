import React from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getSafeLocalStorage, safeGetItem, safeSetItem } from "@/lib/safeStorage";

type Props = {
  children: React.ReactNode;
};

type State = {
  hasError: boolean;
  error?: unknown;
};

export default class AppErrorBoundary extends React.Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(error: unknown): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: unknown) {
    // Keep a breadcrumb in console for support.
    // eslint-disable-next-line no-console
    console.error("[AppErrorBoundary] Unhandled error", error);

     // Persist last crash so we can debug cases where console logs aren't accessible (mobile webviews).
     try {
       const msg =
         error instanceof Error
           ? `${error.name}: ${error.message}${error.stack ? `\n${error.stack}` : ""}`
           : typeof error === "string"
             ? error
             : JSON.stringify(error);
       safeSetItem(
         "last_client_error",
         JSON.stringify({ type: "react_error_boundary", error: msg, at: new Date().toISOString() }),
       );
     } catch {
       // ignore
     }
  }

  private resetApp = () => {
    this.setState({ hasError: false, error: undefined });
    window.location.reload();
  };

  private clearLocalDataAndReload = () => {
    try {
      const storage = getSafeLocalStorage();
      // Remove only known keys we manage (prevents accidental data loss in other apps on same domain)
      const keysToRemove: string[] = [];
      for (let i = 0; i < storage.length; i++) {
        const key = storage.key(i);
        if (!key) continue;
        if (
          key === "supabase_config" ||
          key === "smm_current_user_id" ||
          key === "store_customer_session_v1" ||
          key.startsWith("smm_orders_")
          || key.startsWith("store_popup_dismiss:")
        ) {
          keysToRemove.push(key);
        }
      }
      keysToRemove.forEach((k) => storage.removeItem(k));
    } catch {
      // ignore
    }
    window.location.reload();
  };

  render() {
    if (!this.state.hasError) return this.props.children;

    const last = safeGetItem("last_client_error");
    const lastText = last ? String(last).slice(0, 4000) : null;

    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-6">
        <Card className="w-full max-w-lg">
          <CardHeader>
            <CardTitle>Ops, algo deu errado</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Alguns usuários podem ver uma “tela preta” quando existe um erro no navegador (muitas vezes causado
              por dados corrompidos no armazenamento local). Você pode tentar recarregar, ou limpar os dados locais
              deste site.
            </p>
            <div className="flex flex-col sm:flex-row gap-2">
              <Button onClick={this.resetApp} variant="default">Recarregar</Button>
              <Button onClick={this.clearLocalDataAndReload} variant="secondary">
                Limpar dados locais e recarregar
              </Button>
            </div>

            {lastText ? (
              <details className="rounded-md border border-border p-3">
                <summary className="cursor-pointer text-sm font-medium">Detalhes técnicos (para suporte)</summary>
                <pre className="mt-2 whitespace-pre-wrap break-words text-xs text-muted-foreground">{lastText}</pre>
              </details>
            ) : null}
          </CardContent>
        </Card>
      </div>
    );
  }
}
