import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Download, ShieldCheck, Smartphone, TriangleAlert } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { getSupabaseClient } from "@/lib/supabaseClient";

import badgeLogo from "@/assets/agencia-recife-badge.png";
import wordmarkLogo from "@/assets/agencia-recife-wordmark.png";
import appScreenshot from "@/assets/app-screenshot.jpg";

type SiteSettings = {
  android_apk_url: string | null;
  android_apk_download_url?: string | null;
  android_apk_direct_url?: string | null;
  android_apk_version: string | null;
};

export default function AppAndroid() {
  const isIOS = useMemo(() => {
    const ua = navigator.userAgent || "";
    return /iphone|ipad|ipod/i.test(ua);
  }, []);

  const { data: settings, isLoading } = useQuery({
    queryKey: ["site-settings-android-apk"],
    queryFn: async () => {
      const supabase = getSupabaseClient();
      const { data, error } = await supabase
        .from("site_settings")
        .select("android_apk_url, android_apk_download_url, android_apk_direct_url, android_apk_version")
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return (data ?? null) as SiteSettings | null;
    },
    staleTime: 1000 * 60,
  });

  const apkDownloadUrl = (settings?.android_apk_download_url ?? settings?.android_apk_url ?? null) as string | null;
  const apkDirectUrl = (settings?.android_apk_direct_url ?? settings?.android_apk_url ?? null) as string | null;
  const apkVersion = settings?.android_apk_version ?? null;

  const resolvedApkUrl = useMemo(() => {
    if (!apkDownloadUrl) return null;
    return apkDownloadUrl.trim();
  }, [apkDownloadUrl]);

  const resolvedDirectUrl = useMemo(() => {
    if (!apkDirectUrl) return null;
    return apkDirectUrl.trim();
  }, [apkDirectUrl]);

  const handleDownload = () => {
    if (!resolvedApkUrl || isIOS) return;

    // Dispara o download do mesmo jeito que o botão "Link direto" (anchor com download)
    // para evitar variações de comportamento em alguns navegadores.
    const a = document.createElement("a");
    a.href = resolvedApkUrl;
    a.download = "";
    // Evita enviar Referer (algumas hospedagens retornam HTML por anti-hotlink/redirect)
    a.rel = "noopener noreferrer";
    a.referrerPolicy = "no-referrer";
    document.body.appendChild(a);
    a.click();
    a.remove();
  };

  return (
    <main className="min-h-screen bg-background">
      <section className="relative overflow-hidden">
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute -top-24 -left-24 h-72 w-72 rounded-full bg-primary/15 blur-3xl" />
          <div className="absolute -bottom-28 -right-28 h-72 w-72 rounded-full bg-accent/10 blur-3xl" />
        </div>

        <div className="container mx-auto px-4 py-10 max-w-5xl relative">
          <header className="grid gap-8 lg:grid-cols-2 lg:items-center">
            <div className="space-y-5">
              <div className="flex items-center gap-3">
                <img
                  src={badgeLogo}
                  alt="Agência Recife"
                  className="h-14 w-14 object-contain"
                  loading="lazy"
                />
                <img
                  src={wordmarkLogo}
                  alt="Agência Recife"
                  className="h-10 object-contain"
                  loading="lazy"
                />
              </div>

              <h1 className="text-3xl md:text-4xl font-semibold tracking-tight">
                Baixe o aplicativo da Agência Recife
              </h1>

              <p className="text-sm md:text-base text-muted-foreground">
                Tenha acesso rápido no seu celular: o app fica instalado na tela inicial e você pode comprar a qualquer
                momento e hora, sem precisar ficar abrindo o site toda vez.
              </p>

              <div className="flex flex-col sm:flex-row gap-3">
                <Button
                  onClick={handleDownload}
                  disabled={isIOS || !resolvedApkUrl || isLoading}
                  className="gap-2"
                >
                  <Download className="h-4 w-4" />
                  {isLoading ? "Carregando..." : "Baixar APK (Android)"}
                </Button>

                {resolvedDirectUrl && !isIOS && (
                  <Button asChild variant="outline">
                    <a
                      href={resolvedDirectUrl}
                      className="gap-2"
                      rel="noopener noreferrer"
                      referrerPolicy="no-referrer"
                    >
                      <Smartphone className="h-4 w-4" />
                      Link direto
                    </a>
                  </Button>
                )}
              </div>

              <div className="grid gap-3">
                <Card className="bg-card/40">
                  <CardContent className="pt-6 space-y-3">
                    <div className="flex items-start gap-3">
                      <TriangleAlert className="h-5 w-5 text-warning shrink-0 mt-0.5" />
                      <div>
                        <div className="text-sm font-medium">Compatibilidade</div>
                        <div className="text-sm text-muted-foreground">
                          O aplicativo funciona atualmente apenas em celulares Android. No iPhone (iOS) ainda não está
                          disponível.
                        </div>
                      </div>
                    </div>
                    {apkVersion && (
                      <div className="text-xs text-muted-foreground">
                        Versão atual: <span className="font-medium text-foreground">{apkVersion}</span>
                      </div>
                    )}
                  </CardContent>
                </Card>

                <Card className="bg-card/40">
                  <CardContent className="pt-6">
                    <div className="flex items-start gap-3">
                      <ShieldCheck className="h-5 w-5 text-success shrink-0 mt-0.5" />
                      <div>
                        <div className="text-sm font-medium">100% Seguro</div>
                        <div className="text-sm text-muted-foreground">
                          Nosso aplicativo é totalmente seguro e feito para facilitar seu acesso. A Agência Recife é a
                          melhor de todos quando o assunto é engajamento e praticidade.
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </div>

            <div className="relative">
              <div className="absolute -inset-6 rounded-3xl bg-primary/10 blur-2xl" />
              <Card className="relative overflow-hidden">
                <CardHeader>
                  <CardTitle className="text-base">Prévia do app</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid gap-4">
                    <img
                      src={appScreenshot}
                      alt="Tela do aplicativo Agência Recife"
                      className="w-full rounded-xl border border-border/60 object-cover"
                      loading="lazy"
                    />
                    <Separator />
                    <div className="text-sm text-muted-foreground">
                      Após instalar, o ícone fica no seu celular e você entra com 1 toque.
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </header>
        </div>
      </section>
    </main>
  );
}
