// Defensive storage wrapper.
// Some mobile browsers (private mode / storage blocked / quota) can throw on localStorage access.

type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem" | "key" | "length">;

class MemoryStorage implements StorageLike {
  private map = new Map<string, string>();

  get length() {
    return this.map.size;
  }

  key(index: number) {
    return Array.from(this.map.keys())[index] ?? null;
  }

  getItem(key: string) {
    return this.map.has(key) ? this.map.get(key)! : null;
  }

  setItem(key: string, value: string) {
    this.map.set(String(key), String(value));
  }

  removeItem(key: string) {
    this.map.delete(String(key));
  }
}

const memoryStorage = new MemoryStorage();

export function getSafeLocalStorage(): StorageLike {
  try {
    // Accessing localStorage itself can throw in some environments.
    // Also test set/remove because quota/blocked storage can throw there.
    const testKey = "__storage_test__";
    window.localStorage.setItem(testKey, "1");
    window.localStorage.removeItem(testKey);
    return window.localStorage;
  } catch {
    return memoryStorage;
  }
}

export function safeGetItem(key: string): string | null {
  try {
    return getSafeLocalStorage().getItem(key);
  } catch {
    return null;
  }
}

export function safeSetItem(key: string, value: string): void {
  try {
    getSafeLocalStorage().setItem(key, value);
  } catch {
    // ignore
  }
}

export function safeRemoveItem(key: string): void {
  try {
    getSafeLocalStorage().removeItem(key);
  } catch {
    // ignore
  }
}
