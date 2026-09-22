import { Injectable, Inject, Optional, createParamDecorator, Get, Query, Post, Body, Headers, Controller, UseGuards, Global, Module, SetMetadata, UnauthorizedException, HttpException, HttpStatus } from '@nestjs/common';
import { Reflector, APP_GUARD } from '@nestjs/core';
import { randomUUID } from 'crypto';
import { dirname } from 'path';
import { mkdirSync } from 'fs';
import { createRequire } from 'module';
import { SignJWT, jwtVerify, errors } from 'jose';
import { isAddress, verifyMessage } from 'viem';

var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __require = /* @__PURE__ */ ((x) => typeof require !== "undefined" ? require : typeof Proxy !== "undefined" ? new Proxy(x, {
  get: (a, b) => (typeof require !== "undefined" ? require : a)[b]
}) : x)(function(x) {
  if (typeof require !== "undefined") return require.apply(this, arguments);
  throw Error('Dynamic require of "' + x + '" is not supported');
});
var __decorateClass = (decorators, target, key, kind) => {
  var result = kind > 1 ? void 0 : kind ? __getOwnPropDesc(target, key) : target;
  for (var i = decorators.length - 1, decorator; i >= 0; i--)
    if (decorator = decorators[i])
      result = (kind ? decorator(target, key, result) : decorator(result)) || result;
  if (kind && result) __defProp(target, key, result);
  return result;
};
var __decorateParam = (index, decorator) => (target, key) => decorator(target, key, index);

// src/nestjs/constants.ts
var EASY_AUTH_OPTIONS = "EASY_AUTH_OPTIONS";
var EASY_AUTH_INSTANCE = "EASY_AUTH_INSTANCE";
var IS_PUBLIC_KEY = "easy_auth:is_public";

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

// src/nestjs/easy-auth.service.ts
var EasyAuthService = class {
  constructor(options) {
    this.options = options;
    this.auth = new EasyAuth(options);
  }
  options;
  auth;
  /**
   * Authenticate a user with third-party credentials.
   */
  async authenticate(provider, credentials) {
    return this.auth.authenticate(provider, credentials);
  }
  /**
   * Verify an incoming JWT bearer token and extract user & metadata.
   */
  async verify(token, options) {
    return this.auth.verify(token, options);
  }
  /**
   * Link a new third-party identity to an existing user account.
   */
  async linkIdentity(userId, provider, credentials) {
    return this.auth.linkIdentity(userId, provider, credentials);
  }
  /**
   * Unlink a third-party identity with anti-lockout protection.
   */
  async unlinkIdentity(userId, provider, providerUserId) {
    return this.auth.unlinkIdentity(userId, provider, providerUserId);
  }
  /**
   * Get user by ID.
   */
  async getUser(id) {
    return this.auth.storage.getUserById(id);
  }
  /**
   * List all identities linked to a user.
   */
  async listIdentities(userId) {
    return this.auth.storage.listIdentitiesByUserId(userId);
  }
  /**
   * Generates a single-use cryptographically random nonce for Web3 authentication anti-replay.
   */
  generateNonce(address, ttlMs) {
    return this.auth.generateNonce(address, ttlMs);
  }
  /**
   * Validates and consumes a single-use nonce.
   */
  consumeNonce(nonce, address) {
    return this.auth.consumeNonce(nonce, address);
  }
};
EasyAuthService = __decorateClass([
  Injectable(),
  __decorateParam(0, Inject(EASY_AUTH_OPTIONS))
], EasyAuthService);
var EasyAuthGuard = class {
  constructor(authService, reflector) {
    this.authService = authService;
    this.reflector = reflector;
  }
  authService;
  reflector;
  async canActivate(context) {
    if (this.reflector) {
      const isPublic = this.reflector.getAllAndOverride(IS_PUBLIC_KEY, [
        context.getHandler(),
        context.getClass()
      ]);
      if (isPublic) {
        return true;
      }
    }
    const request = context.switchToHttp().getRequest();
    const authHeader = request.headers?.authorization;
    if (!authHeader || typeof authHeader !== "string" || !authHeader.startsWith("Bearer ")) {
      throw new UnauthorizedException("Missing or malformed Authorization header with Bearer token");
    }
    const token = authHeader.slice(7).trim();
    if (!token) {
      throw new UnauthorizedException("Empty Bearer token provided");
    }
    try {
      const verifyResult = await this.authService.verify(token);
      request.user = verifyResult.user;
      request.userId = verifyResult.userId;
      request.userMetadata = verifyResult.metadata;
      request.authPayload = verifyResult.payload;
      return true;
    } catch (err) {
      throw new UnauthorizedException(err.message || "Invalid or expired authentication token");
    }
  }
};
EasyAuthGuard = __decorateClass([
  Injectable(),
  __decorateParam(0, Inject(EasyAuthService)),
  __decorateParam(1, Optional()),
  __decorateParam(1, Inject(Reflector))
], EasyAuthGuard);
var CurrentUser = createParamDecorator(
  (data, ctx) => {
    const request = ctx.switchToHttp().getRequest();
    const user = request.user;
    if (!user) {
      return null;
    }
    return data ? user[data] : user;
  }
);
var Public = () => SetMetadata(IS_PUBLIC_KEY, true);

// src/nestjs/easy-auth.controller.ts
var EasyAuthController = class {
  constructor(authService) {
    this.authService = authService;
  }
  authService;
  handleError(err) {
    if (err instanceof EasyAuthError) {
      throw new HttpException(
        {
          statusCode: err.statusCode,
          error: err.code,
          message: err.message
        },
        err.statusCode
      );
    }
    throw new HttpException(
      {
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        message: err?.message || "Internal authentication error"
      },
      HttpStatus.INTERNAL_SERVER_ERROR
    );
  }
  getNonce(address) {
    const nonce = this.authService.generateNonce(address);
    return {
      statusCode: HttpStatus.OK,
      nonce,
      address: address ? address.toLowerCase() : void 0,
      expiresIn: 300
    };
  }
  async login(body) {
    const loginType = body?.loginType || body?.type || body?.provider;
    if (!loginType || !body?.credentials) {
      throw new HttpException(
        { statusCode: 400, error: "BAD_REQUEST", message: "Missing loginType (or provider) and credentials in request body" },
        HttpStatus.BAD_REQUEST
      );
    }
    try {
      const result = await this.authService.authenticate(loginType, body.credentials);
      return {
        statusCode: HttpStatus.OK,
        loginType: result.loginType,
        user: result.user,
        token: result.token,
        isNewUser: result.isNewUser,
        identity: result.identity
      };
    } catch (err) {
      this.handleError(err);
    }
  }
  async link(body, currentUserId) {
    const provider = body?.loginType || body?.type || body?.provider;
    if (!provider || !body?.credentials) {
      throw new HttpException(
        { statusCode: 400, error: "BAD_REQUEST", message: "Missing loginType (or provider), or credentials in request body" },
        HttpStatus.BAD_REQUEST
      );
    }
    if (body?.userId && currentUserId && body.userId !== currentUserId) {
      throw new HttpException(
        { statusCode: 403, error: "FORBIDDEN", message: "Cannot link identity to another user account" },
        HttpStatus.FORBIDDEN
      );
    }
    const targetUserId = currentUserId || body?.userId;
    if (!targetUserId) {
      throw new HttpException(
        { statusCode: 401, error: "UNAUTHORIZED", message: "Authentication required to link an identity" },
        HttpStatus.UNAUTHORIZED
      );
    }
    try {
      const identity = await this.authService.linkIdentity(targetUserId, provider, body.credentials);
      return {
        statusCode: HttpStatus.OK,
        identity
      };
    } catch (err) {
      this.handleError(err);
    }
  }
  async unlink(body, currentUserId) {
    const provider = body?.loginType || body?.type || body?.provider;
    if (!provider || !body?.providerUserId) {
      throw new HttpException(
        { statusCode: 400, error: "BAD_REQUEST", message: "Missing loginType (or provider), or providerUserId in request body" },
        HttpStatus.BAD_REQUEST
      );
    }
    if (body?.userId && currentUserId && body.userId !== currentUserId) {
      throw new HttpException(
        { statusCode: 403, error: "FORBIDDEN", message: "Cannot unlink identity from another user account" },
        HttpStatus.FORBIDDEN
      );
    }
    const targetUserId = currentUserId || body?.userId;
    if (!targetUserId) {
      throw new HttpException(
        { statusCode: 401, error: "UNAUTHORIZED", message: "Authentication required to unlink an identity" },
        HttpStatus.UNAUTHORIZED
      );
    }
    try {
      await this.authService.unlinkIdentity(targetUserId, provider, body.providerUserId);
      return {
        statusCode: HttpStatus.OK,
        success: true
      };
    } catch (err) {
      this.handleError(err);
    }
  }
  async me(authHeader, user) {
    if (user) {
      return {
        statusCode: HttpStatus.OK,
        userId: user.id,
        user,
        metadata: user.metadata
      };
    }
    if (!authHeader?.startsWith("Bearer ")) {
      throw new HttpException(
        { statusCode: 401, error: "UNAUTHORIZED", message: "Missing or invalid Authorization header" },
        HttpStatus.UNAUTHORIZED
      );
    }
    const token = authHeader.slice(7).trim();
    try {
      const result = await this.authService.verify(token);
      return {
        statusCode: HttpStatus.OK,
        userId: result.userId,
        user: result.user,
        metadata: result.metadata
      };
    } catch (err) {
      this.handleError(err);
    }
  }
  async listIdentities(userId, currentUserId) {
    if (userId && currentUserId && userId !== currentUserId) {
      throw new HttpException(
        { statusCode: 403, error: "FORBIDDEN", message: "Cannot view identities of another user account" },
        HttpStatus.FORBIDDEN
      );
    }
    const targetUserId = currentUserId || userId;
    if (!targetUserId) {
      throw new HttpException(
        { statusCode: 401, error: "UNAUTHORIZED", message: "Authentication required to view identities" },
        HttpStatus.UNAUTHORIZED
      );
    }
    try {
      const identities = await this.authService.listIdentities(targetUserId);
      return {
        statusCode: HttpStatus.OK,
        identities
      };
    } catch (err) {
      this.handleError(err);
    }
  }
};
__decorateClass([
  Public(),
  Get("nonce"),
  __decorateParam(0, Query("address"))
], EasyAuthController.prototype, "getNonce", 1);
__decorateClass([
  Public(),
  Post("login"),
  __decorateParam(0, Body())
], EasyAuthController.prototype, "login", 1);
__decorateClass([
  Post("link"),
  __decorateParam(0, Body()),
  __decorateParam(1, CurrentUser("id"))
], EasyAuthController.prototype, "link", 1);
__decorateClass([
  Post("unlink"),
  __decorateParam(0, Body()),
  __decorateParam(1, CurrentUser("id"))
], EasyAuthController.prototype, "unlink", 1);
__decorateClass([
  Get("me"),
  __decorateParam(0, Headers("authorization")),
  __decorateParam(1, CurrentUser())
], EasyAuthController.prototype, "me", 1);
__decorateClass([
  Get("identities"),
  __decorateParam(0, Query("userId")),
  __decorateParam(1, CurrentUser("id"))
], EasyAuthController.prototype, "listIdentities", 1);
EasyAuthController = __decorateClass([
  Controller("api/auth"),
  UseGuards(EasyAuthGuard),
  __decorateParam(0, Inject(EasyAuthService))
], EasyAuthController);

// src/nestjs/easy-auth.module.ts
var EasyAuthModule = class {
  /**
   * Synchronous static registration of EasyAuthModule.
   */
  static forRoot(options) {
    if (options.routePrefix) {
      const cleanPrefix = options.routePrefix.replace(/^\/+|\/+$/g, "");
      Reflect.defineMetadata("path", cleanPrefix, EasyAuthController);
    }
    const controllers = options.disableController ? [] : [EasyAuthController];
    const providers = [
      {
        provide: EASY_AUTH_OPTIONS,
        useValue: options
      },
      EasyAuthService,
      EasyAuthGuard
    ];
    if (options.globalGuard) {
      providers.push({
        provide: APP_GUARD,
        useClass: EasyAuthGuard
      });
    }
    return {
      module: EasyAuthModule,
      controllers,
      providers,
      exports: [EasyAuthService, EasyAuthGuard]
    };
  }
  /**
   * Asynchronous registration of EasyAuthModule using factory function.
   */
  static forRootAsync(asyncOptions) {
    const providers = [
      {
        provide: EASY_AUTH_OPTIONS,
        useFactory: asyncOptions.useFactory,
        inject: asyncOptions.inject || []
      },
      EasyAuthService,
      EasyAuthGuard
    ];
    return {
      module: EasyAuthModule,
      imports: asyncOptions.imports || [],
      controllers: [EasyAuthController],
      providers,
      exports: [EasyAuthService, EasyAuthGuard]
    };
  }
};
EasyAuthModule = __decorateClass([
  Global(),
  Module({})
], EasyAuthModule);

export { CurrentUser, EASY_AUTH_INSTANCE, EASY_AUTH_OPTIONS, EasyAuthController, EasyAuthGuard, EasyAuthModule, EasyAuthService, IS_PUBLIC_KEY, Public };
//# sourceMappingURL=index.mjs.map
//# sourceMappingURL=index.mjs.map