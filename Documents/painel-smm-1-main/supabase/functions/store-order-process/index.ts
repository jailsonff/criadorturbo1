import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { order_id, action, externalDb } = await req.json();

    const supabaseUrl = (externalDb?.url as string | undefined) || Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = (externalDb?.serviceRoleKey as string | undefined) ||
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    console.log(`[store-order-process] Action: ${action}, Order ID: ${order_id}`);

    if (action === "process_paid_order") {
      // CRITICAL: Use atomic update to claim this order for processing
      // This prevents duplicate processing when multiple requests arrive
       const { data: claimedOrder, error: claimError } = await supabase
         .from("store_orders")
         .update({ order_status: "processing" })
         .eq("id", order_id)
         .eq("payment_status", "approved")
         .eq("order_status", "pending") // claim only once
         .is("external_order_id", null) // legacy single
         .is("external_order_ids", null) // combo
         .select(
           `
           *,
           store_packages(service_id, package_type, combo_items)
         `
         )
         .maybeSingle();

      if (claimError) {
        console.error("[store-order-process] Error claiming order:", claimError);
        return new Response(JSON.stringify({ error: "Error claiming order" }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // If no order was returned, check why
      if (!claimedOrder) {
        // Fetch the order to understand the state
        const { data: existingOrder } = await supabase
          .from("store_orders")
          .select("id, payment_status, order_status, external_order_id, external_order_ids")
          .eq("id", order_id)
          .maybeSingle();

        if (!existingOrder) {
          console.log("[store-order-process] Order not found:", order_id);
          return new Response(JSON.stringify({ error: "Order not found" }), {
            status: 404,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        if (existingOrder.external_order_id || existingOrder.external_order_ids) {
          console.log("[store-order-process] Order already processed (duplicate prevented)");
          return new Response(
            JSON.stringify({
              message: "Order already processed",
              external_order_id: existingOrder.external_order_id,
              external_order_ids: existingOrder.external_order_ids,
            }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        if (existingOrder.order_status === "completed") {
          console.log("[store-order-process] Order already completed");
          return new Response(JSON.stringify({ message: "Order already completed" }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        if (existingOrder.payment_status !== "approved") {
          console.log("[store-order-process] Order not paid yet");
          return new Response(JSON.stringify({ error: "Order not paid" }), {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        // Another process is handling this order
        console.log(
          "[store-order-process] Order being processed by another request (duplicate prevented):",
          order_id
        );
        return new Response(JSON.stringify({ message: "Order already being processed" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const order = claimedOrder as any;
      console.log("[store-order-process] Successfully claimed order for processing:", order_id);

      // @ts-ignore - store_packages may be returned as object or array depending on PostgREST
      const pkgRow = Array.isArray(order.store_packages) ? order.store_packages[0] : order.store_packages;
      const packageType = (pkgRow?.package_type as string | undefined) || "single";

       type StrictIgRequirement = "reel" | "photo" | "media" | "content" | "profile" | "none";

       const getStrictRequirement = (textRaw: unknown): StrictIgRequirement => {
         const text = String(textRaw || "").toLowerCase();
         const compact = text.replace(/\s+/g, " ").trim();

         // IMPORTANT: apply strict Instagram link rules ONLY for Instagram services.
         // Otherwise TikTok (and other platforms) that contain keywords like "curtidas"
         // would be incorrectly validated as Instagram and fail server-side.
         const isTikTokContext = text.includes("tiktok");
         const isInstagramContext =
           text.includes("instagram") ||
           text.includes("insta") ||
           /(^|\s)ig(\s|$)/.test(compact);
         if (isTikTokContext || !isInstagramContext) return "none";

         // Stories usam regra própria em outro fluxo (username-only)
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
      };

      const strictRequirement = getStrictRequirement((order as any)?.service_name);

      const validateStrictInstagramLink = (raw: string, requirement: StrictIgRequirement): { ok: boolean; error?: string } => {
        if (requirement === "none") return { ok: true };

        const v = String(raw || "").trim();
        if (!v) return { ok: false, error: "Missing link" };

        if (requirement === "profile") {
          const candidate = v.trim();

          // @username
          if (candidate.startsWith("@")) {
            const u = candidate.replace(/^@+/, "");
            if (!/^[a-zA-Z0-9._]{1,30}$/.test(u)) return { ok: false, error: "Invalid username" };
            return { ok: true };
          }

          // username puro
          if (/^[a-zA-Z0-9._]{1,30}$/.test(candidate)) return { ok: true };

          // link de perfil
          let url: URL;
          try {
            const withProto = /^https?:\/\//i.test(candidate) ? candidate : `https://${candidate}`;
            url = new URL(withProto);
          } catch {
            return { ok: false, error: "Invalid profile input" };
          }

          const host = url.hostname.toLowerCase();
          if (!host.includes("instagram.com")) return { ok: false, error: "Non-Instagram URL" };

          const parts = String(url.pathname || "")
            .split("/")
            .map((p) => p.trim())
            .filter(Boolean);

          const first = (parts[0] || "").toLowerCase();

          // bloquear posts/reels
          if (["reel", "p", "tv"].includes(first) || ["reel", "p", "tv"].includes((parts[1] || "").toLowerCase())) {
            return { ok: false, error: "Post/Reel not allowed" };
          }

          if (!first || first === "stories" || first === "explore") return { ok: false, error: "Not a profile" };
          return { ok: true };
        }

        if (v.includes("@")) return { ok: false, error: "@/profile is not allowed" };

        let url: URL;
        try {
          const candidate = /^https?:\/\//i.test(v) ? v : `https://${v}`;
          url = new URL(candidate);
        } catch {
          return { ok: false, error: "Invalid URL" };
        }

        const host = url.hostname.toLowerCase();
        if (!host.includes("instagram.com")) return { ok: false, error: "Non-Instagram URL" };

        const parts = String(url.pathname || "")
          .split("/")
          .map((p) => p.trim())
          .filter(Boolean);

        const hasShortcode = (idx: number) => Boolean(parts[idx] && parts[idx + 1]);

        const isReel = (parts[0] === "reel" && hasShortcode(0)) || (parts[1] === "reel" && hasShortcode(1));
        const isPost = (parts[0] === "p" && hasShortcode(0)) || (parts[1] === "p" && hasShortcode(1));
         const isTv = (parts[0] === "tv" && hasShortcode(0)) || (parts[1] === "tv" && hasShortcode(1));
         const isContent = isReel || isPost || isTv;

        if (!isContent) return { ok: false, error: "Profile link is not allowed" };
        if (requirement === "reel" && !isReel) return { ok: false, error: "Reel link required" };
        if (requirement === "photo" && !isPost) return { ok: false, error: "Post/photo link required" };
         if (requirement === "media" && !(isReel || isPost)) return { ok: false, error: "Post/photo or reel link required" };
        return { ok: true };
      };

      const createProviderOrder = async (serviceExternalId: number, link: string, quantity: number) => {
        const { data: service, error: serviceError } = await supabase
          .from("imported_services")
          .select("provider_id, external_service_id")
          .eq("external_service_id", serviceExternalId)
          .single();

        if (serviceError || !service) {
          throw new Error(`Service not found: ${serviceExternalId}`);
        }

        const { data: provider, error: providerError } = await supabase
          .from("smm_providers")
          .select("api_url, api_key")
          .eq("id", service.provider_id)
          .single();

        if (providerError || !provider) {
          throw new Error(`Provider not found for service: ${serviceExternalId}`);
        }

        const formData = new FormData();
        formData.append("key", provider.api_key);
        formData.append("action", "add");
        formData.append("service", serviceExternalId.toString());
        formData.append("link", link);
        formData.append("quantity", quantity.toString());

        const apiResponse = await fetch(provider.api_url, { method: "POST", body: formData });
        const apiResult = await apiResponse.json();
        if (!apiResult?.order) {
          throw new Error(apiResult?.error || "API error");
        }
        return Number(apiResult.order);
      };

      // COMBO: create multiple provider orders
      if (packageType === "combo") {
        const payload = (order.order_payload as any) || {};
        const items: Array<{ service_id: number; quantity: number; links: string[] }> = Array.isArray(payload.items)
          ? payload.items
          : [];

        if (items.length === 0) {
          console.error("[store-order-process] Combo payload has no items");
          await supabase.from("store_orders").update({ order_status: "error" }).eq("id", order_id);
          return new Response(JSON.stringify({ error: "Combo payload missing" }), {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        const extractFirstUrl = (raw: string) => {
          const s = String(raw || "");
          const match = s.match(/(https?:\/\/[^\s]+|www\.[^\s]+|(?:m\.)?instagram\.com\/[^\s]+)/i);
          if (!match) return String(raw || "").trim();

          let candidate = String(match[0] || "")
            .trim()
            .replace(/^[\[({<"'“”‘’]+/g, "")
            .replace(/[\]\[(){}<>"',;.!?…]+$/g, "");

          // If there are multiple URLs concatenated, keep only the first.
          const secondHttpIdx = candidate.toLowerCase().indexOf("http", 4);
          if (secondHttpIdx > 0) candidate = candidate.slice(0, secondHttpIdx).replace(/\/*$/g, "");

          if (/^www\./i.test(candidate)) candidate = `https://${candidate}`;
          if (/^(?:m\.)?instagram\.com\//i.test(candidate)) {
            candidate = `https://www.${candidate}`.replace("https://www.m.", "https://m.");
          }

          const canonicalizeInstagramPath = (pathname: string) => {
            const parts = String(pathname || "")
              .split("/")
              .map((p) => p.trim())
              .filter(Boolean);
            const isShortcodeType = (t: string) => ["reel", "p", "tv"].includes(String(t || "").toLowerCase());

            if (parts.length >= 3 && isShortcodeType(parts[1])) return `/${parts[0]}/${parts[1]}/${parts[2]}`;
            if (parts.length >= 2 && isShortcodeType(parts[0])) return `/${parts[0]}/${parts[1]}`;
            return pathname.replace(/\/+$/g, "");
          };

          // Strip query/hash, keep only origin + pathname
          try {
            const u = new URL(candidate);
            const host = u.hostname.toLowerCase();
            const pathname = host.includes("instagram.com")
              ? canonicalizeInstagramPath(u.pathname)
              : u.pathname.replace(/\/+$/g, "");
            return `https://${host}${pathname}`;
          } catch {
            return candidate
              .split("?")[0]
              .split("#")[0]
              .trim()
              .replace(/\s+/g, "")
              .replace(/\/+$/g, "")
              .toLowerCase();
          }
        };

        const normalizeForDedup = (raw: string) => {
          const cleaned = extractFirstUrl(raw);
          return String(cleaned || "")
            .trim()
            .replace(/\s+/g, "")
            .replace(/\/+$/g, "")
            .toLowerCase();
        };

        // Server-side safety: block duplicated links inside the same service item
        for (const item of items) {
          const links = (Array.isArray(item.links) ? item.links : [])
            .map((l) => extractFirstUrl(String(l || "")))
            .map((l) => String(l || "").trim())
            .filter(Boolean);

          // Server-side validation: for Instagram-only strict packages, reject profile/@/other networks
          if (strictRequirement !== "none") {
            for (const l of links) {
              const v = validateStrictInstagramLink(l, strictRequirement);
              if (!v.ok) {
                console.error("[store-order-process] Invalid link for strict IG package:", v.error);
                await supabase.from("store_orders").update({ order_status: "error" }).eq("id", order_id);
                return new Response(
                  JSON.stringify({ error: "Invalid link", details: v.error }),
                  { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
                );
              }
            }
          }

          const normalized = links.map(normalizeForDedup).filter(Boolean);
          if (normalized.length > 0 && new Set(normalized).size !== normalized.length) {
            console.error("[store-order-process] Duplicate links detected for service:", item.service_id);
            await supabase.from("store_orders").update({ order_status: "error" }).eq("id", order_id);
            return new Response(
              JSON.stringify({
                error: "Duplicate links for same service",
                service_id: item.service_id,
              }),
              { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
          }
        }

        const results: any[] = [];
        const errors: any[] = [];

        for (const item of items) {
          const serviceId = Number(item.service_id);
          const totalQty = Math.max(0, Number(item.quantity) || 0);
          const links = (Array.isArray(item.links) ? item.links : [])
            .map((l) => extractFirstUrl(String(l || "")))
            .map((l) => String(l || "").trim())
            .filter(Boolean);

          if (strictRequirement !== "none") {
            for (const l of links) {
              const v = validateStrictInstagramLink(l, strictRequirement);
              if (!v.ok) {
                console.error("[store-order-process] Invalid link for strict IG package:", v.error);
                await supabase.from("store_orders").update({ order_status: "error" }).eq("id", order_id);
                return new Response(
                  JSON.stringify({ error: "Invalid link", details: v.error }),
                  { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
                );
              }
            }
          }

          if (links.length === 0) continue;

          // Split quantity across links (ex: 10.000 with 2 links => 5.000 each).
          const n = links.length;
          const base = Math.floor(totalQty / n);
          const remainder = totalQty % n;

          for (let i = 0; i < links.length; i++) {
            const link = extractFirstUrl(links[i]);
            const qty = base + (i < remainder ? 1 : 0);
            if (!link || qty <= 0) continue;

            try {
              const externalOrderId = await createProviderOrder(serviceId, link, qty);
              results.push({
                service_id: serviceId,
                link,
                quantity: qty,
                external_order_id: externalOrderId,
                // per-link status starts as processing; will be updated by sync
                order_status: "processing",
                provider_status: "processing",
              });
            } catch (e) {
              const msg = e instanceof Error ? e.message : String(e);
              errors.push({ service_id: serviceId, link, error: msg });
              // Keep a row for visibility in UI (so each link can show error)
              results.push({
                service_id: serviceId,
                link,
                quantity: qty,
                external_order_id: null,
                order_status: "error",
                provider_status: "error",
                error: msg,
              });
            }
          }
        }

        const successful = results.filter((r: any) => Number(r?.external_order_id) > 0);
        const update: Record<string, any> = {
          external_order_ids: results,
          external_order_id: results[0]?.external_order_id ?? null, // legacy convenience
          // IMPORTANT:
          // - If at least one sub-order was created, the overall order is still processable/tracked.
          // - Only mark the whole order as error when ALL sub-orders failed to be created.
          order_status:
            successful.length === 0
              ? "error"
              : errors.length > 0
                ? "partial"
                : "processing",
        };

        await supabase.from("store_orders").update(update).eq("id", order_id);

        if (results.length > 0) {
          await supabase.rpc("increment_package_sales", { package_id: order.package_id });
        }

        return new Response(
          JSON.stringify({
            success: errors.length === 0,
            external_order_ids: results,
            errors,
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // SINGLE (supports multi-link via order_payload)
      const serviceId = pkgRow?.service_id;
      if (!serviceId) {
        console.error("[store-order-process] No service_id found for package");
        await supabase.from("store_orders").update({ order_status: "error" }).eq("id", order_id);
        return new Response(JSON.stringify({ error: "No service configured for package" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const payload = (order.order_payload as any) || {};
      const payloadLinks = Array.isArray(payload.links) ? payload.links : [];
      const isMultiLinkSingle = payload?.type === "single" && payloadLinks.length > 0;

      const extractFirstUrlSingle = (raw: string) => {
        const s = String(raw || "");
        const match = s.match(/(https?:\/\/[^\s]+|www\.[^\s]+|(?:m\.)?instagram\.com\/[^\s]+)/i);
        if (!match) return String(raw || "").trim();

        let candidate = String(match[0] || "")
          .trim()
          .replace(/^[\[({<"'“”‘’]+/g, "")
          .replace(/[\]\[(){}<>"',;.!?…]+$/g, "");

        const secondHttpIdx = candidate.toLowerCase().indexOf("http", 4);
        if (secondHttpIdx > 0) candidate = candidate.slice(0, secondHttpIdx).replace(/\/*$/g, "");
        if (/^www\./i.test(candidate)) candidate = `https://${candidate}`;
        if (/^(?:m\.)?instagram\.com\//i.test(candidate)) {
          candidate = `https://www.${candidate}`.replace("https://www.m.", "https://m.");
        }

        const canonicalizeInstagramPath = (pathname: string) => {
          const parts = String(pathname || "")
            .split("/")
            .map((p) => p.trim())
            .filter(Boolean);
          const isShortcodeType = (t: string) => ["reel", "p", "tv"].includes(String(t || "").toLowerCase());

          if (parts.length >= 3 && isShortcodeType(parts[1])) return `/${parts[0]}/${parts[1]}/${parts[2]}`;
          if (parts.length >= 2 && isShortcodeType(parts[0])) return `/${parts[0]}/${parts[1]}`;
          return pathname.replace(/\/+$/g, "");
        };

        try {
          const u = new URL(candidate);
          const host = u.hostname.toLowerCase();
          const pathname = host.includes("instagram.com")
            ? canonicalizeInstagramPath(u.pathname)
            : u.pathname.replace(/\/+$/g, "");
          return `https://${host}${pathname}`;
        } catch {
          return candidate
            .split("?")[0]
            .split("#")[0]
            .trim()
            .replace(/\s+/g, "")
            .replace(/\/+$/g, "")
            .toLowerCase();
        }
      };

      const normalizeForDedup = (raw: string) => {
        const cleaned = extractFirstUrlSingle(raw);
        return String(cleaned || "")
          .trim()
          .replace(/\s+/g, "")
          .replace(/\/+$/g, "")
          .toLowerCase();
      };

      if (isMultiLinkSingle) {
        const links = payloadLinks.map((l: any) => String(l || "").trim()).filter(Boolean);

        if (strictRequirement !== "none") {
          for (const l of links) {
            const v = validateStrictInstagramLink(l, strictRequirement);
            if (!v.ok) {
              console.error("[store-order-process] Invalid link for strict IG package:", v.error);
              await supabase.from("store_orders").update({ order_status: "error" }).eq("id", order_id);
              return new Response(JSON.stringify({ error: "Invalid link", details: v.error }), {
                status: 400,
                headers: { ...corsHeaders, "Content-Type": "application/json" },
              });
            }
          }
        }
        const normalized = links.map(normalizeForDedup).filter(Boolean);

        if (normalized.length > 0 && new Set(normalized).size !== normalized.length) {
          console.error("[store-order-process] Duplicate links detected (single):", serviceId);
          await supabase.from("store_orders").update({ order_status: "error" }).eq("id", order_id);
          return new Response(JSON.stringify({ error: "Duplicate links" }), {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        const totalQty = Math.max(0, Number(payload.quantity ?? order.quantity) || 0);
        const n = links.length;
        const base = Math.floor(totalQty / n);
        const remainder = totalQty % n;

        const results: any[] = [];
        const errors: any[] = [];

        for (let i = 0; i < links.length; i++) {
          const link = links[i];
          const qty = base + (i < remainder ? 1 : 0);
          if (!link || qty <= 0) continue;

          try {
            const externalOrderId = await createProviderOrder(Number(serviceId), link, qty);
            results.push({
              service_id: Number(serviceId),
              link,
              quantity: qty,
              external_order_id: externalOrderId,
              order_status: "processing",
              provider_status: "processing",
            });
          } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            errors.push({ link, error: msg });
            results.push({
              service_id: Number(serviceId),
              link,
              quantity: qty,
              external_order_id: null,
              order_status: "error",
              provider_status: "error",
              error: msg,
            });
          }
        }

        const successful = results.filter((r: any) => Number(r?.external_order_id) > 0);
        const update: Record<string, any> = {
          external_order_ids: results,
          external_order_id: results[0]?.external_order_id ?? null,
          // Same rule as combo: don't fail the whole order if some links were created successfully.
          order_status:
            successful.length === 0
              ? "error"
              : errors.length > 0
                ? "partial"
                : "processing",
        };

        await supabase.from("store_orders").update(update).eq("id", order_id);

        if (results.length > 0) {
          await supabase.rpc("increment_package_sales", { package_id: order.package_id });
        }

        return new Response(
          JSON.stringify({
            success: errors.length === 0,
            external_order_ids: results,
            errors,
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Legacy single-link
      try {
        if (strictRequirement !== "none") {
          const v = validateStrictInstagramLink(String(order.link), strictRequirement);
          if (!v.ok) {
            console.error("[store-order-process] Invalid link for strict IG package:", v.error);
            await supabase.from("store_orders").update({ order_status: "error" }).eq("id", order_id);
            return new Response(JSON.stringify({ error: "Invalid link", details: v.error }), {
              status: 400,
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
          }
        }
        const externalOrderId = await createProviderOrder(Number(serviceId), String(order.link), Number(order.quantity));

        await supabase
          .from("store_orders")
          .update({ external_order_id: externalOrderId, order_status: "processing" })
          .eq("id", order_id);

        await supabase.rpc("increment_package_sales", { package_id: order.package_id });

        console.log(`[store-order-process] Order created successfully: ${externalOrderId}`);

        return new Response(
          JSON.stringify({
            success: true,
            external_order_id: externalOrderId,
            message: "Order processed successfully",
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        console.error("[store-order-process] API error:", msg);
        await supabase.from("store_orders").update({ order_status: "error" }).eq("id", order_id);
        return new Response(JSON.stringify({ error: msg || "API error" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    if (action === "check_status") {
      // Check status of an existing order from SMM API
      const { data: order, error: orderError } = await supabase
        .from("store_orders")
        .select(`
          id, external_order_id, order_status,
          store_packages(service_id)
        `)
        .eq("id", order_id)
        .single();

      if (orderError || !order?.external_order_id) {
        console.log("[store-order-process] Order not found or no external_order_id:", order_id);
        return new Response(
          JSON.stringify({ error: "Order not found or not yet processed" }),
          { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // @ts-ignore - store_packages is an array from join
      const serviceId = Array.isArray(order.store_packages) ? order.store_packages[0]?.service_id : order.store_packages?.service_id;
      if (!serviceId) {
        console.error("[store-order-process] No service_id for check_status:", order_id);
        return new Response(
          JSON.stringify({ error: "No service configured" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Get service with provider
      const { data: service, error: serviceError } = await supabase
        .from("imported_services")
        .select("provider_id")
        .eq("external_service_id", serviceId)
        .single();

      if (serviceError || !service) {
        console.error("[store-order-process] Service not found for check_status:", serviceError);
        return new Response(
          JSON.stringify({ error: "Service not found" }),
          { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Get provider credentials
      const { data: providerData, error: providerError } = await supabase
        .from("smm_providers")
        .select("api_url, api_key")
        .eq("id", service.provider_id)
        .single();

      if (providerError || !providerData?.api_url || !providerData?.api_key) {
        console.error("[store-order-process] Provider not found for order:", order_id, providerError);
        return new Response(
          JSON.stringify({ error: "Provider configuration not found" }),
          { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Call SMM API to check order status
      console.log(`[store-order-process] Checking status for external order ${order.external_order_id}`);
      
      const formData = new FormData();
      formData.append("key", providerData.api_key);
      formData.append("action", "status");
      formData.append("order", order.external_order_id.toString());

      try {
        const apiResponse = await fetch(providerData.api_url, {
          method: "POST",
          body: formData,
        });

        const apiResult = await apiResponse.json();
        console.log("[store-order-process] Status API response:", apiResult);

        // Map API status to our status
        let newOrderStatus = order.order_status;
        if (apiResult.status) {
          const apiStatus = apiResult.status.toLowerCase();
          if (apiStatus === "completed") {
            newOrderStatus = "completed";
          } else if (apiStatus === "in progress" || apiStatus === "inprogress" || apiStatus === "processing" || apiStatus === "pending") {
            newOrderStatus = "processing";
          } else if (apiStatus === "partial") {
            newOrderStatus = "partial";
          } else if (apiStatus === "canceled" || apiStatus === "cancelled" || apiStatus === "refunded") {
            newOrderStatus = "cancelled";
          } else if (apiStatus === "error" || apiStatus === "failed") {
            newOrderStatus = "error";
          }
        }

        // Update order with status info from API
        const updateData: Record<string, any> = {};
        
        if (apiResult.start_count !== undefined) {
          updateData.start_count = String(apiResult.start_count);
        }
        if (apiResult.remains !== undefined) {
          updateData.remains = String(apiResult.remains);
        }
        if (newOrderStatus !== order.order_status) {
          updateData.order_status = newOrderStatus;
        }

        if (Object.keys(updateData).length > 0) {
          await supabase
            .from("store_orders")
            .update(updateData)
            .eq("id", order_id);
          console.log("[store-order-process] Updated order with status:", updateData);
        }

        return new Response(
          JSON.stringify({ 
            external_order_id: order.external_order_id,
            status: apiResult.status,
            start_count: apiResult.start_count,
            remains: apiResult.remains,
            charge: apiResult.charge,
            order_status: newOrderStatus,
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      } catch (apiError) {
        console.error("[store-order-process] Error calling SMM API:", apiError);
        return new Response(
          JSON.stringify({ error: "Failed to check status with provider" }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    // Action: sync_all_processing - Sync status for all paid orders that are still in progress
    if (action === "sync_all_processing") {
      const { data: processingOrders, error: fetchError } = await supabase
        .from("store_orders")
        .select(`
          id,
          order_status,
          external_order_id,
          external_order_ids,
          store_packages(service_id, package_type)
        `)
        .eq("payment_status", "approved")
        // Include 'error' as well so we can recover from transient provider/network issues
        // and re-sync real statuses after a partial success.
        .in("order_status", ["processing", "pending", "partial", "error"])
        .order("updated_at", { ascending: false })
        .limit(200);

      if (fetchError) {
        console.error("[store-order-process] Error fetching processing orders:", fetchError);
        return new Response(JSON.stringify({ error: "Failed to fetch orders" }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const normalizeApiStatusToOrderStatus = (apiStatusRaw: unknown) => {
        const apiStatus = String(apiStatusRaw || "").toLowerCase();
        if (apiStatus === "completed") return "completed";
        if (
          apiStatus === "in progress" ||
          apiStatus === "inprogress" ||
          apiStatus === "processing" ||
          apiStatus === "pending"
        )
          return "processing";
        if (apiStatus === "partial") return "partial";
        if (apiStatus === "canceled" || apiStatus === "cancelled" || apiStatus === "refunded") return "cancelled";
        if (apiStatus === "error" || apiStatus === "failed") return "error";
        return "processing";
      };

      const getProviderForService = async (serviceExternalId: number) => {
        const { data: service, error: serviceError } = await supabase
          .from("imported_services")
          .select("provider_id")
          .eq("external_service_id", serviceExternalId)
          .single();

        if (serviceError || !service?.provider_id) {
          throw new Error(`Service/provider not found: ${serviceExternalId}`);
        }

        const { data: provider, error: providerError } = await supabase
          .from("smm_providers")
          .select("api_url, api_key")
          .eq("id", service.provider_id)
          .single();

        if (providerError || !provider?.api_url || !provider?.api_key) {
          throw new Error(`Provider credentials missing for service: ${serviceExternalId}`);
        }

        return provider;
      };

      const checkProviderOrderStatus = async (serviceExternalId: number, externalOrderId: number) => {
        const provider = await getProviderForService(serviceExternalId);
        const formData = new FormData();
        formData.append("key", provider.api_key);
        formData.append("action", "status");
        formData.append("order", String(externalOrderId));

        const apiResponse = await fetch(provider.api_url, { method: "POST", body: formData });
        const apiResult = await apiResponse.json();

        return {
          apiResult,
          mappedStatus: normalizeApiStatusToOrderStatus(apiResult?.status),
        };
      };

      console.log(`[store-order-process] Found ${processingOrders?.length || 0} processing orders to sync`);

      const results: any[] = [];

      // Small in-memory cache to avoid re-fetching provider creds repeatedly in same invocation
      const providerCache = new Map<number, { api_url: string; api_key: string }>();
      const getProviderForServiceCached = async (serviceExternalId: number) => {
        const cached = providerCache.get(serviceExternalId);
        if (cached) return cached;
        const provider = await getProviderForService(serviceExternalId);
        providerCache.set(serviceExternalId, provider);
        return provider;
      };

      const checkProviderOrderStatusCached = async (serviceExternalId: number, externalOrderId: number) => {
        const provider = await getProviderForServiceCached(serviceExternalId);
        const formData = new FormData();
        formData.append("key", provider.api_key);
        formData.append("action", "status");
        formData.append("order", String(externalOrderId));

        const apiResponse = await fetch(provider.api_url, { method: "POST", body: formData });
        const apiResult = await apiResponse.json();

        return {
          apiResult,
          mappedStatus: normalizeApiStatusToOrderStatus(apiResult?.status),
        };
      };

      for (const o of processingOrders || []) {
        try {
          const orderRow: any = o;
          // @ts-ignore - store_packages may be object or array
          const pkgRow = Array.isArray(orderRow.store_packages) ? orderRow.store_packages[0] : orderRow.store_packages;
          const packageType = String(pkgRow?.package_type || "single").toLowerCase();

          // COMBO: update each link sub-order independently
          if (packageType === "combo" && Array.isArray(orderRow.external_order_ids)) {
            const externalRows = orderRow.external_order_ids as any[];

            const updatedRows: any[] = [];
            const perRowStatuses: string[] = [];

            for (const r of externalRows) {
              const serviceId = Number(r?.service_id) || 0;
              const externalOrderId = Number(r?.external_order_id) || 0;

              if (!serviceId || !externalOrderId) {
                updatedRows.push(r);
                continue;
              }

              try {
                const { apiResult, mappedStatus } = await checkProviderOrderStatusCached(serviceId, externalOrderId);
                perRowStatuses.push(mappedStatus);

                updatedRows.push({
                  ...r,
                  provider_status: apiResult?.status ?? null,
                  order_status: mappedStatus,
                  start_count: apiResult?.start_count !== undefined ? String(apiResult.start_count) : (r?.start_count ?? null),
                  remains: apiResult?.remains !== undefined ? String(apiResult.remains) : (r?.remains ?? null),
                  charge: apiResult?.charge !== undefined ? String(apiResult.charge) : (r?.charge ?? null),
                });
              } catch (e) {
                const msg = e instanceof Error ? e.message : String(e);
                updatedRows.push({ ...r, order_status: "error", provider_status: "error", error: msg });
                perRowStatuses.push("error");
              }
            }

            // Aggregate overall order_status from sub-orders
            const overallStatus = (() => {
              if (perRowStatuses.length === 0) return "processing";

              const allCompleted = perRowStatuses.every((s) => s === "completed");
              if (allCompleted) return "completed";

              const allCancelled = perRowStatuses.every((s) => s === "cancelled");
              if (allCancelled) return "cancelled";

              const allError = perRowStatuses.every((s) => s === "error");
              if (allError) return "error";

              // If anything is still moving, keep overall as processing.
              if (perRowStatuses.some((s) => s === "processing")) return "processing";

              // If any link is partial, overall is partial.
              if (perRowStatuses.some((s) => s === "partial")) return "partial";

              // Mixed terminal statuses (e.g., completed + error) should be treated as partial,
              // not full error.
              if (perRowStatuses.some((s) => s === "error")) return "partial";

              return "processing";
            })();

            await supabase
              .from("store_orders")
              .update({
                external_order_ids: updatedRows,
                order_status: overallStatus,
              })
              .eq("id", orderRow.id);

            results.push({ id: orderRow.id, success: true, type: "combo", order_status: overallStatus });
            continue;
          }

          // SINGLE/LEGACY
          const serviceId = Number(pkgRow?.service_id) || 0;
          const externalOrderId = Number(orderRow.external_order_id) || 0;

          if (!serviceId || !externalOrderId) {
            results.push({ id: orderRow.id, success: false, error: "Missing service_id or external_order_id" });
            continue;
          }

          const { apiResult, mappedStatus } = await checkProviderOrderStatusCached(serviceId, externalOrderId);

          const updateData: Record<string, any> = {
            order_status: mappedStatus,
          };
          if (apiResult?.start_count !== undefined) updateData.start_count = String(apiResult.start_count);
          if (apiResult?.remains !== undefined) updateData.remains = String(apiResult.remains);

          await supabase.from("store_orders").update(updateData).eq("id", orderRow.id);

          results.push({ id: orderRow.id, success: true, type: "single", order_status: mappedStatus });
        } catch (e) {
          results.push({ id: (o as any)?.id, success: false, error: e instanceof Error ? e.message : String(e) });
        }
      }

      return new Response(JSON.stringify({ synced: results.length, results }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(
      JSON.stringify({ error: "Invalid action" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error("[store-order-process] Error:", errorMessage);
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
