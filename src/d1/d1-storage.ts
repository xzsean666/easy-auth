import type { StorageAdapter, DeleteIdentityOptions } from "../storage/base.js";
import type { User, Identity, CreateUserData, CreateIdentityData } from "../core/types.js";
import { EasyAuthError } from "../core/errors.js";
import { D1SessionManager } from "./sessions.js";

/**
 * Minimal type definition for Cloudflare D1 Database binding
 */
export interface D1PreparedStatement {
  bind(...values: any[]): D1PreparedStatement;
  first<T = unknown>(colName?: string): Promise<T | null>;
  all<T = unknown>(): Promise<{ results: T[]; success: boolean; meta?: any }>;
  run(): Promise<{ success: boolean; meta?: any }>;
}

export interface D1DatabaseLike {
  prepare(query: string): D1PreparedStatement;
  batch<T = unknown>(statements: D1PreparedStatement[]): Promise<any[]>;
  withSession?(bookmark?: string): D1DatabaseLike;
}

export interface D1StorageOptions {
  /**
   * Cloudflare D1 Database binding instance (e.g. `env.DB`)
   */
  db: D1DatabaseLike;

  /**
   * Optional initial session bookmark for Read-Your-Own-Writes consistency
   */
  bookmark?: string | null;

  /**
   * Automatically initialize database schema and indexes via `db.batch()`.
   * Defaults to true.
   */
  autoInitTables?: boolean;

  /**
   * Custom table name for users. Defaults to "easy_auth_users".
   */
  usersTable?: string;

  /**
   * Custom table name for identities. Defaults to "easy_auth_identities".
   */
  identitiesTable?: string;
}

interface UserRow {
  id: string;
  metadata: string;
  created_at: string;
  updated_at: string;
}

interface IdentityRow {
  id: string;
  user_id: string;
  provider: string;
  provider_user_id: string;
  profile: string | null;
  created_at: string;
  updated_at: string;
}

function generateId(prefix: string): string {
  if (typeof globalThis.crypto?.randomUUID === "function") {
    return `${prefix}_${globalThis.crypto.randomUUID().replace(/-/g, "").slice(0, 16)}`;
  }
  // Math.random fallback for non-crypto mock environments
  return `${prefix}_${Math.random().toString(36).substring(2, 18)}`;
}

/**
 * Production-ready Cloudflare D1 StorageAdapter.
 *
 * Highly optimized for Cloudflare Workers / Pages:
 * - Read-Your-Own-Writes (RYW) consistency via D1SessionManager
 * - Single-RPC batch initialization via `db.batch()`
 * - Zero node:fs or native C++ dependencies
 */
export class D1StorageAdapter implements StorageAdapter {
  private readonly rawDb: D1DatabaseLike;
  private readonly sessionManager: D1SessionManager;
  private readonly usersTable: string;
  private readonly identitiesTable: string;
  private readonly autoInitTables: boolean;
  private isInitialized = false;
  private initPromise: Promise<void> | null = null;

  constructor(options: D1StorageOptions) {
    if (!options?.db) {
      throw new EasyAuthError("STORAGE_ERROR", "D1StorageAdapter requires a valid Cloudflare D1 database binding ('db').");
    }

    this.rawDb = options.db;
    this.sessionManager = new D1SessionManager(options.bookmark);
    this.usersTable = options.usersTable || "easy_auth_users";
    this.identitiesTable = options.identitiesTable || "easy_auth_identities";
    this.autoInitTables = options.autoInitTables !== false;
  }

  /**
   * Returns the D1Database instance wrapped with active session bookmark
   */
  getDb(): D1DatabaseLike {
    return this.sessionManager.wrapDatabase(this.rawDb);
  }

  /**
   * Retrieves the current D1 session bookmark.
   */
  getBookmark(): string | null {
    return this.sessionManager.getBookmark();
  }

  /**
   * Manually sets or advances the active D1 session bookmark.
   */
  setBookmark(bookmark: string | null): void {
    this.sessionManager.setBookmark(bookmark);
  }

  /**
   * Clears the current bookmark.
   */
  clearBookmark(): void {
    this.sessionManager.clearBookmark();
  }

  /**
   * Ensures database schema and indexes are created via a single D1 batch RPC
   */
  async ensureInit(): Promise<void> {
    if (this.isInitialized || !this.autoInitTables) {
      return;
    }

    if (!this.initPromise) {
      this.initPromise = (async () => {
        try {
          const stmts = [
            this.rawDb.prepare(`
              CREATE TABLE IF NOT EXISTS ${this.usersTable} (
                id TEXT PRIMARY KEY,
                metadata TEXT NOT NULL,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
              )
            `),
            this.rawDb.prepare(`
              CREATE TABLE IF NOT EXISTS ${this.identitiesTable} (
                id TEXT PRIMARY KEY,
                user_id TEXT NOT NULL,
                provider TEXT NOT NULL,
                provider_user_id TEXT NOT NULL,
                profile TEXT,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                UNIQUE(provider, provider_user_id)
              )
            `),
            this.rawDb.prepare(`
              CREATE INDEX IF NOT EXISTS idx_${this.identitiesTable}_user_id
              ON ${this.identitiesTable}(user_id)
            `),
          ];

          const results = await this.rawDb.batch(stmts);
          this.captureBookmarkFromResult(results);
          this.isInitialized = true;
        } catch (err: any) {
          throw new EasyAuthError("STORAGE_ERROR", `Failed to initialize D1 database schema: ${err.message}`, err);
        }
      })();
    }

    await this.initPromise;
  }

  private captureBookmarkFromResult(result: any): void {
    if (!result) return;
    if (Array.isArray(result) && result.length > 0) {
      const last = result[result.length - 1];
      const bm = last?.meta?.bookmark || last?.bookmark;
      if (bm) this.sessionManager.setBookmark(bm);
      return;
    }
    const bm = result?.meta?.bookmark || result?.bookmark;
    if (bm) this.sessionManager.setBookmark(bm);
  }

  private mapUserRow(row: UserRow): User {
    let metadata: Record<string, any> = {};
    try {
      metadata = JSON.parse(row.metadata);
    } catch {
      metadata = {};
    }

    return {
      id: row.id,
      metadata,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
    };
  }

  private mapIdentityRow(row: IdentityRow): Identity {
    let profile: Record<string, any> | undefined;
    if (row.profile) {
      try {
        profile = JSON.parse(row.profile);
      } catch {
        profile = undefined;
      }
    }

    return {
      id: row.id,
      userId: row.user_id,
      provider: row.provider,
      providerUserId: row.provider_user_id,
      profile,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
    };
  }

  async createUser(data: CreateUserData): Promise<User> {
    await this.ensureInit();

    const id = data.id || generateId("usr");
    const now = new Date();
    const createdAt = (data.createdAt || now).toISOString();
    const updatedAt = (data.updatedAt || now).toISOString();
    const metadataStr = JSON.stringify(data.metadata || {});

    try {
      const stmt = this.getDb()
        .prepare(`
          INSERT INTO ${this.usersTable} (id, metadata, created_at, updated_at)
          VALUES (?, ?, ?, ?)
        `)
        .bind(id, metadataStr, createdAt, updatedAt);

      const res = await stmt.run();
      this.captureBookmarkFromResult(res);
    } catch (err: any) {
      throw new EasyAuthError("STORAGE_ERROR", `Failed to create user with ID "${id}": ${err.message}`, err);
    }

    return {
      id,
      metadata: data.metadata ? { ...data.metadata } : {},
      createdAt: new Date(createdAt),
      updatedAt: new Date(updatedAt),
    };
  }

  async getUserById(id: string): Promise<User | null> {
    await this.ensureInit();

    try {
      const stmt = this.getDb()
        .prepare(`
          SELECT id, metadata, created_at, updated_at
          FROM ${this.usersTable}
          WHERE id = ?
        `)
        .bind(id);

      const row = await stmt.first<UserRow>();
      return row ? this.mapUserRow(row) : null;
    } catch (err: any) {
      throw new EasyAuthError("STORAGE_ERROR", `Failed to fetch user with ID "${id}": ${err.message}`, err);
    }
  }

  async updateUserMetadata(id: string, metadata: Record<string, any>): Promise<User> {
    await this.ensureInit();

    const existing = await this.getUserById(id);
    if (!existing) {
      throw new EasyAuthError("USER_NOT_FOUND", `User with ID "${id}" was not found.`);
    }

    const merged = { ...existing.metadata, ...(metadata || {}) };
    const updatedAt = new Date().toISOString();
    const metadataStr = JSON.stringify(merged);

    try {
      const stmt = this.getDb()
        .prepare(`
          UPDATE ${this.usersTable}
          SET metadata = ?, updated_at = ?
          WHERE id = ?
        `)
        .bind(metadataStr, updatedAt, id);

      const res = await stmt.run();
      this.captureBookmarkFromResult(res);
    } catch (err: any) {
      throw new EasyAuthError("STORAGE_ERROR", `Failed to update metadata for user "${id}": ${err.message}`, err);
    }

    return {
      ...existing,
      metadata: merged,
      updatedAt: new Date(updatedAt),
    };
  }

  async createIdentity(data: CreateIdentityData): Promise<Identity> {
    await this.ensureInit();

    // 1. Verify user exists
    const user = await this.getUserById(data.userId);
    if (!user) {
      throw new EasyAuthError("USER_NOT_FOUND", `User with ID "${data.userId}" was not found.`);
    }

    // 2. Check for duplicate identity
    const existing = await this.getIdentity(data.provider, data.providerUserId);
    if (existing) {
      throw new EasyAuthError(
        "IDENTITY_ALREADY_LINKED",
        `Identity for provider "${data.provider}" with ID "${data.providerUserId}" is already linked.`
      );
    }

    const id = data.id || generateId("idn");
    const now = new Date();
    const createdAt = (data.createdAt || now).toISOString();
    const updatedAt = (data.updatedAt || now).toISOString();
    const profileStr = data.profile ? JSON.stringify(data.profile) : null;

    try {
      const stmt = this.getDb()
        .prepare(`
          INSERT INTO ${this.identitiesTable} (id, user_id, provider, provider_user_id, profile, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `)
        .bind(id, data.userId, data.provider, data.providerUserId, profileStr, createdAt, updatedAt);

      const res = await stmt.run();
      this.captureBookmarkFromResult(res);
    } catch (err: any) {
      if (err.message && err.message.includes("UNIQUE constraint failed")) {
        throw new EasyAuthError(
          "IDENTITY_ALREADY_LINKED",
          `Identity for provider "${data.provider}" with ID "${data.providerUserId}" is already linked.`
        );
      }
      throw new EasyAuthError(
        "STORAGE_ERROR",
        `Failed to create identity "${data.provider}:${data.providerUserId}": ${err.message}`,
        err
      );
    }

    return {
      id,
      userId: data.userId,
      provider: data.provider,
      providerUserId: data.providerUserId,
      profile: data.profile ? { ...data.profile } : undefined,
      createdAt: new Date(createdAt),
      updatedAt: new Date(updatedAt),
    };
  }

  async getIdentity(provider: string, providerUserId: string): Promise<Identity | null> {
    await this.ensureInit();

    try {
      const stmt = this.getDb()
        .prepare(`
          SELECT id, user_id, provider, provider_user_id, profile, created_at, updated_at
          FROM ${this.identitiesTable}
          WHERE provider = ? AND provider_user_id = ?
        `)
        .bind(provider, providerUserId);

      const row = await stmt.first<IdentityRow>();
      return row ? this.mapIdentityRow(row) : null;
    } catch (err: any) {
      throw new EasyAuthError("STORAGE_ERROR", `Failed to get identity for "${provider}:${providerUserId}": ${err.message}`, err);
    }
  }

  async listIdentitiesByUserId(userId: string): Promise<Identity[]> {
    await this.ensureInit();

    try {
      const stmt = this.getDb()
        .prepare(`
          SELECT id, user_id, provider, provider_user_id, profile, created_at, updated_at
          FROM ${this.identitiesTable}
          WHERE user_id = ?
          ORDER BY created_at ASC
        `)
        .bind(userId);

      const res = await stmt.all<IdentityRow>();
      const rows = res.results || [];
      return rows.map((r) => this.mapIdentityRow(r));
    } catch (err: any) {
      throw new EasyAuthError("STORAGE_ERROR", `Failed to list identities for user "${userId}": ${err.message}`, err);
    }
  }

  async deleteIdentity(
    userId: string,
    provider: string,
    providerUserId: string,
    options?: DeleteIdentityOptions
  ): Promise<boolean> {
    await this.ensureInit();

    try {
      let stmt: D1PreparedStatement;
      if (options?.enforceMinimumCount) {
        stmt = this.getDb()
          .prepare(`
            DELETE FROM ${this.identitiesTable}
            WHERE user_id = ? AND provider = ? AND provider_user_id = ?
              AND (SELECT COUNT(*) FROM ${this.identitiesTable} WHERE user_id = ?) > 1
          `)
          .bind(userId, provider, providerUserId, userId);
      } else {
        stmt = this.getDb()
          .prepare(`
            DELETE FROM ${this.identitiesTable}
            WHERE user_id = ? AND provider = ? AND provider_user_id = ?
          `)
          .bind(userId, provider, providerUserId);
      }

      const res = await stmt.run();
      this.captureBookmarkFromResult(res);

      const changes = res?.meta?.changes ?? (res as any)?.changes;
      return typeof changes === "number" ? changes > 0 : res.success === true;
    } catch (err: any) {
      throw new EasyAuthError(
        "STORAGE_ERROR",
        `Failed to delete identity "${provider}:${providerUserId}": ${err.message}`,
        err
      );
    }
  }
}
