import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Download, Loader2, Upload } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { getSupabaseClient } from "@/lib/supabaseClient";

type SiteSettings = {
  id: string;
  android_apk_url?: string | null;
  android_apk_download_url?: string | null;
  android_apk_direct_url?: string | null;
  android_apk_version?: string | null;
};

const AdminPWA = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);

  const [version, setVersion] = useState<string>("");
  const [file, setFile] = useState<File | null>(null);
  const [apkDownloadUrlInput, setApkDownloadUrlInput] = useState<string>("");
  const [apkDirectUrlInput, setApkDirectUrlInput] = useState<string>("");

  const { data: settings } = useQuery({
    queryKey: ["site-settings-admin-pwa"],
    queryFn: async () => {
      const supabase = getSupabaseClient();
      const { data, error } = await supabase
        .from("site_settings")
        .select(
          "id, android_apk_url, android_apk_download_url, android_apk_direct_url, android_apk_version"
        )
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return (data ?? null) as SiteSettings | null;
    },
  });

  const currentApkUrl = settings?.android_apk_url ?? null;
  const currentApkDownloadUrl = settings?.android_apk_download_url ?? null;
  const currentApkDirectUrl = settings?.android_apk_direct_url ?? null;
  const currentVersion = settings?.android_apk_version ?? null;

  // Preenche os campos com os valores atuais uma vez que carregar.
  useEffect(() => {
    if (!settings) return;

    setApkDownloadUrlInput((prev) => {
      if (prev.trim()) return prev;
      return (settings.android_apk_download_url ?? settings.android_apk_url ?? "") as string;
    });

    setApkDirectUrlInput((prev) => {
      if (prev.trim()) return prev;
      return (settings.android_apk_direct_url ?? settings.android_apk_url ?? "") as string;
    });
  }, [settings]);

  const canUpload = useMemo(() => Boolean(settings?.id), [settings?.id]);

  const uploadMutation = useMutation({
    mutationFn: async () => {
      if (!settings?.id) throw new Error("Configuração do site não encontrada.");
      if (!file) throw new Error("Selecione um arquivo .apk.");

      const isApk = file.name.toLowerCase().endsWith(".apk") || file.type === "application/vnd.android.package-archive";
      if (!isApk) throw new Error("Arquivo inválido. Envie um .apk do Android.");

      const supabase = getSupabaseClient();

      // Mantém um caminho fixo para sempre ser “a última versão”.
      const objectPath = "agencia-recife-latest.apk";

      const { error: uploadError } = await supabase.storage
        .from("app-downloads")
        .upload(objectPath, file, {
          upsert: true,
          contentType: "application/vnd.android.package-archive",
        });
      if (uploadError) throw uploadError;

      const {
        data: { publicUrl },
      } = supabase.storage.from("app-downloads").getPublicUrl(objectPath);

      const { error: updateError } = await supabase
        .from("site_settings")
        .update({
          // Manter compatibilidade com versões antigas do app
          android_apk_url: publicUrl,
          android_apk_download_url: publicUrl,
          android_apk_version: version || null,
          updated_at: new Date().toISOString(),
          updated_by: user?.id ?? null,
        })
        .eq("id", settings.id);
      if (updateError) throw updateError;

      return publicUrl;
    },
    onSuccess: (publicUrl) => {
      setFile(null);
      queryClient.invalidateQueries({ queryKey: ["site-settings-admin-pwa"] });
      queryClient.invalidateQueries({ queryKey: ["site-settings-android-apk"] });
      toast({
        title: "APK atualizado",
        description: "Upload concluído e link público atualizado.",
      });
      // Abrir o link em uma nova aba ajuda a testar o download.
      window.open(publicUrl, "_blank", "noopener,noreferrer");
    },
    onError: (err: any) => {
      toast({
        title: "Erro ao enviar APK",
        description: err?.message || "Não foi possível enviar o arquivo.",
        variant: "destructive",
      });
    },
  });

  const saveApkLinksMutation = useMutation({
    mutationFn: async () => {
      if (!settings?.id) throw new Error("Configuração do site não encontrada.");

      const downloadValue = apkDownloadUrlInput.trim();
      const directValue = apkDirectUrlInput.trim();

      if (!downloadValue && !directValue) {
        throw new Error("Informe ao menos um link.");
      }

      const validate = (value: string) => {
        // Aceita:
        // - Caminho relativo no seu domínio: /app-downloads/agencia-recife-latest.apk
        // - URL completa (http/https)
        const isAbsolute = /^https?:\/\//i.test(value);
        const isRelative = value.startsWith("/");
        if (!isAbsolute && !isRelative) {
          throw new Error("Use uma URL completa (https://...) ou um caminho começando com '/'.");
        }
      };

      if (downloadValue) validate(downloadValue);
      if (directValue) validate(directValue);

      const supabase = getSupabaseClient();
      const { error } = await supabase
        .from("site_settings")
        .update({
          android_apk_download_url: downloadValue || null,
          android_apk_direct_url: directValue || null,
          // compat: se tiver download, prioriza; senão, usa direct
          android_apk_url: downloadValue || directValue || null,
          updated_at: new Date().toISOString(),
          updated_by: user?.id ?? null,
        })
        .eq("id", settings.id);
      if (error) throw error;

      return { downloadValue, directValue };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["site-settings-admin-pwa"] });
      queryClient.invalidateQueries({ queryKey: ["site-settings-android-apk"] });
      toast({
        title: "Link atualizado",
        description: "Os links do APK foram atualizados.",
      });
    },
    onError: (err: any) => {
      toast({
        title: "Erro ao salvar link",
        description: err?.message || "Não foi possível salvar o link.",
        variant: "destructive",
      });
    },
  });

  return (
    <div className="w-full min-w-0 p-4 md:p-6 space-y-6">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold">App (PWA)</h1>
        <p className="text-sm text-muted-foreground">
          Seu site já está configurado como um app instalável (PWA). Aqui ficam as
          orientações para instalação e os arquivos usados.
        </p>
      </header>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Como instalar</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <p className="text-sm font-medium">Android (Chrome)</p>
              <p className="text-sm text-muted-foreground">
                Abra o site → menu ⋮ → <span className="font-medium">Instalar app</span> /{" "}
                <span className="font-medium">Adicionar à tela inicial</span>.
              </p>
            </div>
            <Separator />
            <div className="space-y-2">
              <p className="text-sm font-medium">iPhone (Safari)</p>
              <p className="text-sm text-muted-foreground">
                Abra o site → Compartilhar → <span className="font-medium">Adicionar à Tela de Início</span>.
              </p>
            </div>
            <Separator />
            <div className="space-y-2">
              <p className="text-sm font-medium">Desktop (Chrome/Edge)</p>
              <p className="text-sm text-muted-foreground">
                Ícone de instalação na barra de endereço ou menu ⋮ →{" "}
                <span className="font-medium">Instalar</span>.
              </p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Arquivos do App</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="text-sm">
              <p className="text-muted-foreground">Ícone 512px</p>
              <p className="font-mono">/pwa-512.png</p>
            </div>
            <div className="text-sm">
              <p className="text-muted-foreground">Ícone vetorial</p>
              <p className="font-mono">/pwa-icon.svg</p>
            </div>
            <div className="text-sm">
              <p className="text-muted-foreground">Configuração do PWA</p>
              <p className="font-mono">vite.config.ts</p>
            </div>
            <Separator />
            <p className="text-sm text-muted-foreground">
              Notificações push ficam desativadas por enquanto (como você pediu).
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>App Android (APK)</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">
                Envie o arquivo <span className="font-medium">.apk</span> para que o botão “App” da loja abra a página
                de download.
              </p>
              <p className="text-xs text-muted-foreground">
                Observação: para o aviso do Android mostrar o <span className="font-medium">domínio do seu site</span>,
                o arquivo precisa estar hospedado no seu próprio domínio (ex.: em <span className="font-mono">public/app-downloads</span>)
                e o link deve ser um caminho relativo.
              </p>
            </div>

            <div className="grid gap-3">
              <div className="grid gap-2">
                <Label>Links dos botões (recomendado: no seu domínio)</Label>

                <div className="grid gap-2">
                  <div className="grid gap-1">
                    <Label htmlFor="apk-download-url" className="text-xs text-muted-foreground">
                      Botão “Baixar APK (Android)”
                    </Label>
                    <Input
                      id="apk-download-url"
                      value={apkDownloadUrlInput}
                      onChange={(e) => setApkDownloadUrlInput(e.target.value)}
                      placeholder={"/app-downloads/agencia-recife-latest.apk"}
                    />
                  </div>

                  <div className="grid gap-1">
                    <Label htmlFor="apk-direct-url" className="text-xs text-muted-foreground">
                      Botão “Link direto”
                    </Label>
                    <Input
                      id="apk-direct-url"
                      value={apkDirectUrlInput}
                      onChange={(e) => setApkDirectUrlInput(e.target.value)}
                      placeholder={"/app-downloads/agencia-recife-latest.apk"}
                    />
                  </div>

                  <div className="flex flex-col sm:flex-row gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => saveApkLinksMutation.mutate()}
                      disabled={!canUpload || saveApkLinksMutation.isPending}
                      className="gap-2"
                    >
                      {saveApkLinksMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                      Salvar links
                    </Button>
                    <div className="text-xs text-muted-foreground sm:self-center">
                      Dica: use <span className="font-mono">/app-downloads/agencia-recife-latest.apk</span>.
                    </div>
                  </div>
                </div>
              </div>
              <Separator />
            </div>

            <div className="grid gap-4">
              <div className="grid gap-2">
                <Label htmlFor="apk-version">Versão (opcional)</Label>
                <Input
                  id="apk-version"
                  value={version}
                  onChange={(e) => setVersion(e.target.value)}
                  placeholder={currentVersion || "Ex: 1.0.0"}
                />
              </div>

              <div className="grid gap-2">
                <Label>Arquivo APK</Label>
                <input
                  ref={fileRef}
                  type="file"
                  accept=".apk"
                  className="hidden"
                  onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                />

                <div className="flex flex-col sm:flex-row gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => fileRef.current?.click()}
                    className="gap-2"
                  >
                    <Upload className="h-4 w-4" />
                    Selecionar APK
                  </Button>

                  <Button
                    type="button"
                    onClick={() => uploadMutation.mutate()}
                    disabled={!canUpload || !file || uploadMutation.isPending}
                    className="gap-2"
                  >
                    {uploadMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                    {uploadMutation.isPending ? "Enviando..." : "Enviar"}
                  </Button>
                </div>

                <p className="text-xs text-muted-foreground">
                  {file ? `Selecionado: ${file.name}` : "Nenhum arquivo selecionado."}
                </p>
              </div>
            </div>

            <Separator />

            <div className="space-y-2 text-sm">
              <div>
                <p className="text-muted-foreground">Links atuais do APK</p>

                {(currentApkDownloadUrl || currentApkDirectUrl || currentApkUrl) ? (
                  <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                    <div className="flex-1 space-y-2">
                      <div className="text-xs">
                        <span className="text-muted-foreground">Baixar APK: </span>
                        <a
                          href={currentApkDownloadUrl || currentApkUrl || "#"}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="font-mono break-all underline"
                        >
                          {currentApkDownloadUrl || currentApkUrl}
                        </a>
                      </div>
                      <div className="text-xs">
                        <span className="text-muted-foreground">Link direto: </span>
                        <a
                          href={currentApkDirectUrl || currentApkUrl || "#"}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="font-mono break-all underline"
                        >
                          {currentApkDirectUrl || currentApkUrl}
                        </a>
                      </div>
                    </div>

                    <Button asChild size="sm" variant="outline" className="gap-2">
                      <a
                        href={currentApkDownloadUrl || currentApkUrl || "#"}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        <Download className="h-4 w-4" />
                        Testar download
                      </a>
                    </Button>
                  </div>
                ) : (
                  <p className="text-muted-foreground">Ainda não enviado.</p>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default AdminPWA;
