import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { getExternalConfig, getSupabaseClient } from "@/lib/supabaseClient";
import { backendSupabase } from "@/lib/backendClient";
import { useToast } from "@/hooks/use-toast";
import { formatCurrency } from "@/lib/utils";
import {
  checkStoreCustomerExists,
  normalizePhoneDigits,
  storeCustomerLogin,
  storeCustomerSignup,
  validateStoredStoreCustomerSession,
  type StoreCustomerSession,
} from "@/lib/storeCustomerAuth";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import {
  AlertTriangle,
  Package,
  Link as LinkIcon,
  Phone,
  Loader2,
  CheckCircle,
  Copy,
  QrCode,
  Image,
  Video,
  Clapperboard,
  X,
} from "lucide-react";

function serializeUnknownError(err: unknown) {
  try {
    if (err instanceof Error) {
      const anyErr = err as any;
      return {
        name: err.name,
        message: err.message,
        stack: err.stack,
        status: anyErr?.status,
        statusCode: anyErr?.statusCode,
        cause: anyErr?.cause,
        details: anyErr?.details,
        context: anyErr?.context,
      };
    }
    if (typeof err === "object" && err) {
      const anyErr = err as any;
      return {
        name: anyErr?.name,
        message: anyErr?.message,
        status: anyErr?.status,
        statusCode: anyErr?.statusCode,
        details: anyErr?.details,
        ...anyErr,
      };
    }
    return { message: String(err) };
  } catch {
    return { message: "(failed to serialize error)" };
  }
}

async function logCheckoutErrorToBackend(input: {
  checkoutReqId: string;
  mode: "pix" | "credit";
  phoneDigits: string;
  pkgId: string;
  frontendId: string;
  orderId?: string | null;
  message?: string;
  error?: unknown;
}) {
  try {
    const digits = String(input.phoneDigits || "").replace(/\D/g, "");
    const len = digits.length;
    const last4 = len >= 4 ? digits.slice(-4) : "";
    const first2 = len >= 2 ? digits.slice(0, 2) : "";
    const masked = len > 0 ? `${first2}${"*".repeat(Math.max(0, len - (first2 ? 2 : 0) - (last4 ? 4 : 0)))}${last4}` : null;

    await backendSupabase.functions.invoke("store-client-log", {
      body: {
        source: "storefront",
        event_name: "pix_generate_error",
        checkout_req_id: input.checkoutReqId,
        frontend_id: input.frontendId,
        package_id: input.pkgId,
        order_id: input.orderId ?? null,
        mode: input.mode,
        phone_masked: masked,
        phone_last4: last4 || null,
        phone_len: len || null,
        user_agent: typeof navigator !== "undefined" ? navigator.userAgent : null,
        url: typeof window !== "undefined" ? window.location.href : null,
        message: input.message || null,
        error_json: input.error ? serializeUnknownError(input.error) : null,
        retention_days: 7,
      },
    });
  } catch {
    // never block checkout UX on logging
  }
}

interface PredefinedQuantity {
  quantity: number;
  price: number;
  link_fields?: number;
}

type LinkTutorialRule = {
  service: string;
  allowed: string;
};

interface StorePackage {
  id: string;
  name: string;
  description: string | null;
  cover_image_url: string | null;
  // legacy/single
  service_id: number;
  base_quantity: number;
  base_price: number;
  price_per_thousand: number;
  allow_custom_quantity: boolean;
  min_quantity: number;
  max_quantity: number;
  sales_count: number;
  badge_text: string | null;
  predefined_quantities?: PredefinedQuantity[] | null;
  usage_notes?: string | null;
  link_label?: string | null;
  link_tutorial_rules?: LinkTutorialRule[] | null;
  default_link_fields?: number | null;
  // combo
  package_type?: "single" | "combo";
  combo_items?: Array<{
    service_id: number;
    quantity: number;
    links_count: number;
    link_label?: string;
  }> | null;

  // Optional: used to detect TikTok packages by Sessão
  section?: { id: string; name: string; display_order: number; is_active: boolean } | null;
}

interface PurchaseModalProps {
  isOpen: boolean;
  onClose: () => void;
  package: StorePackage;
  frontendId: string;
}

type Step = "phone" | "link" | "payment" | "success";

function normalizeTutorialRules(input: unknown): LinkTutorialRule[] {
  if (!input) return [];
  if (Array.isArray(input)) {
    return input
      .map((r: any) => ({ service: String(r?.service || "").trim(), allowed: String(r?.allowed || "").trim() }))
      .filter((r) => r.service || r.allowed);
  }
  if (typeof input === "string") {
    try {
      const parsed = JSON.parse(input);
      return normalizeTutorialRules(parsed);
    } catch {
      return [];
    }
  }
  return [];
}

function getServiceEmoji(serviceName: string): string {
  const s = String(serviceName || "").toLowerCase();
  if (s.includes("curtid")) return "❤️";
  if (s.includes("visual") || s.includes("views")) return "👀";
  if (s.includes("salva")) return "🔖";
  if (s.includes("compart")) return "📤";
  if (s.includes("repost")) return "🔁";
  if (s.includes("seguidor") || s.includes("follower")) return "👥";
  if (s.includes("story")) return "⏱️";
  if (s.includes("coment")) return "💬";
  return "🔗";
}


export function PurchaseModal({ isOpen, onClose, package: pkg, frontendId }: PurchaseModalProps) {
  const supabase = getSupabaseClient();
  const externalDb = getExternalConfig();

  const { toast } = useToast();
  const [step, setStep] = useState<Step>("phone");
  const [phone, setPhone] = useState("");
  const [pin, setPin] = useState("");
  const [authMode, setAuthMode] = useState<"login" | "signup">("login");
  const [customerExists, setCustomerExists] = useState<boolean | null>(null);
  const [authSession, setAuthSession] = useState<StoreCustomerSession | null>(null);
  const [authBusy, setAuthBusy] = useState(false);
  const isCombo = (pkg.package_type || "single") === "combo";

  type StrictIgRequirement = "reel" | "photo" | "media" | "content" | "profile" | "none";

  const getStrictRequirementFromText = useCallback(
    (textRaw: unknown): StrictIgRequirement => {
      const text = String(textRaw || "").toLowerCase();
      const compact = text.replace(/\s+/g, " ").trim();

      // Stories usam regra própria (username-only)
      if (text.includes("story") || text.includes("stories")) return "none";

      // Seguidores: aceitar SOMENTE perfil/@ (nunca link de post/reel)
      if (text.includes("seguidor") || text.includes("follower") || text.includes("followers")) return "profile";

      const isReelsContext = text.includes("reel") || text.includes("reels");
      const isPhotoContext = text.includes("foto");

      const isReelsViews = (text.includes("visual") || text.includes("views") || text.includes("visualiza")) && isReelsContext;
      const isReelsOnlyPackage = isReelsContext && (text.includes("serve") && text.includes("apenas") && text.includes("reel"));
      const isBareReelsPackage = compact === "reels" || compact === "reel";

      const isPhotoViews = (text.includes("visual") || text.includes("views") || text.includes("visualiza")) && isPhotoContext;
      const isMediaOnly = text.includes("salva") || text.includes("compart");

      const isTarget =
        text.includes("repost") ||
        text.includes("curtid") ||
        isMediaOnly ||
        isReelsViews ||
        isReelsOnlyPackage ||
        isBareReelsPackage ||
        isPhotoViews;

      if (!isTarget) return "none";
      if (isReelsViews || isReelsOnlyPackage || isBareReelsPackage) return "reel";
      if (isPhotoViews) return "photo";
      if (isMediaOnly) return "media";
      return "content";
    },
    [],
  );

  const isTikTokPackage = useMemo(() => {
    const sectionName = String((pkg as any)?.section?.name || "").toLowerCase();
    const name = String(pkg?.name || "").toLowerCase();
    const linkLabel = String((pkg as any)?.link_label || "").toLowerCase();
    return sectionName.includes("tiktok") || name.includes("tiktok") || linkLabel.includes("tiktok");
  }, [pkg]);

  const isInstagramPackage = useMemo(() => {
    const sectionName = String((pkg as any)?.section?.name || "").toLowerCase();
    const name = String(pkg?.name || "").toLowerCase();
    const linkLabel = String((pkg as any)?.link_label || "").toLowerCase();
    const usageNotes = String((pkg as any)?.usage_notes || "").toLowerCase();
    const tutorialText = normalizeTutorialRules((pkg as any).link_tutorial_rules)
      .map((r) => `${r.service} ${r.allowed}`.toLowerCase())
      .join(" ");
    const text = `${sectionName} ${name} ${linkLabel} ${usageNotes} ${tutorialText}`;
    return text.includes("instagram") || text.includes("insta") || text.includes(" ig ");
  }, [pkg]);

  const strictRequirement = useMemo<StrictIgRequirement>(() => {
    if (isTikTokPackage) return "none";
    if (!isInstagramPackage) return "none";
    const text = [
      pkg?.name,
      (pkg as any)?.link_label,
      (pkg as any)?.usage_notes,
      normalizeTutorialRules((pkg as any).link_tutorial_rules)
        .map((r) => `${r.service} ${r.allowed}`)
        .join(" "),
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    return getStrictRequirementFromText(text);
  }, [getStrictRequirementFromText, isInstagramPackage, isTikTokPackage, pkg?.name, (pkg as any)?.link_label, (pkg as any)?.usage_notes, (pkg as any)?.link_tutorial_rules]);

  const isStoryViewsPackage = useMemo(() => {
    // Alguns pacotes de Story Views estão nomeados apenas como "Story" (sem "views"),
    // então usamos sinais adicionais (link_label/usage_notes/tutorial) para detectar.
    const name = String(pkg?.name || "").toLowerCase();
    const linkLabel = String((pkg as any)?.link_label || "").toLowerCase();
    const usageNotes = String((pkg as any)?.usage_notes || "").toLowerCase();
    const tutorialText = normalizeTutorialRules((pkg as any).link_tutorial_rules)
      .map((r) => `${r.service} ${r.allowed}`.toLowerCase())
      .join(" ");

    const hasStoryKeyword = name.includes("story") || name.includes("stories") || linkLabel.includes("story") || usageNotes.includes("story");
    const hasViewsKeyword = name.includes("visual") || name.includes("views") || usageNotes.includes("visual") || usageNotes.includes("views");

    // Indício forte de username (sem URL)
    const hintsUsernameOnly =
      linkLabel.includes("apenas") && linkLabel.includes("@") ||
      usageNotes.includes("apenas") && usageNotes.includes("@") ||
      tutorialText.includes("apenas") && tutorialText.includes("@") ||
      linkLabel.includes("@") && (linkLabel.includes("usu") || linkLabel.includes("user"));

    return hasStoryKeyword && (hasViewsKeyword || hintsUsernameOnly);
  }, [pkg?.name, (pkg as any)?.link_label, (pkg as any)?.usage_notes, (pkg as any)?.link_tutorial_rules]);

  function validateStrictInstagramLink(raw: string, requirement: StrictIgRequirement): { ok: boolean; message?: string } {
    if (requirement === "none") return { ok: true };

    const v = String(raw || "").trim();
    if (!v) return { ok: false, message: "Preencha o link do Instagram para continuar." };

    // PROFILE (seguidores): aceitar @username OU link do perfil; recusar qualquer link de post/reel/vídeo
    if (requirement === "profile") {
      const candidate = v.trim();

      // 1) @username
      if (candidate.startsWith("@")) {
        const u = candidate.replace(/^@+/, "");
        if (!/^[a-zA-Z0-9._]{1,30}$/.test(u)) {
          return { ok: false, message: "@ incorreto. Digite apenas o @usuario do Instagram (sem espaços)." };
        }
        return { ok: true };
      }

      // 2) username puro
      if (/^[a-zA-Z0-9._]{1,30}$/.test(candidate)) {
        return { ok: true };
      }

      // 3) link de perfil do Instagram
      let url: URL;
      try {
        const withProto = /^https?:\/\//i.test(candidate) ? candidate : `https://${candidate}`;
        url = new URL(withProto);
      } catch {
        return { ok: false, message: "Link incorreto. Use apenas o @ ou o link do perfil do Instagram." };
      }

      const host = url.hostname.toLowerCase();
      if (!host.includes("instagram.com")) {
        return { ok: false, message: "Link incorreto. Para seguidores, aceitamos apenas Instagram." };
      }

      const parts = String(url.pathname || "")
        .split("/")
        .map((p) => p.trim())
        .filter(Boolean);

      const first = (parts[0] || "").toLowerCase();

      // bloquear posts/reels
      if (["reel", "p", "tv"].includes(first) || ["reel", "p", "tv"].includes((parts[1] || "").toLowerCase())) {
        return { ok: false, message: "Link incorreto. Para seguidores, use apenas o link do PERFIL ou o @ do Instagram." };
      }

      // permitir apenas /{username}/
      if (!first || first === "stories" || first === "explore") {
        return { ok: false, message: "Link incorreto. Cole o link do perfil (instagram.com/usuario) ou digite @usuario." };
      }

      return { ok: true };
    }

    // Nunca aceitar @/username nesses pacotes
    if (v.includes("@")) {
      return {
        ok: false,
        message: "Link incorreto. Cole o link do Instagram do conteúdo (post/reel/foto). Não use @ ou link de perfil.",
      };
    }

    // Deve ser URL do Instagram
    let url: URL;
    try {
      const candidate = /^https?:\/\//i.test(v) ? v : `https://${v}`;
      url = new URL(candidate);
    } catch {
      return {
        ok: false,
        message: "Link incorreto. Cole um link válido do Instagram (ex: https://www.instagram.com/reel/... ).",
      };
    }

    const host = url.hostname.toLowerCase();
    if (!host.includes("instagram.com")) {
      return {
        ok: false,
        message: "Link incorreto. Estes serviços aceitam apenas links do Instagram.",
      };
    }

    const parts = String(url.pathname || "")
      .split("/")
      .map((p) => p.trim())
      .filter(Boolean);

    // Aceita: /reel/{code}/  /p/{code}/  /tv/{code}/  ou /{user}/reel/{code}/ etc.
    const hasShortcode = (idx: number) => Boolean(parts[idx] && parts[idx + 1]);
    const isShortcodeType = (t: string) => ["reel", "p", "tv"].includes(String(t || "").toLowerCase());

    const isReel = (parts[0] === "reel" && hasShortcode(0)) || (parts[1] === "reel" && hasShortcode(1));
    const isPost = (parts[0] === "p" && hasShortcode(0)) || (parts[1] === "p" && hasShortcode(1));
    const isTv = (parts[0] === "tv" && hasShortcode(0)) || (parts[1] === "tv" && hasShortcode(1));
    const isContent = isReel || isPost || isTv;

    // Rejeitar perfil: /{username}/
    if (!isContent) {
      return {
        ok: false,
        message:
          "Link incorreto. Cole o link do post/reel/foto específico (não o link do perfil).",
      };
    }

    if (requirement === "reel" && !isReel) {
      return {
        ok: false,
        message: "Link incorreto. Para este serviço, use o link de um REEL (instagram.com/reel/...).",
      };
    }
    if (requirement === "photo" && !isPost) {
      return {
        ok: false,
        message: "Link incorreto. Para este serviço, use o link de uma FOTO/POST (instagram.com/p/...).",
      };
    }

    if (requirement === "media" && !(isReel || isPost)) {
      return {
        ok: false,
        message: "Link incorreto. Para este serviço, use apenas link de FOTO/POST (instagram.com/p/...) ou VÍDEO/REEL (instagram.com/reel/...).",
      };
    }

    return { ok: true };
  }

  const tutorialRules = normalizeTutorialRules((pkg as any).link_tutorial_rules);
  const [tutorialOpen, setTutorialOpen] = useState(false);

  const [link, setLink] = useState("");
  const [singleLinks, setSingleLinks] = useState<string[]>([""]);
  const [comboLinks, setComboLinks] = useState<Record<string, string[]>>({});
  const [storyInvalidByIndex, setStoryInvalidByIndex] = useState<Record<number, string>>({});
  const [comboStoryInvalidByKey, setComboStoryInvalidByKey] = useState<Record<string, string>>({});
  const [comboServiceNames, setComboServiceNames] = useState<Record<string, string>>({});

  // (moved) isTikTokPackage is defined earlier to avoid Instagram validation leaking into TikTok packages.

  // TikTok-only validation state
  const [tiktokInvalidByField, setTiktokInvalidByField] = useState<Record<string, string>>({});

  // TikTok short-link resolution state
  const [tiktokResolvingByField, setTiktokResolvingByField] = useState<Record<string, boolean>>({});
  const tiktokResolveReqIdRef = useRef<Record<string, number>>({});
  const tiktokResolveTimeoutRef = useRef<Record<string, number>>({});

  const isTikTokShortLink = useCallback((raw: string) => {
    const v = String(raw || "").trim().toLowerCase();
    return v.includes("vt.tiktok.com/") || v.includes("vm.tiktok.com/");
  }, []);

  const validateTikTokLink = useCallback(
    (raw: string): { ok: boolean; message?: string } => {
      const v = String(raw || "").trim();
      if (!v) return { ok: false, message: "Preencha o link do TikTok para continuar." };

      // Allow short links; they will be converted.
      if (isTikTokShortLink(v)) return { ok: true };

      // Must be a TikTok URL
      let url: URL;
      try {
        const candidate = /^https?:\/\//i.test(v) ? v : `https://${v}`;
        url = new URL(candidate);
      } catch {
        return { ok: false, message: "Link inválido. Cole um link do TikTok." };
      }

      const host = url.hostname.toLowerCase();
      if (!host.includes("tiktok.com")) {
        return { ok: false, message: "Apenas links do TikTok são aceitos neste serviço." };
      }

      // Prefer requiring a video link for these services.
      const path = String(url.pathname || "").toLowerCase();
      if (!path.includes("/video/")) {
        return { ok: false, message: "Cole o link do VÍDEO do TikTok (…/video/…)." };
      }

      return { ok: true };
    },
    [isTikTokShortLink],
  );

  const resolveTikTokIfNeeded = useCallback(
    async (raw: string): Promise<string> => {
      const v = String(raw || "").trim();
      if (!v) return v;
      if (!isTikTokPackage) return v;

      const lower = v.toLowerCase();
      const isShort = lower.includes("vt.tiktok.com/") || lower.includes("vm.tiktok.com/");
      if (!isShort) return v;

      try {
        const { data, error } = await backendSupabase.functions.invoke("tiktok-resolve", {
          body: { url: v },
        });
        if (error) throw error;

        const canonical = String(data?.canonicalUrl || data?.resolvedUrl || "").trim();
        return canonical || v;
      } catch {
        // silent fail (user can still proceed with original link)
        return v;
      }
    },
    [isTikTokPackage],
  );

  const scheduleResolveTikTok = useCallback(
    (fieldKey: string, raw: string, apply: (resolved: string) => void) => {
      if (!isTikTokPackage) return;
      if (!isTikTokShortLink(raw)) return;

      // Debounce per-field to avoid spamming while the user types.
      const prevTimeout = tiktokResolveTimeoutRef.current[fieldKey];
      if (prevTimeout) window.clearTimeout(prevTimeout);

      const timeoutId = window.setTimeout(async () => {
        const reqId = (tiktokResolveReqIdRef.current[fieldKey] || 0) + 1;
        tiktokResolveReqIdRef.current[fieldKey] = reqId;

        setTiktokResolvingByField((prev) => ({ ...prev, [fieldKey]: true }));
        try {
          const resolved = await resolveTikTokIfNeeded(raw);
          // Only apply if this is the latest request for this field
          if (tiktokResolveReqIdRef.current[fieldKey] === reqId) {
            apply(resolved);
          }
        } finally {
          if (tiktokResolveReqIdRef.current[fieldKey] === reqId) {
            setTiktokResolvingByField((prev) => ({ ...prev, [fieldKey]: false }));
          }
        }
      }, 180);

      tiktokResolveTimeoutRef.current[fieldKey] = timeoutId;
    },
    [isTikTokPackage, isTikTokShortLink, resolveTikTokIfNeeded],
  );

  const tiktokConversionPending = useMemo(() => {
    if (!isTikTokPackage) return false;

    const anyResolving = Object.values(tiktokResolvingByField || {}).some(Boolean);
    if (anyResolving) return true;

    const linksToCheck: string[] = [];
    if (isCombo) {
      for (const arr of Object.values(comboLinks || {})) {
        (arr || []).forEach((l) => linksToCheck.push(String(l || "")));
      }
    } else {
      (singleLinks || []).forEach((l) => linksToCheck.push(String(l || "")));
    }

    return linksToCheck
      .map((l) => extractUrlFromText(l))
      .some((l) => isTikTokShortLink(l));
  }, [comboLinks, isCombo, isTikTokPackage, isTikTokShortLink, singleLinks, tiktokResolvingByField]);

  const hasTikTokInvalid = useMemo(() => {
    if (!isTikTokPackage) return false;
    return Object.values(tiktokInvalidByField || {}).some((m) => !!String(m || "").trim());
  }, [isTikTokPackage, tiktokInvalidByField]);

  // For combos: fetch service names so we can apply strict IG rules per item even if link_label is generic.
  useEffect(() => {
    if (!isOpen) return;
    if (!isCombo) return;
    const items = (pkg.combo_items || []).filter((it) => Number(it.service_id) > 0);
    const ids = Array.from(new Set(items.map((it) => Number(it.service_id)).filter((n) => Number.isFinite(n) && n > 0)));
    if (ids.length === 0) return;

    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from("imported_services")
        .select("external_service_id, name")
        .in("external_service_id", ids);

      if (cancelled) return;
      if (error) {
        // Silent fail: UI still works with link_label-only heuristics.
        return;
      }
      const map: Record<string, string> = {};
      (data || []).forEach((r: any) => {
        const k = String(r?.external_service_id ?? "");
        if (!k) return;
        map[k] = String(r?.name || "");
      });
      setComboServiceNames(map);
    })();

    return () => {
      cancelled = true;
    };
  }, [isOpen, isCombo, pkg.combo_items, supabase]);

  const [quantity, setQuantity] = useState(pkg.base_quantity);
  const [selectedPrice, setSelectedPrice] = useState(pkg.base_price);
  const [quantityMode, setQuantityMode] = useState<"fixed" | "predefined" | "custom">(
    pkg.predefined_quantities && pkg.predefined_quantities.length > 0 ? "predefined" : "fixed"
  );
  const [isLoading, setIsLoading] = useState(false);
  const [pixData, setPixData] = useState<{ qr_code: string; qr_code_base64: string; payment_id: string } | null>(null);
  const [orderId, setOrderId] = useState<string | null>(null);
  const [checkingPayment, setCheckingPayment] = useState(false);

  // Credits (late-approved payments after pending cleanup)
  const [packageCreditAmount, setPackageCreditAmount] = useState<number>(0);
  const [packageCreditLoading, setPackageCreditLoading] = useState(false);

  // Duplicate-prevention (same service + same link while active)
  const [duplicateBlockMessage, setDuplicateBlockMessage] = useState<string | null>(null);
  const [duplicateMatches, setDuplicateMatches] = useState<Array<{ service_id: number; normalized_link: string; order_id?: string; status?: string }>>([]);
  const [checkingDuplicate, setCheckingDuplicate] = useState(false);
  const [duplicateCheckQueued, setDuplicateCheckQueued] = useState(false);
  const [duplicateDialogOpen, setDuplicateDialogOpen] = useState(false);
  const lastDuplicateCheckHashRef = useRef<string>("");
  const lastDuplicateRequestIdRef = useRef<number>(0);

  // Calculate price
  const calculatePrice = (qty: number) => {
    if (isCombo) return pkg.base_price;
    if (quantityMode === "fixed") {
      return pkg.base_price;
    }
    if (quantityMode === "predefined") {
      return selectedPrice;
    }
    // Price per 1000 basis (custom mode)
    return (qty / 1000) * pkg.price_per_thousand;
  };

  const totalPrice = calculatePrice(quantity);

  const hasPredefined = pkg.predefined_quantities && pkg.predefined_quantities.length > 0;

  const [selectedPredefinedIndex, setSelectedPredefinedIndex] = useState<number | null>(
    hasPredefined ? 0 : null
  );

  const handleSelectPredefined = (pq: PredefinedQuantity, index: number) => {
    setQuantity(pq.quantity);
    setSelectedPrice(pq.price);
    setQuantityMode("predefined");
    setSelectedPredefinedIndex(index);

    // adjust number of link fields for single package
    if (!isCombo) {
      const desired = Math.max(1, Number(pq.link_fields || pkg.default_link_fields || 1));
      setSingleLinks((prev) => {
        const next = Array.from({ length: desired }).map((_, i) => prev[i] || "");
        return next;
      });
    }
  };

  // Format phone number
  const formatPhone = (value: string) => {
    const numbers = value.replace(/\D/g, "");
    if (numbers.length <= 11) {
      return numbers.replace(/(\d{2})(\d{5})(\d{4})/, "($1) $2-$3");
    }
    return value;
  };

  const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const formatted = formatPhone(e.target.value);
    setPhone(formatted);
  };

  const isPhoneValid = phone.replace(/\D/g, "").length >= 10;

  // Store customer auth (WhatsApp + PIN)
  useEffect(() => {
    if (!isOpen) return;
    const phoneDigits = normalizePhoneDigits(phone);
    setPin("");
    setCustomerExists(null);
    setAuthSession(null);

    if (phoneDigits.length < 10) return;

    let cancelled = false;
    (async () => {
      try {
        const [existing, session] = await Promise.all([
          checkStoreCustomerExists(phoneDigits),
          validateStoredStoreCustomerSession(phoneDigits),
        ]);
        if (cancelled) return;
        setCustomerExists(existing);
        if (session) {
          setAuthSession(session);
        }
        // default mode: if not exists => signup; else login
        setAuthMode(existing ? "login" : "signup");
      } catch {
        if (cancelled) return;
        setCustomerExists(null);
        setAuthSession(null);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [isOpen, phone]);

  // Fetch available credit for this package (after customer is authenticated)
  useEffect(() => {
    if (!isOpen) return;
    if (!authSession?.token) {
      setPackageCreditAmount(0);
      return;
    }

    const phoneDigits = normalizePhoneDigits(phone);
    if (phoneDigits.length < 10) {
      setPackageCreditAmount(0);
      return;
    }

    let cancelled = false;
    setPackageCreditLoading(true);

    (async () => {
      try {
        const { data, error } = await backendSupabase.functions.invoke("store-package-credits", {
          body: {
            action: "list",
            phone: phoneDigits,
            token: authSession.token,
            externalDb: externalDb?.serviceRoleKey ? { url: externalDb.url, serviceRoleKey: externalDb.serviceRoleKey } : undefined,
          },
        });
        if (error) throw error;
        const list = (data as any)?.credits as Array<{ package_id: string; amount: number }>;
        const row = Array.isArray(list) ? list.find((c) => String(c?.package_id) === String(pkg.id)) : undefined;
        const amt = Number(row?.amount) || 0;
        if (!cancelled) setPackageCreditAmount(amt);
      } catch {
        if (!cancelled) setPackageCreditAmount(0);
      } finally {
        if (!cancelled) setPackageCreditLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [authSession?.token, externalDb?.serviceRoleKey, externalDb?.url, isOpen, phone, pkg.id]);

  // Single (multi-link) helpers
  const desiredSingleLinkFields = Math.max(
    1,
    Number(
      (quantityMode === "predefined" &&
      selectedPredefinedIndex !== null &&
      pkg.predefined_quantities?.[selectedPredefinedIndex]?.link_fields
        ? pkg.predefined_quantities?.[selectedPredefinedIndex]?.link_fields
        : undefined) ||
        pkg.default_link_fields ||
        1
    )
  );

  useEffect(() => {
    if (isCombo) return;
    setSingleLinks((prev) => Array.from({ length: desiredSingleLinkFields }).map((_, i) => prev[i] || ""));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isCombo, desiredSingleLinkFields]);

  const singleFilledLinks = useMemo(() => {
    if (isCombo) return [] as string[];
    return (singleLinks || [])
      .map((l) => extractUrlFromText(String(l || "")))
      .map((l) => String(l || "").trim())
      .filter(Boolean);
  }, [isCombo, singleLinks]);

  const buildOrderDraft = useCallback(() => {
    const finalQuantity = isCombo
      ? 1
      : quantityMode === "predefined"
        ? quantity
        : quantityMode === "fixed"
          ? pkg.base_quantity
          : quantity;

    const orderPayload = isCombo
      ? {
          type: "combo",
          items: (pkg.combo_items || [])
            .filter((it) => Number(it.service_id) > 0)
            .map((it) => {
              const serviceId = Number(it.service_id);
              const links = (comboLinks[String(serviceId)] || [])
                .map((l) => extractUrlFromText(String(l || "")))
                .map((l) => String(l || "").trim())
                .filter(Boolean);

              return {
                service_id: serviceId,
                quantity: Number(it.quantity) || 0,
                links,
              };
            }),
        }
      : {
          type: "single",
          quantity: finalQuantity,
          links: singleFilledLinks,
        };

    const linkValue = isCombo ? "combo" : (singleFilledLinks[0] || link);
    return { finalQuantity, orderPayload, linkValue };
  }, [comboLinks, isCombo, link, pkg.base_quantity, pkg.combo_items, quantity, quantityMode, singleFilledLinks]);

  const singleMissingLinks = !isCombo && singleFilledLinks.length < 1;
  const singleHasDuplicates = !isCombo && hasDuplicateLinks(singleFilledLinks);

  const firstSingleLink = singleFilledLinks[0] || "";

  const storyInvalidMessage = useMemo(() => {
    if (!isStoryViewsPackage || isCombo) return null;
    const msgs = Object.values(storyInvalidByIndex || {}).filter(Boolean);
    return msgs[0] || null;
  }, [isStoryViewsPackage, isCombo, storyInvalidByIndex]);

  const isLinkValid = useMemo(() => {
    const v = firstSingleLink.trim();

    if (isTikTokPackage) {
      const res = validateTikTokLink(v);
      return res.ok && !hasTikTokInvalid;
    }

    if (isStoryViewsPackage) {
      // Instagram username: 1-30 chars, letters/numbers/._ (sem @ e sem URL)
      if (storyInvalidMessage) return false;
      return /^[a-zA-Z0-9._]{1,30}$/.test(v.replace(/^@+/, ""));
    }

    if (strictRequirement === "profile") {
      return validateStrictInstagramLink(v, "profile").ok;
    }

    const strict = validateStrictInstagramLink(v, strictRequirement);
    if (!strict.ok) return false;

    // Mantém compatibilidade com outros pacotes que aceitam @/texto (ex: username) fora dos alvos citados.
    return v.length > 0 && (v.includes("http") || v.includes("www") || v.includes(".com") || (strictRequirement === "none" && v.includes("@")));
  }, [firstSingleLink, hasTikTokInvalid, isStoryViewsPackage, isTikTokPackage, strictRequirement, storyInvalidMessage, validateTikTokLink]);

  const singleInvalidStrictMessage = useMemo(() => {
    if (isCombo) return null;
    if (isStoryViewsPackage) return null;
    if (isTikTokPackage) return null;
    if (strictRequirement === "none") return null;

    const firstInvalid = (singleLinks || [])
      .map((l) => extractUrlFromText(String(l || "")).trim())
      .filter(Boolean)
      .map((l) => validateStrictInstagramLink(l, strictRequirement))
      .find((r) => !r.ok);

    return firstInvalid?.message || null;
  }, [isCombo, isStoryViewsPackage, isTikTokPackage, strictRequirement, singleLinks]);

  const comboInvalidStrictMessage = useMemo(() => {
    if (!isCombo) return null;
    if (isTikTokPackage) return null;

    // STORY (combos): se qualquer campo de story estiver inválido, bloquear
    const storyMsgs = Object.values(comboStoryInvalidByKey || {}).filter(Boolean);
    if (storyMsgs.length > 0) return storyMsgs[0] || "Link incorreto.";

    const items = (pkg.combo_items || []).filter((it) => Number(it.service_id) > 0);
    for (const it of items) {
      const rawLabel = it.link_label || "";
      const serviceName = comboServiceNames[String(it.service_id)] || "";
      const itemReq = getStrictRequirementFromText(`${rawLabel} ${serviceName}`);
      if (itemReq === "none") continue;

      const links = (comboLinks[String(it.service_id)] || [])
        .map((l) => extractUrlFromText(String(l || "")).trim())
        .filter(Boolean);

      for (const l of links) {
        const res = validateStrictInstagramLink(l, itemReq);
        if (!res.ok) return res.message || "Link incorreto.";
      }
    }
    return null;
  }, [isCombo, isTikTokPackage, pkg.combo_items, comboLinks, comboStoryInvalidByKey, getStrictRequirementFromText]);

  // Combo validation (to enable/disable PIX in real time)
  const comboItems = isCombo
    ? (pkg.combo_items || []).filter((it) => Number(it.service_id) > 0)
    : [];

  const comboMissingLinks =
    isCombo &&
    comboItems.some((it) => {
      const links = comboLinks[String(it.service_id)] || [];
      const filled = links.filter((l) => String(l || "").trim()).length;
      return filled < 1;
    });

  const comboHasDuplicates =
    isCombo &&
    comboItems.some((it) => {
      const links = (comboLinks[String(it.service_id)] || []).filter((l) => String(l || "").trim());
      return hasDuplicateLinks(links);
    });

  // Extract + normalize URL/identificador do Instagram a partir do texto
  // - Padrão: mantém somente a PRIMEIRA URL encontrada e canonicaliza.
  // - Regra especial (Visualizações de Story): converte qualquer input em "username" (sem @).
  function extractSingleUrlFromText(
    text: string,
    opts?: { isStoryViews?: boolean },
  ): { url: string; hadMultiple: boolean } {
    const raw = String(text || "");

    // Find ALL URL-ish tokens; keep only the first one.
    // Includes plain instagram.com/... (without protocol) as well.
    const urlPatternGlobal = /((?:https?:\/\/)[^\s]+|www\.[^\s]+|(?:m\.)?instagram\.com\/[^\s]+)/gi;
    const matches = Array.from(raw.matchAll(urlPatternGlobal))
      .map((m) => m[0])
      .filter(Boolean);

    // ---------------------------
    // STORY VIEWS: normalize to IG username
    // ---------------------------
    const storyMode = opts?.isStoryViews ?? isStoryViewsPackage;
    if (storyMode) {
      // Prefer extracting from URL if present; otherwise accept @user or just user.
      let candidate = matches.length > 0 ? String(matches[0]) : raw;
      candidate = candidate
        .trim()
        .replace(/^[\[({<"'“”‘’]+/g, "")
        .replace(/[\]\[(){}<>"',;.!?…]+$/g, "")
        .replace(/\.+$/g, "");

      // If user pasted multiple URLs concatenated (no spaces), keep only the first one.
      const secondHttpIdx = candidate.toLowerCase().indexOf("http", 4);
      if (secondHttpIdx > 0) {
        candidate = candidate.slice(0, secondHttpIdx).replace(/\/*$/g, "");
      }

      const hadMultiple = matches.length > 1 || secondHttpIdx > 0;

      const extractUsernameFromInstagramUrl = (maybeUrl: string) => {
        let u = String(maybeUrl || "").trim();
        if (/^www\./i.test(u)) u = `https://${u}`;
        if (/^(?:m\.)?instagram\.com\//i.test(u)) {
          u = `https://www.${u}`.replace("https://www.m.", "https://m.");
        }

        try {
          const parsed = new URL(u);
          const host = parsed.hostname.toLowerCase();
          if (!host.includes("instagram.com")) return "";

          const parts = String(parsed.pathname || "")
            .split("/")
            .map((p) => p.trim())
            .filter(Boolean);

          if (parts.length === 0) return "";

          // Links comuns:
          // - https://instagram.com/usuario
          // - https://instagram.com/stories/usuario/...
          const first = parts[0].toLowerCase();
          if (first === "stories" && parts.length >= 2) return parts[1];

          // Evitar pegar "reel", "p", etc (não é perfil)
          if (["reel", "p", "tv"].includes(first)) return "";

          return parts[0];
        } catch {
          return "";
        }
      };

      const fromUrl = extractUsernameFromInstagramUrl(candidate);

      // Se for link de post/reel/vídeo, não aceitar (story = somente @/username)
      try {
        const c = /^https?:\/\//i.test(candidate) ? candidate : `https://${candidate}`;
        const u = new URL(c);
        if (u.hostname.toLowerCase().includes("instagram.com")) {
          const parts = String(u.pathname || "")
            .split("/")
            .map((p) => p.trim())
            .filter(Boolean);
          const first = (parts[0] || "").toLowerCase();
          const second = (parts[1] || "").toLowerCase();
          const isPostLike = ["reel", "p", "tv"].includes(first) || ["reel", "p", "tv"].includes(second);
          if (isPostLike) return { url: "", hadMultiple };
        }
      } catch {
        // ignore
      }
      const fromRaw = String(candidate || "")
        .trim()
        .replace(/^@+/, "")
        .replace(/\s+/g, "")
        .split("?")[0]
        .split("#")[0]
        .split("/")[0]
        .replace(/[^a-zA-Z0-9._]/g, "");

      const username = (fromUrl || fromRaw).trim();
      return { url: username, hadMultiple };
    }

    // ---------------------------
    // DEFAULT: URL canonicalization
    // ---------------------------
    if (matches.length === 0) return { url: text, hadMultiple: false };

    let candidate = String(matches[0])
      .trim()
      .replace(/^[\[({<"'“”‘’]+/g, "")
      .replace(/[\]\[(){}<>"',;.!?…]+$/g, "")
      .replace(/\.+$/g, "");

    // If user pasted multiple URLs concatenated (no spaces), keep only the first one.
    const secondHttpIdx = candidate.toLowerCase().indexOf("http", 4);
    if (secondHttpIdx > 0) {
      candidate = candidate.slice(0, secondHttpIdx).replace(/\/*$/g, "");
    }

    // Ensure protocol for URL parsing
    if (/^www\./i.test(candidate)) candidate = `https://${candidate}`;
    if (/^(?:m\.)?instagram\.com\//i.test(candidate)) candidate = `https://www.${candidate}`.replace("https://www.m.", "https://m.");

    const canonicalizeInstagramPath = (pathname: string) => {
      const parts = String(pathname || "")
        .split("/")
        .map((p) => p.trim())
        .filter(Boolean);

      // Common IG formats:
      // - /{user}/reel/{code}/...
      // - /{user}/p/{code}/...
      // - /{user}/tv/{code}/...
      // - /reel/{code}/...
      const isShortcodeType = (t: string) => ["reel", "p", "tv"].includes(String(t || "").toLowerCase());

      if (parts.length >= 3 && isShortcodeType(parts[1])) {
        return `/${parts[0]}/${parts[1]}/${parts[2]}/`;
      }
      if (parts.length >= 2 && isShortcodeType(parts[0])) {
        return `/${parts[0]}/${parts[1]}/`;
      }

      // Fallback: keep pathname but ensure trailing slash
      return pathname.endsWith("/") ? pathname : `${pathname}/`;
    };

    let normalized = candidate;
    try {
      const u = new URL(candidate);

      // Remove tracking params/fragments; keep clean canonical path
      const host = u.hostname.replace(/^www\./i, "www.");
      let pathname = u.pathname;

      if (host.includes("instagram.com")) {
        pathname = canonicalizeInstagramPath(pathname);
      } else {
        pathname = pathname.endsWith("/") ? pathname : `${pathname}/`;
      }

      normalized = `https://${host}${pathname}`;
    } catch {
      // Fallback: remove query/hash manually
      normalized = candidate.split("?")[0].split("#")[0];
      normalized = normalized.endsWith("/") ? normalized : `${normalized}/`;
    }

    const hadMultiple = matches.length > 1 || secondHttpIdx > 0;
    return { url: normalized, hadMultiple };
  }

  function extractUrlFromText(text: string): string {
    return extractSingleUrlFromText(text).url;
  }

  // Normalize link for duplicate detection (same service): ignore trailing slash + casing
  function normalizeLinkForDedup(maybeUrl: string) {
    return String(maybeUrl || "")
      .trim()
      .replace(/\s+/g, "")
      .replace(/\/+$/g, "")
      .toLowerCase();
  }

  function hasDuplicateLinks(links: string[]) {
    const normalized = links
      .map((l) => normalizeLinkForDedup(extractUrlFromText(l)))
      .filter(Boolean);
    return new Set(normalized).size !== normalized.length;
  }

  const isBlockedPair = useCallback(
    (serviceId: number, rawLink: string) => {
      const normalized = normalizeLinkForDedup(extractUrlFromText(String(rawLink || "")));
      if (!normalized) return false;
      return (duplicateMatches || []).some(
        (m) => Number(m?.service_id) === Number(serviceId) && String(m?.normalized_link || "") === normalized,
      );
    },
    [duplicateMatches],
  );

  const handleLinkChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value;
    const { url } = extractSingleUrlFromText(raw);

    // Legacy single-link state kept for compatibility; do NOT shrink singleLinks
    setLink(url);
    setSingleLinks((prev) => {
      const next = [...(prev || [""])];
      next[0] = url;
      return next;
    });
  };

  const handleContinueToLink = async () => {
    if (!isPhoneValid) {
      toast({
        title: "Telefone inválido",
        description: "Por favor, insira um número de telefone válido.",
        variant: "destructive",
      });
      return;
    }

    const phoneDigits = normalizePhoneDigits(phone);
    if (phoneDigits.length < 10) return;

    // Already authenticated for this phone
    if (authSession) {
      setStep("link");
      return;
    }

    if (pin.length !== 4) {
      toast({
        title: "Senha inválida",
        description: "Digite uma senha (PIN) de 4 dígitos.",
        variant: "destructive",
      });
      return;
    }

    // Defensive: if check hasn't loaded yet, check now
    let existsNow = customerExists;
    try {
      if (existsNow === null) existsNow = await checkStoreCustomerExists(phoneDigits);
    } catch {
      // ignore
    }

    setAuthBusy(true);
    try {
      if (authMode === "login") {
        if (!existsNow) {
          toast({
            title: "Não cadastrado",
            description: "Seu WhatsApp ainda não tem cadastro. Clique em Cadastrar para criar sua senha.",
            variant: "destructive",
          });
          setAuthMode("signup");
          return;
        }
        const s = await storeCustomerLogin(phoneDigits, pin);
        setAuthSession(s);
        setStep("link");
        return;
      }

      // signup
      if (existsNow) {
        toast({
          title: "WhatsApp já cadastrado",
          description: "Este WhatsApp já está cadastrado. Faça login com sua senha.",
          variant: "destructive",
        });
        setAuthMode("login");
        return;
      }
      const s = await storeCustomerSignup(phoneDigits, pin);
      setAuthSession(s);
      setStep("link");
    } catch (e: any) {
      toast({
        title: "Erro",
        description: e?.message || "Não foi possível autenticar. Tente novamente.",
        variant: "destructive",
      });
    } finally {
      setAuthBusy(false);
    }
  };

  // Duplicate-prevention check (same service + same link while order is active)
  useEffect(() => {
    const ACTIVE_STATUSES = ["pending", "processing", "partial"]; // keep in sync with backend

    const buildPairs = () => {
      const pairs: Array<{ service_id: number; link: string }> = [];

      if (isCombo) {
        const items = (pkg.combo_items || []).filter((it) => Number(it.service_id) > 0);
        for (const it of items) {
          const sid = Number(it.service_id);
          const links = (comboLinks[String(sid)] || [])
            .map((l) => extractUrlFromText(String(l || "")))
            .map((l) => String(l || "").trim())
            .filter(Boolean);

          for (const l of links) {
            pairs.push({ service_id: sid, link: l });
          }
        }
      } else {
        const sid = Number(pkg.service_id) || 0;
        for (const l of singleFilledLinks) {
          pairs.push({ service_id: sid, link: l });
        }
      }

      // normalize and de-duplicate pairs
      const normalized = pairs
        .map((p) => ({
          service_id: Number(p.service_id) || 0,
          link: normalizeLinkForDedup(extractUrlFromText(p.link)),
        }))
        .filter((p) => p.service_id > 0 && !!p.link);

      const key = (p: { service_id: number; link: string }) => `${p.service_id}::${p.link}`;
      const unique = Array.from(new Map(normalized.map((p) => [key(p), p])).values());

      // stable order for hashing
      unique.sort((a, b) => (a.service_id - b.service_id) || a.link.localeCompare(b.link));
      return unique;
    };

    const pairs = buildPairs();

    // Nothing to validate yet
    if (pairs.length === 0) {
      setDuplicateBlockMessage(null);
      setDuplicateMatches([]);
      setCheckingDuplicate(false);
      setDuplicateCheckQueued(false);
      lastDuplicateCheckHashRef.current = "";
      return;
    }

    // Only validate when inputs are minimally valid (avoid noisy requests)
    if (!isCombo && (!isLinkValid || singleFilledLinks.length < 1)) {
      setDuplicateBlockMessage(null);
      setDuplicateMatches([]);
      setCheckingDuplicate(false);
      setDuplicateCheckQueued(false);
      lastDuplicateCheckHashRef.current = "";
      return;
    }

    // Combo: require at least 1 link per item before checking (to keep it "instant" but not spammy)
    if (isCombo && comboMissingLinks) {
      setDuplicateBlockMessage(null);
      setDuplicateMatches([]);
      setCheckingDuplicate(false);
      setDuplicateCheckQueued(false);
      lastDuplicateCheckHashRef.current = "";
      return;
    }

    const currentHash = JSON.stringify(pairs);
    if (currentHash === lastDuplicateCheckHashRef.current) return;

    // Immediately disable actions while we debounce the request
    setDuplicateCheckQueued(true);

    const validate = async () => {
      const reqId = ++lastDuplicateRequestIdRef.current;
      setCheckingDuplicate(true);
      lastDuplicateCheckHashRef.current = currentHash;

      try {
        const { data, error } = await backendSupabase.functions.invoke("store-order-duplicate-check", {
          body: {
            pairs,
            activeStatuses: ACTIVE_STATUSES,
            externalDb: externalDb?.serviceRoleKey
              ? { url: externalDb.url, serviceRoleKey: externalDb.serviceRoleKey }
              : undefined,
          },
        });

        // Ignore slow/stale responses
        if (reqId !== lastDuplicateRequestIdRef.current) return;

        if (error) {
          console.error("Duplicate check error:", error);
          // Fail-closed: if we can't verify, do not allow purchase to proceed.
          setDuplicateBlockMessage(
            "Não foi possível verificar se já existe pedido ativo agora. Verifique sua conexão e tente novamente."
          );
          setDuplicateMatches([]);
          setDuplicateDialogOpen(true);
          return;
        }

        if (data?.blocked) {
          setDuplicateBlockMessage(
            "VOCÊ TEM UM PEDIDO ATIVO. AGUARDE A FINALIZAÇÃO PARA COMPRAR NOVAMENTE PARA ESTE MESMO LINK, OU COMPRE PARA OUTRO LINK."
          );
          setDuplicateMatches(Array.isArray(data?.matches) ? data.matches : []);
        } else {
          setDuplicateBlockMessage(null);
          setDuplicateMatches([]);
        }
      } catch (e) {
        console.error("Duplicate check exception:", e);
        if (reqId !== lastDuplicateRequestIdRef.current) return;
        // Fail-closed: if we can't verify, do not allow purchase to proceed.
        setDuplicateBlockMessage(
          "Não foi possível verificar se já existe pedido ativo agora. Verifique sua conexão e tente novamente."
        );
        setDuplicateMatches([]);
        setDuplicateDialogOpen(true);
      } finally {
        if (reqId === lastDuplicateRequestIdRef.current) {
          setCheckingDuplicate(false);
          setDuplicateCheckQueued(false);
        }
      }
    };

    // Faster debounce for near-instant UX
    const timeout = window.setTimeout(validate, 120);
    return () => {
      window.clearTimeout(timeout);
      // Keep queued=true while user is still typing (next effect run will refresh)
    };
  }, [
    isCombo,
    pkg.service_id,
    (pkg as any).combo_items,
    comboLinks,
    singleFilledLinks,
    isLinkValid,
    comboMissingLinks,
    externalDb?.serviceRoleKey,
    externalDb?.url,
  ]);

  // Open/close popup automatically when a duplicate is detected
  useEffect(() => {
    if (duplicateBlockMessage && step === "link") {
      setDuplicateDialogOpen(true);
    }
    if (!duplicateBlockMessage) {
      setDuplicateDialogOpen(false);
    }
  }, [duplicateBlockMessage, step]);


  const handleCheckout = async (mode: "pix" | "credit") => {
    const checkoutReqId =
      typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;

    // Block purchase if not authenticated
    if (!authSession) {
      toast({
        title: "Faça login para continuar",
        description: "Digite seu WhatsApp e sua senha de 4 dígitos para continuar.",
        variant: "destructive",
      });
      setStep("phone");
      return;
    }
    if (isCombo) {
      if (comboInvalidStrictMessage) {
        toast({
          title: "Link incorreto",
          description: comboInvalidStrictMessage,
          variant: "destructive",
        });
        return;
      }
      const items = (pkg.combo_items || []).filter((it) => Number(it.service_id) > 0);
      if (items.length === 0) {
        toast({
          title: "COMBO inválido",
          description: "Este combo não possui itens configurados.",
          variant: "destructive",
        });
        return;
      }

      // Allow fewer links than configured, but require at least 1 valid link per item.
      const missing = items.find((it) => {
        const links = comboLinks[String(it.service_id)] || [];
        const filled = links.filter((l) => String(l || "").trim()).length;
        return filled < 1;
      });

      if (missing) {
        toast({
          title: "Links incompletos",
          description: "Preencha pelo menos 1 link em cada item do combo para continuar.",
          variant: "destructive",
        });
        return;
      }

      // Block duplicated links inside the same service item
      const duplicatedItem = items.find((it) => {
        const links = (comboLinks[String(it.service_id)] || []).filter((l) => String(l || "").trim());
        return hasDuplicateLinks(links);
      });

      if (duplicatedItem) {
        toast({
          title: "Link repetido",
          description: "O mesmo serviço não pode ter links repetidos. Mude para outro link diferente.",
          variant: "destructive",
        });
        return;
      }
    } else {
      if (storyInvalidMessage) {
        toast({
          title: "Link incorreto",
          description: storyInvalidMessage,
          variant: "destructive",
        });
        return;
      }
      if (singleInvalidStrictMessage) {
        toast({
          title: "Link incorreto",
          description: singleInvalidStrictMessage,
          variant: "destructive",
        });
        return;
      }
      if (singleMissingLinks) {
        toast({
          title: "Links incompletos",
          description: "Preencha pelo menos 1 link para continuar.",
          variant: "destructive",
        });
        return;
      }

      if (singleHasDuplicates) {
        toast({
          title: "Link repetido",
          description: "Você não pode repetir o mesmo link em mais de um campo.",
          variant: "destructive",
        });
        return;
      }

      if (!isLinkValid) {
        toast({
          title: "Link inválido",
          description: isStoryViewsPackage
            ? "Por favor, digite apenas o @ do Instagram (ou cole o link do story/perfil para extrair o usuário)."
            : "Por favor, insira um link válido do seu post, foto ou vídeo.",
          variant: "destructive",
        });
        return;
      }

      // Block if duplicate-prevention detected an active order for same service+link
      if (duplicateBlockMessage) {
        toast({
          title: "Pedido ativo",
          description: duplicateBlockMessage,
          variant: "destructive",
        });
        return;
      }
    }

    // Final server-side validation (prevents bypass / race conditions)
    try {
      setCheckingDuplicate(true);
      const pairs: Array<{ service_id: number; link: string }> = [];

      if (isCombo) {
        const items = (pkg.combo_items || []).filter((it) => Number(it.service_id) > 0);
        for (const it of items) {
          const sid = Number(it.service_id);
          const links = (comboLinks[String(sid)] || [])
            .map((l) => extractUrlFromText(String(l || "")))
            .map((l) => String(l || "").trim())
            .filter(Boolean);
          for (const l of links) pairs.push({ service_id: sid, link: l });
        }
      } else {
        const sid = Number(pkg.service_id) || 0;
        for (const l of singleFilledLinks) pairs.push({ service_id: sid, link: l });
      }

      const normalizedPairs = pairs
        .map((p) => ({ service_id: Number(p.service_id) || 0, link: normalizeLinkForDedup(extractUrlFromText(p.link)) }))
        .filter((p) => p.service_id > 0 && !!p.link);

      const { data, error } = await backendSupabase.functions.invoke("store-order-duplicate-check", {
        body: {
          pairs: normalizedPairs,
          activeStatuses: ["pending", "processing", "partial"],
          externalDb: externalDb?.serviceRoleKey
            ? { url: externalDb.url, serviceRoleKey: externalDb.serviceRoleKey }
            : undefined,
        },
      });

      if (error) {
        toast({
          title: "Não foi possível validar",
          description: "Falha ao verificar pedido ativo. Verifique sua conexão e tente novamente.",
          variant: "destructive",
        });
        setDuplicateBlockMessage("Falha ao verificar pedido ativo. Verifique sua conexão e tente novamente.");
        setDuplicateDialogOpen(true);
        return;
      }

      if (!error && data?.blocked) {
         setDuplicateMatches(Array.isArray(data?.matches) ? data.matches : []);
         setDuplicateBlockMessage(
           "VOCÊ TEM UM PEDIDO ATIVO. AGUARDE A FINALIZAÇÃO PARA COMPRAR NOVAMENTE PARA ESTE MESMO LINK, OU COMPRE PARA OUTRO LINK."
         );
         setDuplicateDialogOpen(true);
        toast({
          title: "Pedido ativo",
          description:
            "VOCÊ TEM UM PEDIDO ATIVO. AGUARDE A FINALIZAÇÃO PARA COMPRAR NOVAMENTE PARA ESTE MESMO LINK, OU COMPRE PARA OUTRO LINK.",
          variant: "destructive",
        });
        return;
      }
    } catch (e: any) {
      // IMPORTANT: never crash the UI on transient network/backend failures.
      console.error("Duplicate check exception (final validation):", e);
      toast({
        title: "Não foi possível validar",
        description: "Falha ao verificar pedido ativo. Verifique sua conexão e tente novamente.",
        variant: "destructive",
      });
      setDuplicateBlockMessage("Falha ao verificar pedido ativo. Verifique sua conexão e tente novamente.");
      setDuplicateMatches([]);
      setDuplicateDialogOpen(true);
      return;
    } finally {
      setCheckingDuplicate(false);
    }

    setIsLoading(true);
    try {
      const { finalQuantity, orderPayload, linkValue } = buildOrderDraft();

      const phoneDigits = phone.replace(/\D/g, "");

      console.log("[store-checkout] start", {
        checkoutReqId,
        mode,
        package_id: pkg.id,
        package_name: pkg.name,
        isCombo,
        frontend_id: frontendId,
        phoneDigitsLen: phoneDigits.length,
        finalQuantity,
        totalPrice,
        link_preview: String(linkValue || "").slice(0, 120),
        hasOrderPayload: Boolean(orderPayload),
      });

      if (mode === "credit") {
        const { data: creditRes, error: creditErr } = await backendSupabase.functions.invoke("store-package-credits", {
          body: {
            action: "redeem",
            phone: phoneDigits,
            token: authSession.token,
            package_id: pkg.id,
            frontend_id: frontendId,
            link: linkValue,
            quantity: finalQuantity,
            service_name: pkg.name,
            order_payload: orderPayload,
            externalDb: externalDb?.serviceRoleKey ? { url: externalDb.url, serviceRoleKey: externalDb.serviceRoleKey } : undefined,
          },
        });
        if (creditErr) throw creditErr;

        toast({
          title: "Saldo usado com sucesso",
          description: "Seu pedido foi enviado para processamento.",
        });
        setPackageCreditAmount(0);
        setOrderId(String((creditRes as any)?.order_id || ""));
        setStep("success");
        return;
      }

      // PIX flow
      const { data: order, error: orderError } = await supabase
        .from("store_orders")
        .insert({
          frontend_id: frontendId,
          package_id: pkg.id,
          phone: phoneDigits,
          customer_id: authSession.customerId,
          link: linkValue,
          quantity: finalQuantity,
          total_price: totalPrice,
          service_name: pkg.name,
          payment_status: "pending",
          order_status: "pending",
          order_payload: orderPayload,
        } as any)
        .select()
        .single();

      if (orderError) {
        console.error("[store-checkout] store_orders insert failed", {
          checkoutReqId,
          orderError: serializeUnknownError(orderError),
        });
        await logCheckoutErrorToBackend({
          checkoutReqId,
          mode,
          phoneDigits,
          pkgId: pkg.id,
          frontendId,
          orderId: null,
          message: "store_orders insert failed",
          error: orderError,
        });
        throw orderError;
      }
      setOrderId(order.id);

      console.log("[store-checkout] order created", { checkoutReqId, order_id: order.id });

      const emailDigits = phoneDigits || "cliente";
      const { data: pixResponse, error: pixError } = await backendSupabase.functions.invoke("mercadopago-pix", {
        body: {
          amount: totalPrice,
          description: `${pkg.name}`,
          email: `cliente+${emailDigits}@example.com`,
          order_id: order.id,
          phone: phoneDigits,
          package_id: pkg.id,
          externalDb: externalDb?.serviceRoleKey
            ? { url: externalDb.url, serviceRoleKey: externalDb.serviceRoleKey }
            : undefined,
        },
      });

      if (pixError) {
        console.error("[store-checkout] mercadopago-pix invoke failed", {
          checkoutReqId,
          order_id: order.id,
          pixError: serializeUnknownError(pixError),
          pixResponse: pixResponse ?? null,
        });
        await logCheckoutErrorToBackend({
          checkoutReqId,
          mode,
          phoneDigits,
          pkgId: pkg.id,
          frontendId,
          orderId: String(order.id),
          message: "mercadopago-pix invoke failed",
          error: { pixError: serializeUnknownError(pixError), pixResponse: pixResponse ?? null },
        });
        throw pixError;
      }

      if (pixResponse?.qr_code) {
        setPixData(pixResponse);

        // Update order with payment_id
        await supabase.from("store_orders").update({ payment_id: pixResponse.payment_id }).eq("id", order.id);

        setStep("payment");
      } else {
        console.error("[store-checkout] mercadopago-pix missing qr_code", {
          checkoutReqId,
          order_id: order.id,
          pixResponse: pixResponse ?? null,
        });
        await logCheckoutErrorToBackend({
          checkoutReqId,
          mode,
          phoneDigits,
          pkgId: pkg.id,
          frontendId,
          orderId: String(order.id),
          message: "mercadopago-pix missing qr_code",
          error: { pixResponse: pixResponse ?? null },
        });
        throw new Error("Erro ao gerar QR Code PIX");
      }
    } catch (error: any) {
      console.error("[store-checkout] failed", {
        checkoutReqId,
        mode,
        orderId,
        error: serializeUnknownError(error),
      });

      // Best-effort persistent log for production debugging
      await logCheckoutErrorToBackend({
        checkoutReqId,
        mode,
        phoneDigits: phone.replace(/\D/g, ""),
        pkgId: pkg.id,
        frontendId,
        orderId: orderId || null,
        message: "checkout failed",
        error,
      });

      toast({
        title: "Erro",
        description: error.message || "Erro ao gerar pagamento. Tente novamente.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleGeneratePix = () => handleCheckout("pix");
  const handleUseCredit = () => handleCheckout("credit");

  // Poll for payment status
  useEffect(() => {
    if (step !== "payment" || !pixData?.payment_id) return;

    const checkPayment = async () => {
      setCheckingPayment(true);
      try {
        const { data, error } = await backendSupabase.functions.invoke("mercadopago-pix", {
          body: {
            action: "check_status",
            payment_id: pixData.payment_id,
            order_id: orderId,
            externalDb: externalDb?.serviceRoleKey
              ? { url: externalDb.url, serviceRoleKey: externalDb.serviceRoleKey }
              : undefined,
          },
        });

        if (!error && data?.status === "approved") {
          // Update order status
          if (orderId) {
            await supabase
              .from("store_orders")
              .update({ 
                payment_status: "approved"
              })
              .eq("id", orderId);

            // Call edge function to process order in SMM API
              try {
                await backendSupabase.functions.invoke("store-order-process", {
                  body: {
                    order_id: orderId,
                    action: "process_paid_order",
                    externalDb: externalDb?.serviceRoleKey
                      ? { url: externalDb.url, serviceRoleKey: externalDb.serviceRoleKey }
                      : undefined,
                  },
                });
                console.log("Order sent to SMM API");
              } catch (processError) {
                console.error("Error processing order:", processError);
              }
          }
          setStep("success");
        }
      } catch (error) {
        console.error("Error checking payment:", error);
      } finally {
        setCheckingPayment(false);
      }
    };

    const interval = setInterval(checkPayment, 5000);
    return () => clearInterval(interval);
  }, [step, pixData, orderId]);

  const handleClose = useCallback(() => {
    setStep("phone");
    setPhone("");
    setPin("");
    setAuthMode("login");
    setCustomerExists(null);
    setAuthSession(null);
    setAuthBusy(false);
    setLink("");
    setSingleLinks([""]);
    setComboLinks({});
    setQuantity(pkg.base_quantity);
    setSelectedPrice(pkg.base_price);
    setQuantityMode(pkg.predefined_quantities && pkg.predefined_quantities.length > 0 ? "predefined" : "fixed");
    setSelectedPredefinedIndex(pkg.predefined_quantities && pkg.predefined_quantities.length > 0 ? 0 : null);
    setPixData(null);
    setOrderId(null);
    setDuplicateBlockMessage(null);
    setDuplicateMatches([]);
    setCheckingDuplicate(false);
    setStoryInvalidByIndex({});
    lastDuplicateCheckHashRef.current = "";
    onClose();
  }, [onClose, pkg.base_price, pkg.base_quantity, pkg.predefined_quantities]);

  // Auto-close ONLY after successful approval
  useEffect(() => {
    if (step !== "success") return;
    const t = window.setTimeout(() => {
      handleClose();
    }, 1200);
    return () => window.clearTimeout(t);
  }, [step, handleClose]);

  const copyPixCode = () => {
    if (pixData?.qr_code) {
      navigator.clipboard.writeText(pixData.qr_code);
      toast({
        title: "Código copiado!",
        description: "Cole no seu aplicativo de pagamento.",
      });
    }
  };

  // Handle cancel - delete pending order if exists
  const handleCancel = async () => {
    // If there's a pending order that hasn't been paid, delete it
    if (orderId && step === "payment") {
      try {
        await supabase
          .from("store_orders")
          .delete()
          .eq("id", orderId)
          .eq("payment_status", "pending");
        console.log("Pending order deleted on cancel");
      } catch (error) {
        console.error("Error deleting pending order:", error);
      }
    }
    handleClose();
  };

  // Prevent closing when clicking outside; allow closing only via "X" (or programmatic close)
  const handleOpenChange = (open: boolean) => {
    if (!open) {
      // If user closes during payment via X, clean up pending order
      if (step === "payment") {
        void handleCancel();
        return;
      }
      handleClose();
    }
  };

  const normalizeComboTitle = (raw: string) => {
    const t = (raw || "").trim().toLowerCase();
    if (t.includes("visual")) return "VISUALIZAÇÕES";
    if (t.includes("curtid")) return "CURTIDAS";
    return (raw || "Item").toUpperCase();
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <DialogContent
        className="w-[calc(100vw-1rem)] max-w-[calc(100vw-1rem)] sm:w-full sm:max-w-lg max-h-[90vh] overflow-hidden overflow-x-hidden flex flex-col bg-card/80 backdrop-blur supports-[backdrop-filter]:bg-card/70 border-border/60 shadow-xl p-4 sm:p-6"
        onPointerDownOutside={(e) => {
          // Never close by clicking outside
          e.preventDefault();
        }}
        onEscapeKeyDown={(e) => {
          // Never close with Escape (only via X or automatic logic)
          e.preventDefault();
        }}
        onInteractOutside={(e) => {
          // Never close via outside interactions
          e.preventDefault();
        }}
      >
        <DialogHeader>
          <DialogTitle className="flex items-center justify-between gap-2">
            <span className="flex items-center gap-2 min-w-0">
              <Package className="w-5 h-5 text-primary" />
              <span className="truncate">{step === "success" ? "Pedido Confirmado!" : pkg.name}</span>
            </span>

            <span className="flex items-center gap-2 shrink-0">
              {step === "phone" && (
                <Button
                  type="button"
                  variant="default"
                  size="sm"
                  onClick={() => setAuthMode((m) => (m === "login" ? "signup" : "login"))}
                  className="shadow-md shadow-primary/20 ring-2 ring-primary/30"
                >
                  {authMode === "login" ? "Cadastrar" : "Entrar"}
                </Button>
              )}

              {/* Mobile-first explicit close button (outside click/ESC are blocked) */}
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label="Fechar"
                className="h-9 w-9 rounded-full"
                onClick={() => {
                  if (step === "payment") {
                    void handleCancel();
                    return;
                  }
                  handleClose();
                }}
              >
                <X className="h-4 w-4" />
              </Button>
            </span>
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden pr-1">
          {step === "phone" && (
            <div className="space-y-4">
              <div className="p-4 rounded-lg bg-card border border-border">
                <div className="flex items-center gap-3 mb-3">
                  {pkg.cover_image_url ? (
                    <img
                      src={pkg.cover_image_url}
                      alt={pkg.name}
                      className="w-16 h-16 rounded-lg object-cover"
                    />
                  ) : (
                    <div className="w-16 h-16 rounded-lg bg-primary/20 flex items-center justify-center">
                      <Package className="w-8 h-8 text-primary" />
                    </div>
                  )}
                  <div>
                    <h3 className="font-medium">{pkg.name}</h3>
                    <p className="text-2xl font-bold text-primary">
                      {formatCurrency(quantityMode === "predefined" ? selectedPrice : pkg.base_price)}
                    </p>
                  </div>
                </div>

                {/* Usage Notes */}
                {pkg.usage_notes && (
                  <div className="mt-3 flex items-center gap-2 px-3 py-2.5 rounded-lg bg-primary/10 border border-primary/30">
                    <div className="flex items-center gap-1.5 shrink-0">
                      {(pkg.usage_notes.toLowerCase().includes("foto") ||
                        pkg.usage_notes.toLowerCase().includes("imagem")) && (
                        <div className="flex items-center justify-center w-6 h-6 rounded-full bg-primary/20">
                          <Image className="w-3.5 h-3.5 text-primary" />
                        </div>
                      )}
                      {(pkg.usage_notes.toLowerCase().includes("video") ||
                        pkg.usage_notes.toLowerCase().includes("vídeo")) && (
                        <div className="flex items-center justify-center w-6 h-6 rounded-full bg-primary/20">
                          <Video className="w-3.5 h-3.5 text-primary" />
                        </div>
                      )}
                      {pkg.usage_notes.toLowerCase().includes("reel") && (
                        <div className="flex items-center justify-center w-6 h-6 rounded-full bg-primary/20">
                          <Clapperboard className="w-3.5 h-3.5 text-primary" />
                        </div>
                      )}
                      {/* Default icon if no keyword matched */}
                      {!pkg.usage_notes.toLowerCase().includes("foto") &&
                        !pkg.usage_notes.toLowerCase().includes("imagem") &&
                        !pkg.usage_notes.toLowerCase().includes("video") &&
                        !pkg.usage_notes.toLowerCase().includes("vídeo") &&
                        !pkg.usage_notes.toLowerCase().includes("reel") && (
                          <div className="flex items-center justify-center w-6 h-6 rounded-full bg-primary/20">
                            <CheckCircle className="w-3.5 h-3.5 text-primary" />
                          </div>
                        )}
                    </div>
                    <p className="text-sm font-medium text-primary">{pkg.usage_notes}</p>
                  </div>
                )}

                {/* Predefined quantities buttons */}
                {hasPredefined && (
                  <div className="mt-4 space-y-2">
                    <Label className="text-xs text-muted-foreground">Escolha uma quantidade:</Label>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 select-none">
                      {pkg.predefined_quantities!.map((pq, index) => (
                        <Button
                          key={index}
                          type="button"
                          variant={
                            quantityMode === "predefined" && selectedPredefinedIndex === index
                              ? "default"
                              : "outline"
                          }
                          size="sm"
                          className="w-full whitespace-nowrap px-2 touch-manipulation"
                          onClick={() => handleSelectPredefined(pq, index)}
                        >
                          <span className="font-medium">{pq.quantity.toLocaleString()}</span>
                          <span className="ml-1 text-xs opacity-70">({formatCurrency(pq.price)})</span>
                        </Button>
                      ))}
                    </div>
                  </div>
                )}

                {pkg.allow_custom_quantity && (
                  <Tabs
                    value={
                      hasPredefined
                        ? quantityMode === "custom"
                          ? "custom"
                          : "predefined"
                        : quantityMode
                    }
                    onValueChange={(v) => {
                      if (v === "custom") {
                        setQuantityMode("custom");
                      } else if (v === "predefined" && hasPredefined) {
                        const first = pkg.predefined_quantities![0];
                        handleSelectPredefined(first, 0);
                      } else {
                        setQuantityMode("fixed");
                      }
                    }}
                    className="mt-4"
                  >
                    <TabsList className="grid w-full grid-cols-2">
                      <TabsTrigger value={hasPredefined ? "predefined" : "fixed"}>
                        {hasPredefined ? "Pacotes" : "Pacote Fixo"}
                      </TabsTrigger>
                      <TabsTrigger value="custom">Personalizar</TabsTrigger>
                    </TabsList>
                    <TabsContent value={hasPredefined ? "predefined" : "fixed"} className="pt-3">
                      {hasPredefined ? (
                        <p className="text-sm text-muted-foreground">
                          {quantity.toLocaleString()} unidades por {formatCurrency(selectedPrice)}
                        </p>
                      ) : (
                        <p className="text-sm text-muted-foreground">
                          {pkg.base_quantity} unidades por {formatCurrency(pkg.base_price)}
                        </p>
                      )}
                    </TabsContent>
                    <TabsContent value="custom" className="pt-3 space-y-2">
                      <Label>Quantidade desejada</Label>
                      <Input
                        type="number"
                        value={quantity}
                        onChange={(e) =>
                          setQuantity(
                            Math.max(
                              pkg.min_quantity,
                              Math.min(pkg.max_quantity, parseInt(e.target.value) || 0)
                            )
                          )
                        }
                        min={pkg.min_quantity}
                        max={pkg.max_quantity}
                      />
                      <p className="text-xs text-muted-foreground">
                        Mín: {pkg.min_quantity} | Máx: {pkg.max_quantity.toLocaleString()}
                      </p>
                      <p className="text-sm font-medium">
                        Total: <span className="text-primary">{formatCurrency(calculatePrice(quantity))}</span>
                      </p>
                    </TabsContent>
                  </Tabs>
                )}
              </div>

              <div className="space-y-2">
                <Label className="flex items-center gap-2">
                  <Phone className="w-4 h-4" />
                  Seu WhatsApp
                </Label>
                <Input
                  placeholder="(00) 00000-0000"
                  value={phone}
                  onChange={handlePhoneChange}
                  maxLength={15}
                />
                <p className="text-xs text-muted-foreground">
                  Você poderá consultar seus pedidos usando este número.
                </p>
              </div>

              <div className="space-y-2 rounded-2xl border border-primary/25 bg-card/50 p-4 shadow-sm shadow-primary/10">
                <Label className="flex items-center justify-between">
                  <span className="font-semibold">Senha (4 dígitos)</span>
                  {authSession ? (
                    <span className="text-xs text-muted-foreground">Logado</span>
                  ) : customerExists === false ? (
                    <span className="text-xs font-medium text-primary">Primeiro acesso</span>
                  ) : null}
                </Label>

                <div className="flex justify-center">
                  <InputOTP
                    maxLength={4}
                    value={pin}
                    onChange={(v) => setPin(String(v || "").replace(/\D/g, "").slice(0, 4))}
                    disabled={!!authSession}
                    containerClassName="justify-center gap-3"
                  >
                    <InputOTPGroup className="gap-3">
                      <InputOTPSlot
                        index={0}
                        className="h-12 w-12 rounded-xl border border-primary/30 bg-primary/10 text-base font-semibold text-foreground shadow-sm shadow-primary/10 transition-colors"
                      />
                      <InputOTPSlot
                        index={1}
                        className="h-12 w-12 rounded-xl border border-primary/30 bg-primary/10 text-base font-semibold text-foreground shadow-sm shadow-primary/10 transition-colors"
                      />
                      <InputOTPSlot
                        index={2}
                        className="h-12 w-12 rounded-xl border border-primary/30 bg-primary/10 text-base font-semibold text-foreground shadow-sm shadow-primary/10 transition-colors"
                      />
                      <InputOTPSlot
                        index={3}
                        className="h-12 w-12 rounded-xl border border-primary/30 bg-primary/10 text-base font-semibold text-foreground shadow-sm shadow-primary/10 transition-colors"
                      />
                    </InputOTPGroup>
                  </InputOTP>
                </div>

                <p className="text-xs text-muted-foreground text-center">
                  {authMode === "login"
                    ? "Digite sua senha para entrar."
                    : "Crie uma senha numérica para cadastrar."}
                </p>
              </div>

              <Button
                onClick={handleContinueToLink}
                className="w-full"
                disabled={
                  !isPhoneValid ||
                  authBusy ||
                  (!authSession && pin.length !== 4)
                }
              >
                {authBusy ? (
                  <span className="inline-flex items-center">
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    {authMode === "login" ? "Entrando..." : "Cadastrando..."}
                  </span>
                ) : authSession ? (
                  "Continuar"
                ) : authMode === "login" ? (
                  "Entrar e continuar"
                ) : (
                  "Cadastrar e continuar"
                )}
              </Button>
            </div>
          )}

          {step === "link" && (
            <div className="space-y-4">
              <Alert className="bg-warning/10 border-warning/30">
                <AlertTriangle className="h-4 w-4 text-warning" />
                <AlertDescription className="text-foreground text-sm">
                  <strong>ATENÇÃO:</strong> Coloque os links corretamente. Não nos responsabilizamos por pedidos
                  feitos com links errados. <strong>Não há estorno.</strong>
                </AlertDescription>
              </Alert>

              <Dialog open={tutorialOpen} onOpenChange={setTutorialOpen}>
                <DialogTrigger asChild>
                  <Button type="button" variant="destructive" className="w-full font-extrabold tracking-wide">
                    TUTORIAL APRENDA
                  </Button>
                </DialogTrigger>

                <DialogContent className="max-w-lg">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="absolute right-4 top-4"
                    onClick={() => setTutorialOpen(false)}
                    aria-label="Fechar tutorial"
                  >
                    <X className="h-5 w-5" />
                  </Button>

                  <DialogHeader>
                    <DialogTitle className="text-base sm:text-lg font-extrabold tracking-tight">
                      <span className="text-destructive">COMO COLOCAR OS LINKS</span>
                    </DialogTitle>
                  </DialogHeader>

                  <div className="mt-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs sm:text-sm">
                    <span className="font-semibold text-destructive">Destaque:</span>{" "}
                    Cole sempre o link completo.
                  </div>

                  {tutorialRules.length > 0 ? (
                    <div className="mt-3 overflow-hidden rounded-lg border border-border">
                      <div className="grid grid-cols-2 bg-muted/40 text-[10px] sm:text-xs font-extrabold uppercase tracking-wide">
                        <div className="p-2 border-r border-border text-destructive">SERVIÇOS</div>
                        <div className="p-2 text-destructive">O QUE PODE COLOCAR</div>
                      </div>
                      <div className="divide-y divide-border">
                        {tutorialRules.map((r, idx) => (
                          <div key={idx} className="grid grid-cols-2 text-[11px] sm:text-sm">
                            <div className="p-2 border-r border-border font-semibold whitespace-nowrap overflow-hidden text-ellipsis">
                              <span className="inline-flex items-center gap-1">
                                <span aria-hidden="true">{getServiceEmoji(r.service)}</span>
                                <span>{r.service || "-"}</span>
                              </span>
                            </div>
                            <div className="p-2 text-muted-foreground whitespace-pre-wrap leading-snug">
                              {r.allowed || "-"}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground mt-2">Nenhuma regra cadastrada para este pacote ainda.</p>
                  )}

                  <div className="mt-3 text-[11px] sm:text-xs text-muted-foreground">
                    Dica: evite links encurtados e não envie texto junto do link.
                  </div>
                </DialogContent>
              </Dialog>
              {isCombo ? (
                <div className="space-y-4">
                  {(pkg.combo_items || [])
                    .filter((it) => Number(it.service_id) > 0)
                    .map((it, idx) => {
                      const linksCount = Math.max(1, Number(it.links_count) || 1);
                      const rawLabel = it.link_label || `Item ${idx + 1}`;
                      const sectionTitle = normalizeComboTitle(rawLabel);
                      const serviceName = comboServiceNames[String(it.service_id)] || "";
                      const requirementText = `${rawLabel} ${serviceName}`;
                      const itemIsStory = /\bstory\b|\bstories\b/i.test(requirementText);
                      const itemStrictReq = getStrictRequirementFromText(requirementText);
                      const key = String(it.service_id);
                      const links = comboLinks[key] || Array.from({ length: linksCount }).map(() => "");

                      const totalQty = Number(it.quantity) || 0;
                      const filledIndices = links
                        .map((l, i) => (String(l || "").trim() ? i : -1))
                        .filter((i) => i >= 0);
                      const filledCount = filledIndices.length;

                      // Duplicate detection for this service item
                      const normalizedFilled = links
                        .map((l) => normalizeLinkForDedup(extractUrlFromText(String(l || ""))))
                        .filter(Boolean);
                      const hasDupForItem =
                        normalizedFilled.length > 0 && new Set(normalizedFilled).size !== normalizedFilled.length;

                      const allocations: number[] = Array.from({ length: linksCount }).map(() => 0);
                      if (filledCount > 0 && totalQty > 0) {
                        const base = Math.floor(totalQty / filledCount);
                        const remainder = totalQty % filledCount;
                        filledIndices.forEach((linkIdx, n) => {
                          allocations[linkIdx] = base + (n < remainder ? 1 : 0);
                        });
                      }

                      return (
                        <section
                          key={`${key}_${idx}`}
                          className="rounded-xl border border-border/60 bg-card/50 p-4 shadow-sm"
                        >
                          <header className="mb-3 flex flex-col items-center justify-center gap-2">
                            <div className="flex items-center justify-center gap-2">
                              <div className="flex items-center justify-center h-8 w-8 rounded-full bg-primary/15 border border-primary/20">
                                <LinkIcon className="h-4 w-4 text-primary" />
                              </div>

                              <div
                                className="inline-flex items-center justify-center rounded-full bg-primary px-4 py-1 text-xs font-bold tracking-wide text-primary-foreground shadow-sm ring-1 ring-primary/30"
                                aria-label={sectionTitle}
                              >
                                {sectionTitle}
                              </div>
                            </div>

                            <div className="flex flex-wrap items-center justify-center gap-2 text-xs">
                              <div className="inline-flex items-center justify-center rounded-full bg-primary/15 px-3 py-1 font-semibold text-primary ring-1 ring-primary/20">
                                Total: <span className="ml-1 font-bold tabular-nums">{totalQty.toLocaleString()}</span>
                              </div>
                              <div className="inline-flex items-center justify-center rounded-full bg-secondary/50 px-3 py-1 font-semibold text-foreground ring-1 ring-border">
                                Links preenchidos: <span className="ml-1 font-bold tabular-nums">{filledCount}</span>
                              </div>
                            </div>
                          </header>

                          {hasDupForItem && (
                            <Alert className="mb-3 bg-destructive/10 border-destructive/30">
                              <AlertTriangle className="h-4 w-4 text-destructive" />
                              <AlertDescription className="text-foreground text-sm">
                                <strong>LINK REPETIDO:</strong> Este serviço não pode ter o mesmo link em mais de um campo.
                                Mude para outro diferente.
                              </AlertDescription>
                            </Alert>
                          )}

                          <div className="space-y-3">
                            {Array.from({ length: linksCount }).map((_, linkIdx) => (
                              <div key={linkIdx} className="space-y-1">
                                <Label className="text-xs font-semibold tracking-wide uppercase text-muted-foreground flex items-center justify-between">
                                  <span>
                                    {sectionTitle} #{linkIdx + 1}
                                    {String(links[linkIdx] || "").trim() ? (
                                      <span className="ml-2 inline-flex items-center justify-center rounded-full bg-primary px-2.5 py-0.5 text-[10px] font-bold tracking-normal normal-case text-primary-foreground shadow-sm ring-1 ring-primary/30 tabular-nums">
                                        Qtd: {allocations[linkIdx].toLocaleString()}
                                      </span>
                                    ) : null}
                                  </span>
                                </Label>
                                {(() => {
                                  const fieldKey = `${key}:${linkIdx}`;
                                  const raw = String(links[linkIdx] || "");
                                  const cleaned = extractUrlFromText(raw).trim();
                                  const needsStrictUi = !itemIsStory && itemStrictReq !== "none";
                                  const validation = needsStrictUi
                                    ? validateStrictInstagramLink(cleaned, itemStrictReq)
                                    : ({ ok: true } as const);

                                  const showInvalid = needsStrictUi && !!cleaned && !validation.ok;

                                  const fallbackMessage =
                                    itemStrictReq === "profile"
                                      ? "Link incorreto. Use apenas o @usuario ou o link do perfil do Instagram."
                                      : itemStrictReq === "reel"
                                        ? "Link incorreto. Cole o link de um REEL (instagram.com/reel/...)."
                                        : itemStrictReq === "photo"
                                          ? "Link incorreto. Para este serviço, use apenas link de FOTO/POST (instagram.com/p/...)."
                                          : itemStrictReq === "media"
                                            ? "Link incorreto. Para este serviço, use apenas link de FOTO/POST (instagram.com/p/...) ou VÍDEO/REEL (instagram.com/reel/...)."
                                          : "Link incorreto. Cole um link do Instagram do conteúdo (post/reel/foto).";

                                  const msg =
                                    "message" in validation && typeof (validation as any).message === "string" && (validation as any).message
                                      ? String((validation as any).message)
                                      : fallbackMessage;

                                  const storyMsg = comboStoryInvalidByKey[fieldKey];
                                  const showStoryInvalid = itemIsStory && !!storyMsg;

                                  return (
                                    <>
                                      <Input
                                        placeholder={
                                          itemIsStory
                                            ? "@seuusuario"
                                            : itemStrictReq === "profile"
                                              ? "@seuusuario ou https://instagram.com/seuusuario"
                                              : itemStrictReq === "reel"
                                                ? "https://www.instagram.com/reel/..."
                                                : itemStrictReq === "photo"
                                                  ? "https://www.instagram.com/p/..."
                                                  : itemStrictReq === "media"
                                                    ? "https://www.instagram.com/p/... ou https://www.instagram.com/reel/..."
                                                    : "https://instagram.com/p/..."
                                        }
                                        value={raw}
                                        className={
                                          `bg-muted/30 border-primary/20 focus-visible:ring-primary/40 ` +
                                          (isBlockedPair(Number(it.service_id), raw)
                                            ? "border-destructive/60 bg-destructive/5 focus-visible:ring-destructive/30 ring-1 ring-destructive/20"
                                            : "") +
                                          (showInvalid || showStoryInvalid
                                            ? " border-destructive/60 bg-destructive/5 focus-visible:ring-destructive/30 ring-1 ring-destructive/20"
                                            : "")
                                        }
                                        onChange={(e) => {
                                          const typed = e.target.value;
                                          const { url, hadMultiple } = extractSingleUrlFromText(typed, { isStoryViews: itemIsStory });

                                          if (hadMultiple) {
                                            toast({
                                              title: "Cole apenas 1 link por campo",
                                              description: "Detectei mais de um link no mesmo campo. Mantive somente o primeiro.",
                                              variant: "destructive",
                                            });
                                          }

                                          let storyError: string | null = null;
                                          // STORY em combo: só aceita @username (ou link do story/perfil para extrair username)
                                          if (itemIsStory) {
                                            const s = String(typed || "").trim();
                                            const lower = s.toLowerCase();

                                            if (lower.includes("http") || lower.includes("www.") || lower.includes("instagram.com")) {
                                              if (!lower.includes("instagram.com")) {
                                                storyError = "Para STORY, aceitamos apenas Instagram. Digite @usuario.";
                                              } else if (lower.includes("/reel/") || lower.includes("/p/") || lower.includes("/tv/")) {
                                                storyError = "Para STORY, digite apenas @usuario (não use link de post/reel/vídeo).";
                                              } else {
                                                storyError = null;
                                              }
                                            } else {
                                              if (s.length > 0 && !s.startsWith("@")) {
                                                storyError = "Digite o @ do Instagram. Ex: @recifenafoliaa";
                                              } else if (s.startsWith("@") && !/^[a-zA-Z0-9._]{1,30}$/.test(s.replace(/^@+/, ""))) {
                                                storyError = "@ incorreto. Use apenas @usuario (sem espaços).";
                                              } else {
                                                storyError = null;
                                              }
                                            }

                                            setComboStoryInvalidByKey((prev) => {
                                              const next = { ...(prev || {}) };
                                              if (!storyError) delete next[fieldKey];
                                              else next[fieldKey] = storyError;
                                              return next;
                                            });
                                          } else {
                                            // limpar qualquer erro de story caso o item mude (segurança)
                                            setComboStoryInvalidByKey((prev) => {
                                              if (!prev?.[fieldKey]) return prev;
                                              const next = { ...prev };
                                              delete next[fieldKey];
                                              return next;
                                            });
                                          }

                                          setComboLinks((prev) => {
                                            const current = prev[key] || Array.from({ length: linksCount }).map(() => "");
                                            const nextLinks = [...current];
                                            // Em STORY, se inválido, mantemos o texto digitado para o usuário enxergar.
                                            nextLinks[linkIdx] = itemIsStory && storyError ? typed : url;
                                            return { ...prev, [key]: nextLinks };
                                          });

                                          // TikTok: resolve rápido (quase instantâneo) e bloqueia o PIX até converter.
                                          if (!itemIsStory) {
                                            const fieldKey = `combo:${key}:${linkIdx}`;

                                            // TikTok-only validation (reject other platforms)
                                            if (isTikTokPackage) {
                                              const candidate = extractUrlFromText(String(url || typed || "")).trim();
                                              const v = validateTikTokLink(candidate);
                                              setTiktokInvalidByField((prev) => {
                                                const next = { ...(prev || {}) };
                                                if (v.ok) delete next[fieldKey];
                                                else next[fieldKey] = v.message || "Apenas links do TikTok são aceitos.";
                                                return next;
                                              });
                                            }

                                            scheduleResolveTikTok(fieldKey, url, (resolved) => {
                                              if (!resolved || resolved === url) return;
                                              setComboLinks((prev) => {
                                                const cur = prev[key] || Array.from({ length: linksCount }).map(() => "");
                                                const next = [...cur];
                                                next[linkIdx] = resolved;
                                                return { ...prev, [key]: next };
                                              });

                                              // Re-validate after conversion
                                              if (isTikTokPackage) {
                                                const v = validateTikTokLink(resolved);
                                                setTiktokInvalidByField((prev) => {
                                                  const next = { ...(prev || {}) };
                                                  if (v.ok) delete next[fieldKey];
                                                  else next[fieldKey] = v.message || "Cole o link do VÍDEO do TikTok.";
                                                  return next;
                                                });
                                              }
                                            });
                                          }
                                        }}
                                        onBlur={async () => {
                                          if (itemIsStory) return;
                                          const current = String((comboLinks[key] || [])[linkIdx] || "");
                                          const resolved = await resolveTikTokIfNeeded(current);
                                          if (resolved && resolved !== current) {
                                            setComboLinks((prev) => {
                                              const cur = prev[key] || Array.from({ length: linksCount }).map(() => "");
                                              const next = [...cur];
                                              next[linkIdx] = resolved;
                                              return { ...prev, [key]: next };
                                            });
                                          }
                                        }}
                                      />
                                       {(showInvalid || showStoryInvalid || (!!tiktokInvalidByField[`combo:${key}:${linkIdx}`] && isTikTokPackage)) && (
                                         <p className="text-xs font-extrabold uppercase tracking-wide text-destructive">
                                           {isTikTokPackage
                                             ? tiktokInvalidByField[`combo:${key}:${linkIdx}`]
                                             : itemIsStory
                                               ? storyMsg
                                               : msg}
                                         </p>
                                       )}
                                    </>
                                  );
                                })()}
                              </div>
                            ))}
                          </div>

                          <div className="mt-3 flex items-center justify-center text-xs text-muted-foreground">
                            <span>
                              Quantidade deste item: <b>{totalQty.toLocaleString()}</b>
                            </span>
                          </div>
                        </section>
                      );
                    })}
                </div>
              ) : (
                <div className="space-y-4 rounded-xl border border-border/60 bg-card/50 p-4 shadow-sm">
                  <Label className="flex items-center justify-center gap-2 text-sm font-semibold tracking-wide uppercase">
                    <LinkIcon className="w-4 h-4 text-primary" />
                    {isTikTokPackage
                      ? "LINK VÍDEO TIKTOK"
                      : isStoryViewsPackage
                      ? "COLOQUE APENAS O @"
                      : strictRequirement === "profile"
                        ? "LINK DO PERFIL / @ DO INSTAGRAM"
                        : strictRequirement === "reel"
                          ? "LINK DO REEL"
                          : strictRequirement === "photo"
                            ? "LINK DA FOTO (POST)"
                            : strictRequirement === "media"
                              ? "LINK DA FOTO OU VÍDEO"
                            : (pkg.link_label || "Link do Post / Foto / Vídeo")}
                  </Label>

                  {(() => {
                    const totalQty = Number(
                      quantityMode === "fixed" ? pkg.base_quantity : quantity
                    ) || 0;

                    const filledIndices = (singleLinks || [])
                      .map((l, i) => (String(l || "").trim() ? i : -1))
                      .filter((i) => i >= 0);

                    const filledCount = filledIndices.length;
                    const allocations: number[] = Array.from({ length: desiredSingleLinkFields }).map(() => 0);

                    if (filledCount > 0 && totalQty > 0) {
                      const base = Math.floor(totalQty / filledCount);
                      const remainder = totalQty % filledCount;
                      filledIndices.forEach((linkIdx, n) => {
                        allocations[linkIdx] = base + (n < remainder ? 1 : 0);
                      });
                    }

                    return (
                      <>
                        <div className="flex flex-wrap items-center justify-center gap-2 text-xs">
                          <div className="inline-flex items-center justify-center rounded-full bg-primary/15 px-3 py-1 font-semibold text-primary ring-1 ring-primary/20">
                            Total:{" "}
                            <span className="ml-1 font-bold tabular-nums">{totalQty.toLocaleString()}</span>
                          </div>
                          <div className="inline-flex items-center justify-center rounded-full bg-secondary/50 px-3 py-1 font-semibold text-foreground ring-1 ring-border">
                            Links preenchidos:{" "}
                            <span className="ml-1 font-bold tabular-nums">{filledCount}</span>
                          </div>
                        </div>
                        {singleHasDuplicates && (
                          <Alert className="bg-destructive/10 border-destructive/30">
                            <AlertTriangle className="h-4 w-4 text-destructive" />
                            <AlertDescription className="text-foreground text-sm">
                              <strong>LINK REPETIDO:</strong> Você não pode repetir o mesmo link em mais de um campo.
                            </AlertDescription>
                          </Alert>
                        )}

                        <div className="space-y-2">
                          {Array.from({ length: desiredSingleLinkFields }).map((_, idx) => (
                            <div key={idx} className="space-y-1">
                              <Label className="text-xs font-semibold tracking-wide uppercase text-muted-foreground flex items-center justify-between">
                                <span>
                                  Link #{idx + 1}
                                  {String(singleLinks[idx] || "").trim() ? (
                                    <span className="ml-2 inline-flex items-center justify-center rounded-full bg-primary px-2.5 py-0.5 text-[10px] font-bold tracking-normal normal-case text-primary-foreground shadow-sm ring-1 ring-primary/30 tabular-nums">
                                      Qtd: {allocations[idx].toLocaleString()}
                                    </span>
                                  ) : null}
                                </span>
                              </Label>
                              {(() => {
                                const raw = String(singleLinks[idx] || "");
                                const cleaned = extractUrlFromText(raw).trim();
                                 const needsStrictUi = !isTikTokPackage && !isStoryViewsPackage && strictRequirement !== "none";
                                const validation = needsStrictUi
                                  ? validateStrictInstagramLink(cleaned, strictRequirement)
                                  : ({ ok: true } as const);

                                const showInvalid = needsStrictUi && !!cleaned && !validation.ok;

                                const fallbackMessage =
                                  strictRequirement === "profile"
                                    ? "Link incorreto. Use apenas o @usuario ou o link do perfil do Instagram."
                                    : strictRequirement === "reel"
                                      ? "Link incorreto. Cole o link de um REEL (instagram.com/reel/...)."
                                      : strictRequirement === "photo"
                                        ? "Link incorreto. Para este serviço, use apenas link de FOTO/POST (instagram.com/p/...)."
                                        : strictRequirement === "media"
                                          ? "Link incorreto. Para este serviço, use apenas link de FOTO/POST (instagram.com/p/...) ou VÍDEO/REEL (instagram.com/reel/...)."
                                        : "Link incorreto. Cole um link do Instagram do conteúdo (post/reel/foto).";

                                const msg =
                                  "message" in validation && typeof (validation as any).message === "string" && (validation as any).message
                                    ? String((validation as any).message)
                                    : fallbackMessage;

                                return (
                                  <>
                              <Input
                                placeholder={
                                  isTikTokPackage
                                    ? "https://www.tiktok.com/@user/video/123..."
                                    : isStoryViewsPackage
                                      ? "@seuusuario"
                                      : strictRequirement === "profile"
                                        ? "@seuusuario ou https://instagram.com/seuusuario"
                                        : strictRequirement === "reel"
                                          ? "https://www.instagram.com/reel/..."
                                          : strictRequirement === "photo"
                                            ? "https://www.instagram.com/p/..."
                                            : strictRequirement === "media"
                                              ? "https://www.instagram.com/p/... ou https://www.instagram.com/reel/..."
                                            : "https://instagram.com/p/..."
                                }
                                value={singleLinks[idx] || ""}
                                onChange={(e) => {
                                  const raw = e.target.value;
                                  const { url } = extractSingleUrlFromText(raw);

                                  // STORY: só aceita @username (ou link do story/perfil para extrair username)
                                  if (isStoryViewsPackage) {
                                    const s = String(raw || "").trim();
                                    const lower = s.toLowerCase();

                                    const setInvalid = (msg: string | null) => {
                                      setStoryInvalidByIndex((prev) => {
                                        const next = { ...(prev || {}) };
                                        if (!msg) delete next[idx];
                                        else next[idx] = msg;
                                        return next;
                                      });
                                    };

                                    // Se for URL
                                    if (lower.includes("http") || lower.includes("www.") || lower.includes("instagram.com")) {
                                      if (!lower.includes("instagram.com")) {
                                        setInvalid("Para STORY, aceitamos apenas Instagram. Digite @usuario.");
                                      } else if (
                                        lower.includes("/reel/") ||
                                        lower.includes("/p/") ||
                                        lower.includes("/tv/")
                                      ) {
                                        setInvalid("Para STORY, digite apenas @usuario (não use link de post/reel/vídeo).");
                                      } else {
                                        // stories/<user>/... ou perfil/<user>
                                        setInvalid(null);
                                      }
                                    } else {
                                      // Se não for URL, exigir @
                                      if (s.length > 0 && !s.startsWith("@")) {
                                        setInvalid("Digite o @ do Instagram. Ex: @recifenafoliaa");
                                      } else if (s.startsWith("@") && !/^[a-zA-Z0-9._]{1,30}$/.test(s.replace(/^@+/, ""))) {
                                        setInvalid("@ incorreto. Use apenas @usuario (sem espaços).");
                                      } else {
                                        setInvalid(null);
                                      }
                                    }
                                  }

                                  const next = [...singleLinks];
                                  // Em STORY, mantemos o texto digitado se for inválido para o usuário enxergar,
                                  // mas o processamento vai extrair/limpar via extractUrlFromText().
                                  if (isStoryViewsPackage && storyInvalidByIndex[idx]) {
                                    next[idx] = raw;
                                  } else {
                                    next[idx] = url;
                                  }
                                  setSingleLinks(next);
                                  // keep legacy single 'link' in sync for other UI logic
                                  setLink(next[0] || "");

                                  // TikTok: resolve rápido (quase instantâneo) e bloqueia o PIX até converter.
                                  if (!isStoryViewsPackage) {
                                    const fieldKey = `single:${idx}`;

                                    // TikTok-only validation (reject other platforms)
                                    if (isTikTokPackage) {
                                      const candidate = extractUrlFromText(String(url || raw || "")).trim();
                                      const v = validateTikTokLink(candidate);
                                      setTiktokInvalidByField((prev) => {
                                        const next = { ...(prev || {}) };
                                        if (v.ok) delete next[fieldKey];
                                        else next[fieldKey] = v.message || "Apenas links do TikTok são aceitos.";
                                        return next;
                                      });
                                    }

                                    scheduleResolveTikTok(fieldKey, url, (resolved) => {
                                      if (!resolved || resolved === url) return;
                                      setSingleLinks((prev) => {
                                        const next = [...prev];
                                        next[idx] = resolved;
                                        return next;
                                      });
                                      setLink((prev) => (idx === 0 ? resolved : prev));

                                      // Re-validate after conversion
                                      if (isTikTokPackage) {
                                        const v = validateTikTokLink(resolved);
                                        setTiktokInvalidByField((prev) => {
                                          const next = { ...(prev || {}) };
                                          if (v.ok) delete next[fieldKey];
                                          else next[fieldKey] = v.message || "Cole o link do VÍDEO do TikTok.";
                                          return next;
                                        });
                                      }
                                    });
                                  }
                                }}
                                onBlur={async () => {
                                  if (isStoryViewsPackage) return;
                                  const current = String(singleLinks[idx] || "");
                                  const resolved = await resolveTikTokIfNeeded(current);
                                  if (resolved && resolved !== current) {
                                    setSingleLinks((prev) => {
                                      const next = [...prev];
                                      next[idx] = resolved;
                                      return next;
                                    });
                                    setLink((prev) => (idx === 0 ? resolved : prev));
                                  }
                                }}
                                  className={
                                    `bg-muted/30 border-primary/20 focus-visible:ring-primary/40 ` +
                                    (isBlockedPair(Number(pkg.service_id), singleLinks[idx] || "")
                                      ? "border-destructive/60 bg-destructive/5 focus-visible:ring-destructive/30 ring-1 ring-destructive/20"
                                      : "") +
                                    (showInvalid || (isStoryViewsPackage && !!storyInvalidByIndex[idx])
                                      ? " border-destructive/60 bg-destructive/5 focus-visible:ring-destructive/30 ring-1 ring-destructive/20"
                                      : "")
                                  }
                              />
                              {(showInvalid || (isStoryViewsPackage && !!storyInvalidByIndex[idx])) && (
                                <p className="text-xs text-destructive">
                                  {isStoryViewsPackage ? storyInvalidByIndex[idx] : msg}
                                </p>
                              )}

                              {isTikTokPackage && !!tiktokInvalidByField[`single:${idx}`] && (
                                <p className="text-xs font-extrabold uppercase tracking-wide text-destructive">
                                  {tiktokInvalidByField[`single:${idx}`]}
                                </p>
                              )}
                                  </>
                                );
                              })()}
                            </div>
                          ))}
                        </div>

                        <p className="text-xs text-muted-foreground text-center">
                          Dica: preencha 1 link (tudo vai para ele) ou preencha vários para distribuir automaticamente.
                        </p>
                      </>
                    );
                  })()}
                </div>
              )}

              {/* Duplicate block warning (single + combo) */}
              {duplicateBlockMessage && (
                <Alert className="bg-destructive/10 border-destructive/30">
                  <AlertTriangle className="h-4 w-4 text-destructive" />
                  <AlertDescription className="text-foreground text-sm">
                    <strong>PEDIDO ATIVO:</strong> {duplicateBlockMessage}
                  </AlertDescription>
                </Alert>
              )}

              {/* Popup (requested): blocks before PIX when same service + same link has an active order */}
              <AlertDialog open={duplicateDialogOpen} onOpenChange={setDuplicateDialogOpen}>
                <AlertDialogContent className="max-w-md rounded-2xl border-border/60 bg-background/95 p-5 shadow-2xl backdrop-blur-md sm:p-6">
                  <AlertDialogHeader className="space-y-3">
                    <div className="flex items-start gap-3">
                      <div className="mt-0.5 inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-destructive/10 ring-1 ring-destructive/20">
                        <AlertTriangle className="h-5 w-5 text-destructive" />
                      </div>

                      <div className="min-w-0">
                        <AlertDialogTitle className="text-base font-semibold tracking-tight sm:text-lg">
                          VOCÊ TEM UM PEDIDO ATIVO
                        </AlertDialogTitle>
                        <AlertDialogDescription className="mt-1 text-sm leading-relaxed text-muted-foreground">
                          {duplicateBlockMessage ||
                            "Aguarde a finalização para comprar novamente para este mesmo link, ou compre para outro link."}
                        </AlertDialogDescription>
                      </div>
                    </div>
                  </AlertDialogHeader>

                  <AlertDialogFooter className="mt-2 sm:justify-end">
                    <AlertDialogAction className="h-10 rounded-xl px-6">
                      Entendi
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>

              {/* Combo validation (real-time) */}
              {isCombo && (comboMissingLinks || comboHasDuplicates) && (
                <Alert className="bg-destructive/10 border-destructive/30">
                  <AlertTriangle className="h-4 w-4 text-destructive" />
                  <AlertDescription className="text-foreground text-sm">
                    {comboHasDuplicates ? (
                      <>
                        <strong>LINK REPETIDO:</strong> Remova links duplicados no mesmo item do combo.
                      </>
                    ) : (
                      <>
                        <strong>LINKS INCOMPLETOS:</strong> Preencha pelo menos 1 link em cada item do combo para continuar.
                      </>
                    )}
                  </AlertDescription>
                </Alert>
              )}

              {/* Single validation (real-time) */}
              {!isCombo && (singleMissingLinks || singleHasDuplicates || !!singleInvalidStrictMessage) && (
                <Alert className="bg-destructive/10 border-destructive/30">
                  <AlertTriangle className="h-4 w-4 text-destructive" />
                  <AlertDescription className="text-foreground text-sm">
                    {singleHasDuplicates ? (
                      <>
                        <strong>LINK REPETIDO:</strong> Remova links duplicados.
                      </>
                    ) : singleInvalidStrictMessage ? (
                      <>
                        <strong>LINK INCORRETO:</strong> {singleInvalidStrictMessage}
                      </>
                    ) : (
                      <>
                        <strong>LINKS INCOMPLETOS:</strong> Preencha pelo menos 1 link para continuar.
                      </>
                    )}
                  </AlertDescription>
                </Alert>
              )}

              {/* Space so the sticky footer doesn't cover the last inputs */}
              <div className="h-24" />

              <div className="sticky bottom-0 -mx-6 px-6 py-4 bg-card/90 backdrop-blur supports-[backdrop-filter]:bg-card/80 border-t border-border/60">
                <div className="p-4 rounded-xl bg-card/50 border border-border/60">
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-muted-foreground">Total</span>
                    <span className="text-xl font-bold text-primary">{formatCurrency(totalPrice)}</span>
                  </div>
                </div>

                <div className="mt-3 flex gap-2">
                  <Button variant="outline" onClick={() => setStep("phone")} className="flex-1">
                    Voltar
                  </Button>
                  <Button
                    onClick={handleGeneratePix}
                    disabled={
                      !authSession ||
                      isLoading ||
                      checkingDuplicate ||
                      duplicateCheckQueued ||
                      !!duplicateBlockMessage ||
                      tiktokConversionPending ||
                      hasTikTokInvalid ||
                      (isCombo
                        ? comboMissingLinks || comboHasDuplicates
                        : singleMissingLinks || singleHasDuplicates || !!singleInvalidStrictMessage)
                    }
                    className="flex-1"
                  >
                    {isLoading ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Gerando PIX...
                      </>
                    ) : checkingDuplicate || duplicateCheckQueued || tiktokConversionPending ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Verificando...
                      </>
                    ) : (
                      "Gerar PIX"
                    )}
                  </Button>
                </div>
              </div>
            </div>
          )}

          {step === "payment" && pixData && (
            <div className="space-y-4">
              <div className="text-center">
                <p className="text-sm text-muted-foreground mb-4">
                  Escaneie o QR Code ou copie a chave PIX para pagar
                </p>

                {pixData.qr_code_base64 ? (
                  <div className="bg-white p-4 rounded-xl inline-block mx-auto">
                    <img
                      src={`data:image/png;base64,${pixData.qr_code_base64}`}
                      alt="QR Code PIX"
                      className="w-48 h-48"
                    />
                  </div>
                ) : (
                  <div className="bg-white p-8 rounded-xl inline-block mx-auto">
                    <QrCode className="w-32 h-32 text-gray-400" />
                  </div>
                )}

                <div className="mt-4">
                  <p className="text-2xl font-bold text-primary">{formatCurrency(totalPrice)}</p>
                </div>
              </div>

              <Button onClick={copyPixCode} className="w-full gap-2 bg-primary hover:bg-primary/90">
                <Copy className="w-4 h-4" />
                Copiar Chave PIX
              </Button>

              <div className="p-3 rounded-lg bg-blue-500/10 border border-blue-500/20">
                <p className="text-xs text-center text-blue-300">
                  💡 Você pode minimizar esta página para abrir o app do banco. O pagamento será detectado
                  automaticamente.
                </p>
              </div>

              <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="w-4 h-4 animate-spin text-primary" />
                Aguardando confirmação do pagamento...
              </div>

              <Button variant="outline" onClick={handleCancel} className="w-full">
                Cancelar
              </Button>
            </div>
          )}

          {step === "success" && (
            <div className="space-y-4 text-center py-4">
              <div className="w-16 h-16 rounded-full bg-green-500/20 flex items-center justify-center mx-auto">
                <CheckCircle className="w-10 h-10 text-green-500" />
              </div>
              <div>
                <h3 className="text-xl font-bold">Pagamento Confirmado!</h3>
                <p className="text-muted-foreground mt-2">Seu pedido foi enviado e está sendo processado.</p>
                <p className="text-sm text-muted-foreground mt-4">
                  Consulte o status usando seu número de telefone.
                </p>
              </div>
              <Button onClick={handleClose} className="w-full">
                Fechar
              </Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

