import { S as StorageAdapter } from './base-CHEJmheF.cjs';
import { U as User, E as EasyAuthJwtPayload, A as AuthResult, I as Identity, V as VerifyOptions, b as VerifyResult } from './types-BUHBKPKK.cjs';

/**
 * JWT configuration options
 */
interface JwtConfig {
    /**
     * Secret key for HS256/symmetric signing.
     * Must be at least 32 characters for security.
     */
    secret: string;
    /**
     * Token issuer. Defaults to "easy-auth".
     */
    issuer?: string;
    /**
     * Token audience. Optional.
     */
    audience?: string | string[];
    /**
     * Token expiration time.
     * Can be expressed in seconds or a time span string (e.g. "1h", "7d", "30d").
     * Defaults to "7d".
     */
    expiresIn?: string | number;
    /**
     * Algorithm used for signing. Defaults to "HS256".
     */
    algorithm?: string;
    /**
     * Whitelist of metadata keys to embed in the JWT payload.
     * If omitted, user.metadata is included while automatically omitting known sensitive fields (password, secret, totpSecret).
     */
    metadataKeys?: string[];
}
/**
 * Options when signing a token
 */
interface SignJwtOptions {
    /**
     * Override expiration time for this specific token
     */
    expiresIn?: string | number;
    /**
     * Array of provider names currently associated with this user
     */
    identities?: string[];
    /**
     * Custom extra payload attributes to include in the token
     */
    extraPayload?: Record<string, any>;
}

/**
 * Modern JWT subsystem for Easy Auth SDK based on standard `jose` library.
 */
declare class JwtService {
    private readonly config;
    private readonly key;
    constructor(config: JwtConfig);
    /**
     * Signs a unified JWT token for the given User
     */
    sign(user: User, options?: SignJwtOptions): Promise<string>;
    /**
     * Verifies and decodes a JWT token.
     * Throws TOKEN_EXPIRED if the token is past its expiration time.
     * Throws TOKEN_INVALID if the signature is invalid, forged, or structurally malformed.
     */
    verify(token: string): Promise<EasyAuthJwtPayload>;
}

/**
 * Extracted identity output from a provider verification
 */
interface ExtractedIdentity<TProfile = any> {
    /**
     * Global unique identifier in the third-party domain (e.g. lowercase wallet address, github user ID)
     */
    providerUserId: string;
    /**
     * Optional profile metadata snapshot extracted from the provider
     */
    profile?: TProfile;
}
/**
 * Core contract that all authentication providers must implement
 */
interface AuthProvider<TCredentials = any, TProfile = any> {
    /**
     * Unique name identifier of the provider (e.g. "web3", "google", "github", "sms")
     */
    readonly name: string;
    /**
     * Optional broad category or login type (e.g. "wallet", "oauth2", "totp", "sms")
     */
    readonly type?: string;
    /**
     * Verifies the third-party credentials and extracts a normalized identity
     */
    verifyAndExtract(credentials: TCredentials): Promise<ExtractedIdentity<TProfile>>;
    /**
     * Optional method to generate authorization URL for OAuth2 redirection
     */
    getAuthorizationUrl?(options: {
        redirectUri: string;
        state?: string;
        scope?: string;
    }): string;
}
/**
 * Functional provider type for one-line registration
 */
type FunctionalAuthProvider<TCredentials = any, TProfile = any> = (credentials: TCredentials) => Promise<ExtractedIdentity<TProfile>>;

/**
 * Registry for managing and dispatching authentication providers.
 */
declare class ProviderRegistry {
    private readonly providers;
    /**
     * Registers a provider instance
     */
    register(provider: AuthProvider): void;
    /**
     * Registers a functional provider with a single verification function
     */
    registerFunction<TCredentials = any, TProfile = any>(name: string, verifyFn: FunctionalAuthProvider<TCredentials, TProfile>): void;
    /**
     * Retrieves a registered provider by name. Throws PROVIDER_NOT_FOUND if not found.
     */
    get(name: string): AuthProvider;
    /**
     * Checks if a provider is registered
     */
    has(name: string): boolean;
    /**
     * Returns a list of all registered provider names
     */
    list(): string[];
}

interface AuthEngineDependencies {
    storage: StorageAdapter;
    jwtService: JwtService;
    registry: ProviderRegistry;
}
/**
 * Core orchestration engine of Easy Auth.
 * Manages authentication, identity linking, unlinking (with Anti-Lockout safety),
 * and unified token verification.
 */
declare class AuthEngine {
    readonly storage: StorageAdapter;
    readonly jwtService: JwtService;
    readonly registry: ProviderRegistry;
    constructor(dependencies: AuthEngineDependencies);
    /**
     * Unified authentication entrypoint.
     * If the identity is seen for the first time, automatically creates a new User and links the Identity.
     * If the identity is already known, logs in the existing User.
     */
    authenticate(providerName: string, credentials: unknown): Promise<AuthResult>;
    /**
     * Links a new external identity to an existing user account.
     * Enforces exclusive binding: if the identity is already bound to another user, throws IDENTITY_ALREADY_LINKED.
     * Idempotent: if already linked to the same user, returns the existing identity.
     */
    linkIdentity(userId: string, providerName: string, credentials: unknown): Promise<Identity>;
    /**
     * Unlinks an external identity from an existing user account.
     * Enforces Anti-Lockout safety: rejects unlinking if it is the user's only remaining identity.
     */
    unlinkIdentity(userId: string, providerName: string, providerUserId: string): Promise<void>;
    /**
     * Returns all identities linked to a specific user
     */
    listIdentities(userId: string): Promise<Identity[]>;
    /**
     * Updates user profile / metadata
     */
    updateUserMetadata(userId: string, patch: Record<string, any>): Promise<User>;
    /**
     * Alias for updateUserMetadata
     */
    updateMetadata(userId: string, patch: Record<string, any>): Promise<User>;
    /**
     * Alias for verify
     */
    verifyToken(token: string, options?: VerifyOptions): Promise<VerifyResult>;
    /**
     * Verifies an Easy Auth JWT token and returns standard context including userId, metadata, and user entity.
     */
    verify(token: string, options?: VerifyOptions): Promise<VerifyResult>;
}

interface Web3Credentials {
    address: string;
    signature: string;
    message: string;
    /**
     * Single-use challenge nonce (optional if included in message)
     */
    nonce?: string;
}
interface Web3ProviderOptions {
    /**
     * Domain name to verify in the signed message (useful for EIP-4361 SIWE anti-phishing)
     */
    domain?: string;
    /**
     * Enforce strict EIP-4361 header matching:
     * `^${domain} wants you to sign in with your Ethereum account:`
     * Defaults to false for broader compatibility.
     */
    strictDomainMatch?: boolean;
    /**
     * Expected statement substring in the signed message
     */
    statement?: string;
    /**
     * Enforce expiration time and not-before timestamps when present in EIP-4361 messages.
     * Defaults to true.
     */
    verifyTimestamps?: boolean;
    /**
     * Callback to validate and consume single-use nonces (anti-replay defense).
     */
    validateNonce?: (address: string, nonce: string, message: string) => Promise<boolean> | boolean;
    /**
     * Optional Viem PublicClient to support ERC-1271 smart contract wallet verification (Safe, Argent, AA)
     */
    client?: any;
}
interface Web3Profile {
    address: string;
}
/**
 * Web3 EVM wallet signature authentication provider.
 * Supports standard EIP-191 personal_sign and EIP-4361 SIWE message validation.
 * Normalizes all wallet addresses to lowercase.
 */
declare class Web3Provider implements AuthProvider<Web3Credentials, Web3Profile> {
    readonly name = "web3";
    readonly type = "wallet";
    private readonly domain?;
    private readonly statement?;
    private readonly strictDomainMatch;
    private readonly verifyTimestamps;
    private validateNonce?;
    private readonly client?;
    constructor(options?: Web3ProviderOptions);
    /**
     * Returns true if a nonce validator callback is registered.
     */
    hasNonceValidator(): boolean;
    /**
     * Attach or replace the nonce validator callback (e.g. from EasyAuth nonce manager).
     */
    setNonceValidator(fn: (address: string, nonce: string, message: string) => Promise<boolean> | boolean): this;
    verifyAndExtract(credentials: Web3Credentials): Promise<ExtractedIdentity<Web3Profile>>;
}

/**
 * Database configuration for automated persistent storage adapter instantiation.
 */
interface DatabaseConfig {
    /** Database engine: 'sqlite' | 'postgres' | 'memory' */
    type: "sqlite" | "postgres" | "memory";
    /** File path for SQLite (e.g. './data/auth.db' or ':memory:'). Defaults to ':memory:'. */
    path?: string;
    /** PostgreSQL client or pool instance */
    pool?: any;
    client?: any;
}
/**
 * Options for initializing EasyAuth SDK
 */
interface EasyAuthOptions {
    /**
     * JWT signing and verification configuration
     */
    jwt: JwtConfig;
    /**
     * Explicit custom storage adapter for User and Identity persistence.
     * If provided, takes precedence over the `database` config.
     */
    storage?: StorageAdapter;
    /**
     * Database configuration for automated persistent storage adapter instantiation.
     * Convenient shortcut to automatically initialize SQLite or PostgreSQL with auto DDL.
     */
    database?: DatabaseConfig;
    /**
     * Initial array of authentication providers to register
     */
    providers?: AuthProvider[];
}
/**
 * EasyAuth — Universal Multi-Provider Authentication & Identity Linking SDK.
 *
 * Core philosophy: Any login → One User → One User ID.
 */
declare class EasyAuth {
    readonly storage: StorageAdapter;
    readonly jwt: JwtService;
    readonly registry: ProviderRegistry;
    readonly engine: AuthEngine;
    constructor(options: EasyAuthOptions);
    /**
     * Registers a provider instance or functional provider dynamically at runtime
     */
    registerProvider(provider: AuthProvider): void;
    registerProvider<TCredentials = any, TProfile = any>(name: string, verifyFn: FunctionalAuthProvider<TCredentials, TProfile>): void;
    /**
     * Returns a registered provider by name
     */
    getProvider(name: string): AuthProvider;
    private readonly nonces;
    private cleanExpiredNonces;
    /**
     * Generates a cryptographically random Nonce for anti-replay Web3 authentication.
     * Cached with a default TTL of 5 minutes. Bounded to prevent memory exhaustion DoS.
     */
    generateNonce(address?: string, ttlMs?: number): string;
    /**
     * Validates and consumes a single-use Nonce.
     * Returns true if valid and unconsumed; false otherwise.
     */
    consumeNonce(nonce: string, address?: string): boolean;
    /**
     * Factory method to create a Web3Provider pre-bound with EasyAuth's single-use nonce validator.
     */
    createWeb3Provider(options?: Web3ProviderOptions): Web3Provider;
    /**
     * Authenticates user using third-party credentials.
     * Automatically creates user if first time; matches existing user otherwise.
     */
    authenticate(providerName: string, credentials: unknown): Promise<AuthResult>;
    /**
     * Verifies an Easy Auth JWT token and extracts user ID & metadata.
     * Single-line authentication middleware method.
     */
    verify(token: string, options?: VerifyOptions): Promise<VerifyResult>;
    /**
     * Alias for `verify`
     */
    verifyToken(token: string, options?: VerifyOptions): Promise<VerifyResult>;
    /**
     * Links a new authentication method to an existing user
     */
    linkIdentity(userId: string, providerName: string, credentials: unknown): Promise<Identity>;
    /**
     * Unlinks an authentication method with Anti-Lockout safety protection
     */
    unlinkIdentity(userId: string, providerName: string, providerUserId: string): Promise<void>;
    /**
     * Lists all external identities currently linked to a user
     */
    listIdentities(userId: string): Promise<Identity[]>;
    /**
     * Updates user metadata
     */
    updateUserMetadata(userId: string, patch: Record<string, any>): Promise<User>;
    /**
     * Alias for updateUserMetadata
     */
    updateMetadata(userId: string, patch: Record<string, any>): Promise<User>;
    /**
     * Obtains OAuth redirection authorization URL for supported providers.
     */
    getAuthorizationUrl(providerName: string, options: {
        redirectUri: string;
        state?: string;
        scope?: string;
    }): string;
}

export { type AuthProvider as A, type DatabaseConfig as D, type ExtractedIdentity as E, type FunctionalAuthProvider as F, type JwtConfig as J, ProviderRegistry as P, type SignJwtOptions as S, type Web3Credentials as W, AuthEngine as a, type AuthEngineDependencies as b, EasyAuth as c, type EasyAuthOptions as d, JwtService as e, type Web3Profile as f, Web3Provider as g, type Web3ProviderOptions as h };
