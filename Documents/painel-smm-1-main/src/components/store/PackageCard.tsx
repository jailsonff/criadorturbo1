import { Package, ShoppingCart, Flame } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatCurrency } from "@/lib/utils";

interface StorePackage {
  id: string;
  name: string;
  description: string | null;
  cover_image_url: string | null;
  service_id: number;
  base_quantity: number;
  base_price: number;
  price_per_thousand: number;
  allow_custom_quantity: boolean;
  min_quantity: number;
  max_quantity: number;
  sales_count: number;
  badge_text: string | null;
}

interface PackageCardProps {
  package: StorePackage;
  onBuy: () => void;
}

export function PackageCard({ package: pkg, onBuy }: PackageCardProps) {
  const packageType = (pkg as any).package_type as string | undefined;
  const isCombo =
    typeof packageType === "string" && packageType.toLowerCase().includes("combo");

  

  const comboLines = (() => {
    if (!isCombo) return [] as string[];

    const comboItems = (pkg as any).combo_items as
      | Array<{ quantity?: number; link_label?: string }>
      | null
      | undefined;

    // Preferimos usar combo_items (fonte real do COMBO) e só cair no description como fallback.
    const fromItems = Array.isArray(comboItems)
      ? comboItems
          .map((it) => {
            const qty = Number(it.quantity) || 0;
            const label = String(it.link_label || "").trim();
            if (!qty || !label) return "";
            return `${qty} ${label}`.trim();
          })
          .filter(Boolean)
      : [];

    return fromItems.length
      ? fromItems
      : (pkg.description ?? "")
          .split(/\r?\n/)
          .map((l) => l.trim())
          .filter(Boolean);
  })();
  return (
    <div className="group relative bg-card border border-border rounded-xl overflow-hidden hover:border-primary/50 transition-all duration-300 hover:shadow-lg hover:shadow-primary/10 flex flex-col h-full">
      {/* Badge */}
      {pkg.badge_text && (
        <div className="absolute top-2 right-2 z-10">
          <Badge variant="destructive" className="text-xs px-2 py-0.5">
            {pkg.badge_text}
          </Badge>
        </div>
      )}

      {/* Combo title strip (above cover) */}
      {isCombo && (
        <div className="px-3 pt-3">
          <div className="w-full rounded-lg bg-muted/20 border border-border px-3 py-2 text-center">
            <span className="text-xs font-extrabold tracking-widest text-primary uppercase">
              {String(pkg.name || "COMBO")}
            </span>
          </div>
        </div>
      )}

      {/* Cover Image */}
      <div className={"aspect-square relative overflow-hidden bg-gradient-to-br from-primary/20 to-primary/5 " + (isCombo ? "mt-3" : "")}> 

        {pkg.cover_image_url ? (
          <img
            src={pkg.cover_image_url}
            alt={pkg.name}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
            loading="lazy"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <Package className="w-12 h-12 text-primary/50" />
          </div>
        )}

        {/* Delivery Badge */}
        <div className="absolute bottom-2 left-2">
          <div className="flex items-center gap-1 px-2 py-1 rounded bg-background/70 backdrop-blur-sm border border-border">
            <Flame className="w-3 h-3 text-primary" />
            <span className="text-[10px] text-foreground font-medium">
              ENTREGA IMEDIATA
            </span>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="p-3 flex-1 flex flex-col gap-2">
        {/* Price */}
        <div className="space-y-1">
          <div className="flex items-baseline gap-1">
            <span className="text-lg md:text-xl font-bold text-primary">
              {formatCurrency(pkg.base_price)}
            </span>
          </div>
          <p className="text-[10px] text-muted-foreground flex items-center gap-1">
            <span className="text-primary">◆</span> À vista no PIX
          </p>
        </div>

        {/* COMBO info (from combo_items / description) */}
        {isCombo && (
          <div className="rounded-md border border-border overflow-hidden bg-muted/20">
            {comboLines.length ? (
              comboLines.map((line, idx) => (
                <div
                  key={`${pkg.id}-combo-line-${idx}`}
                  className={
                    "px-2 py-1 text-xs font-medium text-center " +
                    (idx > 0 ? "border-t border-border" : "")
                  }
                >
                  {line}
                </div>
              ))
            ) : (
              <div className="px-2 py-1 text-xs font-medium text-center opacity-60">
                Itens do combo não configurados
              </div>
            )}
          </div>
        )}

        {!isCombo && (
          <h3 className="font-semibold text-sm text-center line-clamp-2 min-h-[2.5rem]">
            {pkg.name}
          </h3>
        )}

        <div className="mt-auto space-y-2">
          {/* Buy Button */}
          <Button onClick={onBuy} className="w-full gap-2 text-sm" size="sm">
            <ShoppingCart className="w-4 h-4" />
            COMPRAR
          </Button>

          {/* Sales Count */}
          <div className="flex items-center justify-center gap-1 min-h-[1.25rem]">
            {pkg.sales_count > 0 ? (
              <>
                <span className="text-xs text-muted-foreground">
                  +{pkg.sales_count} Vendidos
                </span>
                <Flame className="w-3 h-3 text-primary" />
              </>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}

