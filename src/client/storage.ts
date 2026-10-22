import type { TokenStorageAdapter } from "./types.js";

/**
 * Standard in-memory token storage (ideal for SSR, Node.js, and automated unit tests)
 */
export class MemoryTokenStorage implements TokenStorageAdapter {
  private readonly store = new Map<string, string>();

  getItem(key: string): string | null {
    return this.store.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.store.set(key, value);
  }

  removeItem(key: string): void {
    this.store.delete(key);
  }

  clear(): void {
    this.store.clear();
  }
}

/**
 * Browser localStorage adapter with safe fallback
 */
export class LocalStorageAdapter implements TokenStorageAdapter {
  private readonly fallback = new MemoryTokenStorage();

  private isAvailable(): boolean {
    try {
      return typeof globalThis.localStorage !== "undefined";
    } catch {
      return false;
    }
  }

  getItem(key: string): string | null {
    if (this.isAvailable()) {
      try {
        return globalThis.localStorage.getItem(key);
      } catch {
        return this.fallback.getItem(key);
      }
    }
    return this.fallback.getItem(key);
  }

  setItem(key: string, value: string): void {
    if (this.isAvailable()) {
      try {
        globalThis.localStorage.setItem(key, value);
        return;
      } catch {
        this.fallback.setItem(key, value);
        return;
      }
    }
    this.fallback.setItem(key, value);
  }

  removeItem(key: string): void {
    if (this.isAvailable()) {
      try {
        globalThis.localStorage.removeItem(key);
        return;
      } catch {
        this.fallback.removeItem(key);
        return;
      }
    }
    this.fallback.removeItem(key);
  }
}

/**
 * Browser sessionStorage adapter with safe fallback
 */
export class SessionStorageAdapter implements TokenStorageAdapter {
  private readonly fallback = new MemoryTokenStorage();

  private isAvailable(): boolean {
    try {
      return typeof globalThis.sessionStorage !== "undefined";
    } catch {
      return false;
    }
  }

  getItem(key: string): string | null {
    if (this.isAvailable()) {
      try {
        return globalThis.sessionStorage.getItem(key);
      } catch {
        return this.fallback.getItem(key);
      }
    }
    return this.fallback.getItem(key);
  }

  setItem(key: string, value: string): void {
    if (this.isAvailable()) {
      try {
        globalThis.sessionStorage.setItem(key, value);
        return;
      } catch {
        this.fallback.setItem(key, value);
        return;
      }
    }
    this.fallback.setItem(key, value);
  }

  removeItem(key: string): void {
    if (this.isAvailable()) {
      try {
        globalThis.sessionStorage.removeItem(key);
        return;
      } catch {
        this.fallback.removeItem(key);
        return;
      }
    }
    this.fallback.removeItem(key);
  }
}
