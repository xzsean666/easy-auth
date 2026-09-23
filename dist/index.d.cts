import { S as StorageAdapter, C as CreateUserData, U as User, a as CreateIdentityData, I as Identity, A as AuthProvider, E as ExtractedIdentity } from './decorators-a7QbIYVz.cjs';
export { b as AuthEngine, c as AuthEngineDependencies, d as AuthResult, e as CurrentUser, D as DatabaseConfig, f as EasyAuth, g as EasyAuthController, h as EasyAuthGuard, i as EasyAuthJwtPayload, j as EasyAuthModule, k as EasyAuthModuleAsyncOptions, l as EasyAuthModuleOptions, m as EasyAuthOptions, n as EasyAuthService, F as FunctionalAuthProvider, J as JwtConfig, o as JwtService, P as ProviderRegistry, p as Public, q as SignJwtOptions, V as VerifyOptions, r as VerifyResult, W as Web3Credentials, s as Web3Profile, t as Web3Provider, u as Web3ProviderOptions } from './decorators-a7QbIYVz.cjs';
import { DatabaseSync } from 'node:sqlite';
import '@nestjs/common';
import '@nestjs/core';

/**
 * Easy Auth Error Code definitions
 */
type ErrorCode = "PROVIDER_NOT_FOUND" | "INVALID_CREDENTIALS" | "TOKEN_INVALID" | "TOKEN_EXPIRED" | "USER_NOT_FOUND" | "IDENTITY_ALREADY_LINKED" | "CANNOT_UNLINK_LAST_IDENTITY" | "STORAGE_ERROR" | "CONFIG_ERROR" | "RATE_LIMIT_EXCEEDED" | "NETWORK_ERROR";
/**
 * Standard error class for Easy Auth SDK
 */
declare class EasyAuthError extends Error {
    readonly code: ErrorCode;
    readonly statusCode: number;
    readonly details?: unknown;
    constructor(code: ErrorCode, message?: string, details?: unknown);
}

interface MemoryStorageOptions {
    /**
     * Maximum number of users to retain in memory.
     * If exceeded, the oldest entries are evicted to prevent unbounded memory leaks.
     */
    maxEntries?: number;
}
/**
 * High-performance, zero-dependency in-memory StorageAdapter.
 * Ideal for local development, testing, and prototyping.
 */
declare class MemoryStorageAdapter implements StorageAdapter {
    private readonly users;
    private readonly identities;
    private readonly userIdentities;
    private readonly maxEntries?;
    constructor(options?: MemoryStorageOptions);
    private getIdentityKey;
    private cloneUser;
    private cloneIdentity;
    createUser(data: CreateUserData): Promise<User>;
    getUserById(id: string): Promise<User | null>;
    updateUserMetadata(id: string, metadata: Record<string, any>): Promise<User>;
    createIdentity(data: CreateIdentityData): Promise<Identity>;
    getIdentity(provider: string, providerUserId: string): Promise<Identity | null>;
    listIdentitiesByUserId(userId: string): Promise<Identity[]>;
    deleteIdentity(userId: string, provider: string, providerUserId: string, options?: {
        enforceMinimumCount?: boolean;
    }): Promise<boolean>;
    /**
     * Resets all in-memory data (useful for test isolation)
     */
    clear(): void;
}

interface SqliteStorageOptions {
    /**
     * File path to SQLite database file.
     * Defaults to persistent file: process.env.EASY_AUTH_DB_PATH || './easy-auth.sqlite'.
     * Pass ':memory:' explicitly only if temporary in-memory storage is required.
     */
    path?: string;
    /**
     * Pre-instantiated DatabaseSync instance if already managed externally.
     */
    db?: DatabaseSync;
}
/**
 * Native, high-performance SQLite StorageAdapter built on Node.js 22+ `node:sqlite`.
 * Requires zero native compilation or heavy external C++ binaries.
 */
declare class SqliteStorageAdapter implements StorageAdapter {
    private readonly db;
    private readonly isManaged;
    constructor(options?: SqliteStorageOptions);
    private initTables;
    private mapUserRow;
    private mapIdentityRow;
    createUser(data: CreateUserData): Promise<User>;
    getUserById(id: string): Promise<User | null>;
    updateUserMetadata(id: string, metadata: Record<string, any>): Promise<User>;
    createIdentity(data: CreateIdentityData): Promise<Identity>;
    getIdentity(provider: string, providerUserId: string): Promise<Identity | null>;
    listIdentitiesByUserId(userId: string): Promise<Identity[]>;
    deleteIdentity(userId: string, provider: string, providerUserId: string, options?: {
        enforceMinimumCount?: boolean;
    }): Promise<boolean>;
    /**
     * Clears all tables (mainly used for test isolation).
     */
    clear(): void;
    /**
     * Closes database connection if managed internally.
     */
    close(): void;
}

interface PostgresQueryRunner {
    query(sql: string, params?: any[]): Promise<{
        rows: any[];
        rowCount?: number | null;
    }>;
}
interface PostgresStorageOptions {
    /**
     * PostgreSQL client, pool, or any object implementing `query(sql, params)`.
     */
    pool?: PostgresQueryRunner;
    client?: PostgresQueryRunner;
    query?: (sql: string, params?: any[]) => Promise<{
        rows: any[];
        rowCount?: number | null;
    }>;
    /**
     * Whether to automatically run DDL statements on startup.
     * Defaults to true.
     */
    autoInitTables?: boolean;
}
/**
 * Production-ready PostgreSQL StorageAdapter supporting standard `pg.Pool`, `pg.Client`,
 * or serverless Postgres drivers (e.g. Neon, Supabase, Vercel Postgres).
 */
declare class PostgresStorageAdapter implements StorageAdapter {
    private readonly runner;
    private isInitialized;
    private initPromise;
    private readonly autoInitTables;
    constructor(options: PostgresStorageOptions);
    /**
     * Ensures that the database tables and indexes exist.
     */
    ensureInit(): Promise<void>;
    private mapUserRow;
    private mapIdentityRow;
    createUser(data: CreateUserData): Promise<User>;
    getUserById(id: string): Promise<User | null>;
    updateUserMetadata(id: string, metadata: Record<string, any>): Promise<User>;
    createIdentity(data: CreateIdentityData): Promise<Identity>;
    getIdentity(provider: string, providerUserId: string): Promise<Identity | null>;
    listIdentitiesByUserId(userId: string): Promise<Identity[]>;
    deleteIdentity(userId: string, provider: string, providerUserId: string, options?: {
        enforceMinimumCount?: boolean;
    }): Promise<boolean>;
}

interface OAuth2Credentials {
    code: string;
    redirectUri?: string;
    codeVerifier?: string;
}
interface OAuth2BaseProviderOptions<TProfile = any> {
    name: string;
    clientId: string;
    clientSecret: string;
    tokenEndpoint: string;
    userInfoEndpoint: string;
    authorizationEndpoint?: string;
    scope?: string;
    mapProfile: (rawUserInfo: any, tokenResponse: any) => {
        providerUserId: string;
        profile?: TProfile;
    };
    headers?: Record<string, string>;
    /**
     * Content-Type format for the token endpoint POST request.
     * Defaults to "form" (application/x-www-form-urlencoded) per RFC 6749 Section 4.1.3.
     * Can be set to "json" (application/json) for non-standard providers.
     */
    contentType?: "form" | "json";
    /**
     * Request timeout in milliseconds for HTTP calls. Defaults to 10000ms.
     */
    timeoutMs?: number;
    /**
     * Custom fetch function (useful for unit testing or proxies)
     */
    fetchFn?: typeof fetch;
}
/**
 * Declarative OAuth2 base provider.
 * Allows instant onboarding of standard OAuth2 / OIDC providers
 * (such as GitHub, Discord, Apple, Google, Slack, etc.) without writing custom HTTP code.
 */
declare class OAuth2BaseProvider<TProfile = any> implements AuthProvider<OAuth2Credentials, TProfile> {
    readonly name: string;
    readonly type = "oauth2";
    private readonly options;
    private readonly fetchImpl;
    private readonly timeoutMs;
    private readonly contentType;
    constructor(options: OAuth2BaseProviderOptions<TProfile>);
    verifyAndExtract(credentials: OAuth2Credentials): Promise<ExtractedIdentity<TProfile>>;
    /**
     * Generates standard OAuth2 authorization URL for browser redirection.
     */
    getAuthorizationUrl(options: {
        redirectUri: string;
        state?: string;
        scope?: string;
    }): string;
}

interface GoogleCredentials {
    /**
     * OAuth 2.0 authorization code from frontend
     */
    code?: string;
    /**
     * Redirect URI used during the OAuth authorization flow
     */
    redirectUri?: string;
    /**
     * Code verifier for PKCE (optional)
     */
    codeVerifier?: string;
    /**
     * Google ID Token (e.g. from Google One Tap or Google Sign-In button)
     */
    idToken?: string;
}
interface GoogleProfile {
    email?: string;
    name?: string;
    avatar?: string;
    emailVerified?: boolean;
}
interface GoogleProviderOptions {
    /**
     * Google OAuth 2.0 Client ID (or array of Client IDs for multi-platform Web/iOS/Android)
     */
    clientId: string | string[];
    /**
     * Optional additional client IDs accepted for audience matching (e.g. mobile apps)
     */
    clientIds?: string[];
    /**
     * Google OAuth 2.0 Client Secret (optional if using client-side ID token verification only)
     */
    clientSecret?: string;
    /**
     * Request timeout in milliseconds for HTTP calls. Defaults to 10000ms.
     */
    timeoutMs?: number;
    /**
     * ID Token verification strategy:
     * - "jwks" (default): Fast in-memory cached cryptographic verification using Google's public JWKS (<1ms).
     * - "tokeninfo": Verification via Google's tokeninfo HTTP API.
     */
    idTokenVerificationMode?: "jwks" | "tokeninfo";
    /**
     * Custom fetch function (useful for unit testing or corporate proxies)
     */
    fetchFn?: typeof fetch;
}
/**
 * Built-in Google authentication provider.
 * Supports both standard OAuth 2.0 authorization code flow and direct ID Token verification.
 */
declare class GoogleProvider implements AuthProvider<GoogleCredentials, GoogleProfile> {
    readonly name = "google";
    readonly type = "oauth2";
    private readonly options;
    private readonly fetchImpl;
    private readonly timeoutMs;
    private static readonly googleJwks;
    constructor(options: GoogleProviderOptions);
    private getAllowedClientIds;
    verifyAndExtract(credentials: GoogleCredentials): Promise<ExtractedIdentity<GoogleProfile>>;
    private verifyIdToken;
    private verifyIdTokenViaTokeninfo;
    private exchangeCode;
    /**
     * Generates standard Google OAuth 2.0 authorization URL for browser redirection.
     */
    getAuthorizationUrl(options: {
        redirectUri: string;
        state?: string;
        scope?: string;
    }): string;
}

interface LineCredentials {
    /**
     * Authorization code returned from LINE Login
     */
    code?: string;
    /**
     * Redirect URI configured for LINE Login
     */
    redirectUri?: string;
    /**
     * LINE OpenID Connect ID Token (optional)
     */
    idToken?: string;
    /**
     * Existing access token (optional)
     */
    accessToken?: string;
}
interface LineProfile {
    name?: string;
    avatar?: string;
    statusMessage?: string;
    email?: string;
}
interface LineProviderOptions {
    /**
     * LINE Channel ID
     */
    channelId: string;
    /**
     * LINE Channel Secret
     */
    channelSecret?: string;
    /**
     * Request timeout in milliseconds for HTTP calls. Defaults to 10000ms.
     */
    timeoutMs?: number;
    /**
     * Custom fetch function (useful for unit testing or corporate proxies)
     */
    fetchFn?: typeof fetch;
}
/**
 * Built-in LINE Login authentication provider.
 * Supports standard LINE Login v2.1 OAuth 2.0 authorization code flow and ID Token verification.
 */
declare class LineProvider implements AuthProvider<LineCredentials, LineProfile> {
    readonly name = "line";
    readonly type = "oauth2";
    private readonly options;
    private readonly fetchImpl;
    private readonly timeoutMs;
    constructor(options: LineProviderOptions);
    verifyAndExtract(credentials: LineCredentials): Promise<ExtractedIdentity<LineProfile>>;
    private verifyIdToken;
    private exchangeCode;
    private fetchProfileByAccessToken;
    /**
     * Generates standard LINE Login v2.1 authorization URL for browser redirection.
     */
    getAuthorizationUrl(options: {
        redirectUri: string;
        state?: string;
        scope?: string;
    }): string;
}

interface TotpCredentials {
    /**
     * Account identifier (e.g. email, username, or user ID)
     */
    account: string;
    /**
     * 6-digit dynamic code generated by Google Authenticator / TOTP app
     */
    code: string;
    /**
     * The Base32 shared secret key.
     * NOTE: For security, client-supplied secrets are ignored during authentication
     * unless `allowClientSecret: true` is explicitly configured on TotpProvider.
     */
    secret?: string;
}
interface TotpProfile {
    account: string;
}
interface TotpProviderOptions {
    /**
     * Provider name. Defaults to "totp".
     */
    name?: string;
    /**
     * Time step in seconds. Defaults to 30.
     */
    step?: number;
    /**
     * Drift window (number of steps before and after allowed). Defaults to 1 (+/- 30 seconds).
     */
    window?: number;
    /**
     * Number of digits. Defaults to 6.
     */
    digits?: number;
    /**
     * Authoritative server-side shared secret or secret resolver function.
     * In production, this should always be provided.
     */
    secret?: string | ((account: string) => Promise<string | null | undefined> | string | null | undefined);
    /**
     * Allow client-supplied secrets in credentials payload.
     * WARNING: For security, this defaults to false.
     * Only enable for testing or stateless flows where clients hold secrets.
     */
    allowClientSecret?: boolean;
    /**
     * Automatically track and enforce monotonic time-steps per account to prevent code reuse within the window.
     * Defaults to true (RFC 6238 Section 5.2 compliance).
     */
    enforceMonotonicCounter?: boolean;
    /**
     * Optional custom hook to validate and consume OTP (e.g. against a distributed Redis cache).
     */
    consumeOtp?: (account: string, code: string, counter: number) => Promise<boolean> | boolean;
    /**
     * Maximum failed verification attempts before temporary lockout. Defaults to 5.
     * Set to 0 to disable.
     */
    maxFailedAttempts?: number;
    /**
     * Lockout duration in milliseconds after exceeding maxFailedAttempts. Defaults to 60000 (1 minute).
     */
    lockoutDurationMs?: number;
}
/**
 * Base32 decode utility (RFC 4648)
 */
declare function base32Decode(base32: string): Buffer;
/**
 * Base32 encode utility (RFC 4648)
 */
declare function base32Encode(buffer: Buffer): string;
/**
 * TotpProvider (Google Authenticator / RFC 6238 TOTP).
 *
 * Treats 6-digit TOTP verification purely as a standard authentication provider.
 * Zero external dependencies, timing-safe verification, Google Authenticator compatible.
 */
declare class TotpProvider implements AuthProvider<TotpCredentials, TotpProfile> {
    readonly name: string;
    readonly type = "totp";
    private readonly step;
    private readonly window;
    private readonly digits;
    private readonly options;
    private readonly lastUsedTimeSteps;
    private readonly failedAttempts;
    constructor(options?: TotpProviderOptions);
    /**
     * Generates a new random Base32 secret key compatible with Google Authenticator
     */
    static generateSecret(length?: number): string;
    /**
     * Generates an otpauth:// URI suitable for creating QR codes for Google Authenticator
     */
    static generateTotpUri(params: {
        secret: string;
        accountName: string;
        issuer?: string;
        digits?: number;
        period?: number;
    }): string;
    /**
     * Generates a dynamic token for the given secret and timestamp
     */
    static generateToken(secret: string, options?: {
        timestamp?: number;
        step?: number;
        digits?: number;
    }): string;
    /**
     * Verifies a TOTP token against a secret with timing-safe comparison and window drift tolerance.
     * Returns validation status along with matched time-step counter.
     */
    static verifyTokenWithCounter(secret: string, token: string, options?: {
        timestamp?: number;
        step?: number;
        window?: number;
        digits?: number;
    }): {
        valid: boolean;
        counter?: number;
    };
    /**
     * Verifies a TOTP token against a secret with timing-safe comparison and window drift tolerance.
     */
    static verifyToken(secret: string, token: string, options?: {
        timestamp?: number;
        step?: number;
        window?: number;
        digits?: number;
    }): boolean;
    /**
     * Standard AuthProvider verifyAndExtract implementation
     */
    verifyAndExtract(credentials: TotpCredentials): Promise<ExtractedIdentity<TotpProfile>>;
}

/**
 * Easy Auth — Universal Multi-Provider Authentication & Identity Linking SDK
 */

declare const VERSION = "0.1.0";

export { AuthProvider, CreateIdentityData, CreateUserData, EasyAuthError, type ErrorCode, ExtractedIdentity, type GoogleCredentials, TotpProvider as GoogleOtpProvider, type GoogleProfile, GoogleProvider, type GoogleProviderOptions, Identity, type LineCredentials, type LineProfile, LineProvider, type LineProviderOptions, MemoryStorageAdapter, type MemoryStorageOptions, OAuth2BaseProvider, type OAuth2BaseProviderOptions, type OAuth2Credentials, type PostgresQueryRunner, PostgresStorageAdapter, type PostgresStorageOptions, SqliteStorageAdapter, type SqliteStorageOptions, StorageAdapter, type TotpCredentials, type TotpProfile, TotpProvider, type TotpProviderOptions, User, VERSION, base32Decode, base32Encode };
