import { U as User, I as Identity } from '../types-BUHBKPKK.js';

/**
 * Token and user state storage adapter interface for client SDK
 */
interface TokenStorageAdapter {
    getItem(key: string): string | null | Promise<string | null>;
    setItem(key: string, value: string): void | Promise<void>;
    removeItem(key: string): void | Promise<void>;
}
/**
 * Client initialization configuration
 */
interface ClientConfig {
    /**
     * Base URL of the backend API server (e.g. "https://api.example.com" or "").
     * Defaults to "" (current origin).
     */
    baseUrl?: string;
    /**
     * Route prefix for Easy Auth endpoints. Defaults to "/api/auth".
     */
    routePrefix?: string;
    /**
     * Storage adapter for persisting the JWT token and user snapshot.
     * Defaults to LocalStorageAdapter in browsers, or MemoryTokenStorage in Node/SSR.
     */
    storage?: TokenStorageAdapter;
    /**
     * Storage key for the authentication JWT token. Defaults to "easy_auth_token".
     */
    tokenKey?: string;
    /**
     * Storage key for the cached user profile snapshot. Defaults to "easy_auth_user".
     */
    userKey?: string;
    /**
     * Custom fetch function (useful for SSR, mock testing, or request proxies).
     */
    fetchFn?: typeof fetch;
    /**
     * Global callback triggered when any request encounters a 401 Unauthorized response.
     */
    onUnauthorized?: () => void;
}
/**
 * Callback listener for authentication state changes
 */
type AuthStateListener = (user: User | null) => void;
/**
 * Authentication response from the backend
 */
interface ClientAuthResult {
    user: User;
    token: string;
    isNewUser: boolean;
}

/**
 * Universal, framework-agnostic frontend client for Easy Auth.
 *
 * Provides reactive authentication state, pluggable token persistence,
 * and an automatic Bearer-injected `client.fetch()` for effortless API consumption.
 */
declare class EasyAuthClient {
    private readonly baseUrl;
    private readonly routePrefix;
    private readonly storage;
    private readonly tokenKey;
    private readonly userKey;
    private readonly fetchImpl;
    private readonly onUnauthorizedCallback?;
    private readonly listeners;
    private currentUser;
    private currentToken;
    private isLoaded;
    private loadPromise;
    constructor(config?: ClientConfig);
    private ensureStateLoaded;
    private notifyListeners;
    /**
     * Subscribes to authentication state changes.
     * Returns an unsubscribe function.
     */
    onAuthStateChange(listener: AuthStateListener): () => void;
    /**
     * Retrieves the current stored JWT authentication token.
     */
    getToken(): Promise<string | null>;
    /**
     * Retrieves the currently logged-in User profile.
     */
    getUser(): Promise<User | null>;
    /**
     * Returns true if user is currently authenticated with a valid token.
     */
    isAuthenticated(): Promise<boolean>;
    /**
     * Performs authentication via third-party provider credentials.
     * On success, persists token and user snapshot and notifies all listeners.
     */
    login(provider: string, credentials: unknown): Promise<ClientAuthResult>;
    /**
     * Links a new third-party identity to the currently authenticated account.
     */
    link(provider: string, credentials: unknown): Promise<Identity>;
    /**
     * Unlinks an existing identity from the current account (with anti-lockout protection).
     */
    unlink(provider: string, providerUserId: string): Promise<boolean>;
    /**
     * Fetches fresh user profile from backend `/me` endpoint.
     */
    getMe(): Promise<User | null>;
    /**
     * Fetches all linked identities for current user.
     */
    getIdentities(): Promise<Identity[]>;
    /**
     * Clears all local credentials, resets state, and notifies listeners.
     */
    logout(): Promise<void>;
    /**
     * High-order fetch wrapper with automatic Bearer token injection and 401 interception.
     */
    fetch(input: Parameters<typeof fetch>[0], init?: RequestInit): Promise<Response>;
}

/**
 * Standard in-memory token storage (ideal for SSR, Node.js, and automated unit tests)
 */
declare class MemoryTokenStorage implements TokenStorageAdapter {
    private readonly store;
    getItem(key: string): string | null;
    setItem(key: string, value: string): void;
    removeItem(key: string): void;
    clear(): void;
}
/**
 * Browser localStorage adapter with safe fallback
 */
declare class LocalStorageAdapter implements TokenStorageAdapter {
    private readonly fallback;
    private isAvailable;
    getItem(key: string): string | null;
    setItem(key: string, value: string): void;
    removeItem(key: string): void;
}
/**
 * Browser sessionStorage adapter with safe fallback
 */
declare class SessionStorageAdapter implements TokenStorageAdapter {
    private readonly fallback;
    private isAvailable;
    getItem(key: string): string | null;
    setItem(key: string, value: string): void;
    removeItem(key: string): void;
}

export { type AuthStateListener, type ClientAuthResult, type ClientConfig, EasyAuthClient, LocalStorageAdapter, MemoryTokenStorage, SessionStorageAdapter, type TokenStorageAdapter };
