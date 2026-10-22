'use strict';

// src/core/errors.ts
var ERROR_STATUS_MAP = {
  PROVIDER_NOT_FOUND: 400,
  INVALID_CREDENTIALS: 401,
  TOKEN_INVALID: 401,
  TOKEN_EXPIRED: 401,
  UNAUTHORIZED: 401,
  USER_NOT_FOUND: 404,
  IDENTITY_ALREADY_LINKED: 409,
  CANNOT_UNLINK_LAST_IDENTITY: 400,
  RATE_LIMIT_EXCEEDED: 429,
  NETWORK_ERROR: 502,
  STORAGE_ERROR: 500,
  CONFIG_ERROR: 500
};
var EasyAuthError = class extends Error {
  code;
  statusCode;
  details;
  constructor(code, message, details) {
    super(message || code);
    this.name = "EasyAuthError";
    this.code = code;
    this.statusCode = ERROR_STATUS_MAP[code] ?? 500;
    this.details = details;
    Object.setPrototypeOf(this, new.target.prototype);
  }
};

// src/client/storage.ts
var MemoryTokenStorage = class {
  store = /* @__PURE__ */ new Map();
  getItem(key) {
    return this.store.get(key) ?? null;
  }
  setItem(key, value) {
    this.store.set(key, value);
  }
  removeItem(key) {
    this.store.delete(key);
  }
  clear() {
    this.store.clear();
  }
};
var LocalStorageAdapter = class {
  fallback = new MemoryTokenStorage();
  isAvailable() {
    try {
      return typeof globalThis.localStorage !== "undefined";
    } catch {
      return false;
    }
  }
  getItem(key) {
    if (this.isAvailable()) {
      try {
        return globalThis.localStorage.getItem(key);
      } catch {
        return this.fallback.getItem(key);
      }
    }
    return this.fallback.getItem(key);
  }
  setItem(key, value) {
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
  removeItem(key) {
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
};
var SessionStorageAdapter = class {
  fallback = new MemoryTokenStorage();
  isAvailable() {
    try {
      return typeof globalThis.sessionStorage !== "undefined";
    } catch {
      return false;
    }
  }
  getItem(key) {
    if (this.isAvailable()) {
      try {
        return globalThis.sessionStorage.getItem(key);
      } catch {
        return this.fallback.getItem(key);
      }
    }
    return this.fallback.getItem(key);
  }
  setItem(key, value) {
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
  removeItem(key) {
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
};

// src/client/client.ts
var EasyAuthClient = class {
  baseUrl;
  routePrefix;
  storage;
  tokenKey;
  userKey;
  fetchImpl;
  onUnauthorizedCallback;
  listeners = /* @__PURE__ */ new Set();
  currentUser = null;
  currentToken = null;
  isLoaded = false;
  loadPromise = null;
  constructor(config) {
    this.baseUrl = (config?.baseUrl || "").replace(/\/+$/, "");
    const rawPrefix = config?.routePrefix ?? "/api/auth";
    this.routePrefix = rawPrefix.startsWith("/") ? rawPrefix.replace(/\/+$/, "") : `/${rawPrefix}`.replace(/\/+$/, "");
    this.storage = config?.storage ?? new LocalStorageAdapter();
    this.tokenKey = config?.tokenKey ?? "easy_auth_token";
    this.userKey = config?.userKey ?? "easy_auth_user";
    this.fetchImpl = config?.fetchFn ?? globalThis.fetch;
    this.onUnauthorizedCallback = config?.onUnauthorized;
  }
  async ensureStateLoaded() {
    if (this.isLoaded) return;
    if (this.loadPromise) return this.loadPromise;
    this.loadPromise = (async () => {
      try {
        const storedToken = await this.storage.getItem(this.tokenKey);
        const storedUserJson = await this.storage.getItem(this.userKey);
        this.currentToken = storedToken || null;
        if (storedUserJson) {
          try {
            this.currentUser = JSON.parse(storedUserJson);
          } catch {
            this.currentUser = null;
          }
        }
      } catch {
        this.currentToken = null;
        this.currentUser = null;
      } finally {
        this.isLoaded = true;
      }
    })();
    await this.loadPromise;
  }
  notifyListeners() {
    for (const listener of this.listeners) {
      try {
        listener(this.currentUser);
      } catch (err) {
        console.error("Error in onAuthStateChange listener:", err);
      }
    }
  }
  /**
   * Subscribes to authentication state changes.
   * Returns an unsubscribe function.
   */
  onAuthStateChange(listener) {
    this.listeners.add(listener);
    this.ensureStateLoaded().then(() => {
      listener(this.currentUser);
    });
    return () => {
      this.listeners.delete(listener);
    };
  }
  /**
   * Retrieves the current stored JWT authentication token.
   */
  async getToken() {
    await this.ensureStateLoaded();
    return this.currentToken;
  }
  /**
   * Retrieves the currently logged-in User profile.
   */
  async getUser() {
    await this.ensureStateLoaded();
    return this.currentUser;
  }
  /**
   * Returns true if user is currently authenticated with a valid token.
   */
  async isAuthenticated() {
    await this.ensureStateLoaded();
    return !!this.currentToken;
  }
  /**
   * Performs authentication via third-party provider credentials.
   * On success, persists token and user snapshot and notifies all listeners.
   */
  async login(provider, credentials) {
    await this.ensureStateLoaded();
    const url = `${this.baseUrl}${this.routePrefix}/login`;
    const res = await this.fetchImpl(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ provider, credentials })
    });
    if (!res.ok) {
      let errorBody;
      try {
        errorBody = await res.json();
      } catch {
        errorBody = { message: res.statusText };
      }
      throw new EasyAuthError(
        errorBody?.code || "AUTH_FAILED",
        errorBody?.message || `Login failed with status ${res.status}`,
        errorBody
      );
    }
    const data = await res.json();
    this.currentToken = data.token;
    this.currentUser = data.user;
    await this.storage.setItem(this.tokenKey, data.token);
    await this.storage.setItem(this.userKey, JSON.stringify(data.user));
    this.notifyListeners();
    return data;
  }
  /**
   * Links a new third-party identity to the currently authenticated account.
   */
  async link(provider, credentials) {
    await this.ensureStateLoaded();
    if (!this.currentToken) {
      throw new EasyAuthError("UNAUTHORIZED", "Cannot link identity: not authenticated.");
    }
    const url = `${this.baseUrl}${this.routePrefix}/link`;
    const res = await this.fetchImpl(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.currentToken}`
      },
      body: JSON.stringify({ provider, credentials })
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new EasyAuthError(
        err?.code || "INVALID_CREDENTIALS",
        err?.message || `Failed to link identity: ${res.statusText}`,
        err
      );
    }
    return await res.json();
  }
  /**
   * Unlinks an existing identity from the current account (with anti-lockout protection).
   */
  async unlink(provider, providerUserId) {
    await this.ensureStateLoaded();
    if (!this.currentToken) {
      throw new EasyAuthError("UNAUTHORIZED", "Cannot unlink identity: not authenticated.");
    }
    const url = `${this.baseUrl}${this.routePrefix}/unlink`;
    const res = await this.fetchImpl(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.currentToken}`
      },
      body: JSON.stringify({ provider, providerUserId })
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new EasyAuthError(
        err?.code || "CANNOT_UNLINK_LAST_IDENTITY",
        err?.message || `Failed to unlink identity: ${res.statusText}`,
        err
      );
    }
    return true;
  }
  /**
   * Fetches fresh user profile from backend `/me` endpoint.
   */
  async getMe() {
    await this.ensureStateLoaded();
    if (!this.currentToken) return null;
    const url = `${this.baseUrl}${this.routePrefix}/me`;
    const res = await this.fetchImpl(url, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${this.currentToken}`
      }
    });
    if (!res.ok) {
      if (res.status === 401) {
        await this.logout();
      }
      return null;
    }
    const user = await res.json();
    this.currentUser = user;
    await this.storage.setItem(this.userKey, JSON.stringify(user));
    this.notifyListeners();
    return user;
  }
  /**
   * Fetches all linked identities for current user.
   */
  async getIdentities() {
    await this.ensureStateLoaded();
    if (!this.currentToken) return [];
    const url = `${this.baseUrl}${this.routePrefix}/identities`;
    const res = await this.fetchImpl(url, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${this.currentToken}`
      }
    });
    if (!res.ok) {
      if (res.status === 401) {
        await this.logout();
      }
      return [];
    }
    return await res.json();
  }
  /**
   * Clears all local credentials, resets state, and notifies listeners.
   */
  async logout() {
    await this.ensureStateLoaded();
    this.currentToken = null;
    this.currentUser = null;
    try {
      await this.storage.removeItem(this.tokenKey);
      await this.storage.removeItem(this.userKey);
    } catch {
    }
    this.notifyListeners();
  }
  /**
   * High-order fetch wrapper with automatic Bearer token injection and 401 interception.
   */
  async fetch(input, init) {
    await this.ensureStateLoaded();
    const headers = new Headers(init?.headers);
    if (this.currentToken && !headers.has("Authorization")) {
      headers.set("Authorization", `Bearer ${this.currentToken}`);
    }
    const response = await this.fetchImpl(input, {
      ...init,
      headers
    });
    if (response.status === 401) {
      await this.logout();
      if (this.onUnauthorizedCallback) {
        try {
          this.onUnauthorizedCallback();
        } catch (cbErr) {
          console.error("Error in onUnauthorized callback:", cbErr);
        }
      }
    }
    return response;
  }
};

exports.EasyAuthClient = EasyAuthClient;
exports.LocalStorageAdapter = LocalStorageAdapter;
exports.MemoryTokenStorage = MemoryTokenStorage;
exports.SessionStorageAdapter = SessionStorageAdapter;
//# sourceMappingURL=index.cjs.map
//# sourceMappingURL=index.cjs.map