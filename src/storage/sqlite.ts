import { randomUUID } from "node:crypto";
import { dirname } from "node:path";
import { mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import type { DatabaseSync } from "node:sqlite";
import type { StorageAdapter } from "./base.js";
import type { User, Identity, CreateUserData, CreateIdentityData } from "../core/types.js";
import { EasyAuthError } from "../core/errors.js";

function getDatabaseSyncClass(): typeof DatabaseSync {
  try {
    const req = typeof require !== "undefined" ? require : createRequire(import.meta.url);
    const mod = req("node:sqlite");
    return mod.DatabaseSync;
  } catch (err: any) {
    throw new EasyAuthError(
      "STORAGE_ERROR",
      `Native SQLite (node:sqlite) is not available: ${err.message}`
    );
  }
}

export interface SqliteStorageOptions {
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

/**
 * Native, high-performance SQLite StorageAdapter built on Node.js 22+ `node:sqlite`.
 * Requires zero native compilation or heavy external C++ binaries.
 */
export class SqliteStorageAdapter implements StorageAdapter {
  private readonly db: DatabaseSync;
  private readonly isManaged: boolean;

  constructor(options?: SqliteStorageOptions) {
    if (options?.db) {
      this.db = options.db;
      this.isManaged = false;
    } else {
      const location = options?.path || process.env.EASY_AUTH_DB_PATH || "./easy-auth.sqlite";
      if (location !== ":memory:" && !location.startsWith("file::memory:")) {
        const dir = dirname(location);
        if (dir && dir !== ".") {
          mkdirSync(dir, { recursive: true });
        }
      }
      const DB = getDatabaseSyncClass();
      this.db = new DB(location);
      this.isManaged = true;
    }

    this.initTables();
  }

  private initTables(): void {
    this.db.exec(`
      PRAGMA journal_mode = WAL;
      PRAGMA busy_timeout = 5000;
      PRAGMA synchronous = NORMAL;

      CREATE TABLE IF NOT EXISTS easy_auth_users (
        id TEXT PRIMARY KEY,
        metadata TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS easy_auth_identities (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        provider TEXT NOT NULL,
        provider_user_id TEXT NOT NULL,
        profile TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        UNIQUE(provider, provider_user_id)
      );

      CREATE INDEX IF NOT EXISTS idx_easy_auth_identities_user_id
        ON easy_auth_identities(user_id);
    `);
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
    const id = data.id || `usr_${randomUUID().replace(/-/g, "").slice(0, 16)}`;
    const now = new Date();
    const createdAt = (data.createdAt || now).toISOString();
    const updatedAt = (data.updatedAt || now).toISOString();
    const metadataStr = JSON.stringify(data.metadata || {});

    try {
      const stmt = this.db.prepare(`
        INSERT INTO easy_auth_users (id, metadata, created_at, updated_at)
        VALUES (?, ?, ?, ?)
      `);
      stmt.run(id, metadataStr, createdAt, updatedAt);
    } catch (err: any) {
      throw new EasyAuthError(
        "STORAGE_ERROR",
        `Failed to create user with ID "${id}": ${err.message}`,
        err
      );
    }

    return {
      id,
      metadata: data.metadata ? { ...data.metadata } : {},
      createdAt: new Date(createdAt),
      updatedAt: new Date(updatedAt),
    };
  }

  async getUserById(id: string): Promise<User | null> {
    const stmt = this.db.prepare(`
      SELECT id, metadata, created_at, updated_at
      FROM easy_auth_users
      WHERE id = ?
    `);
    const row = stmt.get(id) as UserRow | undefined;
    return row ? this.mapUserRow(row) : null;
  }

  async updateUserMetadata(id: string, metadata: Record<string, any>): Promise<User> {
    const updatedAt = new Date().toISOString();
    const patchJson = JSON.stringify(metadata || {});

    const stmt = this.db.prepare(`
      UPDATE easy_auth_users
      SET metadata = json_patch(metadata, ?), updated_at = ?
      WHERE id = ?
      RETURNING id, metadata, created_at, updated_at
    `);
    const row = stmt.get(patchJson, updatedAt, id) as UserRow | undefined;
    if (!row) {
      throw new EasyAuthError("USER_NOT_FOUND", `User with ID "${id}" was not found.`);
    }

    return this.mapUserRow(row);
  }

  async createIdentity(data: CreateIdentityData): Promise<Identity> {
    // 1. Verify that the user exists
    const user = await this.getUserById(data.userId);
    if (!user) {
      throw new EasyAuthError("USER_NOT_FOUND", `User with ID "${data.userId}" was not found.`);
    }

    // 2. Verify identity uniqueness
    const existing = await this.getIdentity(data.provider, data.providerUserId);
    if (existing) {
      throw new EasyAuthError(
        "IDENTITY_ALREADY_LINKED",
        `Identity for provider "${data.provider}" with ID "${data.providerUserId}" is already linked.`
      );
    }

    const id = data.id || `idn_${randomUUID().replace(/-/g, "").slice(0, 16)}`;
    const now = new Date();
    const createdAt = (data.createdAt || now).toISOString();
    const updatedAt = (data.updatedAt || now).toISOString();
    const profileStr = data.profile ? JSON.stringify(data.profile) : null;

    try {
      const stmt = this.db.prepare(`
        INSERT INTO easy_auth_identities (id, user_id, provider, provider_user_id, profile, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `);
      stmt.run(id, data.userId, data.provider, data.providerUserId, profileStr, createdAt, updatedAt);
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
    const stmt = this.db.prepare(`
      SELECT id, user_id, provider, provider_user_id, profile, created_at, updated_at
      FROM easy_auth_identities
      WHERE provider = ? AND provider_user_id = ?
    `);
    const row = stmt.get(provider, providerUserId) as IdentityRow | undefined;
    return row ? this.mapIdentityRow(row) : null;
  }

  async listIdentitiesByUserId(userId: string): Promise<Identity[]> {
    const stmt = this.db.prepare(`
      SELECT id, user_id, provider, provider_user_id, profile, created_at, updated_at
      FROM easy_auth_identities
      WHERE user_id = ?
      ORDER BY created_at ASC
    `);
    const rows = stmt.all(userId) as IdentityRow[];
    return rows.map((r) => this.mapIdentityRow(r));
  }

  async deleteIdentity(
    userId: string,
    provider: string,
    providerUserId: string,
    options?: { enforceMinimumCount?: boolean }
  ): Promise<boolean> {
    if (options?.enforceMinimumCount) {
      const stmt = this.db.prepare(`
        DELETE FROM easy_auth_identities
        WHERE user_id = ? AND provider = ? AND provider_user_id = ?
          AND (SELECT COUNT(*) FROM easy_auth_identities WHERE user_id = ?) > 1
      `);
      const res = stmt.run(userId, provider, providerUserId, userId);
      return Number(res.changes) > 0;
    }

    const stmt = this.db.prepare(`
      DELETE FROM easy_auth_identities
      WHERE user_id = ? AND provider = ? AND provider_user_id = ?
    `);
    const res = stmt.run(userId, provider, providerUserId);
    return Number(res.changes) > 0;
  }

  /**
   * Clears all tables (mainly used for test isolation).
   */
  clear(): void {
    this.db.exec(`
      DELETE FROM easy_auth_identities;
      DELETE FROM easy_auth_users;
    `);
  }

  /**
   * Closes database connection if managed internally.
   */
  close(): void {
    if (this.isManaged) {
      this.db.close();
    }
  }
}
