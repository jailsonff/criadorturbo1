import { backendSupabase } from "@/lib/backendClient";
import { safeGetItem, safeRemoveItem, safeSetItem } from "@/lib/safeStorage";

export type StoreCustomerSession = {
  phone: string; // digits only
  customerId: string;
  token: string;
  expiresAt: string;
};

const STORAGE_KEY = "store_customer_session_v1";

export function getStoredStoreCustomerSession(): StoreCustomerSession | null {
  try {
    const raw = safeGetItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed?.phone || !parsed?.customerId || !parsed?.token || !parsed?.expiresAt) return null;
    return parsed as StoreCustomerSession;
  } catch {
    return null;
  }
}

export function setStoredStoreCustomerSession(session: StoreCustomerSession) {
  safeSetItem(STORAGE_KEY, JSON.stringify(session));
}

export function clearStoredStoreCustomerSession() {
  safeRemoveItem(STORAGE_KEY);
}

export function normalizePhoneDigits(input: string) {
  return String(input || "").replace(/\D/g, "");
}

export async function checkStoreCustomerExists(phoneDigits: string): Promise<boolean> {
  const { data, error } = await backendSupabase.functions.invoke("store-customer-auth", {
    body: { action: "check", phone: phoneDigits },
  });
  if (error) throw error;
  return !!data?.exists;
}

export async function storeCustomerSignup(phoneDigits: string, pin4: string) {
  const { data, error } = await backendSupabase.functions.invoke("store-customer-auth", {
    body: { action: "signup", phone: phoneDigits, pin: pin4 },
  });
  if (error) throw error;
  if (!data?.token || !data?.customer_id || !data?.expires_at) throw new Error("Resposta inválida");
  const session: StoreCustomerSession = {
    phone: phoneDigits,
    customerId: String(data.customer_id),
    token: String(data.token),
    expiresAt: String(data.expires_at),
  };
  setStoredStoreCustomerSession(session);
  return session;
}

export async function storeCustomerLogin(phoneDigits: string, pin4: string) {
  const { data, error } = await backendSupabase.functions.invoke("store-customer-auth", {
    body: { action: "login", phone: phoneDigits, pin: pin4 },
  });
  if (error) throw error;
  if (!data?.token || !data?.customer_id || !data?.expires_at) throw new Error("Resposta inválida");
  const session: StoreCustomerSession = {
    phone: phoneDigits,
    customerId: String(data.customer_id),
    token: String(data.token),
    expiresAt: String(data.expires_at),
  };
  setStoredStoreCustomerSession(session);
  return session;
}

export async function validateStoredStoreCustomerSession(phoneDigits: string) {
  const s = getStoredStoreCustomerSession();
  if (!s) return null;
  if (s.phone !== phoneDigits) return null;
  // quick expiry check
  if (Date.parse(s.expiresAt) <= Date.now()) {
    clearStoredStoreCustomerSession();
    return null;
  }

  const { data, error } = await backendSupabase.functions.invoke("store-customer-auth", {
    body: { action: "validate_session", phone: s.phone, token: s.token },
  });
  if (error) return null;
  if (!data?.ok) return null;
  return s;
}
