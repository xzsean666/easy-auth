import { describe, it, expect, beforeEach } from "vitest";
import { JwtService } from "../../src/jwt/jwt-service.js";
import { EasyAuthError } from "../../src/core/errors.js";
import type { User } from "../../src/core/types.js";

describe("JwtService", () => {
  const secret = "a_super_secure_32_chars_secret_key!";
  let jwtService: JwtService;

  const mockUser: User = {
    id: "usr_test123",
    metadata: { name: "Alice", email: "alice@example.com", role: "admin" },
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(() => {
    jwtService = new JwtService({ secret });
  });

  describe("Initialization", () => {
    it("should throw CONFIG_ERROR if secret is missing or empty", () => {
      expect(() => new JwtService({ secret: "" })).toThrow(EasyAuthError);
      expect(() => new JwtService({ secret: "   " })).toThrow(EasyAuthError);
      expect(() => new JwtService(null as any)).toThrow(EasyAuthError);

      try {
        new JwtService({ secret: "" });
      } catch (err: any) {
        expect(err.code).toBe("CONFIG_ERROR");
        expect(err.statusCode).toBe(500);
      }
    });

    it("should throw CONFIG_ERROR if secret is shorter than 32 characters", () => {
      expect(() => new JwtService({ secret: "short-key-under-32-chars" })).toThrow(EasyAuthError);
      try {
        new JwtService({ secret: "short-key-under-32-chars" });
      } catch (err: any) {
        expect(err.code).toBe("CONFIG_ERROR");
        expect(err.message).toContain("at least 32 characters");
      }
    });
  });

  describe("Signing and Verifying", () => {
    it("should sign a valid JWT and verify it correctly", async () => {
      const token = await jwtService.sign(mockUser, {
        identities: ["web3", "google"],
        extraPayload: { orgId: "org_999" },
      });

      expect(typeof token).toBe("string");
      expect(token.split(".")).toHaveLength(3);

      const payload = await jwtService.verify(token);
      expect(payload.sub).toBe(mockUser.id);
      expect(payload.iss).toBe("easy-auth");
      expect(payload.metadata).toEqual(mockUser.metadata);
      expect(payload.identities).toEqual(["web3", "google"]);
      expect(payload.orgId).toBe("org_999");
      expect(typeof payload.iat).toBe("number");
      expect(typeof payload.exp).toBe("number");
      expect(payload.exp).toBeGreaterThan(payload.iat);
    });

    it("should support custom issuer and audience", async () => {
      const customService = new JwtService({
        secret,
        issuer: "my-custom-issuer",
        audience: "my-app",
      });

      const token = await customService.sign(mockUser);
      const payload = await customService.verify(token);

      expect(payload.iss).toBe("my-custom-issuer");
      expect(payload.aud).toBe("my-app");
    });
  });

  describe("Expiration Handling", () => {
    it("should reject expired token with TOKEN_EXPIRED error", async () => {
      const expiredToken = await jwtService.sign(mockUser, {
        expiresIn: "-10s",
      });

      await expect(jwtService.verify(expiredToken)).rejects.toThrow(EasyAuthError);

      try {
        await jwtService.verify(expiredToken);
      } catch (err: any) {
        expect(err.code).toBe("TOKEN_EXPIRED");
        expect(err.statusCode).toBe(401);
      }
    });
  });

  describe("Tampering & Invalid Token Handling", () => {
    it("should reject token with tampered signature with TOKEN_INVALID", async () => {
      const token = await jwtService.sign(mockUser);
      const parts = token.split(".");
      // Tamper signature
      const tampered = `${parts[0]}.${parts[1]}.invalidsignature`;

      await expect(jwtService.verify(tampered)).rejects.toThrow(EasyAuthError);

      try {
        await jwtService.verify(tampered);
      } catch (err: any) {
        expect(err.code).toBe("TOKEN_INVALID");
        expect(err.statusCode).toBe(401);
      }
    });

    it("should reject token with tampered payload with TOKEN_INVALID", async () => {
      const token = await jwtService.sign(mockUser);
      const parts = token.split(".");
      // Tamper payload (base64url for '{"sub":"usr_hacker"}')
      const tamperedPayload = Buffer.from(JSON.stringify({ sub: "usr_hacker" })).toString("base64url");
      const tampered = `${parts[0]}.${tamperedPayload}.${parts[2]}`;

      try {
        await jwtService.verify(tampered);
      } catch (err: any) {
        expect(err.code).toBe("TOKEN_INVALID");
        expect(err.statusCode).toBe(401);
      }
    });

    it("should reject token signed by a different secret", async () => {
      const otherService = new JwtService({ secret: "another_different_secret_key_32chars" });
      const foreignToken = await otherService.sign(mockUser);

      try {
        await jwtService.verify(foreignToken);
      } catch (err: any) {
        expect(err.code).toBe("TOKEN_INVALID");
        expect(err.statusCode).toBe(401);
      }
    });

    it("should reject malformed or empty token strings", async () => {
      await expect(jwtService.verify("")).rejects.toThrow(EasyAuthError);
      await expect(jwtService.verify("   ")).rejects.toThrow(EasyAuthError);
      await expect(jwtService.verify("not.a.token")).rejects.toThrow(EasyAuthError);
      await expect(jwtService.verify("singlepart")).rejects.toThrow(EasyAuthError);
    });
  });
});
