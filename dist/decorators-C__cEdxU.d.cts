import * as _nestjs_common from '@nestjs/common';
import { DynamicModule, HttpStatus, CanActivate, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

/**
 * Core domain types and models for Easy Auth SDK
 */
interface User {
    id: string;
    metadata: Record<string, any>;
    createdAt: Date;
    updatedAt: Date;
}
interface Identity {
    id: string;
    userId: string;
    provider: string;
    providerUserId: string;
    profile?: Record<string, any>;
    createdAt: Date;
    updatedAt: Date;
}
interface AuthResult {
    user: User;
    identity: Identity;
    token: string;
    isNewUser: boolean;
    loginType: string;
}
interface EasyAuthJwtPayload {
    sub: string;
    iss: string;
    aud?: string;
    iat: number;
    exp: number;
    metadata?: Record<string, any>;
    identities?: string[];
    [key: string]: any;
}
interface VerifyOptions {
    /**
     * If true (default), loads the latest User record from the storage adapter.
     * If false, extracts user info directly from the JWT payload for stateless zero-IO verification.
     */
    fetchUser?: boolean;
}
interface VerifyResult {
    userId: string;
    metadata: Record<string, any>;
    user: User;
    payload: EasyAuthJwtPayload;
}
interface CreateUserData {
    id?: string;
    metadata?: Record<string, any>;
    createdAt?: Date;
    updatedAt?: Date;
}
interface CreateIdentityData {
    id?: string;
    userId: string;
    provider: string;
    providerUserId: string;
    profile?: Record<string, any>;
    createdAt?: Date;
    updatedAt?: Date;
}

interface DeleteIdentityOptions {
    /**
     * If true, deletion succeeds only if the user has more than 1 linked identity.
     * Prevents TOCTOU race conditions where concurrent requests orphan an account.
     */
    enforceMinimumCount?: boolean;
}
/**
 * StorageAdapter interface contract
 *
 * Provides persistence decoupling for Easy Auth SDK.
 */
interface StorageAdapter {
    createUser(data: CreateUserData): Promise<User>;
    getUserById(id: string): Promise<User | null>;
    updateUserMetadata(id: string, metadata: Record<string, any>): Promise<User>;
    createIdentity(data: CreateIdentityData): Promise<Identity>;
    getIdentity(provider: string, providerUserId: string): Promise<Identity | null>;
    listIdentitiesByUserId(userId: string): Promise<Identity[]>;
    deleteIdentity(userId: string, provider: string, providerUserId: string, options?: DeleteIdentityOptions): Promise<boolean>;
}

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

interface EasyAuthModuleOptions extends EasyAuthOptions {
    /**
     * Route prefix for built-in EasyAuthController.
     * Defaults to 'api/auth'.
     */
    routePrefix?: string;
    /**
     * Whether to disable registering the built-in EasyAuthController.
     * Defaults to false.
     */
    disableController?: boolean;
    /**
     * Whether to register EasyAuthGuard as a global guard.
     * Defaults to false.
     */
    globalGuard?: boolean;
}
declare class EasyAuthService {
    readonly options: EasyAuthModuleOptions;
    readonly auth: EasyAuth;
    constructor(options: EasyAuthModuleOptions);
    /**
     * Authenticate a user with third-party credentials.
     */
    authenticate(provider: string, credentials: any): Promise<AuthResult>;
    /**
     * Verify an incoming JWT bearer token and extract user & metadata.
     */
    verify(token: string, options?: VerifyOptions): Promise<VerifyResult>;
    /**
     * Link a new third-party identity to an existing user account.
     */
    linkIdentity(userId: string, provider: string, credentials: any): Promise<Identity>;
    /**
     * Unlink a third-party identity with anti-lockout protection.
     */
    unlinkIdentity(userId: string, provider: string, providerUserId: string): Promise<void>;
    /**
     * Get user by ID.
     */
    getUser(id: string): Promise<User | null>;
    /**
     * List all identities linked to a user.
     */
    listIdentities(userId: string): Promise<Identity[]>;
    /**
     * Generates a single-use cryptographically random nonce for Web3 authentication anti-replay.
     */
    generateNonce(address?: string, ttlMs?: number): string;
    /**
     * Validates and consumes a single-use nonce.
     */
    consumeNonce(nonce: string, address?: string): boolean;
    /**
     * Updates user metadata.
     */
    updateUserMetadata(userId: string, patch: Record<string, any>): Promise<User>;
    /**
     * Alias for updateUserMetadata.
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

interface EasyAuthModuleAsyncOptions {
    imports?: any[];
    useFactory: (...args: any[]) => Promise<EasyAuthModuleOptions> | EasyAuthModuleOptions;
    inject?: any[];
}
declare class EasyAuthModule {
    /**
     * Synchronous static registration of EasyAuthModule.
     */
    static forRoot(options: EasyAuthModuleOptions): DynamicModule;
    /**
     * Asynchronous registration of EasyAuthModule using factory function.
     */
    static forRootAsync(asyncOptions: EasyAuthModuleAsyncOptions): DynamicModule;
}

declare class EasyAuthController {
    private readonly authService;
    constructor(authService: EasyAuthService);
    private handleError;
    /**
     * Challenge Nonce generation endpoint for Web3 SIWE anti-replay authentication.
     * GET /api/auth/nonce?address=0x...
     */
    getNonce(address?: string): {
        statusCode: HttpStatus;
        nonce: string;
        address: string | undefined;
        expiresIn: number;
    };
    /**
     * Unified login endpoint.
     * POST /api/auth/login
     */
    login(body: {
        loginType?: string;
        type?: string;
        provider?: string;
        credentials: any;
    }): Promise<{
        statusCode: HttpStatus;
        loginType: string;
        user: User;
        token: string;
        isNewUser: boolean;
        identity: Identity;
    }>;
    /**
     * Identity linking endpoint (protected: user links another identity to their account).
     * POST /api/auth/link
     */
    link(body: {
        userId?: string;
        loginType?: string;
        type?: string;
        provider?: string;
        credentials: any;
    }, currentUserId?: string): Promise<{
        statusCode: HttpStatus;
        identity: Identity;
    }>;
    /**
     * Identity unlinking endpoint (protected with anti-lockout & anti-IDOR).
     * POST /api/auth/unlink
     */
    unlink(body: {
        userId?: string;
        loginType?: string;
        type?: string;
        provider?: string;
        providerUserId: string;
    }, currentUserId?: string): Promise<{
        statusCode: HttpStatus;
        success: boolean;
    }>;
    /**
     * User info endpoint based on Bearer token.
     * GET /api/auth/me
     */
    me(authHeader?: string, user?: User): Promise<{
        statusCode: HttpStatus;
        userId: string;
        user: User;
        metadata: Record<string, any>;
    }>;
    /**
     * List all linked identities for the current authenticated user.
     * GET /api/auth/identities?userId=xxx
     */
    listIdentities(userId?: string, currentUserId?: string): Promise<{
        statusCode: HttpStatus;
        identities: Identity[];
    }>;
    /**
     * OAuth redirection initiator.
     * GET /api/auth/oauth/:provider
     */
    startOAuthByPath(provider: string, redirect: string | undefined, req: any, res: any): any;
    /**
     * OAuth redirection initiator (named alias for common providers).
     * GET /api/auth/:provider(google|line|github|discord)
     */
    startOAuth(provider: string, redirect: string | undefined, req: any, res: any): any;
    private executeOAuthRedirect;
    /**
     * Universal OAuth redirection callback handler.
     * GET /api/auth/callback/:provider
     */
    handleOAuthCallback(provider: string, code: string | undefined, state: string | undefined, error: string | undefined, errorDescription: string | undefined, req: any, res: any): Promise<any>;
}

/**
 * Universal NestJS CanActivate Guard for Easy Auth.
 * Automatically verifies Bearer JWT tokens, extracts User & metadata,
 * and attaches them to `request.user`, `request.userId`, and `request.userMetadata`.
 */
declare class EasyAuthGuard implements CanActivate {
    private readonly authService;
    private readonly reflector?;
    constructor(authService: EasyAuthService, reflector?: Reflector | undefined);
    canActivate(context: ExecutionContext): Promise<boolean>;
}

/**
 * Parameter decorator to extract the current authenticated User (or a specific property)
 * injected by EasyAuthGuard.
 *
 * @example
 * ```typescript
 * @Get('profile')
 * @UseGuards(EasyAuthGuard)
 * getProfile(@CurrentUser() user: User) {
 *   return user;
 * }
 *
 * @Get('user-id')
 * @UseGuards(EasyAuthGuard)
 * getUserId(@CurrentUser('id') userId: string) {
 *   return userId;
 * }
 * ```
 */
declare const CurrentUser: (...dataOrPipes: (string | _nestjs_common.ParameterDecoratorOptions | _nestjs_common.PipeTransform<any, any> | _nestjs_common.Type<_nestjs_common.PipeTransform<any, any>> | undefined)[]) => ParameterDecorator;
/**
 * Decorator to mark a route or controller as public, bypassing EasyAuthGuard.
 *
 * @example
 * ```typescript
 * @Public()
 * @Get('public-info')
 * getPublicInfo() {
 *   return { status: 'ok' };
 * }
 * ```
 */
declare const Public: () => _nestjs_common.CustomDecorator<string>;

export { type AuthProvider as A, type CreateUserData as C, type DatabaseConfig as D, type ExtractedIdentity as E, type FunctionalAuthProvider as F, type Identity as I, type JwtConfig as J, ProviderRegistry as P, type StorageAdapter as S, type User as U, type VerifyOptions as V, type Web3Credentials as W, type CreateIdentityData as a, AuthEngine as b, type AuthEngineDependencies as c, type AuthResult as d, CurrentUser as e, EasyAuth as f, EasyAuthController as g, EasyAuthGuard as h, type EasyAuthJwtPayload as i, EasyAuthModule as j, type EasyAuthModuleAsyncOptions as k, type EasyAuthModuleOptions as l, type EasyAuthOptions as m, EasyAuthService as n, JwtService as o, Public as p, type SignJwtOptions as q, type VerifyResult as r, type Web3Profile as s, Web3Provider as t, type Web3ProviderOptions as u };
