import type { User, Identity } from "../core/types.js";
import { EasyAuthError } from "../core/errors.js";
import type {
  ClientConfig,
  TokenStorageAdapter,
  AuthStateListener,
  ClientAuthResult,
} from "./types.js";
import { LocalStorageAdapter } from "./storage.js";

/**
 * Universal, framework-agnostic frontend client for Easy Auth.
 *
 * Provides reactive authentication state, pluggable token persistence,
 * and an automatic Bearer-injected `client.fetch()` for effortless API consumption.
 */
export class EasyAuthClient {
  private readonly baseUrl: string;
  private readonly routePrefix: string;
  private readonly storage: TokenStorageAdapter;
  private readonly tokenKey: string;
  private readonly userKey: string;
  private readonly fetchImpl: typeof fetch;
  private readonly onUnauthorizedCallback?: () => void;
  private readonly listeners = new Set<AuthStateListener>();

  private currentUser: User | null = null;
  private currentToken: string | null = null;
  private isLoaded = false;
  private loadPromise: Promise<void> | null = null;

  constructor(config?: ClientConfig) {
    this.baseUrl = (config?.baseUrl || "").replace(/\/+$/, "");
    const rawPrefix = config?.routePrefix ?? "/api/auth";
    this.routePrefix = rawPrefix.startsWith("/") ? rawPrefix.replace(/\/+$/, "") : `/${rawPrefix}`.replace(/\/+$/, "");
    this.storage = config?.storage ?? new LocalStorageAdapter();
    this.tokenKey = config?.tokenKey ?? "easy_auth_token";
    this.userKey = config?.userKey ?? "easy_auth_user";
    this.fetchImpl = config?.fetchFn ?? globalThis.fetch;
    this.onUnauthorizedCallback = config?.onUnauthorized;
  }

  private async ensureStateLoaded(): Promise<void> {
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


  private notifyListeners(): void {
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
  onAuthStateChange(listener: AuthStateListener): () => void {
    this.listeners.add(listener);
    // Immediately emit current state
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
  async getToken(): Promise<string | null> {
    await this.ensureStateLoaded();
    return this.currentToken;
  }

  /**
   * Retrieves the currently logged-in User profile.
   */
  async getUser(): Promise<User | null> {
    await this.ensureStateLoaded();
    return this.currentUser;
  }

  /**
   * Returns true if user is currently authenticated with a valid token.
   */
  async isAuthenticated(): Promise<boolean> {
    await this.ensureStateLoaded();
    return !!this.currentToken;
  }

  /**
   * Performs authentication via third-party provider credentials.
   * On success, persists token and user snapshot and notifies all listeners.
   */
  async login(provider: string, credentials: unknown): Promise<ClientAuthResult> {
    await this.ensureStateLoaded();

    const url = `${this.baseUrl}${this.routePrefix}/login`;
    const res = await this.fetchImpl(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ provider, credentials }),
    });

    if (!res.ok) {
      let errorBody: any;
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

    const data = (await res.json()) as ClientAuthResult;
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
  async link(provider: string, credentials: unknown): Promise<Identity> {
    await this.ensureStateLoaded();
    if (!this.currentToken) {
      throw new EasyAuthError("UNAUTHORIZED", "Cannot link identity: not authenticated.");
    }

    const url = `${this.baseUrl}${this.routePrefix}/link`;
    const res = await this.fetchImpl(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.currentToken}`,
      },
      body: JSON.stringify({ provider, credentials }),
    });

    if (!res.ok) {
      const err = (await res.json().catch(() => ({}))) as any;
      throw new EasyAuthError(
        err?.code || "INVALID_CREDENTIALS",
        err?.message || `Failed to link identity: ${res.statusText}`,
        err
      );
    }

    return (await res.json()) as Identity;
  }

  /**
   * Unlinks an existing identity from the current account (with anti-lockout protection).
   */
  async unlink(provider: string, providerUserId: string): Promise<boolean> {
    await this.ensureStateLoaded();
    if (!this.currentToken) {
      throw new EasyAuthError("UNAUTHORIZED", "Cannot unlink identity: not authenticated.");
    }

    const url = `${this.baseUrl}${this.routePrefix}/unlink`;
    const res = await this.fetchImpl(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.currentToken}`,
      },
      body: JSON.stringify({ provider, providerUserId }),
    });

    if (!res.ok) {
      const err = (await res.json().catch(() => ({}))) as any;
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
  async getMe(): Promise<User | null> {
    await this.ensureStateLoaded();
    if (!this.currentToken) return null;

    const url = `${this.baseUrl}${this.routePrefix}/me`;
    const res = await this.fetchImpl(url, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${this.currentToken}`,
      },
    });

    if (!res.ok) {
      if (res.status === 401) {
        await this.logout();
      }
      return null;
    }

    const user = (await res.json()) as User;
    this.currentUser = user;
    await this.storage.setItem(this.userKey, JSON.stringify(user));
    this.notifyListeners();
    return user;
  }

  /**
   * Fetches all linked identities for current user.
   */
  async getIdentities(): Promise<Identity[]> {
    await this.ensureStateLoaded();
    if (!this.currentToken) return [];

    const url = `${this.baseUrl}${this.routePrefix}/identities`;
    const res = await this.fetchImpl(url, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${this.currentToken}`,
      },
    });

    if (!res.ok) {
      if (res.status === 401) {
        await this.logout();
      }
      return [];
    }

    return (await res.json()) as Identity[];
  }

  /**
   * Clears all local credentials, resets state, and notifies listeners.
   */
  async logout(): Promise<void> {
    await this.ensureStateLoaded();
    this.currentToken = null;
    this.currentUser = null;


    try {
      await this.storage.removeItem(this.tokenKey);
      await this.storage.removeItem(this.userKey);
    } catch {
      // Ignore storage errors on cleanup
    }

    this.notifyListeners();
  }

  /**
   * High-order fetch wrapper with automatic Bearer token injection and 401 interception.
   */
  async fetch(input: Parameters<typeof fetch>[0], init?: RequestInit): Promise<Response> {

    await this.ensureStateLoaded();

    const headers = new Headers(init?.headers);
    if (this.currentToken && !headers.has("Authorization")) {
      headers.set("Authorization", `Bearer ${this.currentToken}`);
    }

    const response = await this.fetchImpl(input, {
      ...init,
      headers,
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
}
