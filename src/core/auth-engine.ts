import type { StorageAdapter } from "../storage/base.js";
import type { JwtService } from "../jwt/jwt-service.js";
import type { ProviderRegistry } from "../providers/registry.js";
import type { User, Identity, AuthResult, VerifyResult, VerifyOptions } from "./types.js";
import { EasyAuthError } from "./errors.js";

export interface AuthEngineDependencies {
  storage: StorageAdapter;
  jwtService: JwtService;
  registry: ProviderRegistry;
}

/**
 * Core orchestration engine of Easy Auth.
 * Manages authentication, identity linking, unlinking (with Anti-Lockout safety),
 * and unified token verification.
 */
export class AuthEngine {
  readonly storage: StorageAdapter;
  readonly jwtService: JwtService;
  readonly registry: ProviderRegistry;

  constructor(dependencies: AuthEngineDependencies) {
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
  async authenticate(providerName: string, credentials: unknown): Promise<AuthResult> {
    const provider = this.registry.get(providerName);
    const extracted = await provider.verifyAndExtract(credentials);
    const providerKey = provider.name.toLowerCase();

    let identity = await this.storage.getIdentity(providerKey, extracted.providerUserId);
    let user: User | null = null;
    let isNewUser = false;

    if (identity) {
      user = await this.storage.getUserById(identity.userId);
      if (!user) {
        // Self-healing fallback: recreate user if somehow deleted
        user = await this.storage.createUser({
          id: identity.userId,
          metadata: extracted.profile ? { ...extracted.profile } : {},
        });
      }
    } else {
      isNewUser = true;
      user = await this.storage.createUser({
        metadata: extracted.profile ? { ...extracted.profile } : {},
      });

      try {
        identity = await this.storage.createIdentity({
          userId: user.id,
          provider: providerKey,
          providerUserId: extracted.providerUserId,
          profile: extracted.profile,
        });
      } catch (err: any) {
        // 🔒 Concurrency race resilience: If a concurrent request bound the identity first,
        // recover gracefully by loading the winner's user record instead of throwing an unhandled 409.
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

    // ⚡ Performance optimization: For new users, provider is solely the current one;
    // skip the redundant storage query on first login.
    const providerNames = isNewUser
      ? [providerKey]
      : Array.from(new Set((await this.storage.listIdentitiesByUserId(user.id)).map((i) => i.provider)));

    // Track lastLogin audit in user metadata
    user = await this.storage.updateUserMetadata(user.id, {
      lastLoginType: providerKey,
      lastLoginAt: new Date().toISOString(),
    });

    const token = await this.jwtService.sign(user, {
      identities: providerNames,
    });

    return {
      user,
      identity,
      token,
      isNewUser,
      loginType: providerKey,
    };
  }

  /**
   * Links a new external identity to an existing user account.
   * Enforces exclusive binding: if the identity is already bound to another user, throws IDENTITY_ALREADY_LINKED.
   * Idempotent: if already linked to the same user, returns the existing identity.
   */
  async linkIdentity(userId: string, providerName: string, credentials: unknown): Promise<Identity> {
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
        return existing; // Idempotent success
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
      profile: extracted.profile,
    });

    // Optionally merge profile into user metadata if not already set
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
  async unlinkIdentity(userId: string, providerName: string, providerUserId: string): Promise<void> {
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
      (i) =>
        i.provider.toLowerCase() === providerKey &&
        (i.providerUserId.toLowerCase() === providerUserId.toLowerCase() || i.providerUserId === providerUserId)
    );

    if (!target) {
      throw new EasyAuthError(
        "INVALID_CREDENTIALS",
        `Identity "${providerName}:${providerUserId}" does not belong to user "${userId}".`
      );
    }

    const deleted = await this.storage.deleteIdentity(userId, target.provider, target.providerUserId, {
      enforceMinimumCount: true,
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
  async listIdentities(userId: string): Promise<Identity[]> {
    const user = await this.storage.getUserById(userId);
    if (!user) {
      throw new EasyAuthError("USER_NOT_FOUND", `User "${userId}" was not found.`);
    }
    return this.storage.listIdentitiesByUserId(userId);
  }

  /**
   * Updates user profile / metadata
   */
  async updateUserMetadata(userId: string, patch: Record<string, any>): Promise<User> {
    return this.storage.updateUserMetadata(userId, patch);
  }

  /**
   * Alias for updateUserMetadata
   */
  async updateMetadata(userId: string, patch: Record<string, any>): Promise<User> {
    return this.updateUserMetadata(userId, patch);
  }

  /**
   * Alias for verify
   */
  async verifyToken(token: string, options?: VerifyOptions): Promise<VerifyResult> {
    return this.verify(token, options);
  }

  /**
   * Verifies an Easy Auth JWT token and returns standard context including userId, metadata, and user entity.
   */
  async verify(token: string, options?: VerifyOptions): Promise<VerifyResult> {
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
        payload,
      };
    }

    // Stateless fast path
    const fallbackUser: User = {
      id: userId,
      metadata: payload.metadata || {},
      createdAt: new Date((payload.iat || 0) * 1000),
      updatedAt: new Date((payload.iat || 0) * 1000),
    };

    return {
      userId,
      metadata: fallbackUser.metadata,
      user: fallbackUser,
      payload,
    };
  }
}
