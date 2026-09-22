import { SignJWT, jwtVerify, errors as joseErrors } from "jose";
import type { JwtConfig, SignJwtOptions, EasyAuthJwtPayload } from "./types.js";
import type { User } from "../core/types.js";
import { EasyAuthError } from "../core/errors.js";

/**
 * Modern JWT subsystem for Easy Auth SDK based on standard `jose` library.
 */
export class JwtService {
  private readonly config: JwtConfig;
  private readonly key: Uint8Array;

  constructor(config: JwtConfig) {
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
      ...config,
    };

    this.key = new TextEncoder().encode(this.config.secret);
  }

  /**
   * Signs a unified JWT token for the given User
   */
  async sign(user: User, options?: SignJwtOptions): Promise<string> {
    const extra = options?.extraPayload ? { ...options.extraPayload } : {};
    const identities = options?.identities ? { identities: [...options.identities] } : {};

    let safeMetadata: Record<string, any> = {};
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
      ...extra,
    })
      .setProtectedHeader({ alg: this.config.algorithm || "HS256" })
      .setSubject(user.id)
      .setIssuer(this.config.issuer || "easy-auth")
      .setIssuedAt();

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
  async verify(token: string): Promise<EasyAuthJwtPayload> {
    if (!token || typeof token !== "string" || token.trim().length === 0) {
      throw new EasyAuthError("TOKEN_INVALID", "Token string is empty or invalid.");
    }

    try {
      const { payload } = await jwtVerify(token, this.key, {
        issuer: this.config.issuer,
        audience: this.config.audience,
        algorithms: [this.config.algorithm || "HS256"],
      });

      if (!payload.sub || typeof payload.sub !== "string") {
        throw new EasyAuthError("TOKEN_INVALID", "JWT claim validation failed: missing subject (sub).");
      }

      return payload as unknown as EasyAuthJwtPayload;
    } catch (err: any) {
      if (err instanceof EasyAuthError) {
        throw err;
      }
      if (err instanceof joseErrors.JWTExpired || err?.code === "ERR_JWT_EXPIRED") {
        throw new EasyAuthError("TOKEN_EXPIRED", "The provided token has expired.", err);
      }
      throw new EasyAuthError("TOKEN_INVALID", err?.message || "Invalid or tampered token.", err);
    }
  }
}
