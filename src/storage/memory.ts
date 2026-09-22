import { randomUUID } from "node:crypto";
import type { StorageAdapter } from "./base.js";
import type { User, Identity, CreateUserData, CreateIdentityData } from "../core/types.js";
import { EasyAuthError } from "../core/errors.js";

export interface MemoryStorageOptions {
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
export class MemoryStorageAdapter implements StorageAdapter {
  private readonly users = new Map<string, User>();
  private readonly identities = new Map<string, Identity>();
  private readonly userIdentities = new Map<string, Set<string>>();
  private readonly maxEntries?: number;

  constructor(options?: MemoryStorageOptions) {
    this.maxEntries = options?.maxEntries;
  }

  private getIdentityKey(provider: string, providerUserId: string): string {
    return `${provider}:${providerUserId}`;
  }

  private cloneUser(user: User): User {
    return {
      ...user,
      metadata: { ...user.metadata },
      createdAt: new Date(user.createdAt),
      updatedAt: new Date(user.updatedAt),
    };
  }

  private cloneIdentity(identity: Identity): Identity {
    return {
      ...identity,
      profile: identity.profile ? { ...identity.profile } : undefined,
      createdAt: new Date(identity.createdAt),
      updatedAt: new Date(identity.updatedAt),
    };
  }

  async createUser(data: CreateUserData): Promise<User> {
    // Evict oldest if bounded cap reached
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
    const now = new Date();
    const user: User = {
      id,
      metadata: data.metadata ? { ...data.metadata } : {},
      createdAt: data.createdAt || now,
      updatedAt: data.updatedAt || now,
    };

    this.users.set(id, user);
    this.userIdentities.set(id, new Set());
    return this.cloneUser(user);
  }

  async getUserById(id: string): Promise<User | null> {
    const user = this.users.get(id);
    return user ? this.cloneUser(user) : null;
  }

  async updateUserMetadata(id: string, metadata: Record<string, any>): Promise<User> {
    const user = this.users.get(id);
    if (!user) {
      throw new EasyAuthError("USER_NOT_FOUND", `User with ID "${id}" was not found.`);
    }

    user.metadata = { ...user.metadata, ...metadata };
    user.updatedAt = new Date();
    return this.cloneUser(user);
  }

  async createIdentity(data: CreateIdentityData): Promise<Identity> {
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
    const now = new Date();
    const identity: Identity = {
      id,
      userId: data.userId,
      provider: data.provider,
      providerUserId: data.providerUserId,
      profile: data.profile ? { ...data.profile } : undefined,
      createdAt: data.createdAt || now,
      updatedAt: data.updatedAt || now,
    };

    this.identities.set(key, identity);
    let identitySet = this.userIdentities.get(data.userId);
    if (!identitySet) {
      identitySet = new Set();
      this.userIdentities.set(data.userId, identitySet);
    }
    identitySet.add(key);

    return this.cloneIdentity(identity);
  }

  async getIdentity(provider: string, providerUserId: string): Promise<Identity | null> {
    const key = this.getIdentityKey(provider, providerUserId);
    const identity = this.identities.get(key);
    return identity ? this.cloneIdentity(identity) : null;
  }

  async listIdentitiesByUserId(userId: string): Promise<Identity[]> {
    const keys = this.userIdentities.get(userId);
    if (!keys || keys.size === 0) {
      return [];
    }

    const result: Identity[] = [];
    for (const key of keys) {
      const identity = this.identities.get(key);
      if (identity) {
        result.push(this.cloneIdentity(identity));
      }
    }
    return result;
  }

  async deleteIdentity(
    userId: string,
    provider: string,
    providerUserId: string,
    options?: { enforceMinimumCount?: boolean }
  ): Promise<boolean> {
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
  clear(): void {
    this.users.clear();
    this.identities.clear();
    this.userIdentities.clear();
  }
}
