import { describe, it, expect, vi } from "vitest";
import { GoogleProvider } from "../../src/providers/google/index.js";
import { EasyAuthError } from "../../src/core/errors.js";

describe("GoogleProvider", () => {
  describe("ID Token Mode", () => {
    it("should verify valid Google ID Token and extract user profile", async () => {
      const mockFetch = vi.fn(async (url: string | URL | Request) => {
        const urlStr = url.toString();
        if (urlStr.includes("oauth2.googleapis.com/tokeninfo")) {
          return new Response(
            JSON.stringify({
              sub: "google_sub_1092837465",
              email: "alice@gmail.com",
              name: "Alice Google",
              picture: "https://lh3.googleusercontent.com/photo.jpg",
              email_verified: "true",
              aud: "my_google_client_id",
            }),
            { status: 200, headers: { "Content-Type": "application/json" } }
          );
        }
        return new Response("Not found", { status: 404 });
      }) as unknown as typeof fetch;

      const provider = new GoogleProvider({
        clientId: "my_google_client_id",
        fetchFn: mockFetch,
      });

      const result = await provider.verifyAndExtract({
        idToken: "valid_google_id_token",
      });

      expect(result.providerUserId).toBe("google_sub_1092837465");
      expect(result.profile?.email).toBe("alice@gmail.com");
      expect(result.profile?.name).toBe("Alice Google");
      expect(result.profile?.avatar).toBe("https://lh3.googleusercontent.com/photo.jpg");
      expect(result.profile?.emailVerified).toBe(true);
    });

    it("should reject when audience mismatches clientId", async () => {
      const mockFetch = vi.fn(async () => {
        return new Response(
          JSON.stringify({
            sub: "google_sub_1092837465",
            aud: "wrong_client_id",
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      }) as unknown as typeof fetch;

      const provider = new GoogleProvider({
        clientId: "my_google_client_id",
        fetchFn: mockFetch,
      });

      await expect(provider.verifyAndExtract({ idToken: "bad_token" })).rejects.toThrow(EasyAuthError);
    });
  });

  describe("Authorization Code Mode", () => {
    it("should exchange code for access_token and fetch profile", async () => {
      const mockFetch = vi.fn(async (url: string | URL | Request) => {
        const urlStr = url.toString();
        if (urlStr.includes("oauth2.googleapis.com/token")) {
          return new Response(
            JSON.stringify({
              access_token: "google_access_token_abc",
              expires_in: 3600,
            }),
            { status: 200, headers: { "Content-Type": "application/json" } }
          );
        }
        if (urlStr.includes("googleapis.com/oauth2/v3/userinfo")) {
          return new Response(
            JSON.stringify({
              sub: "google_sub_code_123",
              email: "bob@gmail.com",
              name: "Bob Code",
              picture: "https://lh3.googleusercontent.com/bob.jpg",
              email_verified: true,
            }),
            { status: 200, headers: { "Content-Type": "application/json" } }
          );
        }
        return new Response("Not found", { status: 404 });
      }) as unknown as typeof fetch;

      const provider = new GoogleProvider({
        clientId: "my_google_client_id",
        clientSecret: "my_google_client_secret",
        fetchFn: mockFetch,
      });

      const result = await provider.verifyAndExtract({
        code: "oauth_auth_code_from_frontend",
        redirectUri: "https://example.com/oauth/callback",
      });

      expect(result.providerUserId).toBe("google_sub_code_123");
      expect(result.profile?.name).toBe("Bob Code");
      expect(result.profile?.email).toBe("bob@gmail.com");
    });
  });
});
