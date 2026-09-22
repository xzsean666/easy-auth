import { describe, it, expect, vi } from "vitest";
import { OAuth2BaseProvider } from "../../src/providers/oauth2-base.js";
import { ProviderRegistry } from "../../src/providers/registry.js";
import { EasyAuthError } from "../../src/core/errors.js";

describe("OAuth2BaseProvider and ProviderRegistry", () => {
  describe("ProviderRegistry", () => {
    it("should register and retrieve class-based providers", () => {
      const registry = new ProviderRegistry();
      const mockProvider = {
        name: "test-oauth",
        verifyAndExtract: vi.fn(),
      };

      registry.register(mockProvider);
      expect(registry.has("test-oauth")).toBe(true);
      expect(registry.has("TEST-OAUTH")).toBe(true);
      expect(registry.get("test-oauth")).toBe(mockProvider);
      expect(registry.list()).toEqual(["test-oauth"]);
    });

    it("should register and retrieve functional providers", async () => {
      const registry = new ProviderRegistry();
      registry.registerFunction("sms-otp", async (creds: { phone: string; code: string }) => {
        if (creds.code !== "123456") throw new EasyAuthError("INVALID_CREDENTIALS");
        return { providerUserId: creds.phone, profile: { phone: creds.phone } };
      });

      expect(registry.has("sms-otp")).toBe(true);
      const provider = registry.get("sms-otp");
      const result = await provider.verifyAndExtract({ phone: "+1234567890", code: "123456" });
      expect(result.providerUserId).toBe("+1234567890");
    });

    it("should throw PROVIDER_NOT_FOUND when getting unknown provider", () => {
      const registry = new ProviderRegistry();
      expect(() => registry.get("non-existent")).toThrow(EasyAuthError);
      try {
        registry.get("non-existent");
      } catch (err: any) {
        expect(err.code).toBe("PROVIDER_NOT_FOUND");
        expect(err.statusCode).toBe(400);
      }
    });
  });

  describe("OAuth2BaseProvider Execution Flow", () => {
    it("should successfully exchange code and map user profile", async () => {
      const mockFetch = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
        const urlStr = url.toString();
        if (urlStr === "https://github.com/login/oauth/access_token") {
          return new Response(JSON.stringify({ access_token: "mock_access_token_123" }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        }
        if (urlStr === "https://api.github.com/user") {
          return new Response(
            JSON.stringify({
              id: 12345678,
              login: "octocat",
              name: "monalisa",
              avatar_url: "https://github.com/images/error/octocat_happy.gif",
            }),
            {
              status: 200,
              headers: { "Content-Type": "application/json" },
            }
          );
        }
        return new Response("Not found", { status: 404 });
      }) as unknown as typeof fetch;

      const githubProvider = new OAuth2BaseProvider({
        name: "github",
        clientId: "mock_client_id",
        clientSecret: "mock_client_secret",
        tokenEndpoint: "https://github.com/login/oauth/access_token",
        userInfoEndpoint: "https://api.github.com/user",
        fetchFn: mockFetch,
        mapProfile: (rawUser) => ({
          providerUserId: String(rawUser.id),
          profile: {
            username: rawUser.login,
            name: rawUser.name,
            avatar: rawUser.avatar_url,
          },
        }),
      });

      const result = await githubProvider.verifyAndExtract({
        code: "valid_oauth_code",
      });

      expect(result.providerUserId).toBe("12345678");
      expect(result.profile?.username).toBe("octocat");
      expect(result.profile?.name).toBe("monalisa");
    });

    it("should fail when token endpoint returns error", async () => {
      const mockFetch = vi.fn(async () => {
        return new Response(
          JSON.stringify({
            error: "bad_verification_code",
            error_description: "The code passed is incorrect or expired.",
          }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" },
          }
        );
      }) as unknown as typeof fetch;

      const provider = new OAuth2BaseProvider({
        name: "test",
        clientId: "cid",
        clientSecret: "csec",
        tokenEndpoint: "https://example.com/oauth/token",
        userInfoEndpoint: "https://example.com/oauth/user",
        fetchFn: mockFetch,
        mapProfile: (u) => ({ providerUserId: u.id }),
      });

      await expect(provider.verifyAndExtract({ code: "expired_code" })).rejects.toThrow(EasyAuthError);
    });

    it("should fail when code is missing", async () => {
      const provider = new OAuth2BaseProvider({
        name: "test",
        clientId: "cid",
        clientSecret: "csec",
        tokenEndpoint: "https://example.com/oauth/token",
        userInfoEndpoint: "https://example.com/oauth/user",
        mapProfile: (u) => ({ providerUserId: u.id }),
      });

      await expect(provider.verifyAndExtract({ code: "" })).rejects.toThrow(EasyAuthError);
    });

    it("should use application/x-www-form-urlencoded by default per RFC 6749", async () => {
      let capturedContentType = "";
      let capturedBody = "";

      const mockFetch = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
        const urlStr = url.toString();
        if (urlStr === "https://example.com/oauth/token") {
          capturedContentType = (init?.headers as any)?.["Content-Type"];
          capturedBody = String(init?.body);
          return new Response(JSON.stringify({ access_token: "tok_123" }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        }
        if (urlStr === "https://example.com/oauth/user") {
          return new Response(JSON.stringify({ id: "user_1" }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        }
        return new Response("Not found", { status: 404 });
      }) as unknown as typeof fetch;

      const provider = new OAuth2BaseProvider({
        name: "standard-rfc",
        clientId: "my_client",
        clientSecret: "my_secret",
        tokenEndpoint: "https://example.com/oauth/token",
        userInfoEndpoint: "https://example.com/oauth/user",
        fetchFn: mockFetch,
        mapProfile: () => ({ providerUserId: "user_1" }),
      });

      await provider.verifyAndExtract({ code: "code_abc", redirectUri: "https://app.com/cb" });

      expect(capturedContentType).toBe("application/x-www-form-urlencoded");
      expect(capturedBody).toContain("client_id=my_client");
      expect(capturedBody).toContain("client_secret=my_secret");
      expect(capturedBody).toContain("grant_type=authorization_code");
      expect(capturedBody).toContain("redirect_uri=https%3A%2F%2Fapp.com%2Fcb");
    });
  });
});
