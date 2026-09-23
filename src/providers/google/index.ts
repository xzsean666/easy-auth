import { createRemoteJWKSet, jwtVerify } from "jose";
import type { AuthProvider, ExtractedIdentity } from "../base.js";
import { EasyAuthError } from "../../core/errors.js";

export interface GoogleCredentials {
  /**
   * OAuth 2.0 authorization code from frontend
   */
  code?: string;

  /**
   * Redirect URI used during the OAuth authorization flow
   */
  redirectUri?: string;

  /**
   * Code verifier for PKCE (optional)
   */
  codeVerifier?: string;

  /**
   * Google ID Token (e.g. from Google One Tap or Google Sign-In button)
   */
  idToken?: string;
}

export interface GoogleProfile {
  email?: string;
  name?: string;
  avatar?: string;
  emailVerified?: boolean;
}

export interface GoogleProviderOptions {
  /**
   * Google OAuth 2.0 Client ID (or array of Client IDs for multi-platform Web/iOS/Android)
   */
  clientId: string | string[];

  /**
   * Optional additional client IDs accepted for audience matching (e.g. mobile apps)
   */
  clientIds?: string[];

  /**
   * Google OAuth 2.0 Client Secret (optional if using client-side ID token verification only)
   */
  clientSecret?: string;

  /**
   * Request timeout in milliseconds for HTTP calls. Defaults to 10000ms.
   */
  timeoutMs?: number;

  /**
   * ID Token verification strategy:
   * - "jwks" (default): Fast in-memory cached cryptographic verification using Google's public JWKS (<1ms).
   * - "tokeninfo": Verification via Google's tokeninfo HTTP API.
   */
  idTokenVerificationMode?: "jwks" | "tokeninfo";

  /**
   * Custom fetch function (useful for unit testing or corporate proxies)
   */
  fetchFn?: typeof fetch;
}

/**
 * Built-in Google authentication provider.
 * Supports both standard OAuth 2.0 authorization code flow and direct ID Token verification.
 */
export class GoogleProvider implements AuthProvider<GoogleCredentials, GoogleProfile> {
  readonly name = "google";
  readonly type = "oauth2";
  private readonly options: GoogleProviderOptions;
  private readonly fetchImpl: typeof fetch;
  private readonly timeoutMs: number;

  // Cached Google JWKS public key set for high-performance zero-IO verification
  private static readonly googleJwks = createRemoteJWKSet(
    new URL("https://www.googleapis.com/oauth2/v3/certs")
  );

  constructor(options: GoogleProviderOptions) {
    const primaryId = Array.isArray(options?.clientId) ? options.clientId[0] : options?.clientId;
    if (!options || !primaryId) {
      throw new EasyAuthError("CONFIG_ERROR", "GoogleProvider requires a valid 'clientId'.");
    }

    this.options = options;
    this.fetchImpl = options.fetchFn || globalThis.fetch;
    this.timeoutMs = options.timeoutMs ?? 10000;
  }

  private getAllowedClientIds(): string[] {
    const list = Array.isArray(this.options.clientId) ? [...this.options.clientId] : [this.options.clientId];
    if (this.options.clientIds) {
      list.push(...this.options.clientIds);
    }
    return list.filter(Boolean);
  }

  async verifyAndExtract(credentials: GoogleCredentials): Promise<ExtractedIdentity<GoogleProfile>> {
    if (!credentials) {
      throw new EasyAuthError("INVALID_CREDENTIALS", "Google credentials are required.");
    }

    // Mode 1: Direct ID Token Verification
    if (credentials.idToken) {
      return this.verifyIdToken(credentials.idToken);
    }

    // Mode 2: Authorization Code Exchange
    if (credentials.code) {
      return this.exchangeCode(credentials.code, credentials.redirectUri, credentials.codeVerifier);
    }

    throw new EasyAuthError(
      "INVALID_CREDENTIALS",
      "Google credentials must provide either an 'authorization code' or an 'idToken'."
    );
  }

  private async verifyIdToken(idToken: string): Promise<ExtractedIdentity<GoogleProfile>> {
    const mode = this.options.idTokenVerificationMode ?? (this.options.fetchFn ? "tokeninfo" : "jwks");

    if (mode === "jwks") {
      try {
        const allowed = this.getAllowedClientIds();
        const { payload } = await jwtVerify(idToken, GoogleProvider.googleJwks, {
          issuer: ["https://accounts.google.com", "accounts.google.com"],
          audience: allowed.length === 1 ? allowed[0] : allowed,
        });

        if (!payload.sub || typeof payload.sub !== "string") {
          throw new Error("Missing subject (sub) in Google ID token.");
        }

        return {
          providerUserId: payload.sub,
          profile: {
            email: payload.email as string | undefined,
            name: payload.name as string | undefined,
            avatar: payload.picture as string | undefined,
            emailVerified: Boolean(payload.email_verified),
          },
        };
      } catch (err: any) {
        throw new EasyAuthError("INVALID_CREDENTIALS", `Google ID Token verification failed: ${err.message}`, err);
      }
    }

    return this.verifyIdTokenViaTokeninfo(idToken);
  }

  private async verifyIdTokenViaTokeninfo(idToken: string): Promise<ExtractedIdentity<GoogleProfile>> {
    try {
      const url = `https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(idToken)}`;
      const res = await this.fetchImpl(url, {
        method: "GET",
        signal: AbortSignal.timeout(this.timeoutMs),
      });

      if (!res.ok) {
        throw new Error(`Google tokeninfo endpoint returned status ${res.status}`);
      }

      const info: any = await res.json();

      if (info.error_description || info.error) {
        throw new Error(info.error_description || info.error);
      }

      // Check audience matches our allowed clientIds
      const allowed = this.getAllowedClientIds();
      if (allowed.length > 0 && !allowed.includes(info.aud)) {
        throw new Error(`Google ID Token audience mismatch: expected one of [${allowed.join(", ")}], got "${info.aud}".`);
      }

      if (!info.sub) {
        throw new Error("Missing subject (sub) in Google tokeninfo.");
      }

      return {
        providerUserId: info.sub,
        profile: {
          email: info.email,
          name: info.name,
          avatar: info.picture,
          emailVerified: info.email_verified === "true" || info.email_verified === true,
        },
      };
    } catch (err: any) {
      const isNetwork = err?.name === "TimeoutError" || err?.name === "AbortError" || err?.code === "ECONNREFUSED" || err?.code === "ENOTFOUND";
      const code = isNetwork ? "NETWORK_ERROR" : "INVALID_CREDENTIALS";
      throw new EasyAuthError(code, `Google ID Token verification failed: ${err.message}`, err);
    }
  }

  private async exchangeCode(
    code: string,
    redirectUri?: string,
    codeVerifier?: string
  ): Promise<ExtractedIdentity<GoogleProfile>> {
    if (!this.options.clientSecret) {
      throw new EasyAuthError(
        "CONFIG_ERROR",
        "Google clientSecret is required to exchange OAuth2 authorization code."
      );
    }

    const primaryClientId = Array.isArray(this.options.clientId) ? this.options.clientId[0] : this.options.clientId;

    try {
      const params = new URLSearchParams({
        code,
        client_id: primaryClientId,
        client_secret: this.options.clientSecret,
        grant_type: "authorization_code",
      });

      if (redirectUri) params.append("redirect_uri", redirectUri);
      if (codeVerifier) params.append("code_verifier", codeVerifier);

      const tokenRes = await this.fetchImpl("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: params.toString(),
        signal: AbortSignal.timeout(this.timeoutMs),
      });

      if (!tokenRes.ok) {
        throw new Error(`Google token endpoint returned status ${tokenRes.status}`);
      }

      const tokenData: any = await tokenRes.json();
      if (!tokenData.access_token) {
        throw new Error(tokenData.error_description || "Missing access_token from Google token response.");
      }

      // Fetch user profile from userinfo endpoint
      const userRes = await this.fetchImpl("https://www.googleapis.com/oauth2/v3/userinfo", {
        headers: { Authorization: `Bearer ${tokenData.access_token}` },
        signal: AbortSignal.timeout(this.timeoutMs),
      });

      if (!userRes.ok) {
        throw new Error(`Google userinfo endpoint returned status ${userRes.status}`);
      }

      const userInfo: any = await userRes.json();
      if (!userInfo.sub) {
        throw new Error("Missing subject (sub) in Google userinfo response.");
      }

      return {
        providerUserId: userInfo.sub,
        profile: {
          email: userInfo.email,
          name: userInfo.name,
          avatar: userInfo.picture,
          emailVerified: userInfo.email_verified,
        },
      };
    } catch (err: any) {
      const isNetwork = err?.name === "TimeoutError" || err?.name === "AbortError" || err?.code === "ECONNREFUSED" || err?.code === "ENOTFOUND";
      const code = isNetwork ? "NETWORK_ERROR" : "INVALID_CREDENTIALS";
      throw new EasyAuthError(code, `Google OAuth code exchange failed: ${err.message}`, err);
    }
  }

  /**
   * Generates standard Google OAuth 2.0 authorization URL for browser redirection.
   */
  getAuthorizationUrl(options: { redirectUri: string; state?: string; scope?: string }): string {
    const primaryClientId = Array.isArray(this.options.clientId) ? this.options.clientId[0] : this.options.clientId;
    const params = new URLSearchParams({
      client_id: primaryClientId,
      redirect_uri: options.redirectUri,
      response_type: "code",
      scope: options.scope || "openid email profile",
      access_type: "offline",
      prompt: "select_account",
    });
    if (options.state) {
      params.append("state", options.state);
    }
    return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
  }
}
