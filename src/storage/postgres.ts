import { randomUUID } from "node:crypto";
import type { StorageAdapter } from "./base.js";
import type { User, Identity, CreateUserData, CreateIdentityData } from "../core/types.js";
import { EasyAuthError } from "../core/errors.js";

export interface PostgresQueryRunner {
  query(sql: string, params?: any[]): Promise<{ rows: any[]; rowCount?: number | null }>;
}

export interface PostgresStorageOptions {
  /**
   * PostgreSQL client, pool, or any object implementing `query(sql, params)`.
   */
  pool?: PostgresQueryRunner;
  client?: PostgresQueryRunner;
  query?: (sql: string, params?: any[]) => Promise<{ rows: any[]; rowCount?: number | null }>;

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
export class PostgresStorageAdapter implements StorageAdapter {
  private readonly runner: PostgresQueryRunner;
  private isInitialized = false;
  private initPromise: Promise<void> | null = null;
  private readonly autoInitTables: boolean;

  constructor(options: PostgresStorageOptions) {
    if (options.pool) {
      this.runner = options.pool;
    } else if (options.client) {
      this.runner = options.client;
    } else if (options.query) {
      this.runner = { query: options.query };
    } else {
      throw new EasyAuthError(
        "STORAGE_ERROR",
        "PostgresStorageAdapter requires either 'pool', 'client', or 'query' function."
      );
    }

    this.autoInitTables = options.autoInitTables !== false;
  }

  /**
   * Ensures that the database tables and indexes exist.
   */
  async ensureInit(): Promise<void> {
    if (this.isInitialized || !this.autoInitTables) {
      return;
    }

    if (!this.initPromise) {
      this.initPromise = (async () => {
        await this.runner.query(`
          CREATE TABLE IF NOT EXISTS easy_auth_users (
            id VARCHAR(255) PRIMARY KEY,
            metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
            created_at TIMESTAMPTZ NOT NULL,
            updated_at TIMESTAMPTZ NOT NULL
          );

          CREATE TABLE IF NOT EXISTS easy_auth_identities (
            id VARCHAR(255) PRIMARY KEY,
            user_id VARCHAR(255) NOT NULL,
            provider VARCHAR(255) NOT NULL,
            provider_user_id VARCHAR(255) NOT NULL,
            profile JSONB,
            created_at TIMESTAMPTZ NOT NULL,
            updated_at TIMESTAMPTZ NOT NULL,
            CONSTRAINT uq_easy_auth_provider_user UNIQUE(provider, provider_user_id)
          );

          CREATE INDEX IF NOT EXISTS idx_easy_auth_identities_user_id
            ON easy_auth_identities(user_id);
        `);
        this.isInitialized = true;
      })();
    }

    await this.initPromise;
  }

  private mapUserRow(row: any): User {
    let metadata = row.metadata;
    if (typeof metadata === "string") {
      try {
        metadata = JSON.parse(metadata);
      } catch {
        metadata = {};
      }
    }

    return {
      id: row.id,
      metadata: metadata || {},
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
    };
  }

  private mapIdentityRow(row: any): Identity {
    let profile = row.profile;
    if (typeof profile === "string") {
      try {
        profile = JSON.parse(profile);
      } catch {
        profile = undefined;
      }
    }

    return {
      id: row.id,
      userId: row.user_id,
      provider: row.provider,
      providerUserId: row.provider_user_id,
      profile: profile || undefined,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
    };
  }

  async createUser(data: CreateUserData): Promise<User> {
    await this.ensureInit();

    const id = data.id || `usr_${randomUUID().replace(/-/g, "").slice(0, 16)}`;
    const now = new Date();
    const createdAt = data.createdAt || now;
    const updatedAt = data.updatedAt || now;
    const metadataJson = JSON.stringify(data.metadata || {});

    try {
      const res = await this.runner.query(
        `INSERT INTO easy_auth_users (id, metadata, created_at, updated_at)
         VALUES ($1, $2::jsonb, $3, $4)
         RETURNING id, metadata, created_at, updated_at`,
        [id, metadataJson, createdAt, updatedAt]
      );
      return this.mapUserRow(res.rows[0]);
    } catch (err: any) {
      throw new EasyAuthError(
        "STORAGE_ERROR",
        `Failed to create user with ID "${id}": ${err.message}`,
        err
      );
    }
  }

  async getUserById(id: string): Promise<User | null> {
    await this.ensureInit();

    const res = await this.runner.query(
      `SELECT id, metadata, created_at, updated_at
       FROM easy_auth_users
       WHERE id = $1`,
      [id]
    );

    if (res.rows.length === 0) {
      return null;
    }

    return this.mapUserRow(res.rows[0]);
  }

  async updateUserMetadata(id: string, metadata: Record<string, any>): Promise<User> {
    await this.ensureInit();

    const updatedAt = new Date();
    const res = await this.runner.query(
      `UPDATE easy_auth_users
       SET metadata = metadata || $2::jsonb, updated_at = $3
       WHERE id = $1
       RETURNING id, metadata, created_at, updated_at`,
      [id, JSON.stringify(metadata || {}), updatedAt]
    );

    if (res.rows.length === 0) {
      throw new EasyAuthError("USER_NOT_FOUND", `User with ID "${id}" was not found.`);
    }

    return this.mapUserRow(res.rows[0]);
  }

  async createIdentity(data: CreateIdentityData): Promise<Identity> {
    await this.ensureInit();

    // 1. Verify that the user exists
    const user = await this.getUserById(data.userId);
    if (!user) {
      throw new EasyAuthError("USER_NOT_FOUND", `User with ID "${data.userId}" was not found.`);
    }

    // 2. Check if identity already exists
    const existing = await this.getIdentity(data.provider, data.providerUserId);
    if (existing) {
      throw new EasyAuthError(
        "IDENTITY_ALREADY_LINKED",
        `Identity for provider "${data.provider}" with ID "${data.providerUserId}" is already linked.`
      );
    }

    const id = data.id || `idn_${randomUUID().replace(/-/g, "").slice(0, 16)}`;
    const now = new Date();
    const createdAt = data.createdAt || now;
    const updatedAt = data.updatedAt || now;
    const profileJson = data.profile ? JSON.stringify(data.profile) : null;

    try {
      const res = await this.runner.query(
        `INSERT INTO easy_auth_identities (id, user_id, provider, provider_user_id, profile, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7)
         RETURNING id, user_id, provider, provider_user_id, profile, created_at, updated_at`,
        [id, data.userId, data.provider, data.providerUserId, profileJson, createdAt, updatedAt]
      );
      return this.mapIdentityRow(res.rows[0]);
    } catch (err: any) {
      if (err.code === "23505" || (err.message && err.message.includes("unique"))) {
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
  }

  async getIdentity(provider: string, providerUserId: string): Promise<Identity | null> {
    await this.ensureInit();

    const res = await this.runner.query(
      `SELECT id, user_id, provider, provider_user_id, profile, created_at, updated_at
       FROM easy_auth_identities
       WHERE provider = $1 AND provider_user_id = $2`,
      [provider, providerUserId]
    );

    if (res.rows.length === 0) {
      return null;
    }

    return this.mapIdentityRow(res.rows[0]);
  }

  async listIdentitiesByUserId(userId: string): Promise<Identity[]> {
    await this.ensureInit();

    const res = await this.runner.query(
      `SELECT id, user_id, provider, provider_user_id, profile, created_at, updated_at
       FROM easy_auth_identities
       WHERE user_id = $1
       ORDER BY created_at ASC`,
      [userId]
    );

    return res.rows.map((r: any) => this.mapIdentityRow(r));
  }

  async deleteIdentity(
    userId: string,
    provider: string,
    providerUserId: string,
    options?: { enforceMinimumCount?: boolean }
  ): Promise<boolean> {
    await this.ensureInit();

    const sql = options?.enforceMinimumCount
      ? `DELETE FROM easy_auth_identities
         WHERE user_id = $1 AND provider = $2 AND provider_user_id = $3
           AND (SELECT COUNT(*) FROM easy_auth_identities WHERE user_id = $1) > 1`
      : `DELETE FROM easy_auth_identities
         WHERE user_id = $1 AND provider = $2 AND provider_user_id = $3`;

    const res = await this.runner.query(sql, [userId, provider, providerUserId]);

    return typeof res.rowCount === "number" ? res.rowCount > 0 : (res.rows && res.rows.length > 0);
  }
}
