import { useEffect, useMemo } from "react";
import { useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getSupabaseClient } from "@/lib/supabaseClient";

type SiteSettings = {
  android_apk_url: string | null;
  android_apk_download_url?: string | null;
  android_apk_version: string | null;
};

export default function AppDownloadRedirect() {
  const { fileName } = useParams();

  const { data: settings, isLoading, isError } = useQuery({
    queryKey: ["site-settings-android-apk"],
    queryFn: async () => {
      const supabase = getSupabaseClient();
      const { data, error } = await supabase
        .from("site_settings")
        .select("android_apk_url, android_apk_download_url, android_apk_version")
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return (data ?? null) as SiteSettings | null;
    },
    staleTime: 1000 * 60,
  });

  const targetUrl = useMemo(() => {
    const url = (settings?.android_apk_download_url ?? settings?.android_apk_url)?.trim();
    return url && url.length > 0 ? url : null;
  }, [settings?.android_apk_download_url, settings?.android_apk_url]);

  // Se o Admin apontar o APK para este mesmo caminho, evitar loop infinito.
  const isSelfTarget = useMemo(() => {
    if (!targetUrl) return false;
    try {
      const current = window.location.origin + window.location.pathname;
      const normalizedTarget = new URL(targetUrl, window.location.origin).toString();
      return normalizedTarget === current;
    } catch {
      return false;
    }
  }, [targetUrl]);

  useEffect(() => {
    if (!targetUrl) return;
    if (isSelfTarget) return;
    // Redireciona (mantém histórico limpo)
    window.location.replace(targetUrl);
  }, [targetUrl, isSelfTarget]);

  return (
    <main className="min-h-screen bg-background">
      <div className="container mx-auto px-4 py-10 max-w-xl">
        <Card>
          <CardHeader>
            <CardTitle>Baixando aplicativo</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="text-sm text-muted-foreground">
              Arquivo solicitado: <span className="font-mono">{fileName}</span>
            </div>

            {isLoading ? (
              <div className="text-sm text-muted-foreground">Preparando download…</div>
            ) : isError ? (
              <div className="text-sm text-muted-foreground">
                Não foi possível carregar o link do APK agora.
              </div>
            ) : !targetUrl ? (
              <div className="text-sm text-muted-foreground">
                O link do APK ainda não foi configurado no Admin.
              </div>
            ) : isSelfTarget ? (
              <div className="text-sm text-muted-foreground">
                O link do APK está apontando para ele mesmo. Ajuste o link no Admin para uma URL válida.
              </div>
            ) : (
              <div className="text-sm text-muted-foreground">
                Se o download não iniciar automaticamente, use o botão abaixo.
              </div>
            )}

            {targetUrl ? (
              <Button asChild className="w-full">
                <a href={targetUrl} rel="noopener noreferrer" referrerPolicy="no-referrer" download>
                  Baixar APK
                </a>
              </Button>
            ) : null}
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
