import { describe, it, expect } from "vitest";
import {
  TotpProvider,
  GoogleOtpProvider,
  base32Encode,
  base32Decode,
} from "../../src/providers/totp/index.js";
import { EasyAuthError } from "../../src/core/errors.js";

describe("TotpProvider (Google Authenticator / Google OTP)", () => {
  describe("Base32 Encode & Decode", () => {
    it("should correctly encode and decode buffer", () => {
      const original = Buffer.from("Hello Easy Auth!");
      const encoded = base32Encode(original);
      const decoded = base32Decode(encoded);
      expect(decoded.toString()).toBe("Hello Easy Auth!");
    });

    it("should throw error for invalid base32 characters", () => {
      expect(() => base32Decode("INVALID!CHAR89")).toThrow();
    });
  });

  describe("TOTP Token Generation & Verification", () => {
    const secret = TotpProvider.generateSecret(20);

    it("should generate a valid 6-digit string token", () => {
      const token = TotpProvider.generateToken(secret);
      expect(typeof token).toBe("string");
      expect(token).toMatch(/^\d{6}$/);
    });

    it("should successfully verify current token", () => {
      const token = TotpProvider.generateToken(secret);
      const isValid = TotpProvider.verifyToken(secret, token);
      expect(isValid).toBe(true);
    });

    it("should reject invalid token", () => {
      const isValid = TotpProvider.verifyToken(secret, "999999");
      // Could by tiny chance match if current token is 999999, but let's test bad format
      expect(TotpProvider.verifyToken(secret, "12345")).toBe(false);
      expect(TotpProvider.verifyToken(secret, "abcdef")).toBe(false);
    });

    it("should tolerate clock drift within configured window (window: 1)", () => {
      const now = Date.now();
      // Token from 25 seconds ago (within 30s step)
      const pastToken = TotpProvider.generateToken(secret, { timestamp: now - 25000 });
      expect(TotpProvider.verifyToken(secret, pastToken, { timestamp: now, window: 1 })).toBe(true);

      // Token from 2 minutes ago (4 steps away) -> rejected with window 1
      const ancientToken = TotpProvider.generateToken(secret, { timestamp: now - 120000 });
      expect(TotpProvider.verifyToken(secret, ancientToken, { timestamp: now, window: 1 })).toBe(false);
    });

    it("should generate proper otpauth://totp/ URI for Google Authenticator QR codes", () => {
      const uri = TotpProvider.generateTotpUri({
        secret: "JBSWY3DPEHPK3PXP",
        accountName: "alice@example.com",
        issuer: "EasyAuthApp",
      });

      expect(uri).toContain("otpauth://totp/EasyAuthApp:alice%40example.com");
      expect(uri).toContain("secret=JBSWY3DPEHPK3PXP");
      expect(uri).toContain("issuer=EasyAuthApp");
      expect(uri).toContain("digits=6");
      expect(uri).toContain("period=30");
    });
  });

  describe("TotpProvider as AuthProvider", () => {
    it("should reject client-supplied secret by default to prevent auth bypass", async () => {
      const provider = new TotpProvider();
      const secret = TotpProvider.generateSecret(20);
      const code = TotpProvider.generateToken(secret);

      await expect(
        provider.verifyAndExtract({
          account: "victim@example.com",
          code,
          secret, // Attacker passes their own secret
        })
      ).rejects.toThrow(EasyAuthError);
    });

    it("should verify credentials with secret in payload when allowClientSecret is explicitly enabled", async () => {
      const provider = new TotpProvider({ allowClientSecret: true });
      const secret = TotpProvider.generateSecret(20);
      const code = TotpProvider.generateToken(secret);

      const result = await provider.verifyAndExtract({
        account: "Alice_User",
        code,
        secret,
      });

      expect(result.providerUserId).toBe("alice_user");
      expect(result.profile?.account).toBe("Alice_User");
    });

    it("should block replay attack when submitting the exact same code twice", async () => {
      const secret = TotpProvider.generateSecret(20);
      const provider = new TotpProvider({
        secret,
      });
      const code = TotpProvider.generateToken(secret);

      // First verification succeeds
      const first = await provider.verifyAndExtract({
        account: "charlie",
        code,
      });
      expect(first.providerUserId).toBe("charlie");

      // Second verification of same code within window MUST fail
      await expect(
        provider.verifyAndExtract({
          account: "charlie",
          code,
        })
      ).rejects.toThrow(EasyAuthError);
    });

    it("should verify credentials with resolver function in options", async () => {
      const secret = TotpProvider.generateSecret(20);
      const provider = new GoogleOtpProvider({
        name: "google-otp",
        secret: async (account) => {
          if (account === "bob") return secret;
          return null;
        },
      });

      const code = TotpProvider.generateToken(secret);

      const result = await provider.verifyAndExtract({
        account: "bob",
        code,
      });

      expect(result.providerUserId).toBe("bob");
      expect(provider.name).toBe("google-otp");
    });

    it("should reject when code is wrong or expired", async () => {
      const secret = TotpProvider.generateSecret(20);
      const provider = new TotpProvider({ secret });

      await expect(
        provider.verifyAndExtract({
          account: "alice",
          code: "000000",
        })
      ).rejects.toThrow(EasyAuthError);
    });

    it("should reject when secret is missing", async () => {
      const provider = new TotpProvider();

      await expect(
        provider.verifyAndExtract({
          account: "alice",
          code: "123456",
        })
      ).rejects.toThrow(EasyAuthError);
    });
  });
});
