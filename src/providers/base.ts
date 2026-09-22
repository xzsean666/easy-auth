/**
 * Extracted identity output from a provider verification
 */
export interface ExtractedIdentity<TProfile = any> {
  /**
   * Global unique identifier in the third-party domain (e.g. lowercase wallet address, github user ID)
   */
  providerUserId: string;

  /**
   * Optional profile metadata snapshot extracted from the provider
   */
  profile?: TProfile;
}

/**
 * Core contract that all authentication providers must implement
 */
export interface AuthProvider<TCredentials = any, TProfile = any> {
  /**
   * Unique name identifier of the provider (e.g. "web3", "google", "github", "sms")
   */
  readonly name: string;

  /**
   * Optional broad category or login type (e.g. "wallet", "oauth2", "totp", "sms")
   */
  readonly type?: string;

  /**
   * Verifies the third-party credentials and extracts a normalized identity
   */
  verifyAndExtract(credentials: TCredentials): Promise<ExtractedIdentity<TProfile>>;
}

/**
 * Functional provider type for one-line registration
 */
export type FunctionalAuthProvider<TCredentials = any, TProfile = any> = (
  credentials: TCredentials
) => Promise<ExtractedIdentity<TProfile>>;
