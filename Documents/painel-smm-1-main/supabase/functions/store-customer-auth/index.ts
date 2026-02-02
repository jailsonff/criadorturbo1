import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type Action =
  | "check"
  | "signup"
  | "login"
  | "validate_session"
  | "logout"
  | "admin_set_pin";

type Body = {
  action: Action;
  phone?: string;
  pin?: string;
  token?: string;
  customer_id?: string;
  externalDb?: { url: string; serviceRoleKey: string };
};

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function normalizePhone(phone: unknown) {
  return String(phone || "").replace(/\D/g, "");
}

function requirePin(pin: unknown) {
  const p = String(pin || "").trim();
  if (!/^\d{4}$/.test(p)) return null;
  return p;
}

function bytesToBase64(bytes: Uint8Array) {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}

function base64ToBytes(b64: string) {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function pbkdf2Hash(pin: string, saltB64: string) {
  const salt = base64ToBytes(saltB64);
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey("raw", enc.encode(pin), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt, iterations: 100_000 },
    keyMaterial,
    256,
  );
  return bytesToBase64(new Uint8Array(bits));
}

async function sha256Hex(input: string) {
  const enc = new TextEncoder();
  const digest = await crypto.subtle.digest("SHA-256", enc.encode(input));
  const bytes = new Uint8Array(digest);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function randomToken() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function isAdminRequest(req: Request, supabaseUrl: string, supabaseAnonKey: string, serviceClient: any) {
  const authHeader = req.headers.get("Authorization") || "";
  if (!authHeader.startsWith("Bearer ")) return { ok: false as const };
  const token = authHeader.replace("Bearer ", "");

  const authed = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: claims, error } = await authed.auth.getClaims(token);
  if (error || !claims?.claims?.sub) return { ok: false as const };
  const userId = claims.claims.sub;

  const { data: roleRow, error: roleErr } = await serviceClient
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "admin")
    .maybeSingle();

  if (roleErr || !roleRow) return { ok: false as const };
  return { ok: true as const, userId };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const body = (await req.json()) as Body;
    const action = body.action;

    const supabaseUrl = body.externalDb?.url || Deno.env.get("SUPABASE_URL")!;
    const serviceKey = body.externalDb?.serviceRoleKey || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    const service = createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    // housekeeping
    try {
      await service.rpc("cleanup_expired_store_customer_sessions");
    } catch {
      // non-blocking
    }

    if (action === "check") {
      const phone = normalizePhone(body.phone);
      if (phone.length < 10) return json(400, { error: "Telefone inválido" });

      const { data, error } = await service.from("store_customers").select("id").eq("phone", phone).maybeSingle();
      if (error) return json(500, { error: "Falha ao verificar" });
      return json(200, { exists: !!data });
    }

    if (action === "signup") {
      const phone = normalizePhone(body.phone);
      const pin = requirePin(body.pin);
      if (phone.length < 10) return json(400, { error: "Telefone inválido" });
      if (!pin) return json(400, { error: "PIN inválido" });

      // Block duplicate signup
      const { data: existing } = await service.from("store_customers").select("id").eq("phone", phone).maybeSingle();
      if (existing?.id) return json(409, { error: "Este WhatsApp já está cadastrado. Faça login." });

      const saltBytes = new Uint8Array(16);
      crypto.getRandomValues(saltBytes);
      const saltB64 = bytesToBase64(saltBytes);
      const hashB64 = await pbkdf2Hash(pin, saltB64);

      const { data: created, error: createErr } = await service
        .from("store_customers")
        .insert({ phone, pin_hash: hashB64, pin_salt: saltB64 })
        .select("id")
        .single();

      if (createErr || !created) return json(500, { error: "Falha ao cadastrar" });

      const token = randomToken();
      const tokenHash = await sha256Hex(token);
      const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24 * 30).toISOString();

      const { error: sessErr } = await service.from("store_customer_sessions").insert({
        customer_id: created.id,
        phone,
        token_hash: tokenHash,
        expires_at: expiresAt,
      });

      if (sessErr) return json(500, { error: "Falha ao criar sessão" });
      return json(200, { customer_id: created.id, token, expires_at: expiresAt });
    }

    if (action === "login") {
      const phone = normalizePhone(body.phone);
      const pin = requirePin(body.pin);
      if (phone.length < 10) return json(400, { error: "Telefone inválido" });
      if (!pin) return json(400, { error: "PIN inválido" });

      const { data: customer, error } = await service
        .from("store_customers")
        .select("id, pin_hash, pin_salt")
        .eq("phone", phone)
        .maybeSingle();

      if (error) return json(500, { error: "Falha ao fazer login" });
      if (!customer) return json(404, { error: "Não cadastrado" });

      const candidateHash = await pbkdf2Hash(pin, String(customer.pin_salt));
      if (candidateHash !== String(customer.pin_hash)) {
        return json(401, { error: "Senha incorreta" });
      }

      const token = randomToken();
      const tokenHash = await sha256Hex(token);
      const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24 * 30).toISOString();

      const { error: sessErr } = await service.from("store_customer_sessions").insert({
        customer_id: customer.id,
        phone,
        token_hash: tokenHash,
        expires_at: expiresAt,
      });

      if (sessErr) return json(500, { error: "Falha ao criar sessão" });
      return json(200, { customer_id: customer.id, token, expires_at: expiresAt });
    }

    if (action === "validate_session") {
      const phone = normalizePhone(body.phone);
      const token = String(body.token || "");
      if (phone.length < 10 || !token) return json(400, { ok: false });

      const tokenHash = await sha256Hex(token);
      const { data, error } = await service
        .from("store_customer_sessions")
        .select("id, customer_id, expires_at")
        .eq("phone", phone)
        .eq("token_hash", tokenHash)
        .gt("expires_at", new Date().toISOString())
        .maybeSingle();

      if (error || !data) return json(200, { ok: false });
      return json(200, { ok: true, customer_id: data.customer_id, expires_at: data.expires_at });
    }

    if (action === "logout") {
      const phone = normalizePhone(body.phone);
      const token = String(body.token || "");
      if (phone.length < 10 || !token) return json(200, { ok: true });
      const tokenHash = await sha256Hex(token);
      await service.from("store_customer_sessions").delete().eq("phone", phone).eq("token_hash", tokenHash);
      return json(200, { ok: true });
    }

    if (action === "admin_set_pin") {
      const auth = await isAdminRequest(req, supabaseUrl, anonKey, service);
      if (!auth.ok) return json(401, { error: "Unauthorized" });

      const customerId = String(body.customer_id || "").trim();
      const pin = requirePin(body.pin);
      if (!customerId) return json(400, { error: "customer_id obrigatório" });
      if (!pin) return json(400, { error: "PIN inválido" });

      const saltBytes = new Uint8Array(16);
      crypto.getRandomValues(saltBytes);
      const saltB64 = bytesToBase64(saltBytes);
      const hashB64 = await pbkdf2Hash(pin, saltB64);

      const { error: upErr } = await service
        .from("store_customers")
        .update({ pin_hash: hashB64, pin_salt: saltB64 })
        .eq("id", customerId);

      if (upErr) return json(500, { error: "Falha ao atualizar senha" });
      return json(200, { ok: true });
    }

    return json(400, { error: "Ação inválida" });
  } catch (err) {
    console.error("[store-customer-auth] error", err);
    return json(500, { error: "Erro interno" });
  }
});
