/**
 * Dynamic Supabase Client
 * 
 * This module provides a dynamic Supabase client that:
 * 1. Checks if external database credentials are configured (in localStorage)
 * 2. If configured, creates and returns a client pointing to the external database
 * 3. If not configured, falls back to the default Lovable Cloud database
 * 
 * This enables white-label isolation where each client instance uses their own database.
 */

import { createClient, SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { getSafeLocalStorage, safeGetItem, safeRemoveItem, safeSetItem } from "@/lib/safeStorage";

// Storage key for external database config
const EXTERNAL_CONFIG_KEY = "supabase_config";

// Default Lovable Cloud credentials (from environment)
const DEFAULT_URL = import.meta.env.VITE_SUPABASE_URL;
const DEFAULT_ANON_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

interface ExternalDatabaseConfig {
  url: string;
  anonKey: string;
  serviceRoleKey?: string;
}

// Cache for the dynamic client to avoid recreating on every call
let cachedClient: SupabaseClient<Database> | null = null;
let cachedConfigHash: string | null = null;

/**
 * Gets the external database configuration from localStorage
 */
export function getExternalConfig(): ExternalDatabaseConfig | null {
  try {
    const savedConfig = safeGetItem(EXTERNAL_CONFIG_KEY);
    if (savedConfig) {
      const parsed = JSON.parse(savedConfig);
      if (parsed.url && parsed.anonKey) {
        return parsed;
      }
    }
  } catch (e) {
    console.error("Error reading external database config:", e);
  }
  return null;
}

/**
 * Checks if an external database is configured
 */
export function hasExternalDatabase(): boolean {
  const config = getExternalConfig();
  return config !== null && !!config.url && !!config.anonKey;
}

/**
 * Gets the current database info for display purposes
 */
export function getCurrentDatabaseInfo(): { type: "external" | "default"; url: string } {
  const externalConfig = getExternalConfig();
  if (externalConfig) {
    return {
      type: "external",
      url: externalConfig.url,
    };
  }
  return {
    type: "default",
    url: DEFAULT_URL,
  };
}

/**
 * Creates a hash of the config for cache invalidation
 */
function getConfigHash(config: ExternalDatabaseConfig | null): string {
  if (!config) return "default";
  return `${config.url}:${config.anonKey}`;
}

/**
 * Gets or creates the Supabase client based on current configuration
 * 
 * - If external credentials are configured in localStorage, uses those
 * - Otherwise, uses the default Lovable Cloud credentials
 * 
 * The client is cached and only recreated if the configuration changes.
 */
export function getSupabaseClient(): SupabaseClient<Database> {
  const externalConfig = getExternalConfig();
  const currentHash = getConfigHash(externalConfig);

  // Return cached client if config hasn't changed
  if (cachedClient && cachedConfigHash === currentHash) {
    return cachedClient;
  }

  // Determine which credentials to use
  const url = externalConfig?.url || DEFAULT_URL;
  const anonKey = externalConfig?.anonKey || DEFAULT_ANON_KEY;

  console.log(
    `[SupabaseClient] Creating client for ${externalConfig ? "EXTERNAL" : "DEFAULT"} database:`,
    url.substring(0, 30) + "..."
  );

  // Create new client
  cachedClient = createClient<Database>(url, anonKey, {
    auth: {
      storage: getSafeLocalStorage() as any,
      persistSession: true,
      autoRefreshToken: true,
    },
  });

  cachedConfigHash = currentHash;
  return cachedClient;
}

/**
 * Forces a refresh of the cached client
 * Call this after updating external database credentials
 */
export function refreshSupabaseClient(): SupabaseClient<Database> {
  cachedClient = null;
  cachedConfigHash = null;
  return getSupabaseClient();
}

/**
 * Clears external database configuration
 * After calling this, the app will use the default Lovable Cloud database
 */
export function clearExternalConfig(): void {
  safeRemoveItem(EXTERNAL_CONFIG_KEY);
  refreshSupabaseClient();
  // Notify listeners (storage event won't fire in same tab)
  window.dispatchEvent(new Event("supabase-config-changed"));
}

/**
 * Sets external database configuration
 * After calling this, the app will use the external database
 */
export function setExternalConfig(config: ExternalDatabaseConfig): void {
  safeSetItem(EXTERNAL_CONFIG_KEY, JSON.stringify(config));
  refreshSupabaseClient();
  // Notify listeners (storage event won't fire in same tab)
  window.dispatchEvent(new Event("supabase-config-changed"));
}

// Export the dynamic client as default for easy migration
// Components can import { supabase } from "@/lib/supabaseClient"
export const supabase = getSupabaseClient();

// Re-export a getter for components that need the latest client
export { getSupabaseClient as getDynamicClient };
