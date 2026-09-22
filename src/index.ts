/**
 * Easy Auth — Universal Multi-Provider Authentication & Identity Linking SDK
 */

// Main Facade
export { EasyAuth } from "./easy-auth.js";
export type { EasyAuthOptions, DatabaseConfig } from "./easy-auth.js";

// Core Models, Types & Errors
export {
  EasyAuthError,
} from "./core/errors.js";
export type { ErrorCode } from "./core/errors.js";

export type {
  User,
  Identity,
  AuthResult,
  VerifyResult,
  VerifyOptions,
  EasyAuthJwtPayload,
  CreateUserData,
  CreateIdentityData,
} from "./core/types.js";

export { AuthEngine } from "./core/auth-engine.js";
export type { AuthEngineDependencies } from "./core/auth-engine.js";

// Storage Adapters
export type { StorageAdapter } from "./storage/base.js";
export { MemoryStorageAdapter } from "./storage/memory.js";
export type { MemoryStorageOptions } from "./storage/memory.js";
export { SqliteStorageAdapter } from "./storage/sqlite.js";
export type { SqliteStorageOptions } from "./storage/sqlite.js";
export { PostgresStorageAdapter } from "./storage/postgres.js";
export type { PostgresStorageOptions, PostgresQueryRunner } from "./storage/postgres.js";

// JWT Subsystem
export { JwtService } from "./jwt/jwt-service.js";
export type { JwtConfig, SignJwtOptions } from "./jwt/types.js";

// Providers
export type {
  AuthProvider,
  ExtractedIdentity,
  FunctionalAuthProvider,
} from "./providers/base.js";
export { ProviderRegistry } from "./providers/registry.js";
export { OAuth2BaseProvider } from "./providers/oauth2-base.js";
export type {
  OAuth2BaseProviderOptions,
  OAuth2Credentials,
} from "./providers/oauth2-base.js";

// Web3 Provider
export { Web3Provider } from "./providers/web3/index.js";
export type {
  Web3Credentials,
  Web3ProviderOptions,
  Web3Profile,
} from "./providers/web3/index.js";

// Google Provider
export { GoogleProvider } from "./providers/google/index.js";
export type {
  GoogleCredentials,
  GoogleProviderOptions,
  GoogleProfile,
} from "./providers/google/index.js";

// LINE Provider
export { LineProvider } from "./providers/line/index.js";
export type {
  LineCredentials,
  LineProviderOptions,
  LineProfile,
} from "./providers/line/index.js";

// Google OTP / TOTP Provider
export { TotpProvider, GoogleOtpProvider, base32Decode, base32Encode } from "./providers/totp/index.js";
export type {
  TotpCredentials,
  TotpProviderOptions,
  TotpProfile,
} from "./providers/totp/index.js";

// NestJS Integration
export { EasyAuthModule } from "./nestjs/easy-auth.module.js";
export type { EasyAuthModuleAsyncOptions } from "./nestjs/easy-auth.module.js";
export { EasyAuthService } from "./nestjs/easy-auth.service.js";
export type { EasyAuthModuleOptions } from "./nestjs/easy-auth.service.js";
export { EasyAuthController } from "./nestjs/easy-auth.controller.js";
export { EasyAuthGuard } from "./nestjs/easy-auth.guard.js";
export { Public, CurrentUser } from "./nestjs/decorators.js";

export const VERSION = "0.1.0";
