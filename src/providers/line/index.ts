import type { AuthProvider, ExtractedIdentity } from "../base.js";
import { EasyAuthError } from "../../core/errors.js";

export interface LineCredentials {
  /**
   * Authorization code returned from LINE Login
   */
  code?: string;

  /**
   * Redirect URI configured for LINE Login
   */
  redirectUri?: string;

  /**
   * LINE OpenID Connect ID Token (optional)
   */
  idToken?: string;

  /**
   * Existing access token (optional)
   */
  accessToken?: string;
}

export interface LineProfile {
  name?: string;
  avatar?: string;
  statusMessage?: string;
  email?: string;
}

export interface LineProviderOptions {
  /**
   * LINE Channel ID
   */
  channelId: string;

  /**
   * LINE Channel Secret
   */
  channelSecret?: string;

  /**
   * Request timeout in milliseconds for HTTP calls. Defaults to 10000ms.
   */
  timeoutMs?: number;

  /**
   * Custom fetch function (useful for unit testing or corporate proxies)
   */
  fetchFn?: typeof fetch;
}

/**
 * Built-in LINE Login authentication provider.
 * Supports standard LINE Login v2.1 OAuth 2.0 authorization code flow and ID Token verification.
 */
export class LineProvider implements AuthProvider<LineCredentials, LineProfile> {
  readonly name = "line";
  readonly type = "oauth2";
  private readonly options: LineProviderOptions;
  private readonly fetchImpl: typeof fetch;
  private readonly timeoutMs: number;

  constructor(options: LineProviderOptions) {
    if (!options || !options.channelId) {
      throw new EasyAuthError("CONFIG_ERROR", "LineProvider requires a valid 'channelId'.");
    }

    this.options = options;
    this.fetchImpl = options.fetchFn || globalThis.fetch;
    this.timeoutMs = options.timeoutMs ?? 10000;
  }

  async verifyAndExtract(credentials: LineCredentials): Promise<ExtractedIdentity<LineProfile>> {
    if (!credentials) {
      throw new EasyAuthError("INVALID_CREDENTIALS", "LINE credentials are required.");
    }

    // Mode 1: ID Token verification
    if (credentials.idToken) {
      return this.verifyIdToken(credentials.idToken);
    }

    // Mode 2: Authorization code exchange
    if (credentials.code) {
      return this.exchangeCode(credentials.code, credentials.redirectUri);
    }

    // Mode 3: Direct Access Token profile retrieval
    if (credentials.accessToken) {
      return this.fetchProfileByAccessToken(credentials.accessToken);
    }

    throw new EasyAuthError(
      "INVALID_CREDENTIALS",
      "LINE credentials must provide 'code', 'idToken', or 'accessToken'."
    );
  }

  private async verifyIdToken(idToken: string): Promise<ExtractedIdentity<LineProfile>> {
    try {
      const params = new URLSearchParams({
        id_token: idToken,
        client_id: this.options.channelId,
      });

      const res = await this.fetchImpl("https://api.line.me/oauth2/v2.1/verify", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: params.toString(),
        signal: AbortSignal.timeout(this.timeoutMs),
      });

      if (!res.ok) {
        throw new Error(`LINE verify endpoint returned status ${res.status}`);
      }

      const info: any = await res.json();
      if (info.error_description || info.error) {
        throw new Error(info.error_description || info.error);
      }

      if (!info.sub) {
        throw new Error("Missing subject (sub) in LINE ID token verification.");
      }

      return {
        providerUserId: info.sub,
        profile: {
          name: info.name,
          avatar: info.picture,
          email: info.email,
        },
      };
    } catch (err: any) {
      const isNetwork = err?.name === "TimeoutError" || err?.name === "AbortError" || err?.code === "ECONNREFUSED" || err?.code === "ENOTFOUND";
      const code = isNetwork ? "NETWORK_ERROR" : "INVALID_CREDENTIALS";
      throw new EasyAuthError(code, `LINE ID Token verification failed: ${err.message}`, err);
    }
  }

  private async exchangeCode(code: string, redirectUri?: string): Promise<ExtractedIdentity<LineProfile>> {
    if (!this.options.channelSecret) {
      throw new EasyAuthError("CONFIG_ERROR", "LINE channelSecret is required to exchange authorization code.");
    }
    if (!redirectUri) {
      throw new EasyAuthError("CONFIG_ERROR", "LINE authorization code exchange requires 'redirectUri'.");
    }

    try {
      const params = new URLSearchParams({
        grant_type: "authorization_code",
        code,
        redirect_uri: redirectUri,
        client_id: this.options.channelId,
        client_secret: this.options.channelSecret,
      });

      const res = await this.fetchImpl("https://api.line.me/oauth2/v2.1/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: params.toString(),
        signal: AbortSignal.timeout(this.timeoutMs),
      });

      if (!res.ok) {
        throw new Error(`LINE token endpoint returned status ${res.status}`);
      }

      const tokenData: any = await res.json();
      if (!tokenData.access_token) {
        throw new Error(tokenData.error_description || "Missing access_token from LINE response.");
      }

      return await this.fetchProfileByAccessToken(tokenData.access_token);
    } catch (err: any) {
      const isNetwork = err?.name === "TimeoutError" || err?.name === "AbortError" || err?.code === "ECONNREFUSED" || err?.code === "ENOTFOUND";
      const code = isNetwork ? "NETWORK_ERROR" : "INVALID_CREDENTIALS";
      throw new EasyAuthError(code, `LINE code exchange failed: ${err.message}`, err);
    }
  }

  private async fetchProfileByAccessToken(accessToken: string): Promise<ExtractedIdentity<LineProfile>> {
    try {
      const res = await this.fetchImpl("https://api.line.me/v2/profile", {
        headers: { Authorization: `Bearer ${accessToken}` },
        signal: AbortSignal.timeout(this.timeoutMs),
      });

      if (!res.ok) {
        throw new Error(`LINE profile endpoint returned status ${res.status}`);
      }

      const profile: any = await res.json();
      if (!profile.userId) {
        throw new Error("Missing userId in LINE profile response.");
      }

      return {
        providerUserId: profile.userId,
        profile: {
          name: profile.displayName,
          avatar: profile.pictureUrl,
          statusMessage: profile.statusMessage,
        },
      };
    } catch (err: any) {
      const isNetwork = err?.name === "TimeoutError" || err?.name === "AbortError" || err?.code === "ECONNREFUSED" || err?.code === "ENOTFOUND";
      const code = isNetwork ? "NETWORK_ERROR" : "INVALID_CREDENTIALS";
      throw new EasyAuthError(code, `LINE profile fetch failed: ${err.message}`, err);
    }
  }
}
