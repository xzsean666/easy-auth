import { Injectable, Inject } from "@nestjs/common";
import { EasyAuth, type EasyAuthOptions } from "../easy-auth.js";
import { EASY_AUTH_OPTIONS } from "./constants.js";
import type { AuthResult, VerifyResult, VerifyOptions, User, Identity } from "../core/types.js";

export interface EasyAuthModuleOptions extends EasyAuthOptions {
  /**
   * Route prefix for built-in EasyAuthController.
   * Defaults to 'api/auth'.
   */
  routePrefix?: string;

  /**
   * Whether to disable registering the built-in EasyAuthController.
   * Defaults to false.
   */
  disableController?: boolean;

  /**
   * Whether to register EasyAuthGuard as a global guard.
   * Defaults to false.
   */
  globalGuard?: boolean;
}

@Injectable()
export class EasyAuthService {
  public readonly auth: EasyAuth;

  constructor(@Inject(EASY_AUTH_OPTIONS) public readonly options: EasyAuthModuleOptions) {
    this.auth = new EasyAuth(options);
  }

  /**
   * Authenticate a user with third-party credentials.
   */
  async authenticate(provider: string, credentials: any): Promise<AuthResult> {
    return this.auth.authenticate(provider, credentials);
  }

  /**
   * Verify an incoming JWT bearer token and extract user & metadata.
   */
  async verify(token: string, options?: VerifyOptions): Promise<VerifyResult> {
    return this.auth.verify(token, options);
  }

  /**
   * Link a new third-party identity to an existing user account.
   */
  async linkIdentity(userId: string, provider: string, credentials: any): Promise<Identity> {
    return this.auth.linkIdentity(userId, provider, credentials);
  }

  /**
   * Unlink a third-party identity with anti-lockout protection.
   */
  async unlinkIdentity(userId: string, provider: string, providerUserId: string): Promise<void> {
    return this.auth.unlinkIdentity(userId, provider, providerUserId);
  }

  /**
   * Get user by ID.
   */
  async getUser(id: string): Promise<User | null> {
    return this.auth.storage.getUserById(id);
  }

  /**
   * List all identities linked to a user.
   */
  async listIdentities(userId: string): Promise<Identity[]> {
    return this.auth.storage.listIdentitiesByUserId(userId);
  }

  /**
   * Generates a single-use cryptographically random nonce for Web3 authentication anti-replay.
   */
  generateNonce(address?: string, ttlMs?: number): string {
    return this.auth.generateNonce(address, ttlMs);
  }

  /**
   * Validates and consumes a single-use nonce.
   */
  consumeNonce(nonce: string, address?: string): boolean {
    return this.auth.consumeNonce(nonce, address);
  }

  /**
   * Updates user metadata.
   */
  async updateUserMetadata(userId: string, patch: Record<string, any>): Promise<User> {
    return this.auth.updateUserMetadata(userId, patch);
  }

  /**
   * Alias for updateUserMetadata.
   */
  async updateMetadata(userId: string, patch: Record<string, any>): Promise<User> {
    return this.auth.updateUserMetadata(userId, patch);
  }

  /**
   * Obtains OAuth redirection authorization URL for supported providers.
   */
  getAuthorizationUrl(providerName: string, options: { redirectUri: string; state?: string; scope?: string }): string {
    return this.auth.getAuthorizationUrl(providerName, options);
  }
}
