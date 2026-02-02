import { ExternalLink } from "lucide-react";

export type StoreBanner = {
  id: string;
  title: string | null;
  image_url: string;
  target_url: string | null;
  package_id: string | null;
};

function normalizeExternalUrl(input: string): string {
  const raw = String(input || "").trim();
  if (!raw) return "";
  if (/^https?:\/\//i.test(raw)) return raw;
  return `https://${raw}`;
}

export function StoreBannerGrid({
  banners,
  onOpenPackage,
}: {
  banners: StoreBanner[];
  onOpenPackage: (packageId: string) => void;
}) {
  if (!banners.length) return null;

  return (
    <div className="w-full">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {banners.map((b) => {
          const hasPackage = Boolean(b.package_id);
          const hasUrl = Boolean(String(b.target_url || "").trim());

          return (
            <button
              key={b.id}
              type="button"
              onClick={() => {
                if (hasPackage && b.package_id) {
                  onOpenPackage(b.package_id);
                  return;
                }
                if (hasUrl) {
                  const url = normalizeExternalUrl(b.target_url || "");
                  if (url) window.open(url, "_blank", "noopener,noreferrer");
                }
              }}
              className="group relative w-full overflow-hidden rounded-xl border border-border bg-card hover:border-primary/50 transition-colors"
              aria-label={
                hasPackage
                  ? `Abrir pacote do banner${b.title ? `: ${b.title}` : ""}`
                  : `Abrir link do banner${b.title ? `: ${b.title}` : ""}`
              }
            >
              <div className="relative w-full aspect-[16/7] bg-muted">
                <img
                  src={b.image_url}
                  alt={b.title ? b.title : "Banner promocional"}
                  className="absolute inset-0 h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.02]"
                  loading="lazy"
                />

                {/* subtle overlay */}
                <div className="absolute inset-0 bg-gradient-to-t from-background/40 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />

                {(b.title || !hasPackage) && (
                  <div className="absolute bottom-3 left-3 right-3 flex items-end justify-between gap-3">
                    {b.title ? (
                      <div className="text-left">
                        <div className="inline-flex rounded-md bg-background/70 backdrop-blur px-3 py-2 border border-border">
                          <span className="text-sm font-semibold text-foreground leading-tight line-clamp-2">
                            {b.title}
                          </span>
                        </div>
                      </div>
                    ) : (
                      <span />
                    )}

                    {!hasPackage && (
                      <span className="inline-flex items-center gap-1 rounded-md bg-background/70 backdrop-blur px-2.5 py-2 border border-border text-xs text-foreground">
                        <ExternalLink className="h-4 w-4" />
                        Link
                      </span>
                    )}
                  </div>
                )}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
