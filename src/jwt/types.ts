import type { EasyAuthJwtPayload } from "../core/types.js";

/**
 * JWT configuration options
 */
export interface JwtConfig {
  /**
   * Secret key for HS256/symmetric signing.
   * Must be at least 32 characters for security.
   */
  secret: string;

  /**
   * Token issuer. Defaults to "easy-auth".
   */
  issuer?: string;

  /**
   * Token audience. Optional.
   */
  audience?: string | string[];

  /**
   * Token expiration time.
   * Can be expressed in seconds or a time span string (e.g. "1h", "7d", "30d").
   * Defaults to "7d".
   */
  expiresIn?: string | number;

  /**
   * Algorithm used for signing. Defaults to "HS256".
   */
  algorithm?: string;

  /**
   * Whitelist of metadata keys to embed in the JWT payload.
   * If omitted, user.metadata is included while automatically omitting known sensitive fields (password, secret, totpSecret).
   */
  metadataKeys?: string[];
}

/**
 * Options when signing a token
 */
export interface SignJwtOptions {
  /**
   * Override expiration time for this specific token
   */
  expiresIn?: string | number;

  /**
   * Array of provider names currently associated with this user
   */
  identities?: string[];

  /**
   * Custom extra payload attributes to include in the token
   */
  extraPayload?: Record<string, any>;
}

export type { EasyAuthJwtPayload };
