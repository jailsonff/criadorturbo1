import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export type HotspotDraft = {
  id: string;
  title: string | null;
  xPct: number;
  yPct: number;
  wPct: number;
  hPct: number;
  displayOrder: number;
  isActive: boolean;
  actionType: "open_package" | "open_url" | string;
  packageId: string | null;
  targetUrl: string | null;
  // UI only
  isSelected?: boolean;
};

type DragMode =
  | { type: "none" }
  | { type: "draw"; startXPct: number; startYPct: number; id: string }
  | { type: "move"; id: string; grabDxPct: number; grabDyPct: number }
  | { type: "resize"; id: string; corner: "nw" | "ne" | "sw" | "se" };

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function ensureMinBox(box: { xPct: number; yPct: number; wPct: number; hPct: number }) {
  const min = 1; // 1% min size
  return {
    ...box,
    wPct: Math.max(min, box.wPct),
    hPct: Math.max(min, box.hPct),
  };
}

function getPctFromPointer(evt: PointerEvent | React.PointerEvent, el: HTMLElement) {
  const r = el.getBoundingClientRect();
  const x = (("clientX" in evt ? evt.clientX : 0) - r.left) / r.width;
  const y = (("clientY" in evt ? evt.clientY : 0) - r.top) / r.height;
  return {
    xPct: clamp(x * 100, 0, 100),
    yPct: clamp(y * 100, 0, 100),
  };
}

export function HotspotImageEditor({
  imageUrl,
  value,
  onChange,
}: {
  imageUrl: string;
  value: HotspotDraft[];
  onChange: (next: HotspotDraft[]) => void;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [drag, setDrag] = useState<DragMode>({ type: "none" });

  const selectedId = useMemo(() => value.find((h) => h.isSelected)?.id ?? null, [value]);

  const setSelected = (id: string | null) => {
    onChange(value.map((h) => ({ ...h, isSelected: id ? h.id === id : false })));
  };

  const updateHotspot = (id: string, patch: Partial<HotspotDraft>) => {
    onChange(value.map((h) => (h.id === id ? { ...h, ...patch } : h)));
  };

  // End drag on window pointerup (safety)
  useEffect(() => {
    const onUp = () => setDrag({ type: "none" });
    window.addEventListener("pointerup", onUp);
    return () => window.removeEventListener("pointerup", onUp);
  }, []);

  const handlePointerDownBackground = (e: React.PointerEvent) => {
    if (!containerRef.current) return;
    if (!imageUrl) return;

    // Start drawing when the user clicks on the image/background.
    // (Don't rely on e.target dataset because the click usually lands on <img>.)
    // Existing hotspots stopPropagation(), so this won't conflict with moving/resizing.
    containerRef.current.setPointerCapture?.(e.pointerId);
    const { xPct, yPct } = getPctFromPointer(e, containerRef.current);
    const id = crypto.randomUUID();
    const next: HotspotDraft[] = [
      ...value.map((h) => ({ ...h, isSelected: false })),
      {
        id,
        title: null,
        xPct,
        yPct,
        wPct: 0.5,
        hPct: 0.5,
        displayOrder: value.length,
        isActive: true,
        actionType: "open_package",
        packageId: null,
        targetUrl: null,
        isSelected: true,
      },
    ];
    onChange(next);
    setDrag({ type: "draw", startXPct: xPct, startYPct: yPct, id });
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!containerRef.current) return;
    if (drag.type === "none") return;
    const { xPct, yPct } = getPctFromPointer(e, containerRef.current);

    if (drag.type === "draw") {
      const x0 = drag.startXPct;
      const y0 = drag.startYPct;
      const left = Math.min(x0, xPct);
      const top = Math.min(y0, yPct);
      const w = Math.abs(xPct - x0);
      const h = Math.abs(yPct - y0);
      updateHotspot(drag.id, ensureMinBox({ xPct: left, yPct: top, wPct: w, hPct: h }));
      return;
    }

    if (drag.type === "move") {
      const hs = value.find((h) => h.id === drag.id);
      if (!hs) return;
      const nextX = clamp(xPct - drag.grabDxPct, 0, 100 - hs.wPct);
      const nextY = clamp(yPct - drag.grabDyPct, 0, 100 - hs.hPct);
      updateHotspot(drag.id, { xPct: nextX, yPct: nextY });
      return;
    }

    if (drag.type === "resize") {
      const hs = value.find((h) => h.id === drag.id);
      if (!hs) return;

      let left = hs.xPct;
      let top = hs.yPct;
      let right = hs.xPct + hs.wPct;
      let bottom = hs.yPct + hs.hPct;

      if (drag.corner.includes("n")) top = yPct;
      if (drag.corner.includes("s")) bottom = yPct;
      if (drag.corner.includes("w")) left = xPct;
      if (drag.corner.includes("e")) right = xPct;

      // normalize
      const x1 = clamp(Math.min(left, right), 0, 100);
      const y1 = clamp(Math.min(top, bottom), 0, 100);
      const x2 = clamp(Math.max(left, right), 0, 100);
      const y2 = clamp(Math.max(top, bottom), 0, 100);

      updateHotspot(drag.id, ensureMinBox({ xPct: x1, yPct: y1, wPct: x2 - x1, hPct: y2 - y1 }));
    }
  };

  const handlePointerDownHotspot = (e: React.PointerEvent, id: string) => {
    e.stopPropagation();
    if (!containerRef.current) return;
    containerRef.current.setPointerCapture?.(e.pointerId);
    const hs = value.find((h) => h.id === id);
    if (!hs) return;
    setSelected(id);
    const { xPct, yPct } = getPctFromPointer(e, containerRef.current);
    setDrag({ type: "move", id, grabDxPct: xPct - hs.xPct, grabDyPct: yPct - hs.yPct });
  };

  const handlePointerDownHandle = (e: React.PointerEvent, id: string, corner: "nw" | "ne" | "sw" | "se") => {
    e.stopPropagation();
    containerRef.current?.setPointerCapture?.(e.pointerId);
    setSelected(id);
    setDrag({ type: "resize", id, corner });
  };

  const hasImage = Boolean(String(imageUrl || "").trim());

  return (
    <Card className="p-3">
      {!hasImage ? (
        <div className="text-sm text-muted-foreground">Informe a imagem acima para começar a desenhar os botões.</div>
      ) : (
        <div className="space-y-2">
          <div className="text-xs text-muted-foreground">
            Clique e arraste na imagem para criar um hotspot. Clique em um hotspot para mover/redimensionar.
          </div>

          <div
            ref={containerRef}
            className="relative w-full overflow-hidden rounded-lg border border-border bg-muted"
            style={{ touchAction: "none" }}
            onPointerDown={handlePointerDownBackground}
            onPointerMove={handlePointerMove}
            onPointerUp={() => setDrag({ type: "none" })}
          >
            <div className="relative w-full">
              <img
                src={imageUrl}
                alt="Imagem do popup"
                className="block w-full h-auto select-none"
                loading="lazy"
              />

              {/* overlays */}
              <div className="absolute inset-0">
                {value.map((h) => (
                  <div
                    key={h.id}
                    className={cn(
                      "absolute rounded-md border transition-colors",
                      h.isSelected
                        ? "border-primary bg-primary/10"
                        : "border-primary/40 bg-primary/5",
                      !h.isActive && "opacity-40"
                    )}
                    style={{
                      left: `${h.xPct}%`,
                      top: `${h.yPct}%`,
                      width: `${h.wPct}%`,
                      height: `${h.hPct}%`,
                    }}
                    onPointerDown={(e) => handlePointerDownHotspot(e, h.id)}
                    role="button"
                    aria-label={h.title ? `Hotspot: ${h.title}` : "Hotspot"}
                  >
                    {h.isSelected && (
                      <>
                        {([
                          ["nw", "-left-1 -top-1"],
                          ["ne", "-right-1 -top-1"],
                          ["sw", "-left-1 -bottom-1"],
                          ["se", "-right-1 -bottom-1"],
                        ] as const).map(([corner, cls]) => (
                          <span
                            key={corner}
                            className={cn(
                              "absolute h-3 w-3 rounded-sm bg-primary border border-background",
                              cls
                            )}
                            onPointerDown={(e) => handlePointerDownHandle(e, h.id, corner)}
                          />
                        ))}
                      </>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setSelected(null)}
              disabled={!selectedId}
            >
              Desselecionar
            </Button>
            <div className="text-xs text-muted-foreground">{value.length} hotspots</div>
          </div>
        </div>
      )}
    </Card>
  );
}
