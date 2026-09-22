/**
 * Easy Auth Error Code definitions
 */
export type ErrorCode =
  | "PROVIDER_NOT_FOUND"
  | "INVALID_CREDENTIALS"
  | "TOKEN_INVALID"
  | "TOKEN_EXPIRED"
  | "USER_NOT_FOUND"
  | "IDENTITY_ALREADY_LINKED"
  | "CANNOT_UNLINK_LAST_IDENTITY"
  | "STORAGE_ERROR"
  | "CONFIG_ERROR"
  | "RATE_LIMIT_EXCEEDED"
  | "NETWORK_ERROR";

const ERROR_STATUS_MAP: Record<ErrorCode, number> = {
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
  CONFIG_ERROR: 500,
};

/**
 * Standard error class for Easy Auth SDK
 */
export class EasyAuthError extends Error {
  public readonly code: ErrorCode;
  public readonly statusCode: number;
  public readonly details?: unknown;

  constructor(code: ErrorCode, message?: string, details?: unknown) {
    super(message || code);
    this.name = "EasyAuthError";
    this.code = code;
    this.statusCode = ERROR_STATUS_MAP[code] ?? 500;
    this.details = details;

    // Restore prototype chain
    Object.setPrototypeOf(this, new.target.prototype);
  }
}
