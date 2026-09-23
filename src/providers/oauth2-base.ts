import type { AuthProvider, ExtractedIdentity } from "./base.js";
import { EasyAuthError } from "../core/errors.js";

export interface OAuth2Credentials {
  code: string;
  redirectUri?: string;
  codeVerifier?: string;
}

export interface OAuth2BaseProviderOptions<TProfile = any> {
  name: string;
  clientId: string;
  clientSecret: string;
  tokenEndpoint: string;
  userInfoEndpoint: string;
  authorizationEndpoint?: string;
  scope?: string;
  mapProfile: (
    rawUserInfo: any,
    tokenResponse: any
  ) => {
    providerUserId: string;
    profile?: TProfile;
  };
  headers?: Record<string, string>;
  /**
   * Content-Type format for the token endpoint POST request.
   * Defaults to "form" (application/x-www-form-urlencoded) per RFC 6749 Section 4.1.3.
   * Can be set to "json" (application/json) for non-standard providers.
   */
  contentType?: "form" | "json";
  /**
   * Request timeout in milliseconds for HTTP calls. Defaults to 10000ms.
   */
  timeoutMs?: number;
  /**
   * Custom fetch function (useful for unit testing or proxies)
   */
  fetchFn?: typeof fetch;
}

/**
 * Declarative OAuth2 base provider.
 * Allows instant onboarding of standard OAuth2 / OIDC providers
 * (such as GitHub, Discord, Apple, Google, Slack, etc.) without writing custom HTTP code.
 */
export class OAuth2BaseProvider<TProfile = any> implements AuthProvider<OAuth2Credentials, TProfile> {
  readonly name: string;
  readonly type = "oauth2";
  private readonly options: OAuth2BaseProviderOptions<TProfile>;
  private readonly fetchImpl: typeof fetch;
  private readonly timeoutMs: number;
  private readonly contentType: "form" | "json";

  constructor(options: OAuth2BaseProviderOptions<TProfile>) {
    if (!options.name) throw new EasyAuthError("CONFIG_ERROR", "OAuth2 provider name is required.");
    if (!options.clientId) throw new EasyAuthError("CONFIG_ERROR", "OAuth2 clientId is required.");
    if (!options.clientSecret) throw new EasyAuthError("CONFIG_ERROR", "OAuth2 clientSecret is required.");
    if (!options.tokenEndpoint) throw new EasyAuthError("CONFIG_ERROR", "OAuth2 tokenEndpoint is required.");
    if (!options.userInfoEndpoint) throw new EasyAuthError("CONFIG_ERROR", "OAuth2 userInfoEndpoint is required.");
    if (typeof options.mapProfile !== "function") {
      throw new EasyAuthError("CONFIG_ERROR", "OAuth2 mapProfile function is required.");
    }

    this.name = options.name.toLowerCase();
    this.options = options;
    this.fetchImpl = options.fetchFn || globalThis.fetch;
    this.timeoutMs = options.timeoutMs ?? 10000;
    this.contentType = options.contentType ?? "form";
  }

  async verifyAndExtract(credentials: OAuth2Credentials): Promise<ExtractedIdentity<TProfile>> {
    if (!credentials || !credentials.code || typeof credentials.code !== "string" || credentials.code.trim().length === 0) {
      throw new EasyAuthError("INVALID_CREDENTIALS", "Authorization code is required for OAuth2 authentication.");
    }

    // 1. Exchange code for access token
    let tokenData: any;
    try {
      let reqBody: string;
      const headers: Record<string, string> = {
        Accept: "application/json",
        ...(this.options.headers || {}),
      };

      if (this.contentType === "json") {
        headers["Content-Type"] = "application/json";
        const bodyObj: Record<string, string> = {
          client_id: this.options.clientId,
          client_secret: this.options.clientSecret,
          code: credentials.code,
          grant_type: "authorization_code",
        };
        if (credentials.redirectUri) bodyObj.redirect_uri = credentials.redirectUri;
        if (credentials.codeVerifier) bodyObj.code_verifier = credentials.codeVerifier;
        reqBody = JSON.stringify(bodyObj);
      } else {
        // Standard RFC 6749 application/x-www-form-urlencoded
        headers["Content-Type"] = "application/x-www-form-urlencoded";
        const params = new URLSearchParams({
          client_id: this.options.clientId,
          client_secret: this.options.clientSecret,
          code: credentials.code,
          grant_type: "authorization_code",
        });
        if (credentials.redirectUri) params.append("redirect_uri", credentials.redirectUri);
        if (credentials.codeVerifier) params.append("code_verifier", credentials.codeVerifier);
        reqBody = params.toString();
      }

      const res = await this.fetchImpl(this.options.tokenEndpoint, {
        method: "POST",
        headers,
        body: reqBody,
        signal: AbortSignal.timeout(this.timeoutMs),
      });

      if (!res.ok) {
        throw new Error(`Token endpoint responded with status ${res.status} ${res.statusText}`);
      }

      tokenData = await res.json();
    } catch (err: any) {
      const isNetwork = err?.name === "TimeoutError" || err?.name === "AbortError" || err?.code === "ECONNREFUSED" || err?.code === "ENOTFOUND";
      const code = isNetwork ? "NETWORK_ERROR" : "INVALID_CREDENTIALS";
      throw new EasyAuthError(code, `OAuth2 token exchange failed: ${err.message}`, err);
    }

    if (!tokenData || tokenData.error || !tokenData.access_token) {
      const errorMsg = tokenData?.error_description || tokenData?.error || "Missing access_token in response";
      throw new EasyAuthError("INVALID_CREDENTIALS", `OAuth2 token exchange error: ${errorMsg}`);
    }

    // 2. Fetch user profile
    let rawUserInfo: any;
    try {
      const userRes = await this.fetchImpl(this.options.userInfoEndpoint, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${tokenData.access_token}`,
          Accept: "application/json",
          ...(this.options.headers || {}),
        },
        signal: AbortSignal.timeout(this.timeoutMs),
      });

      if (!userRes.ok) {
        throw new Error(`User info endpoint responded with status ${userRes.status} ${userRes.statusText}`);
      }

      rawUserInfo = await userRes.json();
    } catch (err: any) {
      const isNetwork = err?.name === "TimeoutError" || err?.name === "AbortError" || err?.code === "ECONNREFUSED" || err?.code === "ENOTFOUND";
      const code = isNetwork ? "NETWORK_ERROR" : "INVALID_CREDENTIALS";
      throw new EasyAuthError(code, `Failed to retrieve OAuth2 user info: ${err.message}`, err);
    }

    // 3. Map profile using provided schema
    const mapped = this.options.mapProfile(rawUserInfo, tokenData);
    if (!mapped || !mapped.providerUserId || typeof mapped.providerUserId !== "string" || mapped.providerUserId.trim().length === 0) {
      throw new EasyAuthError("INVALID_CREDENTIALS", "mapProfile did not return a valid providerUserId.");
    }

    return {
      providerUserId: mapped.providerUserId.trim(),
      profile: mapped.profile,
    };
  }

  /**
   * Generates standard OAuth2 authorization URL for browser redirection.
   */
  getAuthorizationUrl(options: { redirectUri: string; state?: string; scope?: string }): string {
    if (!this.options.authorizationEndpoint) {
      throw new EasyAuthError("CONFIG_ERROR", `OAuth2 provider "${this.name}" has no authorizationEndpoint configured.`);
    }
    const params = new URLSearchParams({
      response_type: "code",
      client_id: this.options.clientId,
      redirect_uri: options.redirectUri,
      scope: options.scope || this.options.scope || "openid profile email",
    });
    if (options.state) {
      params.append("state", options.state);
    }
    return `${this.options.authorizationEndpoint}?${params.toString()}`;
  }
}
