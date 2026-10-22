import type { User } from "../core/types.js";

/**
 * Token and user state storage adapter interface for client SDK
 */
export interface TokenStorageAdapter {
  getItem(key: string): string | null | Promise<string | null>;
  setItem(key: string, value: string): void | Promise<void>;
  removeItem(key: string): void | Promise<void>;
}

/**
 * Client initialization configuration
 */
export interface ClientConfig {
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
export type AuthStateListener = (user: User | null) => void;

/**
 * Authentication response from the backend
 */
export interface ClientAuthResult {
  user: User;
  token: string;
  isNewUser: boolean;
}
