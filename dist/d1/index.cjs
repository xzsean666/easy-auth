'use strict';

// src/core/errors.ts
var ERROR_STATUS_MAP = {
  PROVIDER_NOT_FOUND: 400,
  INVALID_CREDENTIALS: 401,
  TOKEN_INVALID: 401,
  TOKEN_EXPIRED: 401,
  UNAUTHORIZED: 401,
  USER_NOT_FOUND: 404,
  IDENTITY_ALREADY_LINKED: 409,
  CANNOT_UNLINK_LAST_IDENTITY: 400,
  RATE_LIMIT_EXCEEDED: 429,
  NETWORK_ERROR: 502,
  STORAGE_ERROR: 500,
  CONFIG_ERROR: 500
};
var EasyAuthError = class extends Error {
  code;
  statusCode;
  details;
  constructor(code, message, details) {
    super(message || code);
    this.name = "EasyAuthError";
    this.code = code;
    this.statusCode = ERROR_STATUS_MAP[code] ?? 500;
    this.details = details;
    Object.setPrototypeOf(this, new.target.prototype);
  }
};

// src/d1/sessions.ts
var D1SessionManager = class {
  currentBookmark = null;
  constructor(initialBookmark) {
    if (initialBookmark) {
      this.currentBookmark = initialBookmark;
    }
  }
  /**
   * Sets or advances the session bookmark.
   */
  setBookmark(bookmark) {
    if (bookmark) {
      this.currentBookmark = bookmark;
    }
  }
  /**
   * Retrieves the active bookmark.
   */
  getBookmark() {
    return this.currentBookmark;
  }
  /**
   * Clears the active bookmark.
   */
  clearBookmark() {
    this.currentBookmark = null;
  }
  /**
   * Wraps a D1Database instance with the current or explicitly provided session bookmark.
   */
  wrapDatabase(db, bookmarkOverride) {
    const bookmark = bookmarkOverride !== void 0 ? bookmarkOverride : this.currentBookmark;
    if (bookmark && typeof db?.withSession === "function") {
      return db.withSession(bookmark);
    }
    return db;
  }
};

// src/d1/d1-storage.ts
function generateId(prefix) {
  if (typeof globalThis.crypto?.randomUUID === "function") {
    return `${prefix}_${globalThis.crypto.randomUUID().replace(/-/g, "").slice(0, 16)}`;
  }
  return `${prefix}_${Math.random().toString(36).substring(2, 18)}`;
}
var D1StorageAdapter = class {
  rawDb;
  sessionManager;
  usersTable;
  identitiesTable;
  autoInitTables;
  isInitialized = false;
  initPromise = null;
  constructor(options) {
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
  getDb() {
    return this.sessionManager.wrapDatabase(this.rawDb);
  }
  /**
   * Retrieves the current D1 session bookmark.
   */
  getBookmark() {
    return this.sessionManager.getBookmark();
  }
  /**
   * Manually sets or advances the active D1 session bookmark.
   */
  setBookmark(bookmark) {
    this.sessionManager.setBookmark(bookmark);
  }
  /**
   * Clears the current bookmark.
   */
  clearBookmark() {
    this.sessionManager.clearBookmark();
  }
  /**
   * Ensures database schema and indexes are created via a single D1 batch RPC
   */
  async ensureInit() {
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
            `)
          ];
          const results = await this.rawDb.batch(stmts);
          this.captureBookmarkFromResult(results);
          this.isInitialized = true;
        } catch (err) {
          throw new EasyAuthError("STORAGE_ERROR", `Failed to initialize D1 database schema: ${err.message}`, err);
        }
      })();
    }
    await this.initPromise;
  }
  captureBookmarkFromResult(result) {
    if (!result) return;
    if (Array.isArray(result) && result.length > 0) {
      const last = result[result.length - 1];
      const bm2 = last?.meta?.bookmark || last?.bookmark;
      if (bm2) this.sessionManager.setBookmark(bm2);
      return;
    }
    const bm = result?.meta?.bookmark || result?.bookmark;
    if (bm) this.sessionManager.setBookmark(bm);
  }
  mapUserRow(row) {
    let metadata = {};
    try {
      metadata = JSON.parse(row.metadata);
    } catch {
      metadata = {};
    }
    return {
      id: row.id,
      metadata,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at)
    };
  }
  mapIdentityRow(row) {
    let profile;
    if (row.profile) {
      try {
        profile = JSON.parse(row.profile);
      } catch {
        profile = void 0;
      }
    }
    return {
      id: row.id,
      userId: row.user_id,
      provider: row.provider,
      providerUserId: row.provider_user_id,
      profile,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at)
    };
  }
  async createUser(data) {
    await this.ensureInit();
    const id = data.id || generateId("usr");
    const now = /* @__PURE__ */ new Date();
    const createdAt = (data.createdAt || now).toISOString();
    const updatedAt = (data.updatedAt || now).toISOString();
    const metadataStr = JSON.stringify(data.metadata || {});
    try {
      const stmt = this.getDb().prepare(`
          INSERT INTO ${this.usersTable} (id, metadata, created_at, updated_at)
          VALUES (?, ?, ?, ?)
        `).bind(id, metadataStr, createdAt, updatedAt);
      const res = await stmt.run();
      this.captureBookmarkFromResult(res);
    } catch (err) {
      throw new EasyAuthError("STORAGE_ERROR", `Failed to create user with ID "${id}": ${err.message}`, err);
    }
    return {
      id,
      metadata: data.metadata ? { ...data.metadata } : {},
      createdAt: new Date(createdAt),
      updatedAt: new Date(updatedAt)
    };
  }
  async getUserById(id) {
    await this.ensureInit();
    try {
      const stmt = this.getDb().prepare(`
          SELECT id, metadata, created_at, updated_at
          FROM ${this.usersTable}
          WHERE id = ?
        `).bind(id);
      const row = await stmt.first();
      return row ? this.mapUserRow(row) : null;
    } catch (err) {
      throw new EasyAuthError("STORAGE_ERROR", `Failed to fetch user with ID "${id}": ${err.message}`, err);
    }
  }
  async updateUserMetadata(id, metadata) {
    await this.ensureInit();
    const existing = await this.getUserById(id);
    if (!existing) {
      throw new EasyAuthError("USER_NOT_FOUND", `User with ID "${id}" was not found.`);
    }
    const merged = { ...existing.metadata, ...metadata || {} };
    const updatedAt = (/* @__PURE__ */ new Date()).toISOString();
    const metadataStr = JSON.stringify(merged);
    try {
      const stmt = this.getDb().prepare(`
          UPDATE ${this.usersTable}
          SET metadata = ?, updated_at = ?
          WHERE id = ?
        `).bind(metadataStr, updatedAt, id);
      const res = await stmt.run();
      this.captureBookmarkFromResult(res);
    } catch (err) {
      throw new EasyAuthError("STORAGE_ERROR", `Failed to update metadata for user "${id}": ${err.message}`, err);
    }
    return {
      ...existing,
      metadata: merged,
      updatedAt: new Date(updatedAt)
    };
  }
  async createIdentity(data) {
    await this.ensureInit();
    const user = await this.getUserById(data.userId);
    if (!user) {
      throw new EasyAuthError("USER_NOT_FOUND", `User with ID "${data.userId}" was not found.`);
    }
    const existing = await this.getIdentity(data.provider, data.providerUserId);
    if (existing) {
      throw new EasyAuthError(
        "IDENTITY_ALREADY_LINKED",
        `Identity for provider "${data.provider}" with ID "${data.providerUserId}" is already linked.`
      );
    }
    const id = data.id || generateId("idn");
    const now = /* @__PURE__ */ new Date();
    const createdAt = (data.createdAt || now).toISOString();
    const updatedAt = (data.updatedAt || now).toISOString();
    const profileStr = data.profile ? JSON.stringify(data.profile) : null;
    try {
      const stmt = this.getDb().prepare(`
          INSERT INTO ${this.identitiesTable} (id, user_id, provider, provider_user_id, profile, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `).bind(id, data.userId, data.provider, data.providerUserId, profileStr, createdAt, updatedAt);
      const res = await stmt.run();
      this.captureBookmarkFromResult(res);
    } catch (err) {
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
      profile: data.profile ? { ...data.profile } : void 0,
      createdAt: new Date(createdAt),
      updatedAt: new Date(updatedAt)
    };
  }
  async getIdentity(provider, providerUserId) {
    await this.ensureInit();
    try {
      const stmt = this.getDb().prepare(`
          SELECT id, user_id, provider, provider_user_id, profile, created_at, updated_at
          FROM ${this.identitiesTable}
          WHERE provider = ? AND provider_user_id = ?
        `).bind(provider, providerUserId);
      const row = await stmt.first();
      return row ? this.mapIdentityRow(row) : null;
    } catch (err) {
      throw new EasyAuthError("STORAGE_ERROR", `Failed to get identity for "${provider}:${providerUserId}": ${err.message}`, err);
    }
  }
  async listIdentitiesByUserId(userId) {
    await this.ensureInit();
    try {
      const stmt = this.getDb().prepare(`
          SELECT id, user_id, provider, provider_user_id, profile, created_at, updated_at
          FROM ${this.identitiesTable}
          WHERE user_id = ?
          ORDER BY created_at ASC
        `).bind(userId);
      const res = await stmt.all();
      const rows = res.results || [];
      return rows.map((r) => this.mapIdentityRow(r));
    } catch (err) {
      throw new EasyAuthError("STORAGE_ERROR", `Failed to list identities for user "${userId}": ${err.message}`, err);
    }
  }
  async deleteIdentity(userId, provider, providerUserId, options) {
    await this.ensureInit();
    try {
      let stmt;
      if (options?.enforceMinimumCount) {
        stmt = this.getDb().prepare(`
            DELETE FROM ${this.identitiesTable}
            WHERE user_id = ? AND provider = ? AND provider_user_id = ?
              AND (SELECT COUNT(*) FROM ${this.identitiesTable} WHERE user_id = ?) > 1
          `).bind(userId, provider, providerUserId, userId);
      } else {
        stmt = this.getDb().prepare(`
            DELETE FROM ${this.identitiesTable}
            WHERE user_id = ? AND provider = ? AND provider_user_id = ?
          `).bind(userId, provider, providerUserId);
      }
      const res = await stmt.run();
      this.captureBookmarkFromResult(res);
      const changes = res?.meta?.changes ?? res?.changes;
      return typeof changes === "number" ? changes > 0 : res.success === true;
    } catch (err) {
      throw new EasyAuthError(
        "STORAGE_ERROR",
        `Failed to delete identity "${provider}:${providerUserId}": ${err.message}`,
        err
      );
    }
  }
};

exports.D1SessionManager = D1SessionManager;
exports.D1StorageAdapter = D1StorageAdapter;
//# sourceMappingURL=index.cjs.map
//# sourceMappingURL=index.cjs.map