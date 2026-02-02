import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { getSupabaseClient } from "@/lib/supabaseClient";
import { safeGetItem, safeSetItem } from "@/lib/safeStorage";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type StorePopup = {
  id: string;
  frontend_id: string | null;
  name: string;
  image_url: string;
  is_active: boolean;
  starts_at: string | null;
  ends_at: string | null;
  trigger_type: string;
  delay_ms: number;
  frequency: string;
  dismiss_ttl_hours: number;
  priority: number;
};

type StorePopupHotspot = {
  id: string;
  popup_id: string;
  title: string | null;
  x_pct: number;
  y_pct: number;
  w_pct: number;
  h_pct: number;
  action_type: string;
  package_id: string | null;
  target_url: string | null;
  display_order: number;
  is_active: boolean;
};

function normalizeExternalUrl(input: string): string {
  const raw = String(input || "").trim();
  if (!raw) return "";
  if (/^https?:\/\//i.test(raw)) return raw;
  return `https://${raw}`;
}

function getDismissKey(popupId: string) {
  return `store_popup_dismiss:${popupId}`;
}

function shouldShowPopup(p: StorePopup): boolean {
  if (p.frequency === "always") return true;
  const key = getDismissKey(p.id);
  const raw = safeGetItem(key);
  if (!raw) return true;
  const nextAllowedAt = Number(raw);
  if (!Number.isFinite(nextAllowedAt)) return true;
  return Date.now() >= nextAllowedAt;
}

function markDismissed(p: StorePopup) {
  if (p.frequency === "always") return;
  const key = getDismissKey(p.id);

  if (p.frequency === "once_per_day") {
    const next = new Date();
    next.setHours(24, 0, 0, 0);
    safeSetItem(key, String(next.getTime()));
    return;
  }

  // once_per_visitor (default)
  const ttl = Math.max(1, Number(p.dismiss_ttl_hours) || 1);
  const nextAllowedAt = Date.now() + ttl * 60 * 60 * 1000;
  safeSetItem(key, String(nextAllowedAt));
}

export function StorePopupModal({
  frontendId,
  onOpenPackage,
}: {
  frontendId: string | null | undefined;
  onOpenPackage: (packageId: string) => void;
}) {
  const supabase = getSupabaseClient();
  const [open, setOpen] = useState(false);
  const [popupToShow, setPopupToShow] = useState<StorePopup | null>(null);

  const { data: popups = [] } = useQuery({
    queryKey: ["store-popups-public", frontendId],
    queryFn: async () => {
      if (!frontendId) return [];
      const { data, error } = await supabase
        .from("store_popups")
        .select("*")
        .eq("frontend_id", frontendId)
        .order("priority", { ascending: false });
      if (error) throw error;
      return (data ?? []) as StorePopup[];
    },
    enabled: !!frontendId,
  });

  const activePopup = useMemo(() => {
    return (popups ?? []).find((p) => shouldShowPopup(p)) ?? null;
  }, [popups]);

  const { data: hotspots = [] } = useQuery({
    queryKey: ["store-popup-hotspots-public", activePopup?.id],
    queryFn: async () => {
      if (!activePopup?.id) return [];
      const { data, error } = await supabase
        .from("store_popup_hotspots")
        .select("*")
        .eq("popup_id", activePopup.id)
        .order("display_order", { ascending: true });
      if (error) throw error;
      return (data ?? []) as StorePopupHotspot[];
    },
    enabled: !!activePopup?.id,
  });

  useEffect(() => {
    if (!activePopup) {
      setOpen(false);
      setPopupToShow(null);
      return;
    }

    const delay = activePopup.trigger_type === "after_delay" ? Math.max(0, activePopup.delay_ms || 0) : 0;
    const t = window.setTimeout(() => {
      setPopupToShow(activePopup);
      setOpen(true);
    }, delay);

    return () => window.clearTimeout(t);
  }, [activePopup]);

  if (!popupToShow || !popupToShow.image_url) return null;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) markDismissed(popupToShow);
        setOpen(next);
      }}
    >
      <DialogContent className="max-w-[min(96vw,900px)] p-0 overflow-hidden">
        <DialogHeader className="sr-only">
          <DialogTitle>{popupToShow.name}</DialogTitle>
        </DialogHeader>

        <div className="relative w-full">
          <img
            src={popupToShow.image_url}
            alt={popupToShow.name}
            className="block w-full h-auto"
          />

          {/* hotspots */}
          <div className="absolute inset-0">
            {hotspots
              .filter((h) => h.is_active)
              .map((h) => (
                <button
                  key={h.id}
                  type="button"
                  className="absolute bg-transparent"
                  style={{
                    left: `${Number(h.x_pct) || 0}%`,
                    top: `${Number(h.y_pct) || 0}%`,
                    width: `${Number(h.w_pct) || 0}%`,
                    height: `${Number(h.h_pct) || 0}%`,
                  }}
                  aria-label={h.title ? h.title : "Abrir"}
                  onClick={() => {
                    if (h.action_type === "open_package" && h.package_id) {
                      onOpenPackage(h.package_id);
                      setOpen(false);
                      return;
                    }
                    if (h.action_type === "open_url" && h.target_url) {
                      const url = normalizeExternalUrl(h.target_url);
                      if (url) window.open(url, "_blank", "noopener,noreferrer");
                      setOpen(false);
                    }
                  }}
                />
              ))}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
