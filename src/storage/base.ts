import type { User, Identity, CreateUserData, CreateIdentityData } from "../core/types.js";

export interface DeleteIdentityOptions {
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
export interface StorageAdapter {
  // User operations
  createUser(data: CreateUserData): Promise<User>;
  getUserById(id: string): Promise<User | null>;
  updateUserMetadata(id: string, metadata: Record<string, any>): Promise<User>;

  // Identity operations
  createIdentity(data: CreateIdentityData): Promise<Identity>;
  getIdentity(provider: string, providerUserId: string): Promise<Identity | null>;
  listIdentitiesByUserId(userId: string): Promise<Identity[]>;
  deleteIdentity(
    userId: string,
    provider: string,
    providerUserId: string,
    options?: DeleteIdentityOptions
  ): Promise<boolean>;
}
