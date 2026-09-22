/**
 * Core domain types and models for Easy Auth SDK
 */

export interface User {
  id: string;                      // Unique user ID (e.g. usr_...)
  metadata: Record<string, any>;   // User profile/attributes (name, avatar, email, roles, etc.)
  createdAt: Date;                 // Registration timestamp
  updatedAt: Date;                 // Last updated timestamp
}

export interface Identity {
  id: string;                      // Unique identity record ID (e.g. idn_...)
  userId: string;                  // Easy Auth User.id
  provider: string;                // Provider identifier (e.g. "web3", "google", "github")
  providerUserId: string;          // Global unique identifier in the provider's domain (e.g. lowercase wallet address, sub)
  profile?: Record<string, any>;   // Provider-specific profile snapshot
  createdAt: Date;                 // Linked timestamp
  updatedAt: Date;                 // Last updated timestamp
}

export interface AuthResult {
  user: User;                      // Unified user entity
  identity: Identity;              // Identity used for this authentication
  token: string;                   // Unified JWT token
  isNewUser: boolean;              // True if user was newly created in this auth flow
  loginType: string;               // Specific provider/method used for this login (e.g. "web3", "google")
}

export interface EasyAuthJwtPayload {
  sub: string;                      // Easy Auth User ID
  iss: string;                      // Issuer (e.g. "easy-auth")
  aud?: string;                     // Audience
  iat: number;                      // Issued at (seconds)
  exp: number;                      // Expiration (seconds)
  metadata?: Record<string, any>;   // Metadata snapshot
  identities?: string[];            // Provider names summary
  [key: string]: any;
}

export interface VerifyOptions {
  /**
   * If true (default), loads the latest User record from the storage adapter.
   * If false, extracts user info directly from the JWT payload for stateless zero-IO verification.
   */
  fetchUser?: boolean;
}

export interface VerifyResult {
  userId: string;                  // Unified User ID (sub)
  metadata: Record<string, any>;   // User metadata snapshot or real-time record
  user: User;                      // Full User object
  payload: EasyAuthJwtPayload;     // Decoded JWT payload
}

export interface CreateUserData {
  id?: string;
  metadata?: Record<string, any>;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface CreateIdentityData {
  id?: string;
  userId: string;
  provider: string;
  providerUserId: string;
  profile?: Record<string, any>;
  createdAt?: Date;
  updatedAt?: Date;
}
