import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getSupabaseClient } from "@/lib/supabaseClient";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { HotspotImageEditor, type HotspotDraft } from "@/components/store/HotspotImageEditor";

type StoreFrontend = {
  id: string;
  name: string;
  slug: string;
};

type StorePopupRow = {
  id: string;
  frontend_id: string | null;
  name: string;
  image_url: string;
  is_active: boolean;
  starts_at: string | null;
  ends_at: string | null;
  timezone: string;
  trigger_type: "on_load" | "after_delay" | string;
  delay_ms: number;
  frequency: "always" | "once_per_visitor" | "once_per_day" | string;
  dismiss_ttl_hours: number;
  priority: number;
  created_at: string;
  updated_at: string;
};

type StorePackageOption = {
  id: string;
  name: string;
  package_type: string;
};

function toLocalDateTimeInput(value: string | null | undefined): string {
  if (!value) return "";
  // input expects "YYYY-MM-DDTHH:mm"
  const d = new Date(value);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function toTimestamptzFromLocalInput(value: string): string | null {
  const raw = String(value || "").trim();
  if (!raw) return null;
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

export default function AdminStorePopups() {
  const supabase = getSupabaseClient();
  const qc = useQueryClient();
  const { toast } = useToast();

  const [selectedFrontendId, setSelectedFrontendId] = useState<string | "">("");
  const [editingPopupId, setEditingPopupId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const { data: frontends = [] } = useQuery({
    queryKey: ["store-frontends-admin"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("store_frontends")
        .select("id, name, slug")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as StoreFrontend[];
    },
  });

  useEffect(() => {
    if (!selectedFrontendId && frontends.length) setSelectedFrontendId(frontends[0].id);
  }, [frontends, selectedFrontendId]);

  const { data: packages = [] } = useQuery({
    queryKey: ["store-packages-options", selectedFrontendId],
    queryFn: async () => {
      if (!selectedFrontendId) return [];
      const { data, error } = await supabase
        .from("store_packages")
        .select("id, name, package_type")
        .eq("frontend_id", selectedFrontendId)
        .order("display_order", { ascending: true });
      if (error) throw error;
      return (data ?? []) as StorePackageOption[];
    },
    enabled: !!selectedFrontendId,
  });

  const { data: popups = [], isLoading: loadingPopups } = useQuery({
    queryKey: ["store-popups", selectedFrontendId],
    queryFn: async () => {
      if (!selectedFrontendId) return [];
      const { data, error } = await supabase
        .from("store_popups")
        .select("*")
        .eq("frontend_id", selectedFrontendId)
        .order("priority", { ascending: false })
        .order("updated_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as StorePopupRow[];
    },
    enabled: !!selectedFrontendId,
  });

  const editingPopup = useMemo(
    () => popups.find((p) => p.id === editingPopupId) ?? null,
    [popups, editingPopupId]
  );

  const [form, setForm] = useState<Omit<StorePopupRow, "id" | "created_at" | "updated_at">>({
    frontend_id: null,
    name: "Popup",
    image_url: "",
    is_active: true,
    starts_at: null,
    ends_at: null,
    timezone: "America/Sao_Paulo",
    trigger_type: "on_load",
    delay_ms: 0,
    frequency: "once_per_visitor",
    dismiss_ttl_hours: 720,
    priority: 0,
  });
  const [hotspots, setHotspots] = useState<HotspotDraft[]>([]);
  const [originalHotspotIds, setOriginalHotspotIds] = useState<string[]>([]);
  const [busyUpload, setBusyUpload] = useState(false);

  const { data: editingHotspots = [] } = useQuery({
    queryKey: ["store-popup-hotspots", editingPopupId],
    queryFn: async () => {
      if (!editingPopupId) return [];
      const { data, error } = await supabase
        .from("store_popup_hotspots")
        .select("*")
        .eq("popup_id", editingPopupId)
        .order("display_order", { ascending: true });
      if (error) throw error;
      return (data ?? []) as any[];
    },
    enabled: !!editingPopupId,
  });

  useEffect(() => {
    if (!editingPopupId || !editingPopup) return;
    setForm({
      frontend_id: editingPopup.frontend_id,
      name: editingPopup.name,
      image_url: editingPopup.image_url,
      is_active: editingPopup.is_active,
      starts_at: editingPopup.starts_at,
      ends_at: editingPopup.ends_at,
      timezone: editingPopup.timezone,
      trigger_type: editingPopup.trigger_type,
      delay_ms: editingPopup.delay_ms,
      frequency: editingPopup.frequency,
      dismiss_ttl_hours: editingPopup.dismiss_ttl_hours,
      priority: editingPopup.priority,
    });
  }, [editingPopupId, editingPopup]);

  useEffect(() => {
    if (!editingPopupId) return;
    const mapped: HotspotDraft[] = (editingHotspots ?? []).map((h: any) => ({
      id: String(h.id),
      title: h.title ?? null,
      xPct: Number(h.x_pct) || 0,
      yPct: Number(h.y_pct) || 0,
      wPct: Number(h.w_pct) || 10,
      hPct: Number(h.h_pct) || 10,
      isActive: Boolean(h.is_active),
      displayOrder: Number(h.display_order) || 0,
      actionType: String(h.action_type || "open_package") as any,
      packageId: h.package_id ? String(h.package_id) : null,
      targetUrl: h.target_url ? String(h.target_url) : null,
    }));
    setHotspots(mapped);
    setOriginalHotspotIds(mapped.map((m) => m.id));
  }, [editingPopupId, editingHotspots]);

  const resetNew = () => {
    setEditingPopupId(null);
    setForm({
      frontend_id: selectedFrontendId || null,
      name: "Popup",
      image_url: "",
      is_active: true,
      starts_at: null,
      ends_at: null,
      timezone: "America/Sao_Paulo",
      trigger_type: "on_load",
      delay_ms: 0,
      frequency: "once_per_visitor",
      dismiss_ttl_hours: 720,
      priority: 0,
    });
    setHotspots([]);
    setOriginalHotspotIds([]);
  };

  const uploadImage = async (file: File) => {
    setBusyUpload(true);
    try {
      const path = `store-popups/${Date.now()}-${file.name}`;
      const { error } = await supabase.storage.from("site-assets").upload(path, file, {
        upsert: true,
        cacheControl: "3600",
        contentType: file.type || "image/*",
      });
      if (error) throw error;
      const { data } = supabase.storage.from("site-assets").getPublicUrl(path);
      const url = data?.publicUrl || "";
      setForm((p) => ({ ...p, image_url: url }));
      toast({ title: "Imagem enviada", description: "Imagem salva e pronta para usar no popup." });
    } catch (e: any) {
      toast({ title: "Erro ao enviar imagem", description: e?.message || String(e), variant: "destructive" });
    } finally {
      setBusyUpload(false);
    }
  };

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!selectedFrontendId) throw new Error("Selecione um frontend da loja.");
      if (!String(form.image_url || "").trim()) throw new Error("Informe a imagem do popup.");

      const payload = {
        id: editingPopupId ?? undefined,
        frontend_id: selectedFrontendId,
        name: String(form.name || "Popup").trim(),
        image_url: String(form.image_url).trim(),
        is_active: Boolean(form.is_active),
        starts_at: form.starts_at,
        ends_at: form.ends_at,
        timezone: String(form.timezone || "America/Sao_Paulo"),
        trigger_type: String(form.trigger_type || "on_load"),
        delay_ms: Math.max(0, Number(form.delay_ms) || 0),
        frequency: String(form.frequency || "once_per_visitor"),
        dismiss_ttl_hours: Math.max(1, Number(form.dismiss_ttl_hours) || 1),
        priority: Number(form.priority) || 0,
      };

      const { data: saved, error } = await supabase
        .from("store_popups")
        .upsert(payload)
        .select("*")
        .single();
      if (error) throw error;
      const popupId = String((saved as any).id);

      // delete removed hotspots
      const currentIds = new Set(hotspots.map((h) => h.id));
      const removed = originalHotspotIds.filter((id) => !currentIds.has(id));
      if (removed.length) {
        const { error: delErr } = await supabase
          .from("store_popup_hotspots")
          .delete()
          .in("id", removed);
        if (delErr) throw delErr;
      }

      // upsert existing/new
      const rows = hotspots
        .slice()
        .sort((a, b) => (a.displayOrder ?? 0) - (b.displayOrder ?? 0))
        .map((h, idx) => ({
          id: h.id,
          popup_id: popupId,
          title: h.title,
          x_pct: h.xPct,
          y_pct: h.yPct,
          w_pct: h.wPct,
          h_pct: h.hPct,
          is_active: h.isActive,
          display_order: idx,
          action_type: h.actionType,
          package_id: h.actionType === "open_package" ? h.packageId : null,
          target_url: h.actionType === "open_url" ? h.targetUrl : null,
        }));

      if (rows.length) {
        const { error: hsErr } = await supabase.from("store_popup_hotspots").upsert(rows);
        if (hsErr) throw hsErr;
      }

      return popupId;
    },
    onSuccess: async (popupId) => {
      await qc.invalidateQueries({ queryKey: ["store-popups", selectedFrontendId] });
      await qc.invalidateQueries({ queryKey: ["store-popup-hotspots", popupId] });
      setEditingPopupId(popupId);
      toast({ title: "Popup salvo", description: "O popup e os botões da imagem foram salvos." });
    },
    onError: (e: any) => {
      toast({ title: "Erro", description: e?.message || String(e), variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("store_popups").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["store-popups", selectedFrontendId] });
      resetNew();
      toast({ title: "Popup removido" });
    },
    onError: (e: any) => toast({ title: "Erro", description: e?.message || String(e), variant: "destructive" }),
  });

  const selectedFrontend = useMemo(
    () => frontends.find((f) => f.id === selectedFrontendId) ?? null,
    [frontends, selectedFrontendId]
  );

  return (
    <div className="p-4 md:p-6 space-y-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Loja: Popups</h1>
          <p className="text-sm text-muted-foreground">
            Crie um popup com imagem e desenhe áreas clicáveis para abrir pacotes/combos.
          </p>
        </div>

        <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
          <div className="min-w-[260px]">
            <Label>Frontend</Label>
            <Select value={selectedFrontendId} onValueChange={setSelectedFrontendId}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione" />
              </SelectTrigger>
              <SelectContent>
                {frontends.map((f) => (
                  <SelectItem key={f.id} value={f.id}>
                    {f.name} ({f.slug})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <Button onClick={resetNew} variant="secondary">
            Novo Popup
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <Card className="xl:col-span-1">
          <CardHeader>
            <CardTitle>Popups cadastrados</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {loadingPopups ? (
              <p className="text-sm text-muted-foreground">Carregando…</p>
            ) : popups.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhum popup criado para este frontend.</p>
            ) : (
              <div className="space-y-2">
                {popups.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => setEditingPopupId(p.id)}
                    className={
                      "w-full text-left rounded-lg border border-border px-3 py-2 hover:border-primary/50 transition-colors " +
                      (p.id === editingPopupId ? "bg-primary/10" : "bg-card")
                    }
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <div className="font-semibold text-sm text-foreground truncate">{p.name}</div>
                        <div className="text-xs text-muted-foreground truncate">
                          {p.is_active ? "Ativo" : "Inativo"} • Prioridade {p.priority}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            deleteMutation.mutate(p.id);
                          }}
                        >
                          Remover
                        </Button>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="xl:col-span-2">
          <CardHeader>
            <CardTitle>{editingPopupId ? "Editar popup" : "Criar popup"}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Nome</Label>
                <Input
                  value={form.name}
                  onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
                  placeholder="Ex.: Promo Janeiro"
                />
              </div>

              <div className="flex items-end justify-between gap-3">
                <div className="flex items-center gap-3">
                  <Switch
                    checked={form.is_active}
                    onCheckedChange={(v) => setForm((p) => ({ ...p, is_active: v }))}
                  />
                  <div>
                    <div className="text-sm font-medium">Ativo</div>
                    <div className="text-xs text-muted-foreground">Se desativar, não aparece na loja.</div>
                  </div>
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Imagem do popup (URL)</Label>
              <div className="flex flex-col md:flex-row gap-2">
                <Input
                  value={form.image_url}
                  onChange={(e) => setForm((p) => ({ ...p, image_url: e.target.value }))}
                  placeholder="https://..."
                />
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) uploadImage(f);
                  }}
                />
                <Button
                  type="button"
                  variant="secondary"
                  disabled={busyUpload}
                  onClick={() => fileInputRef.current?.click()}
                >
                  {busyUpload ? "Enviando…" : "Enviar imagem"}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Dica: use uma imagem bem grande (ex.: 1200px+) para ficar nítida no celular.
              </p>
            </div>

            <Separator />

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label>Início</Label>
                <Input
                  type="datetime-local"
                  value={toLocalDateTimeInput(form.starts_at)}
                  onChange={(e) => setForm((p) => ({ ...p, starts_at: toTimestamptzFromLocalInput(e.target.value) }))}
                />
              </div>
              <div className="space-y-2">
                <Label>Fim</Label>
                <Input
                  type="datetime-local"
                  value={toLocalDateTimeInput(form.ends_at)}
                  onChange={(e) => setForm((p) => ({ ...p, ends_at: toTimestamptzFromLocalInput(e.target.value) }))}
                />
              </div>
              <div className="space-y-2">
                <Label>Fuso (timezone)</Label>
                <Input
                  value={form.timezone}
                  onChange={(e) => setForm((p) => ({ ...p, timezone: e.target.value }))}
                  placeholder="America/Sao_Paulo"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="space-y-2">
                <Label>Disparo</Label>
                <Select value={form.trigger_type} onValueChange={(v) => setForm((p) => ({ ...p, trigger_type: v }))}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="on_load">Ao carregar</SelectItem>
                    <SelectItem value="after_delay">Após delay</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Delay (ms)</Label>
                <Input
                  type="number"
                  value={form.delay_ms}
                  onChange={(e) => setForm((p) => ({ ...p, delay_ms: Number(e.target.value) }))}
                  disabled={form.trigger_type !== "after_delay"}
                />
              </div>
              <div className="space-y-2">
                <Label>Frequência</Label>
                <Select value={form.frequency} onValueChange={(v) => setForm((p) => ({ ...p, frequency: v }))}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="always">Sempre</SelectItem>
                    <SelectItem value="once_per_visitor">1x por visitante</SelectItem>
                    <SelectItem value="once_per_day">1x por dia</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>TTL do “fechado” (horas)</Label>
                <Input
                  type="number"
                  value={form.dismiss_ttl_hours}
                  onChange={(e) => setForm((p) => ({ ...p, dismiss_ttl_hours: Number(e.target.value) }))}
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Prioridade</Label>
                <Input
                  type="number"
                  value={form.priority}
                  onChange={(e) => setForm((p) => ({ ...p, priority: Number(e.target.value) }))}
                />
              </div>
              <div className="flex items-end justify-end gap-2">
                <Button
                  onClick={() => saveMutation.mutate()}
                  disabled={saveMutation.isPending || !selectedFrontendId}
                >
                  {saveMutation.isPending ? "Salvando…" : "Salvar"}
                </Button>
              </div>
            </div>

            <Separator />

            <div className="space-y-3">
              <div>
                <div className="text-base font-semibold">Botões (Hotspots) da imagem</div>
                <div className="text-xs text-muted-foreground">
                  Arraste na imagem para criar um retângulo exatamente em cima do botão “COMPRE AGORA”. Depois selecione o
                  pacote/combo.
                </div>
              </div>

              <HotspotImageEditor
                imageUrl={form.image_url}
                value={hotspots}
                onChange={setHotspots}
              />

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Configurar hotspot selecionado</Label>
                  <div className="text-xs text-muted-foreground">
                    Clique em um retângulo para selecionar e configurar.
                  </div>
                </div>

                <HotspotConfigPanel
                  hotspots={hotspots}
                  onChange={setHotspots}
                  packages={packages}
                />
              </div>

              <div className="flex items-center justify-between">
                <div className="text-xs text-muted-foreground">
                  Frontend atual: {selectedFrontend ? `${selectedFrontend.name} (${selectedFrontend.slug})` : "—"}
                </div>
                <Button
                  variant="outline"
                  onClick={() => {
                    setHotspots([]);
                  }}
                >
                  Limpar hotspots
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function HotspotConfigPanel({
  hotspots,
  onChange,
  packages,
}: {
  hotspots: HotspotDraft[];
  onChange: (next: HotspotDraft[]) => void;
  packages: StorePackageOption[];
}) {
  const selected = hotspots.find((h) => h.isSelected);

  if (!selected) {
    return (
      <Card>
        <CardContent className="p-4">
          <p className="text-sm text-muted-foreground">Nenhum hotspot selecionado.</p>
        </CardContent>
      </Card>
    );
  }

  const update = (patch: Partial<HotspotDraft>) => {
    onChange(hotspots.map((h) => (h.id === selected.id ? { ...h, ...patch } : h)));
  };

  return (
    <Card>
      <CardContent className="p-4 space-y-3">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="space-y-2">
            <Label>Título (opcional)</Label>
            <Input
              value={selected.title ?? ""}
              onChange={(e) => update({ title: e.target.value })}
              placeholder="Ex.: Compre Agora"
            />
          </div>
          <div className="flex items-end justify-between gap-3">
            <div className="flex items-center gap-3">
              <Switch checked={selected.isActive} onCheckedChange={(v) => update({ isActive: v })} />
              <div>
                <div className="text-sm font-medium">Ativo</div>
                <div className="text-xs text-muted-foreground">Se desligar, não clica.</div>
              </div>
            </div>
            <Button
              variant="destructive"
              onClick={() => onChange(hotspots.filter((h) => h.id !== selected.id))}
            >
              Remover
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="space-y-2">
            <Label>Ação</Label>
            <Select
              value={selected.actionType}
              onValueChange={(v) => update({ actionType: v as any })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="open_package">Abrir pacote/combo</SelectItem>
                <SelectItem value="open_url">Abrir link</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {selected.actionType === "open_package" ? (
            <div className="space-y-2">
              <Label>Pacote/Combo</Label>
              <Select
                value={selected.packageId ?? ""}
                onValueChange={(v) => update({ packageId: v })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione" />
                </SelectTrigger>
                <SelectContent>
                  {packages.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name} ({p.package_type})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : (
            <div className="space-y-2">
              <Label>URL</Label>
              <Input
                value={selected.targetUrl ?? ""}
                onChange={(e) => update({ targetUrl: e.target.value })}
                placeholder="https://..."
              />
            </div>
          )}
        </div>

        <div className="text-xs text-muted-foreground">
          Posição: x {selected.xPct.toFixed(2)}% • y {selected.yPct.toFixed(2)}% • w {selected.wPct.toFixed(2)}% • h {selected.hPct.toFixed(2)}%
        </div>
      </CardContent>
    </Card>
  );
}
