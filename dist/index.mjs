import { randomUUID, randomBytes, createHmac, timingSafeEqual } from 'crypto';
import { dirname } from 'path';
import { mkdirSync } from 'fs';
import { createRequire } from 'module';
import { createRemoteJWKSet, jwtVerify, SignJWT, errors } from 'jose';
import { isAddress, verifyMessage } from 'viem';

var __require = /* @__PURE__ */ ((x) => typeof require !== "undefined" ? require : typeof Proxy !== "undefined" ? new Proxy(x, {
  get: (a, b) => (typeof require !== "undefined" ? require : a)[b]
}) : x)(function(x) {
  if (typeof require !== "undefined") return require.apply(this, arguments);
  throw Error('Dynamic require of "' + x + '" is not supported');
});

// src/core/errors.ts
var ERROR_STATUS_MAP = {
  PROVIDER_NOT_FOUND: 400,
  INVALID_CREDENTIALS: 401,
  TOKEN_INVALID: 401,
  TOKEN_EXPIRED: 401,
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

// src/storage/memory.ts
var MemoryStorageAdapter = class {
  users = /* @__PURE__ */ new Map();
  identities = /* @__PURE__ */ new Map();
  userIdentities = /* @__PURE__ */ new Map();
  maxEntries;
  constructor(options) {
    this.maxEntries = options?.maxEntries;
  }
  getIdentityKey(provider, providerUserId) {
    return `${provider}:${providerUserId}`;
  }
  cloneUser(user) {
    return {
      ...user,
      metadata: { ...user.metadata },
      createdAt: new Date(user.createdAt),
      updatedAt: new Date(user.updatedAt)
    };
  }
  cloneIdentity(identity) {
    return {
      ...identity,
      profile: identity.profile ? { ...identity.profile } : void 0,
      createdAt: new Date(identity.createdAt),
      updatedAt: new Date(identity.updatedAt)
    };
  }
  async createUser(data) {
    if (this.maxEntries && this.users.size >= this.maxEntries) {
      const oldestUserId = this.users.keys().next().value;
      if (oldestUserId) {
        const keys = this.userIdentities.get(oldestUserId);
        if (keys) {
          for (const key of keys) {
            this.identities.delete(key);
          }
          this.userIdentities.delete(oldestUserId);
        }
        this.users.delete(oldestUserId);
      }
    }
    const id = data.id || `usr_${randomUUID().replace(/-/g, "").slice(0, 16)}`;
    const now = /* @__PURE__ */ new Date();
    const user = {
      id,
      metadata: data.metadata ? { ...data.metadata } : {},
      createdAt: data.createdAt || now,
      updatedAt: data.updatedAt || now
    };
    this.users.set(id, user);
    this.userIdentities.set(id, /* @__PURE__ */ new Set());
    return this.cloneUser(user);
  }
  async getUserById(id) {
    const user = this.users.get(id);
    return user ? this.cloneUser(user) : null;
  }
  async updateUserMetadata(id, metadata) {
    const user = this.users.get(id);
    if (!user) {
      throw new EasyAuthError("USER_NOT_FOUND", `User with ID "${id}" was not found.`);
    }
    user.metadata = { ...user.metadata, ...metadata };
    user.updatedAt = /* @__PURE__ */ new Date();
    return this.cloneUser(user);
  }
  async createIdentity(data) {
    const key = this.getIdentityKey(data.provider, data.providerUserId);
    if (this.identities.has(key)) {
      throw new EasyAuthError(
        "IDENTITY_ALREADY_LINKED",
        `Identity for provider "${data.provider}" with ID "${data.providerUserId}" is already linked.`
      );
    }
    if (!this.users.has(data.userId)) {
      throw new EasyAuthError("USER_NOT_FOUND", `User with ID "${data.userId}" was not found.`);
    }
    const id = data.id || `idn_${randomUUID().replace(/-/g, "").slice(0, 16)}`;
    const now = /* @__PURE__ */ new Date();
    const identity = {
      id,
      userId: data.userId,
      provider: data.provider,
      providerUserId: data.providerUserId,
      profile: data.profile ? { ...data.profile } : void 0,
      createdAt: data.createdAt || now,
      updatedAt: data.updatedAt || now
    };
    this.identities.set(key, identity);
    let identitySet = this.userIdentities.get(data.userId);
    if (!identitySet) {
      identitySet = /* @__PURE__ */ new Set();
      this.userIdentities.set(data.userId, identitySet);
    }
    identitySet.add(key);
    return this.cloneIdentity(identity);
  }
  async getIdentity(provider, providerUserId) {
    const key = this.getIdentityKey(provider, providerUserId);
    const identity = this.identities.get(key);
    return identity ? this.cloneIdentity(identity) : null;
  }
  async listIdentitiesByUserId(userId) {
    const keys = this.userIdentities.get(userId);
    if (!keys || keys.size === 0) {
      return [];
    }
    const result = [];
    for (const key of keys) {
      const identity = this.identities.get(key);
      if (identity) {
        result.push(this.cloneIdentity(identity));
      }
    }
    return result;
  }
  async deleteIdentity(userId, provider, providerUserId, options) {
    const key = this.getIdentityKey(provider, providerUserId);
    const identity = this.identities.get(key);
    if (!identity || identity.userId !== userId) {
      return false;
    }
    const set = this.userIdentities.get(userId);
    if (options?.enforceMinimumCount && (!set || set.size <= 1)) {
      return false;
    }
    this.identities.delete(key);
    set?.delete(key);
    return true;
  }
  /**
   * Resets all in-memory data (useful for test isolation)
   */
  clear() {
    this.users.clear();
    this.identities.clear();
    this.userIdentities.clear();
  }
};
function getDatabaseSyncClass() {
  try {
    const req = typeof __require !== "undefined" ? __require : createRequire(import.meta.url);
    const mod = req("node:sqlite");
    return mod.DatabaseSync;
  } catch (err) {
    throw new EasyAuthError(
      "STORAGE_ERROR",
      `Native SQLite (node:sqlite) is not available: ${err.message}`
    );
  }
}
var SqliteStorageAdapter = class {
  db;
  isManaged;
  constructor(options) {
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
  initTables() {
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
    const id = data.id || `usr_${randomUUID().replace(/-/g, "").slice(0, 16)}`;
    const now = /* @__PURE__ */ new Date();
    const createdAt = (data.createdAt || now).toISOString();
    const updatedAt = (data.updatedAt || now).toISOString();
    const metadataStr = JSON.stringify(data.metadata || {});
    try {
      const stmt = this.db.prepare(`
        INSERT INTO easy_auth_users (id, metadata, created_at, updated_at)
        VALUES (?, ?, ?, ?)
      `);
      stmt.run(id, metadataStr, createdAt, updatedAt);
    } catch (err) {
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
      updatedAt: new Date(updatedAt)
    };
  }
  async getUserById(id) {
    const stmt = this.db.prepare(`
      SELECT id, metadata, created_at, updated_at
      FROM easy_auth_users
      WHERE id = ?
    `);
    const row = stmt.get(id);
    return row ? this.mapUserRow(row) : null;
  }
  async updateUserMetadata(id, metadata) {
    const updatedAt = (/* @__PURE__ */ new Date()).toISOString();
    const patchJson = JSON.stringify(metadata || {});
    const stmt = this.db.prepare(`
      UPDATE easy_auth_users
      SET metadata = json_patch(metadata, ?), updated_at = ?
      WHERE id = ?
      RETURNING id, metadata, created_at, updated_at
    `);
    const row = stmt.get(patchJson, updatedAt, id);
    if (!row) {
      throw new EasyAuthError("USER_NOT_FOUND", `User with ID "${id}" was not found.`);
    }
    return this.mapUserRow(row);
  }
  async createIdentity(data) {
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
    const id = data.id || `idn_${randomUUID().replace(/-/g, "").slice(0, 16)}`;
    const now = /* @__PURE__ */ new Date();
    const createdAt = (data.createdAt || now).toISOString();
    const updatedAt = (data.updatedAt || now).toISOString();
    const profileStr = data.profile ? JSON.stringify(data.profile) : null;
    try {
      const stmt = this.db.prepare(`
        INSERT INTO easy_auth_identities (id, user_id, provider, provider_user_id, profile, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `);
      stmt.run(id, data.userId, data.provider, data.providerUserId, profileStr, createdAt, updatedAt);
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
    const stmt = this.db.prepare(`
      SELECT id, user_id, provider, provider_user_id, profile, created_at, updated_at
      FROM easy_auth_identities
      WHERE provider = ? AND provider_user_id = ?
    `);
    const row = stmt.get(provider, providerUserId);
    return row ? this.mapIdentityRow(row) : null;
  }
  async listIdentitiesByUserId(userId) {
    const stmt = this.db.prepare(`
      SELECT id, user_id, provider, provider_user_id, profile, created_at, updated_at
      FROM easy_auth_identities
      WHERE user_id = ?
      ORDER BY created_at ASC
    `);
    const rows = stmt.all(userId);
    return rows.map((r) => this.mapIdentityRow(r));
  }
  async deleteIdentity(userId, provider, providerUserId, options) {
    if (options?.enforceMinimumCount) {
      const stmt2 = this.db.prepare(`
        DELETE FROM easy_auth_identities
        WHERE user_id = ? AND provider = ? AND provider_user_id = ?
          AND (SELECT COUNT(*) FROM easy_auth_identities WHERE user_id = ?) > 1
      `);
      const res2 = stmt2.run(userId, provider, providerUserId, userId);
      return Number(res2.changes) > 0;
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
  clear() {
    this.db.exec(`
      DELETE FROM easy_auth_identities;
      DELETE FROM easy_auth_users;
    `);
  }
  /**
   * Closes database connection if managed internally.
   */
  close() {
    if (this.isManaged) {
      this.db.close();
    }
  }
};
var PostgresStorageAdapter = class {
  runner;
  isInitialized = false;
  initPromise = null;
  autoInitTables;
  constructor(options) {
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
  async ensureInit() {
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
  mapUserRow(row) {
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
      updatedAt: new Date(row.updated_at)
    };
  }
  mapIdentityRow(row) {
    let profile = row.profile;
    if (typeof profile === "string") {
      try {
        profile = JSON.parse(profile);
      } catch {
        profile = void 0;
      }
    }
    return {
      id: row.id,
      userId: row.user_id,
      provider: row.provider,
      providerUserId: row.provider_user_id,
      profile: profile || void 0,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at)
    };
  }
  async createUser(data) {
    await this.ensureInit();
    const id = data.id || `usr_${randomUUID().replace(/-/g, "").slice(0, 16)}`;
    const now = /* @__PURE__ */ new Date();
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
    } catch (err) {
      throw new EasyAuthError(
        "STORAGE_ERROR",
        `Failed to create user with ID "${id}": ${err.message}`,
        err
      );
    }
  }
  async getUserById(id) {
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
  async updateUserMetadata(id, metadata) {
    await this.ensureInit();
    const updatedAt = /* @__PURE__ */ new Date();
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
    const id = data.id || `idn_${randomUUID().replace(/-/g, "").slice(0, 16)}`;
    const now = /* @__PURE__ */ new Date();
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
    } catch (err) {
      if (err.code === "23505" || err.message && err.message.includes("unique")) {
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
  async getIdentity(provider, providerUserId) {
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
  async listIdentitiesByUserId(userId) {
    await this.ensureInit();
    const res = await this.runner.query(
      `SELECT id, user_id, provider, provider_user_id, profile, created_at, updated_at
       FROM easy_auth_identities
       WHERE user_id = $1
       ORDER BY created_at ASC`,
      [userId]
    );
    return res.rows.map((r) => this.mapIdentityRow(r));
  }
  async deleteIdentity(userId, provider, providerUserId, options) {
    await this.ensureInit();
    const sql = options?.enforceMinimumCount ? `DELETE FROM easy_auth_identities
         WHERE user_id = $1 AND provider = $2 AND provider_user_id = $3
           AND (SELECT COUNT(*) FROM easy_auth_identities WHERE user_id = $1) > 1` : `DELETE FROM easy_auth_identities
         WHERE user_id = $1 AND provider = $2 AND provider_user_id = $3`;
    const res = await this.runner.query(sql, [userId, provider, providerUserId]);
    return typeof res.rowCount === "number" ? res.rowCount > 0 : res.rows && res.rows.length > 0;
  }
};
var JwtService = class {
  config;
  key;
  constructor(config) {
    if (!config || !config.secret || typeof config.secret !== "string" || config.secret.trim().length === 0) {
      throw new EasyAuthError("CONFIG_ERROR", "JWT secret is required and must be a non-empty string.");
    }
    if (config.secret.length < 32) {
      throw new EasyAuthError(
        "CONFIG_ERROR",
        `JWT secret must be at least 32 characters (256 bits) for cryptographic security. Provided: ${config.secret.length} characters.`
      );
    }
    this.config = {
      issuer: "easy-auth",
      expiresIn: "7d",
      algorithm: "HS256",
      ...config
    };
    this.key = new TextEncoder().encode(this.config.secret);
  }
  /**
   * Signs a unified JWT token for the given User
   */
  async sign(user, options) {
    const extra = options?.extraPayload ? { ...options.extraPayload } : {};
    const identities = options?.identities ? { identities: [...options.identities] } : {};
    let safeMetadata = {};
    if (user.metadata) {
      if (this.config.metadataKeys && Array.isArray(this.config.metadataKeys)) {
        for (const key of this.config.metadataKeys) {
          if (key in user.metadata) {
            safeMetadata[key] = user.metadata[key];
          }
        }
      } else {
        const copy = { ...user.metadata };
        delete copy.password;
        delete copy.passwordHash;
        delete copy.secret;
        delete copy.totpSecret;
        safeMetadata = copy;
      }
    }
    const jwt = new SignJWT({
      metadata: safeMetadata,
      ...identities,
      ...extra
    }).setProtectedHeader({ alg: this.config.algorithm || "HS256" }).setSubject(user.id).setIssuer(this.config.issuer || "easy-auth").setIssuedAt();
    if (this.config.audience) {
      jwt.setAudience(this.config.audience);
    }
    const exp = options?.expiresIn ?? this.config.expiresIn ?? "7d";
    jwt.setExpirationTime(exp);
    return await jwt.sign(this.key);
  }
  /**
   * Verifies and decodes a JWT token.
   * Throws TOKEN_EXPIRED if the token is past its expiration time.
   * Throws TOKEN_INVALID if the signature is invalid, forged, or structurally malformed.
   */
  async verify(token) {
    if (!token || typeof token !== "string" || token.trim().length === 0) {
      throw new EasyAuthError("TOKEN_INVALID", "Token string is empty or invalid.");
    }
    try {
      const { payload } = await jwtVerify(token, this.key, {
        issuer: this.config.issuer,
        audience: this.config.audience,
        algorithms: [this.config.algorithm || "HS256"]
      });
      if (!payload.sub || typeof payload.sub !== "string") {
        throw new EasyAuthError("TOKEN_INVALID", "JWT claim validation failed: missing subject (sub).");
      }
      return payload;
    } catch (err) {
      if (err instanceof EasyAuthError) {
        throw err;
      }
      if (err instanceof errors.JWTExpired || err?.code === "ERR_JWT_EXPIRED") {
        throw new EasyAuthError("TOKEN_EXPIRED", "The provided token has expired.", err);
      }
      throw new EasyAuthError("TOKEN_INVALID", err?.message || "Invalid or tampered token.", err);
    }
  }
};

// src/providers/registry.ts
var ProviderRegistry = class {
  providers = /* @__PURE__ */ new Map();
  /**
   * Registers a provider instance
   */
  register(provider) {
    if (!provider || !provider.name || typeof provider.name !== "string" || provider.name.trim().length === 0) {
      throw new EasyAuthError("CONFIG_ERROR", "Provider must have a valid non-empty 'name' property.");
    }
    if (typeof provider.verifyAndExtract !== "function") {
      throw new EasyAuthError("CONFIG_ERROR", `Provider "${provider.name}" must implement "verifyAndExtract" method.`);
    }
    this.providers.set(provider.name.toLowerCase(), provider);
  }
  /**
   * Registers a functional provider with a single verification function
   */
  registerFunction(name, verifyFn) {
    if (!name || typeof name !== "string" || name.trim().length === 0) {
      throw new EasyAuthError("CONFIG_ERROR", "Provider name must be a non-empty string.");
    }
    if (typeof verifyFn !== "function") {
      throw new EasyAuthError("CONFIG_ERROR", `Verification function for provider "${name}" must be a function.`);
    }
    this.register({
      name: name.toLowerCase(),
      verifyAndExtract: verifyFn
    });
  }
  /**
   * Retrieves a registered provider by name. Throws PROVIDER_NOT_FOUND if not found.
   */
  get(name) {
    if (!name || typeof name !== "string") {
      throw new EasyAuthError("PROVIDER_NOT_FOUND", "Provider name must be specified.");
    }
    const provider = this.providers.get(name.toLowerCase());
    if (!provider) {
      throw new EasyAuthError(
        "PROVIDER_NOT_FOUND",
        `Authentication provider "${name}" is not registered. Registered providers: [${this.list().join(", ")}]`
      );
    }
    return provider;
  }
  /**
   * Checks if a provider is registered
   */
  has(name) {
    if (!name || typeof name !== "string") return false;
    return this.providers.has(name.toLowerCase());
  }
  /**
   * Returns a list of all registered provider names
   */
  list() {
    return Array.from(this.providers.keys());
  }
};

// src/core/auth-engine.ts
var AuthEngine = class {
  storage;
  jwtService;
  registry;
  constructor(dependencies) {
    if (!dependencies.storage) throw new EasyAuthError("CONFIG_ERROR", "StorageAdapter is required for AuthEngine.");
    if (!dependencies.jwtService) throw new EasyAuthError("CONFIG_ERROR", "JwtService is required for AuthEngine.");
    if (!dependencies.registry) throw new EasyAuthError("CONFIG_ERROR", "ProviderRegistry is required for AuthEngine.");
    this.storage = dependencies.storage;
    this.jwtService = dependencies.jwtService;
    this.registry = dependencies.registry;
  }
  /**
   * Unified authentication entrypoint.
   * If the identity is seen for the first time, automatically creates a new User and links the Identity.
   * If the identity is already known, logs in the existing User.
   */
  async authenticate(providerName, credentials) {
    const provider = this.registry.get(providerName);
    const extracted = await provider.verifyAndExtract(credentials);
    const providerKey = provider.name.toLowerCase();
    let identity = await this.storage.getIdentity(providerKey, extracted.providerUserId);
    let user = null;
    let isNewUser = false;
    if (identity) {
      user = await this.storage.getUserById(identity.userId);
      if (!user) {
        user = await this.storage.createUser({
          id: identity.userId,
          metadata: extracted.profile ? { ...extracted.profile } : {}
        });
      }
    } else {
      isNewUser = true;
      user = await this.storage.createUser({
        metadata: extracted.profile ? { ...extracted.profile } : {}
      });
      try {
        identity = await this.storage.createIdentity({
          userId: user.id,
          provider: providerKey,
          providerUserId: extracted.providerUserId,
          profile: extracted.profile
        });
      } catch (err) {
        if (err instanceof EasyAuthError && err.code === "IDENTITY_ALREADY_LINKED") {
          const raceIdentity = await this.storage.getIdentity(providerKey, extracted.providerUserId);
          if (raceIdentity) {
            identity = raceIdentity;
            user = await this.storage.getUserById(raceIdentity.userId);
            isNewUser = false;
          } else {
            throw err;
          }
        } else {
          throw err;
        }
      }
    }
    if (!user) {
      throw new EasyAuthError("STORAGE_ERROR", "Failed to resolve or create user during authentication.");
    }
    const providerNames = isNewUser ? [providerKey] : Array.from(new Set((await this.storage.listIdentitiesByUserId(user.id)).map((i) => i.provider)));
    user = await this.storage.updateUserMetadata(user.id, {
      lastLoginType: providerKey,
      lastLoginAt: (/* @__PURE__ */ new Date()).toISOString()
    });
    const token = await this.jwtService.sign(user, {
      identities: providerNames
    });
    return {
      user,
      identity,
      token,
      isNewUser,
      loginType: providerKey
    };
  }
  /**
   * Links a new external identity to an existing user account.
   * Enforces exclusive binding: if the identity is already bound to another user, throws IDENTITY_ALREADY_LINKED.
   * Idempotent: if already linked to the same user, returns the existing identity.
   */
  async linkIdentity(userId, providerName, credentials) {
    const user = await this.storage.getUserById(userId);
    if (!user) {
      throw new EasyAuthError("USER_NOT_FOUND", `User "${userId}" was not found.`);
    }
    const provider = this.registry.get(providerName);
    const extracted = await provider.verifyAndExtract(credentials);
    const providerKey = provider.name.toLowerCase();
    const existing = await this.storage.getIdentity(providerKey, extracted.providerUserId);
    if (existing) {
      if (existing.userId === userId) {
        return existing;
      }
      throw new EasyAuthError(
        "IDENTITY_ALREADY_LINKED",
        `This ${providerName} account (${extracted.providerUserId}) is already linked to another user.`
      );
    }
    const identity = await this.storage.createIdentity({
      userId,
      provider: providerKey,
      providerUserId: extracted.providerUserId,
      profile: extracted.profile
    });
    if (extracted.profile) {
      const mergedMetadata = { ...extracted.profile, ...user.metadata };
      await this.storage.updateUserMetadata(userId, mergedMetadata);
    }
    return identity;
  }
  /**
   * Unlinks an external identity from an existing user account.
   * Enforces Anti-Lockout safety: rejects unlinking if it is the user's only remaining identity.
   */
  async unlinkIdentity(userId, providerName, providerUserId) {
    const user = await this.storage.getUserById(userId);
    if (!user) {
      throw new EasyAuthError("USER_NOT_FOUND", `User "${userId}" was not found.`);
    }
    const identities = await this.storage.listIdentitiesByUserId(userId);
    if (identities.length <= 1) {
      throw new EasyAuthError(
        "CANNOT_UNLINK_LAST_IDENTITY",
        "Cannot unlink the only remaining login method of this user."
      );
    }
    const providerKey = providerName.toLowerCase();
    const target = identities.find(
      (i) => i.provider.toLowerCase() === providerKey && (i.providerUserId.toLowerCase() === providerUserId.toLowerCase() || i.providerUserId === providerUserId)
    );
    if (!target) {
      throw new EasyAuthError(
        "INVALID_CREDENTIALS",
        `Identity "${providerName}:${providerUserId}" does not belong to user "${userId}".`
      );
    }
    const deleted = await this.storage.deleteIdentity(userId, target.provider, target.providerUserId, {
      enforceMinimumCount: true
    });
    if (!deleted) {
      const remaining = await this.storage.listIdentitiesByUserId(userId);
      if (remaining.length <= 1) {
        throw new EasyAuthError(
          "CANNOT_UNLINK_LAST_IDENTITY",
          "Cannot unlink the only remaining login method of this user."
        );
      }
      throw new EasyAuthError("STORAGE_ERROR", "Failed to delete identity from storage.");
    }
  }
  /**
   * Returns all identities linked to a specific user
   */
  async listIdentities(userId) {
    const user = await this.storage.getUserById(userId);
    if (!user) {
      throw new EasyAuthError("USER_NOT_FOUND", `User "${userId}" was not found.`);
    }
    return this.storage.listIdentitiesByUserId(userId);
  }
  /**
   * Updates user profile / metadata
   */
  async updateUserMetadata(userId, patch) {
    return this.storage.updateUserMetadata(userId, patch);
  }
  /**
   * Alias for updateUserMetadata
   */
  async updateMetadata(userId, patch) {
    return this.updateUserMetadata(userId, patch);
  }
  /**
   * Alias for verify
   */
  async verifyToken(token, options) {
    return this.verify(token, options);
  }
  /**
   * Verifies an Easy Auth JWT token and returns standard context including userId, metadata, and user entity.
   */
  async verify(token, options) {
    const payload = await this.jwtService.verify(token);
    const userId = payload.sub;
    if (options?.fetchUser !== false) {
      const user = await this.storage.getUserById(userId);
      if (!user) {
        throw new EasyAuthError("USER_NOT_FOUND", `User "${userId}" referenced in token was not found in storage.`);
      }
      return {
        userId,
        metadata: user.metadata,
        user,
        payload
      };
    }
    const fallbackUser = {
      id: userId,
      metadata: payload.metadata || {},
      createdAt: new Date((payload.iat || 0) * 1e3),
      updatedAt: new Date((payload.iat || 0) * 1e3)
    };
    return {
      userId,
      metadata: fallbackUser.metadata,
      user: fallbackUser,
      payload
    };
  }
};
var Web3Provider = class {
  name = "web3";
  type = "wallet";
  domain;
  statement;
  strictDomainMatch;
  verifyTimestamps;
  validateNonce;
  client;
  constructor(options) {
    this.domain = options?.domain;
    this.statement = options?.statement;
    this.strictDomainMatch = options?.strictDomainMatch ?? false;
    this.verifyTimestamps = options?.verifyTimestamps ?? true;
    this.validateNonce = options?.validateNonce;
    this.client = options?.client;
  }
  /**
   * Returns true if a nonce validator callback is registered.
   */
  hasNonceValidator() {
    return typeof this.validateNonce === "function";
  }
  /**
   * Attach or replace the nonce validator callback (e.g. from EasyAuth nonce manager).
   */
  setNonceValidator(fn) {
    this.validateNonce = fn;
    return this;
  }
  async verifyAndExtract(credentials) {
    if (!credentials) {
      throw new EasyAuthError("INVALID_CREDENTIALS", "Web3 credentials are required.");
    }
    const { address, signature, message } = credentials;
    if (!address || typeof address !== "string" || !isAddress(address.toLowerCase())) {
      throw new EasyAuthError("INVALID_CREDENTIALS", `Invalid Ethereum address: "${address}".`);
    }
    if (!signature || typeof signature !== "string" || !signature.startsWith("0x")) {
      throw new EasyAuthError("INVALID_CREDENTIALS", "Signature must be a non-empty hex string starting with 0x.");
    }
    if (!message || typeof message !== "string" || message.trim().length === 0) {
      throw new EasyAuthError("INVALID_CREDENTIALS", "Message must be a non-empty string.");
    }
    if (this.domain) {
      if (this.strictDomainMatch) {
        const escaped = this.domain.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        const siweHeader = new RegExp(`^${escaped}(:\\d+)? wants you to sign in with your Ethereum account:`, "m");
        if (!siweHeader.test(message)) {
          throw new EasyAuthError(
            "INVALID_CREDENTIALS",
            `Web3 signature verification failed: message does not match strict EIP-4361 domain header for "${this.domain}".`
          );
        }
      } else {
        const domainPattern = new RegExp(`\\b${this.domain.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i");
        if (!domainPattern.test(message)) {
          throw new EasyAuthError(
            "INVALID_CREDENTIALS",
            `Web3 signature verification failed: message does not match expected domain "${this.domain}".`
          );
        }
      }
    }
    const normalizedAddress = address.toLowerCase();
    const siweHeaderAddressMatch = message.match(
      /wants you to sign in with your Ethereum account:\s*[\r\n]+\s*(0x[a-fA-F0-9]{40})/i
    );
    if (siweHeaderAddressMatch) {
      const headerAddress = siweHeaderAddressMatch[1].toLowerCase();
      if (headerAddress !== normalizedAddress) {
        throw new EasyAuthError(
          "INVALID_CREDENTIALS",
          `Web3 signature verification failed: address declared in SIWE message ("${headerAddress}") does not match credentials address ("${normalizedAddress}").`
        );
      }
    }
    if (this.statement && !message.includes(this.statement)) {
      throw new EasyAuthError(
        "INVALID_CREDENTIALS",
        "Web3 signature verification failed: message does not contain the required statement."
      );
    }
    if (this.verifyTimestamps) {
      const expMatch = message.match(/Expiration Time:\s*([^\n\r]+)/i);
      if (expMatch) {
        const expDate = new Date(expMatch[1].trim());
        if (!isNaN(expDate.getTime()) && Date.now() > expDate.getTime()) {
          throw new EasyAuthError("INVALID_CREDENTIALS", "Web3 signature verification failed: message has expired.");
        }
      }
      const nbfMatch = message.match(/Not Before:\s*([^\n\r]+)/i);
      if (nbfMatch) {
        const nbfDate = new Date(nbfMatch[1].trim());
        if (!isNaN(nbfDate.getTime()) && Date.now() < nbfDate.getTime()) {
          throw new EasyAuthError("INVALID_CREDENTIALS", "Web3 signature verification failed: message is not yet valid (Not Before).");
        }
      }
    }
    if (this.validateNonce) {
      let nonce = credentials.nonce;
      if (!nonce) {
        const nonceMatch = message.match(/Nonce:\s*([a-zA-Z0-9]+)/i);
        if (nonceMatch) nonce = nonceMatch[1];
      }
      if (!nonce) {
        throw new EasyAuthError("INVALID_CREDENTIALS", "Nonce is required for Web3 authentication anti-replay verification.");
      }
      const isNonceValid = await this.validateNonce(normalizedAddress, nonce, message);
      if (!isNonceValid) {
        throw new EasyAuthError(
          "INVALID_CREDENTIALS",
          "Web3 nonce verification failed: nonce is invalid, expired, or already consumed."
        );
      }
    }
    let isValid = false;
    try {
      if (this.client && typeof this.client.verifyMessage === "function") {
        isValid = await this.client.verifyMessage({
          address: normalizedAddress,
          message,
          signature
        });
      } else {
        isValid = await verifyMessage({
          address: normalizedAddress,
          message,
          signature
        });
      }
    } catch (err) {
      throw new EasyAuthError("INVALID_CREDENTIALS", `Web3 signature verification failed: ${err.message}`, err);
    }
    if (!isValid) {
      throw new EasyAuthError("INVALID_CREDENTIALS", "Web3 signature verification failed: signature does not match address.");
    }
    return {
      providerUserId: normalizedAddress,
      profile: {
        address: normalizedAddress
      }
    };
  }
};

// src/easy-auth.ts
var EasyAuth = class {
  storage;
  jwt;
  registry;
  engine;
  constructor(options) {
    if (options.storage) {
      this.storage = options.storage;
    } else if (options.database?.type === "postgres") {
      this.storage = new PostgresStorageAdapter({
        pool: options.database.pool,
        client: options.database.client
      });
    } else if (options.database?.type === "memory") {
      this.storage = new MemoryStorageAdapter();
    } else {
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
      registry: this.registry
    });
  }
  registerProvider(providerOrName, verifyFn) {
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
  getProvider(name) {
    return this.registry.get(name);
  }
  nonces = /* @__PURE__ */ new Map();
  cleanExpiredNonces() {
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
  generateNonce(address, ttlMs = 5 * 60 * 1e3) {
    if (this.nonces.size >= 1e4) {
      this.cleanExpiredNonces();
      if (this.nonces.size >= 1e4) {
        const excess = this.nonces.size - 8e3;
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
      expiresAt: Date.now() + ttlMs
    });
    return nonce;
  }
  /**
   * Validates and consumes a single-use Nonce.
   * Returns true if valid and unconsumed; false otherwise.
   */
  consumeNonce(nonce, address) {
    const record = this.nonces.get(nonce);
    if (!record) return false;
    this.nonces.delete(nonce);
    if (Date.now() > record.expiresAt) return false;
    if (record.address && address && record.address !== address.toLowerCase()) return false;
    return true;
  }
  /**
   * Factory method to create a Web3Provider pre-bound with EasyAuth's single-use nonce validator.
   */
  createWeb3Provider(options) {
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
  async authenticate(providerName, credentials) {
    return this.engine.authenticate(providerName, credentials);
  }
  /**
   * Verifies an Easy Auth JWT token and extracts user ID & metadata.
   * Single-line authentication middleware method.
   */
  async verify(token, options) {
    return this.engine.verify(token, options);
  }
  /**
   * Alias for `verify`
   */
  async verifyToken(token, options) {
    return this.engine.verifyToken(token, options);
  }
  /**
   * Links a new authentication method to an existing user
   */
  async linkIdentity(userId, providerName, credentials) {
    return this.engine.linkIdentity(userId, providerName, credentials);
  }
  /**
   * Unlinks an authentication method with Anti-Lockout safety protection
   */
  async unlinkIdentity(userId, providerName, providerUserId) {
    return this.engine.unlinkIdentity(userId, providerName, providerUserId);
  }
  /**
   * Lists all external identities currently linked to a user
   */
  async listIdentities(userId) {
    return this.engine.listIdentities(userId);
  }
  /**
   * Updates user metadata
   */
  async updateUserMetadata(userId, patch) {
    return this.engine.updateUserMetadata(userId, patch);
  }
  /**
   * Alias for updateUserMetadata
   */
  async updateMetadata(userId, patch) {
    return this.engine.updateMetadata(userId, patch);
  }
};

// src/providers/oauth2-base.ts
var OAuth2BaseProvider = class {
  name;
  type = "oauth2";
  options;
  fetchImpl;
  timeoutMs;
  contentType;
  constructor(options) {
    if (!options.name) throw new EasyAuthError("CONFIG_ERROR", "OAuth2 provider name is required.");
    if (!options.clientId) throw new EasyAuthError("CONFIG_ERROR", "OAuth2 clientId is required.");
    if (!options.clientSecret) throw new EasyAuthError("CONFIG_ERROR", "OAuth2 clientSecret is required.");
    if (!options.tokenEndpoint) throw new EasyAuthError("CONFIG_ERROR", "OAuth2 tokenEndpoint is required.");
    if (!options.userInfoEndpoint) throw new EasyAuthError("CONFIG_ERROR", "OAuth2 userInfoEndpoint is required.");
    if (typeof options.mapProfile !== "function") {
      throw new EasyAuthError("CONFIG_ERROR", "OAuth2 mapProfile function is required.");
    }
    this.name = options.name.toLowerCase();
    this.options = options;
    this.fetchImpl = options.fetchFn || globalThis.fetch;
    this.timeoutMs = options.timeoutMs ?? 1e4;
    this.contentType = options.contentType ?? "form";
  }
  async verifyAndExtract(credentials) {
    if (!credentials || !credentials.code || typeof credentials.code !== "string" || credentials.code.trim().length === 0) {
      throw new EasyAuthError("INVALID_CREDENTIALS", "Authorization code is required for OAuth2 authentication.");
    }
    let tokenData;
    try {
      let reqBody;
      const headers = {
        Accept: "application/json",
        ...this.options.headers || {}
      };
      if (this.contentType === "json") {
        headers["Content-Type"] = "application/json";
        const bodyObj = {
          client_id: this.options.clientId,
          client_secret: this.options.clientSecret,
          code: credentials.code,
          grant_type: "authorization_code"
        };
        if (credentials.redirectUri) bodyObj.redirect_uri = credentials.redirectUri;
        if (credentials.codeVerifier) bodyObj.code_verifier = credentials.codeVerifier;
        reqBody = JSON.stringify(bodyObj);
      } else {
        headers["Content-Type"] = "application/x-www-form-urlencoded";
        const params = new URLSearchParams({
          client_id: this.options.clientId,
          client_secret: this.options.clientSecret,
          code: credentials.code,
          grant_type: "authorization_code"
        });
        if (credentials.redirectUri) params.append("redirect_uri", credentials.redirectUri);
        if (credentials.codeVerifier) params.append("code_verifier", credentials.codeVerifier);
        reqBody = params.toString();
      }
      const res = await this.fetchImpl(this.options.tokenEndpoint, {
        method: "POST",
        headers,
        body: reqBody,
        signal: AbortSignal.timeout(this.timeoutMs)
      });
      if (!res.ok) {
        throw new Error(`Token endpoint responded with status ${res.status} ${res.statusText}`);
      }
      tokenData = await res.json();
    } catch (err) {
      const isNetwork = err?.name === "TimeoutError" || err?.name === "AbortError" || err?.code === "ECONNREFUSED" || err?.code === "ENOTFOUND";
      const code = isNetwork ? "NETWORK_ERROR" : "INVALID_CREDENTIALS";
      throw new EasyAuthError(code, `OAuth2 token exchange failed: ${err.message}`, err);
    }
    if (!tokenData || tokenData.error || !tokenData.access_token) {
      const errorMsg = tokenData?.error_description || tokenData?.error || "Missing access_token in response";
      throw new EasyAuthError("INVALID_CREDENTIALS", `OAuth2 token exchange error: ${errorMsg}`);
    }
    let rawUserInfo;
    try {
      const userRes = await this.fetchImpl(this.options.userInfoEndpoint, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${tokenData.access_token}`,
          Accept: "application/json",
          ...this.options.headers || {}
        },
        signal: AbortSignal.timeout(this.timeoutMs)
      });
      if (!userRes.ok) {
        throw new Error(`User info endpoint responded with status ${userRes.status} ${userRes.statusText}`);
      }
      rawUserInfo = await userRes.json();
    } catch (err) {
      const isNetwork = err?.name === "TimeoutError" || err?.name === "AbortError" || err?.code === "ECONNREFUSED" || err?.code === "ENOTFOUND";
      const code = isNetwork ? "NETWORK_ERROR" : "INVALID_CREDENTIALS";
      throw new EasyAuthError(code, `Failed to retrieve OAuth2 user info: ${err.message}`, err);
    }
    const mapped = this.options.mapProfile(rawUserInfo, tokenData);
    if (!mapped || !mapped.providerUserId || typeof mapped.providerUserId !== "string" || mapped.providerUserId.trim().length === 0) {
      throw new EasyAuthError("INVALID_CREDENTIALS", "mapProfile did not return a valid providerUserId.");
    }
    return {
      providerUserId: mapped.providerUserId.trim(),
      profile: mapped.profile
    };
  }
};
var GoogleProvider = class _GoogleProvider {
  name = "google";
  type = "oauth2";
  options;
  fetchImpl;
  timeoutMs;
  // Cached Google JWKS public key set for high-performance zero-IO verification
  static googleJwks = createRemoteJWKSet(
    new URL("https://www.googleapis.com/oauth2/v3/certs")
  );
  constructor(options) {
    const primaryId = Array.isArray(options?.clientId) ? options.clientId[0] : options?.clientId;
    if (!options || !primaryId) {
      throw new EasyAuthError("CONFIG_ERROR", "GoogleProvider requires a valid 'clientId'.");
    }
    this.options = options;
    this.fetchImpl = options.fetchFn || globalThis.fetch;
    this.timeoutMs = options.timeoutMs ?? 1e4;
  }
  getAllowedClientIds() {
    const list = Array.isArray(this.options.clientId) ? [...this.options.clientId] : [this.options.clientId];
    if (this.options.clientIds) {
      list.push(...this.options.clientIds);
    }
    return list.filter(Boolean);
  }
  async verifyAndExtract(credentials) {
    if (!credentials) {
      throw new EasyAuthError("INVALID_CREDENTIALS", "Google credentials are required.");
    }
    if (credentials.idToken) {
      return this.verifyIdToken(credentials.idToken);
    }
    if (credentials.code) {
      return this.exchangeCode(credentials.code, credentials.redirectUri, credentials.codeVerifier);
    }
    throw new EasyAuthError(
      "INVALID_CREDENTIALS",
      "Google credentials must provide either an 'authorization code' or an 'idToken'."
    );
  }
  async verifyIdToken(idToken) {
    const mode = this.options.idTokenVerificationMode ?? (this.options.fetchFn ? "tokeninfo" : "jwks");
    if (mode === "jwks") {
      try {
        const allowed = this.getAllowedClientIds();
        const { payload } = await jwtVerify(idToken, _GoogleProvider.googleJwks, {
          issuer: ["https://accounts.google.com", "accounts.google.com"],
          audience: allowed.length === 1 ? allowed[0] : allowed
        });
        if (!payload.sub || typeof payload.sub !== "string") {
          throw new Error("Missing subject (sub) in Google ID token.");
        }
        return {
          providerUserId: payload.sub,
          profile: {
            email: payload.email,
            name: payload.name,
            avatar: payload.picture,
            emailVerified: Boolean(payload.email_verified)
          }
        };
      } catch (err) {
        throw new EasyAuthError("INVALID_CREDENTIALS", `Google ID Token verification failed: ${err.message}`, err);
      }
    }
    return this.verifyIdTokenViaTokeninfo(idToken);
  }
  async verifyIdTokenViaTokeninfo(idToken) {
    try {
      const url = `https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(idToken)}`;
      const res = await this.fetchImpl(url, {
        method: "GET",
        signal: AbortSignal.timeout(this.timeoutMs)
      });
      if (!res.ok) {
        throw new Error(`Google tokeninfo endpoint returned status ${res.status}`);
      }
      const info = await res.json();
      if (info.error_description || info.error) {
        throw new Error(info.error_description || info.error);
      }
      const allowed = this.getAllowedClientIds();
      if (allowed.length > 0 && !allowed.includes(info.aud)) {
        throw new Error(`Google ID Token audience mismatch: expected one of [${allowed.join(", ")}], got "${info.aud}".`);
      }
      if (!info.sub) {
        throw new Error("Missing subject (sub) in Google tokeninfo.");
      }
      return {
        providerUserId: info.sub,
        profile: {
          email: info.email,
          name: info.name,
          avatar: info.picture,
          emailVerified: info.email_verified === "true" || info.email_verified === true
        }
      };
    } catch (err) {
      const isNetwork = err?.name === "TimeoutError" || err?.name === "AbortError" || err?.code === "ECONNREFUSED" || err?.code === "ENOTFOUND";
      const code = isNetwork ? "NETWORK_ERROR" : "INVALID_CREDENTIALS";
      throw new EasyAuthError(code, `Google ID Token verification failed: ${err.message}`, err);
    }
  }
  async exchangeCode(code, redirectUri, codeVerifier) {
    if (!this.options.clientSecret) {
      throw new EasyAuthError(
        "CONFIG_ERROR",
        "Google clientSecret is required to exchange OAuth2 authorization code."
      );
    }
    const primaryClientId = Array.isArray(this.options.clientId) ? this.options.clientId[0] : this.options.clientId;
    try {
      const params = new URLSearchParams({
        code,
        client_id: primaryClientId,
        client_secret: this.options.clientSecret,
        grant_type: "authorization_code"
      });
      if (redirectUri) params.append("redirect_uri", redirectUri);
      if (codeVerifier) params.append("code_verifier", codeVerifier);
      const tokenRes = await this.fetchImpl("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: params.toString(),
        signal: AbortSignal.timeout(this.timeoutMs)
      });
      if (!tokenRes.ok) {
        throw new Error(`Google token endpoint returned status ${tokenRes.status}`);
      }
      const tokenData = await tokenRes.json();
      if (!tokenData.access_token) {
        throw new Error(tokenData.error_description || "Missing access_token from Google token response.");
      }
      const userRes = await this.fetchImpl("https://www.googleapis.com/oauth2/v3/userinfo", {
        headers: { Authorization: `Bearer ${tokenData.access_token}` },
        signal: AbortSignal.timeout(this.timeoutMs)
      });
      if (!userRes.ok) {
        throw new Error(`Google userinfo endpoint returned status ${userRes.status}`);
      }
      const userInfo = await userRes.json();
      if (!userInfo.sub) {
        throw new Error("Missing subject (sub) in Google userinfo response.");
      }
      return {
        providerUserId: userInfo.sub,
        profile: {
          email: userInfo.email,
          name: userInfo.name,
          avatar: userInfo.picture,
          emailVerified: userInfo.email_verified
        }
      };
    } catch (err) {
      const isNetwork = err?.name === "TimeoutError" || err?.name === "AbortError" || err?.code === "ECONNREFUSED" || err?.code === "ENOTFOUND";
      const code2 = isNetwork ? "NETWORK_ERROR" : "INVALID_CREDENTIALS";
      throw new EasyAuthError(code2, `Google OAuth code exchange failed: ${err.message}`, err);
    }
  }
};

// src/providers/line/index.ts
var LineProvider = class {
  name = "line";
  type = "oauth2";
  options;
  fetchImpl;
  timeoutMs;
  constructor(options) {
    if (!options || !options.channelId) {
      throw new EasyAuthError("CONFIG_ERROR", "LineProvider requires a valid 'channelId'.");
    }
    this.options = options;
    this.fetchImpl = options.fetchFn || globalThis.fetch;
    this.timeoutMs = options.timeoutMs ?? 1e4;
  }
  async verifyAndExtract(credentials) {
    if (!credentials) {
      throw new EasyAuthError("INVALID_CREDENTIALS", "LINE credentials are required.");
    }
    if (credentials.idToken) {
      return this.verifyIdToken(credentials.idToken);
    }
    if (credentials.code) {
      return this.exchangeCode(credentials.code, credentials.redirectUri);
    }
    if (credentials.accessToken) {
      return this.fetchProfileByAccessToken(credentials.accessToken);
    }
    throw new EasyAuthError(
      "INVALID_CREDENTIALS",
      "LINE credentials must provide 'code', 'idToken', or 'accessToken'."
    );
  }
  async verifyIdToken(idToken) {
    try {
      const params = new URLSearchParams({
        id_token: idToken,
        client_id: this.options.channelId
      });
      const res = await this.fetchImpl("https://api.line.me/oauth2/v2.1/verify", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: params.toString(),
        signal: AbortSignal.timeout(this.timeoutMs)
      });
      if (!res.ok) {
        throw new Error(`LINE verify endpoint returned status ${res.status}`);
      }
      const info = await res.json();
      if (info.error_description || info.error) {
        throw new Error(info.error_description || info.error);
      }
      if (!info.sub) {
        throw new Error("Missing subject (sub) in LINE ID token verification.");
      }
      return {
        providerUserId: info.sub,
        profile: {
          name: info.name,
          avatar: info.picture,
          email: info.email
        }
      };
    } catch (err) {
      const isNetwork = err?.name === "TimeoutError" || err?.name === "AbortError" || err?.code === "ECONNREFUSED" || err?.code === "ENOTFOUND";
      const code = isNetwork ? "NETWORK_ERROR" : "INVALID_CREDENTIALS";
      throw new EasyAuthError(code, `LINE ID Token verification failed: ${err.message}`, err);
    }
  }
  async exchangeCode(code, redirectUri) {
    if (!this.options.channelSecret) {
      throw new EasyAuthError("CONFIG_ERROR", "LINE channelSecret is required to exchange authorization code.");
    }
    if (!redirectUri) {
      throw new EasyAuthError("CONFIG_ERROR", "LINE authorization code exchange requires 'redirectUri'.");
    }
    try {
      const params = new URLSearchParams({
        grant_type: "authorization_code",
        code,
        redirect_uri: redirectUri,
        client_id: this.options.channelId,
        client_secret: this.options.channelSecret
      });
      const res = await this.fetchImpl("https://api.line.me/oauth2/v2.1/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: params.toString(),
        signal: AbortSignal.timeout(this.timeoutMs)
      });
      if (!res.ok) {
        throw new Error(`LINE token endpoint returned status ${res.status}`);
      }
      const tokenData = await res.json();
      if (!tokenData.access_token) {
        throw new Error(tokenData.error_description || "Missing access_token from LINE response.");
      }
      return await this.fetchProfileByAccessToken(tokenData.access_token);
    } catch (err) {
      const isNetwork = err?.name === "TimeoutError" || err?.name === "AbortError" || err?.code === "ECONNREFUSED" || err?.code === "ENOTFOUND";
      const code2 = isNetwork ? "NETWORK_ERROR" : "INVALID_CREDENTIALS";
      throw new EasyAuthError(code2, `LINE code exchange failed: ${err.message}`, err);
    }
  }
  async fetchProfileByAccessToken(accessToken) {
    try {
      const res = await this.fetchImpl("https://api.line.me/v2/profile", {
        headers: { Authorization: `Bearer ${accessToken}` },
        signal: AbortSignal.timeout(this.timeoutMs)
      });
      if (!res.ok) {
        throw new Error(`LINE profile endpoint returned status ${res.status}`);
      }
      const profile = await res.json();
      if (!profile.userId) {
        throw new Error("Missing userId in LINE profile response.");
      }
      return {
        providerUserId: profile.userId,
        profile: {
          name: profile.displayName,
          avatar: profile.pictureUrl,
          statusMessage: profile.statusMessage
        }
      };
    } catch (err) {
      const isNetwork = err?.name === "TimeoutError" || err?.name === "AbortError" || err?.code === "ECONNREFUSED" || err?.code === "ENOTFOUND";
      const code = isNetwork ? "NETWORK_ERROR" : "INVALID_CREDENTIALS";
      throw new EasyAuthError(code, `LINE profile fetch failed: ${err.message}`, err);
    }
  }
};
var BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
function base32Decode(base32) {
  const clean = base32.toUpperCase().replace(/=+$/, "").replace(/\s+/g, "");
  let bits = 0;
  let value = 0;
  const output = [];
  for (let i = 0; i < clean.length; i++) {
    const idx = BASE32_ALPHABET.indexOf(clean[i]);
    if (idx === -1) {
      throw new Error(`Invalid Base32 character: "${clean[i]}"`);
    }
    value = value << 5 | idx;
    bits += 5;
    if (bits >= 8) {
      output.push(value >>> bits - 8 & 255);
      bits -= 8;
    }
  }
  return Buffer.from(output);
}
function base32Encode(buffer) {
  let bits = 0;
  let value = 0;
  let output = "";
  for (let i = 0; i < buffer.length; i++) {
    value = value << 8 | buffer[i];
    bits += 8;
    while (bits >= 5) {
      output += BASE32_ALPHABET[value >>> bits - 5 & 31];
      bits -= 5;
    }
  }
  if (bits > 0) {
    output += BASE32_ALPHABET[value << 5 - bits & 31];
  }
  return output;
}
var TotpProvider = class _TotpProvider {
  name;
  type = "totp";
  step;
  window;
  digits;
  options;
  lastUsedTimeSteps = /* @__PURE__ */ new Map();
  failedAttempts = /* @__PURE__ */ new Map();
  constructor(options) {
    this.name = (options?.name || "totp").toLowerCase();
    this.step = options?.step ?? 30;
    this.window = options?.window ?? 1;
    this.digits = options?.digits ?? 6;
    this.options = options || {};
  }
  /**
   * Generates a new random Base32 secret key compatible with Google Authenticator
   */
  static generateSecret(length = 20) {
    const bytes = randomBytes(length);
    return base32Encode(bytes);
  }
  /**
   * Generates an otpauth:// URI suitable for creating QR codes for Google Authenticator
   */
  static generateTotpUri(params) {
    const { secret, accountName, issuer, digits = 6, period = 30 } = params;
    const label = issuer ? `${encodeURIComponent(issuer)}:${encodeURIComponent(accountName)}` : encodeURIComponent(accountName);
    let uri = `otpauth://totp/${label}?secret=${secret}&digits=${digits}&period=${period}`;
    if (issuer) {
      uri += `&issuer=${encodeURIComponent(issuer)}`;
    }
    return uri;
  }
  /**
   * Generates a dynamic token for the given secret and timestamp
   */
  static generateToken(secret, options) {
    const timestamp = options?.timestamp ?? Date.now();
    const step = options?.step ?? 30;
    const digits = options?.digits ?? 6;
    const secretBuffer = base32Decode(secret);
    const counter = Math.floor(timestamp / 1e3 / step);
    const buf = Buffer.alloc(8);
    buf.writeBigInt64BE(BigInt(counter));
    const hmac = createHmac("sha1", secretBuffer).update(buf).digest();
    const offset = hmac[hmac.length - 1] & 15;
    const binary = (hmac[offset] & 127) << 24 | (hmac[offset + 1] & 255) << 16 | (hmac[offset + 2] & 255) << 8 | hmac[offset + 3] & 255;
    const otp = (binary % 10 ** digits).toString().padStart(digits, "0");
    return otp;
  }
  /**
   * Verifies a TOTP token against a secret with timing-safe comparison and window drift tolerance.
   * Returns validation status along with matched time-step counter.
   */
  static verifyTokenWithCounter(secret, token, options) {
    const timestamp = options?.timestamp ?? Date.now();
    const step = options?.step ?? 30;
    const window = options?.window ?? 1;
    const digits = options?.digits ?? 6;
    if (!token || typeof token !== "string" || token.length !== digits || !/^\d+$/.test(token)) {
      return { valid: false };
    }
    let secretBuffer;
    try {
      secretBuffer = base32Decode(secret);
    } catch {
      return { valid: false };
    }
    const currentCounter = Math.floor(timestamp / 1e3 / step);
    for (let i = -window; i <= window; i++) {
      const counter = currentCounter + i;
      const buf = Buffer.alloc(8);
      buf.writeBigInt64BE(BigInt(counter));
      const hmac = createHmac("sha1", secretBuffer).update(buf).digest();
      const offset = hmac[hmac.length - 1] & 15;
      const binary = (hmac[offset] & 127) << 24 | (hmac[offset + 1] & 255) << 16 | (hmac[offset + 2] & 255) << 8 | hmac[offset + 3] & 255;
      const expected = (binary % 10 ** digits).toString().padStart(digits, "0");
      if (timingSafeEqual(Buffer.from(expected), Buffer.from(token))) {
        return { valid: true, counter };
      }
    }
    return { valid: false };
  }
  /**
   * Verifies a TOTP token against a secret with timing-safe comparison and window drift tolerance.
   */
  static verifyToken(secret, token, options) {
    return _TotpProvider.verifyTokenWithCounter(secret, token, options).valid;
  }
  /**
   * Standard AuthProvider verifyAndExtract implementation
   */
  async verifyAndExtract(credentials) {
    if (!credentials) {
      throw new EasyAuthError("INVALID_CREDENTIALS", "TOTP credentials are required.");
    }
    const { account, code } = credentials;
    if (!account || typeof account !== "string" || account.trim().length === 0) {
      throw new EasyAuthError("INVALID_CREDENTIALS", "Account identifier is required for TOTP verification.");
    }
    const normalizedAccount = account.trim().toLowerCase();
    const maxFailed = this.options.maxFailedAttempts ?? 5;
    const lockoutMs = this.options.lockoutDurationMs ?? 6e4;
    if (maxFailed > 0) {
      const lock = this.failedAttempts.get(normalizedAccount);
      if (lock && Date.now() < lock.lockedUntil) {
        const remainingSec = Math.ceil((lock.lockedUntil - Date.now()) / 1e3);
        throw new EasyAuthError(
          "RATE_LIMIT_EXCEEDED",
          `Too many failed TOTP verification attempts for account "${account}". Please retry after ${remainingSec}s.`
        );
      }
    }
    if (!code || typeof code !== "string" || code.trim().length !== this.digits) {
      throw new EasyAuthError(
        "INVALID_CREDENTIALS",
        `TOTP code must be a ${this.digits}-digit string.`
      );
    }
    let secret = null;
    if (this.options.allowClientSecret && credentials.secret) {
      secret = credentials.secret;
    } else if (this.options.secret) {
      if (typeof this.options.secret === "function") {
        secret = await this.options.secret(account.trim());
      } else {
        secret = this.options.secret;
      }
    }
    if (!secret || typeof secret !== "string" || secret.trim().length === 0) {
      throw new EasyAuthError(
        "INVALID_CREDENTIALS",
        `No authoritative TOTP secret found for account "${account}". Configure options.secret or pass secret with allowClientSecret enabled.`
      );
    }
    const verification = _TotpProvider.verifyTokenWithCounter(secret, code.trim(), {
      step: this.step,
      window: this.window,
      digits: this.digits
    });
    if (!verification.valid || verification.counter === void 0) {
      if (maxFailed > 0) {
        const lock = this.failedAttempts.get(normalizedAccount) || { count: 0, lockedUntil: 0 };
        lock.count += 1;
        if (lock.count >= maxFailed) {
          lock.lockedUntil = Date.now() + lockoutMs;
        }
        this.failedAttempts.set(normalizedAccount, lock);
      }
      throw new EasyAuthError(
        "INVALID_CREDENTIALS",
        "Invalid or expired 6-digit Google OTP code."
      );
    }
    if (maxFailed > 0) {
      this.failedAttempts.delete(normalizedAccount);
    }
    const counter = verification.counter;
    if (this.options.enforceMonotonicCounter !== false) {
      const lastCounter = this.lastUsedTimeSteps.get(normalizedAccount);
      if (lastCounter !== void 0 && counter <= lastCounter) {
        throw new EasyAuthError(
          "INVALID_CREDENTIALS",
          "TOTP code has already been used. Please wait for the next time-step."
        );
      }
      this.lastUsedTimeSteps.set(normalizedAccount, counter);
      if (this.lastUsedTimeSteps.size > 1e4) {
        const excess = this.lastUsedTimeSteps.size - 8e3;
        const keys = this.lastUsedTimeSteps.keys();
        for (let i = 0; i < excess; i++) {
          const k = keys.next().value;
          if (k) this.lastUsedTimeSteps.delete(k);
        }
      }
    }
    if (this.options.consumeOtp) {
      const consumed = await this.options.consumeOtp(normalizedAccount, code.trim(), counter);
      if (!consumed) {
        throw new EasyAuthError(
          "INVALID_CREDENTIALS",
          "TOTP code has already been consumed or rejected by replay check."
        );
      }
    }
    return {
      providerUserId: normalizedAccount,
      profile: {
        account: account.trim()
      }
    };
  }
};

// src/index.ts
var VERSION = "0.1.0";

export { AuthEngine, EasyAuth, EasyAuthError, TotpProvider as GoogleOtpProvider, GoogleProvider, JwtService, LineProvider, MemoryStorageAdapter, OAuth2BaseProvider, PostgresStorageAdapter, ProviderRegistry, SqliteStorageAdapter, TotpProvider, VERSION, Web3Provider, base32Decode, base32Encode };
//# sourceMappingURL=index.mjs.map
//# sourceMappingURL=index.mjs.map