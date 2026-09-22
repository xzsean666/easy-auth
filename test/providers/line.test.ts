import { describe, it, expect, vi } from "vitest";
import { LineProvider } from "../../src/providers/line/index.js";
import { EasyAuthError } from "../../src/core/errors.js";

describe("LineProvider", () => {
  describe("ID Token Mode", () => {
    it("should verify valid LINE ID Token and extract user profile", async () => {
      const mockFetch = vi.fn(async (url: string | URL | Request) => {
        const urlStr = url.toString();
        if (urlStr.includes("api.line.me/oauth2/v2.1/verify")) {
          return new Response(
            JSON.stringify({
              sub: "U1234567890abcdef1234567890abcdef",
              name: "LINE User",
              picture: "https://profile.line-scdn.net/abc",
              email: "lineuser@example.com",
            }),
            { status: 200, headers: { "Content-Type": "application/json" } }
          );
        }
        return new Response("Not found", { status: 404 });
      }) as unknown as typeof fetch;

      const provider = new LineProvider({
        channelId: "1234567890",
        fetchFn: mockFetch,
      });

      const result = await provider.verifyAndExtract({
        idToken: "valid_line_id_token",
      });

      expect(result.providerUserId).toBe("U1234567890abcdef1234567890abcdef");
      expect(result.profile?.name).toBe("LINE User");
      expect(result.profile?.avatar).toBe("https://profile.line-scdn.net/abc");
      expect(result.profile?.email).toBe("lineuser@example.com");
    });
  });

  describe("Authorization Code Mode", () => {
    it("should exchange code for access_token and fetch LINE profile", async () => {
      const mockFetch = vi.fn(async (url: string | URL | Request) => {
        const urlStr = url.toString();
        if (urlStr.includes("api.line.me/oauth2/v2.1/token")) {
          return new Response(
            JSON.stringify({
              access_token: "line_access_token_123",
              token_type: "Bearer",
              expires_in: 2592000,
            }),
            { status: 200, headers: { "Content-Type": "application/json" } }
          );
        }
        if (urlStr.includes("api.line.me/v2/profile")) {
          return new Response(
            JSON.stringify({
              userId: "U99999999999999999999999999999999",
              displayName: "Alice In Line",
              pictureUrl: "https://profile.line-scdn.net/alice",
              statusMessage: "Hello Easy Auth!",
            }),
            { status: 200, headers: { "Content-Type": "application/json" } }
          );
        }
        return new Response("Not found", { status: 404 });
      }) as unknown as typeof fetch;

      const provider = new LineProvider({
        channelId: "1234567890",
        channelSecret: "channel_secret_secret",
        fetchFn: mockFetch,
      });

      const result = await provider.verifyAndExtract({
        code: "line_code_from_redirect",
        redirectUri: "https://example.com/line/callback",
      });

      expect(result.providerUserId).toBe("U99999999999999999999999999999999");
      expect(result.profile?.name).toBe("Alice In Line");
      expect(result.profile?.avatar).toBe("https://profile.line-scdn.net/alice");
      expect(result.profile?.statusMessage).toBe("Hello Easy Auth!");
    });
  });

  describe("Access Token Mode", () => {
    it("should directly fetch profile with accessToken", async () => {
      const mockFetch = vi.fn(async (url: string | URL | Request) => {
        const urlStr = url.toString();
        if (urlStr.includes("api.line.me/v2/profile")) {
          return new Response(
            JSON.stringify({
              userId: "Udirect_access_user",
              displayName: "Direct User",
            }),
            { status: 200, headers: { "Content-Type": "application/json" } }
          );
        }
        return new Response("Not found", { status: 404 });
      }) as unknown as typeof fetch;

      const provider = new LineProvider({
        channelId: "1234567890",
        fetchFn: mockFetch,
      });

      const result = await provider.verifyAndExtract({
        accessToken: "direct_access_token",
      });

      expect(result.providerUserId).toBe("Udirect_access_user");
      expect(result.profile?.name).toBe("Direct User");
    });
  });
});
