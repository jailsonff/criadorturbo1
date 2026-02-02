// Helpers to reflect PIX top-ups immediately in the UI.
// This app's main balance comes from the SMM provider API; PIX top-ups may not be reflected there instantly.

import { safeGetItem, safeRemoveItem, safeSetItem } from "@/lib/safeStorage";

const PENDING_KEY = "pix_pending_topup";
const LAST_FETCHED_KEY = "smm_last_fetched_balance";
export const BALANCE_ADJUSTMENT_EVENT = "balance-adjustment-changed";

const readNumber = (key: string): number => {
  const raw = safeGetItem(key);
  if (!raw) return 0;
  const n = Number(raw);
  return Number.isFinite(n) ? n : 0;
};

const writeNumber = (key: string, value: number) => {
  safeSetItem(key, String(value));
};

export const getPendingPixTopUp = (): number => readNumber(PENDING_KEY);

export const addPendingPixTopUp = (amount: number) => {
  const safe = Number(amount);
  if (!Number.isFinite(safe) || safe <= 0) return;
  const current = getPendingPixTopUp();
  writeNumber(PENDING_KEY, Math.max(0, current + safe));
  window.dispatchEvent(new Event(BALANCE_ADJUSTMENT_EVENT));
};

export const clearPendingPixTopUp = () => {
  safeRemoveItem(PENDING_KEY);
  window.dispatchEvent(new Event(BALANCE_ADJUSTMENT_EVENT));
};

/**
 * Best-effort reconciliation: if the provider balance increases compared to our last fetch,
 * we reduce pending top-up by that delta.
 */
export const reconcilePendingTopUpWithFetchedBalance = (fetchedBalance: number) => {
  const fetched = Number(fetchedBalance);
  if (!Number.isFinite(fetched)) return;

  const lastFetched = readNumber(LAST_FETCHED_KEY);
  const pending = getPendingPixTopUp();

  if (lastFetched > 0 && fetched > lastFetched && pending > 0) {
    const delta = fetched - lastFetched;
    const nextPending = Math.max(0, pending - delta);
    writeNumber(PENDING_KEY, nextPending);
  }

  writeNumber(LAST_FETCHED_KEY, fetched);
};
