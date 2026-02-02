import { useEffect, useMemo, useState } from "react";
import { Download, Share2, PlusSquare } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>; // minimal typing
};

const Install = () => {
  const [bipEvent, setBipEvent] = useState<BeforeInstallPromptEvent | null>(null);

  useEffect(() => {
    const handler = (e: Event) => {
      // Chrome/Edge on Android fires this
      e.preventDefault?.();
      setBipEvent(e as BeforeInstallPromptEvent);
    };

    window.addEventListener("beforeinstallprompt", handler as any);
    return () => window.removeEventListener("beforeinstallprompt", handler as any);
  }, []);

  const isIOS = useMemo(() => {
    const ua = navigator.userAgent || "";
    return /iphone|ipad|ipod/i.test(ua);
  }, []);

  const isStandalone = useMemo(() => {
    // iOS
    const iosStandalone = (window.navigator as any).standalone === true;
    // other browsers
    const mqStandalone = window.matchMedia?.("(display-mode: standalone)")?.matches;
    return Boolean(iosStandalone || mqStandalone);
  }, []);

  const handleInstall = async () => {
    if (!bipEvent) return;
    await bipEvent.prompt();
    await bipEvent.userChoice;
    setBipEvent(null);
  };

  return (
    <main className="min-h-screen bg-background">
      <div className="container mx-auto px-4 py-10 max-w-2xl">
        <header className="mb-6 space-y-2">
          <h1 className="text-3xl font-semibold">Instalar o App</h1>
          <p className="text-sm text-muted-foreground">
            Instale no seu celular para abrir como aplicativo.
          </p>
        </header>

        <div className="space-y-4">
          {isStandalone ? (
            <Card>
              <CardHeader>
                <CardTitle>Já está instalado</CardTitle>
              </CardHeader>
              <CardContent className="text-sm text-muted-foreground">
                Você já está usando o app no modo instalado.
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardHeader>
                <CardTitle>Instalação rápida</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {bipEvent ? (
                  <Button onClick={handleInstall} className="w-full gap-2">
                    <Download className="h-4 w-4" />
                    Instalar agora
                  </Button>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    Se o botão de instalação não aparecer, siga as instruções abaixo (depende do navegador).
                  </p>
                )}

                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="rounded-lg border border-border p-4">
                    <div className="text-sm font-medium mb-2">Android (Chrome)</div>
                    <div className="text-sm text-muted-foreground">
                      Menu ⋮ → <span className="font-medium">Instalar app</span> / <span className="font-medium">Adicionar à tela inicial</span>.
                    </div>
                  </div>

                  <div className="rounded-lg border border-border p-4">
                    <div className="text-sm font-medium mb-2">iPhone (Safari)</div>
                    <div className="text-sm text-muted-foreground">
                      <span className="inline-flex items-center gap-1 font-medium">
                        <Share2 className="h-4 w-4" /> Compartilhar
                      </span>
                      {" "}→{" "}
                      <span className="inline-flex items-center gap-1 font-medium">
                        <PlusSquare className="h-4 w-4" /> Adicionar à Tela de Início
                      </span>
                      .
                    </div>
                    {isIOS && (
                      <div className="mt-2 text-xs text-muted-foreground">
                        No iPhone o botão “Instalar agora” geralmente não aparece; use o menu de compartilhamento.
                      </div>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </main>
  );
};

export default Install;
