import { randomUUID } from "node:crypto";
import { MemoryStorageAdapter } from "./storage/memory.js";
import { SqliteStorageAdapter } from "./storage/sqlite.js";
import { PostgresStorageAdapter } from "./storage/postgres.js";
import type { StorageAdapter } from "./storage/base.js";
import { JwtService } from "./jwt/jwt-service.js";
import type { JwtConfig } from "./jwt/types.js";
import { ProviderRegistry } from "./providers/registry.js";
import type { AuthProvider, FunctionalAuthProvider } from "./providers/base.js";
import { AuthEngine } from "./core/auth-engine.js";
import type { User, Identity, AuthResult, VerifyResult, VerifyOptions } from "./core/types.js";
import { Web3Provider, type Web3ProviderOptions } from "./providers/web3/index.js";

/**
 * Database configuration for automated persistent storage adapter instantiation.
 */
export interface DatabaseConfig {
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
export interface EasyAuthOptions {
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
export class EasyAuth {
  readonly storage: StorageAdapter;
  readonly jwt: JwtService;
  readonly registry: ProviderRegistry;
  readonly engine: AuthEngine;

  constructor(options: EasyAuthOptions) {
    if (options.storage) {
      this.storage = options.storage;
    } else if (options.database?.type === "postgres") {
      this.storage = new PostgresStorageAdapter({
        pool: options.database.pool,
        client: options.database.client,
      });
    } else if (options.database?.type === "memory") {
      this.storage = new MemoryStorageAdapter();
    } else {
      // Default to persistent SQLite on disk, ensuring user data is never lost across server restarts
      const dbPath = options.database?.path || process.env.EASY_AUTH_DB_PATH || "./easy-auth.sqlite";
      this.storage = new SqliteStorageAdapter({ path: dbPath });
    }

    this.jwt = new JwtService(options.jwt);
    this.registry = new ProviderRegistry();

    if (options.providers && Array.isArray(options.providers)) {
      for (const provider of options.providers) {
        this.registry.register(provider);
      }
    }

    this.engine = new AuthEngine({
      storage: this.storage,
      jwtService: this.jwt,
      registry: this.registry,
    });
  }

  /**
   * Registers a provider instance or functional provider dynamically at runtime
   */
  registerProvider(provider: AuthProvider): void;
  registerProvider<TCredentials = any, TProfile = any>(
    name: string,
    verifyFn: FunctionalAuthProvider<TCredentials, TProfile>
  ): void;
  registerProvider(
    providerOrName: AuthProvider | string,
    verifyFn?: FunctionalAuthProvider
  ): void {
    if (typeof providerOrName === "string" && verifyFn) {
      this.registry.registerFunction(providerOrName, verifyFn);
    } else if (typeof providerOrName === "object" && providerOrName !== null) {
      this.registry.register(providerOrName);
    } else {
      throw new Error("Invalid arguments to registerProvider.");
    }
  }

  /**
   * Returns a registered provider by name
   */
  getProvider(name: string): AuthProvider {
    return this.registry.get(name);
  }

  private readonly nonces = new Map<string, { address?: string; expiresAt: number }>();

  private cleanExpiredNonces(): void {
    const now = Date.now();
    for (const [nonce, record] of this.nonces.entries()) {
      if (now > record.expiresAt) {
        this.nonces.delete(nonce);
      }
    }
  }

  /**
   * Generates a cryptographically random Nonce for anti-replay Web3 authentication.
   * Cached with a default TTL of 5 minutes. Bounded to prevent memory exhaustion DoS.
   */
  generateNonce(address?: string, ttlMs = 5 * 60 * 1000): string {
    if (this.nonces.size >= 10000) {
      this.cleanExpiredNonces();
      if (this.nonces.size >= 10000) {
        const excess = this.nonces.size - 8000;
        const keys = this.nonces.keys();
        for (let i = 0; i < excess; i++) {
          const k = keys.next().value;
          if (k) this.nonces.delete(k);
        }
      }
    }

    const nonce = randomUUID().replace(/-/g, "").slice(0, 16);
    this.nonces.set(nonce, {
      address: address?.toLowerCase(),
      expiresAt: Date.now() + ttlMs,
    });
    return nonce;
  }

  /**
   * Validates and consumes a single-use Nonce.
   * Returns true if valid and unconsumed; false otherwise.
   */
  consumeNonce(nonce: string, address?: string): boolean {
    const record = this.nonces.get(nonce);
    if (!record) return false;
    this.nonces.delete(nonce); // Single-use consumption

    if (Date.now() > record.expiresAt) return false;
    if (record.address && address && record.address !== address.toLowerCase()) return false;

    return true;
  }

  /**
   * Factory method to create a Web3Provider pre-bound with EasyAuth's single-use nonce validator.
   */
  createWeb3Provider(options?: Web3ProviderOptions): Web3Provider {
    const provider = new Web3Provider(options);
    if (!provider.hasNonceValidator()) {
      provider.setNonceValidator((address, nonce) => this.consumeNonce(nonce, address));
    }
    return provider;
  }

  /**
   * Authenticates user using third-party credentials.
   * Automatically creates user if first time; matches existing user otherwise.
   */
  async authenticate(providerName: string, credentials: unknown): Promise<AuthResult> {
    return this.engine.authenticate(providerName, credentials);
  }

  /**
   * Verifies an Easy Auth JWT token and extracts user ID & metadata.
   * Single-line authentication middleware method.
   */
  async verify(token: string, options?: VerifyOptions): Promise<VerifyResult> {
    return this.engine.verify(token, options);
  }

  /**
   * Alias for `verify`
   */
  async verifyToken(token: string, options?: VerifyOptions): Promise<VerifyResult> {
    return this.engine.verifyToken(token, options);
  }

  /**
   * Links a new authentication method to an existing user
   */
  async linkIdentity(userId: string, providerName: string, credentials: unknown): Promise<Identity> {
    return this.engine.linkIdentity(userId, providerName, credentials);
  }

  /**
   * Unlinks an authentication method with Anti-Lockout safety protection
   */
  async unlinkIdentity(userId: string, providerName: string, providerUserId: string): Promise<void> {
    return this.engine.unlinkIdentity(userId, providerName, providerUserId);
  }

  /**
   * Lists all external identities currently linked to a user
   */
  async listIdentities(userId: string): Promise<Identity[]> {
    return this.engine.listIdentities(userId);
  }

  /**
   * Updates user metadata
   */
  async updateUserMetadata(userId: string, patch: Record<string, any>): Promise<User> {
    return this.engine.updateUserMetadata(userId, patch);
  }

  /**
   * Alias for updateUserMetadata
   */
  async updateMetadata(userId: string, patch: Record<string, any>): Promise<User> {
    return this.engine.updateMetadata(userId, patch);
  }
}
