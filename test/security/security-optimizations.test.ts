import { describe, it, expect } from "vitest";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import {
  EasyAuth,
  Web3Provider,
  TotpProvider,
  GoogleOtpProvider,
  OAuth2BaseProvider,
  SqliteStorageAdapter,
  MemoryStorageAdapter,
  JwtService,
  EasyAuthError,
} from "../../src/index.js";
import { EasyAuthController } from "../../src/nestjs/easy-auth.controller.js";
import { EasyAuthService } from "../../src/nestjs/easy-auth.service.js";

describe("Security & Availability Audit Optimizations", () => {
  describe("SEC-01: NestJS Anti-IDOR & Authorization Protection", () => {
    it("should reject linking an identity to a different user than authenticated context (IDOR prevention)", async () => {
      const auth = new EasyAuth({
        jwt: { secret: "test-secret-key-32-chars-long-123456" },
        database: { type: "memory" },
      });
      auth.registerProvider("sms", async (c: { code: string }) => ({
        providerUserId: "+1234567890",
        profile: {},
      }));

      const service = new EasyAuthService({ jwt: { secret: "test-secret-key-32-chars-long-123456" } } as any);
      (service as any).auth = auth;
      const controller = new EasyAuthController(service);

      // Authenticated as Alice (usr_alice), trying to link to Bob (usr_bob)
      await expect(
        controller.link(
          { userId: "usr_bob", provider: "sms", credentials: { code: "123" } },
          "usr_alice" // currentUserId from guard
        )
      ).rejects.toThrow();

      try {
        await controller.link(
          { userId: "usr_bob", provider: "sms", credentials: { code: "123" } },
          "usr_alice"
        );
      } catch (err: any) {
        expect(err.getStatus()).toBe(403);
      }
    });

    it("should reject unlinking another user's identity", async () => {
      const auth = new EasyAuth({
        jwt: { secret: "test-secret-key-32-chars-long-123456" },
        database: { type: "memory" },
      });
      const service = new EasyAuthService({ jwt: { secret: "test-secret-key-32-chars-long-123456" } } as any);
      (service as any).auth = auth;
      const controller = new EasyAuthController(service);

      await expect(
        controller.unlink(
          { userId: "usr_victim", provider: "web3", providerUserId: "0x123" },
          "usr_attacker"
        )
      ).rejects.toThrow();

      try {
        await controller.unlink(
          { userId: "usr_victim", provider: "web3", providerUserId: "0x123" },
          "usr_attacker"
        );
      } catch (err: any) {
        expect(err.getStatus()).toBe(403);
      }
    });

    it("should reject querying another user's identities list", async () => {
      const auth = new EasyAuth({
        jwt: { secret: "test-secret-key-32-chars-long-123456" },
        database: { type: "memory" },
      });
      const service = new EasyAuthService({ jwt: { secret: "test-secret-key-32-chars-long-123456" } } as any);
      (service as any).auth = auth;
      const controller = new EasyAuthController(service);

      await expect(
        controller.listIdentities("usr_victim", "usr_attacker")
      ).rejects.toThrow();

      try {
        await controller.listIdentities("usr_victim", "usr_attacker");
      } catch (err: any) {
        expect(err.getStatus()).toBe(403);
      }
    });
  });

  describe("SEC-02: Anti-Lockout Race Condition & DB Atomicity", () => {
    it("should atomically prevent deleting the last identity when enforceMinimumCount is enabled in SQLite", async () => {
      const storage = new SqliteStorageAdapter({ path: ":memory:" });
      const user = await storage.createUser({ metadata: { name: "Alice" } });

      await storage.createIdentity({
        userId: user.id,
        provider: "web3",
        providerUserId: "0x1111",
      });

      // User has only 1 identity. Deletion with enforceMinimumCount must return false
      const deleted = await storage.deleteIdentity(user.id, "web3", "0x1111", {
        enforceMinimumCount: true,
      });
      expect(deleted).toBe(false);

      // Verify the identity is still intact
      const remaining = await storage.listIdentitiesByUserId(user.id);
      expect(remaining).toHaveLength(1);
    });

    it("should atomically allow deletion when more than 1 identity exists, but block concurrent second deletion", async () => {
      const storage = new SqliteStorageAdapter({ path: ":memory:" });
      const user = await storage.createUser({ metadata: { name: "Bob" } });

      await storage.createIdentity({
        userId: user.id,
        provider: "web3",
        providerUserId: "0x1111",
      });
      await storage.createIdentity({
        userId: user.id,
        provider: "google",
        providerUserId: "bob@google.com",
      });

      // Two concurrent unlinks: first should succeed, second must fail
      const firstDelete = await storage.deleteIdentity(user.id, "web3", "0x1111", {
        enforceMinimumCount: true,
      });
      expect(firstDelete).toBe(true);

      const secondDelete = await storage.deleteIdentity(user.id, "google", "bob@google.com", {
        enforceMinimumCount: true,
      });
      expect(secondDelete).toBe(false);

      // Account still has 1 identity and is NEVER locked out!
      const remaining = await storage.listIdentitiesByUserId(user.id);
      expect(remaining).toHaveLength(1);
      expect(remaining[0].provider).toBe("google");
    });
  });

  describe("SEC-03 & SEC-04: TOTP Rate Limiting & Safe Cache Pruning", () => {
    it("should enforce rate limiting and lockout after consecutive failed TOTP attempts", async () => {
      const secret = GoogleOtpProvider.generateSecret();
      const provider = new TotpProvider({
        secret,
        maxFailedAttempts: 3,
        lockoutDurationMs: 5000,
      });

      // Attempt 1: Fail
      await expect(
        provider.verifyAndExtract({ account: "alice@test.com", code: "000000" })
      ).rejects.toThrow("Invalid or expired 6-digit Google OTP code.");

      // Attempt 2: Fail
      await expect(
        provider.verifyAndExtract({ account: "alice@test.com", code: "000000" })
      ).rejects.toThrow("Invalid or expired 6-digit Google OTP code.");

      // Attempt 3: Fail -> triggers lockout
      await expect(
        provider.verifyAndExtract({ account: "alice@test.com", code: "000000" })
      ).rejects.toThrow("Invalid or expired 6-digit Google OTP code.");

      // Attempt 4: Blocked by rate limiting even before checking OTP validity!
      try {
        await provider.verifyAndExtract({ account: "alice@test.com", code: "000000" });
        expect.unreachable();
      } catch (err: any) {
        expect(err).toBeInstanceOf(EasyAuthError);
        expect(err.code).toBe("RATE_LIMIT_EXCEEDED");
        expect(err.statusCode).toBe(429);
      }
    });

    it("should safely prune oldest entries without wiping active replay protection", async () => {
      const secret = GoogleOtpProvider.generateSecret();
      const provider = new TotpProvider({
        secret,
        maxFailedAttempts: 0, // disable lockout for test
      });

      const validCode = GoogleOtpProvider.generateToken(secret);

      // Authenticate user "victim"
      await provider.verifyAndExtract({ account: "victim", code: validCode });

      // Replaying the same code immediately must be rejected
      await expect(
        provider.verifyAndExtract({ account: "victim", code: validCode })
      ).rejects.toThrow("TOTP code has already been used");

      // Populate mock entries in lastUsedTimeSteps to simulate 10,001 entries
      const map = (provider as any).lastUsedTimeSteps as Map<string, number>;
      for (let i = 0; i < 10005; i++) {
        map.set(`dummy_${i}`, 12345);
      }
      // Re-set victim's entry to ensure it is the most recent
      map.delete("victim");
      map.set("victim", 999999);

      // Trigger verification for another user
      const dummyCode = GoogleOtpProvider.generateToken(secret);
      await provider.verifyAndExtract({ account: "trigger", code: dummyCode });

      // Victim's recent counter must NOT have been wiped! (unlike the old .clear())
      expect(map.has("victim")).toBe(true);
    });
  });

  describe("SEC-05: Web3 SIWE Message Address Mismatch", () => {
    it("should reject when SIWE message contains a different address than the signer", async () => {
      const walletA = privateKeyToAccount(generatePrivateKey());
      const walletB = privateKeyToAccount(generatePrivateKey());

      const provider = new Web3Provider({ domain: "example.com" });

      // Message says it's walletB, but signed by walletA
      const message = `example.com wants you to sign in with your Ethereum account:\n${walletB.address}\n\nStatement: Sign in.`;
      const signature = await walletA.signMessage({ message });

      await expect(
        provider.verifyAndExtract({
          address: walletA.address,
          signature,
          message,
        })
      ).rejects.toThrow("address declared in SIWE message");
    });
  });

  describe("SEC-07: Nonce Memory Management & Expiration Cleanup", () => {
    it("should prune expired nonces and respect capacity limits", () => {
      const auth = new EasyAuth({
        jwt: { secret: "test-secret-key-32-chars-long-123456" },
        database: { type: "memory" },
      });

      // Generate a nonce with negative TTL (already expired)
      const nonce1 = auth.generateNonce("0x1111", -1000);
      expect(auth.consumeNonce(nonce1, "0x1111")).toBe(false);

      // Valid nonce works
      const nonce2 = auth.generateNonce("0x2222", 60000);
      expect(auth.consumeNonce(nonce2, "0x2222")).toBe(true);
    });
  });

  describe("SEC-08: JWT Metadata Sanitization", () => {
    it("should exclude sensitive fields (password, secret, totpSecret) from JWT payload by default", async () => {
      const jwt = new JwtService({
        secret: "a_very_secure_secret_key_32_characters_long!",
      });

      const user = {
        id: "usr_test123",
        metadata: {
          username: "alice",
          email: "alice@example.com",
          password: "plain_password_leak!",
          passwordHash: "$2b$10$hashed_password_leak!",
          totpSecret: "JBSWY3DPEHPK3PXP",
          secret: "super_secret_internal_key",
        },
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const token = await jwt.sign(user);
      const decoded = await jwt.verify(token);

      expect(decoded.metadata?.username).toBe("alice");
      expect(decoded.metadata?.email).toBe("alice@example.com");
      expect(decoded.metadata?.password).toBeUndefined();
      expect(decoded.metadata?.passwordHash).toBeUndefined();
      expect(decoded.metadata?.totpSecret).toBeUndefined();
      expect(decoded.metadata?.secret).toBeUndefined();
    });

    it("should respect explicit metadataKeys whitelist in JwtConfig", async () => {
      const jwt = new JwtService({
        secret: "a_very_secure_secret_key_32_characters_long!",
        metadataKeys: ["displayName"],
      });

      const user = {
        id: "usr_test456",
        metadata: {
          displayName: "Alice In Wonderland",
          internalRole: "admin",
          email: "alice@example.com",
        },
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const token = await jwt.sign(user);
      const decoded = await jwt.verify(token);

      expect(decoded.metadata?.displayName).toBe("Alice In Wonderland");
      expect(decoded.metadata?.internalRole).toBeUndefined();
      expect(decoded.metadata?.email).toBeUndefined();
    });
  });

  describe("AVAIL-02: Network Error Categorization", () => {
    it("should throw NETWORK_ERROR on network timeouts in OAuth2 provider", async () => {
      const provider = new OAuth2BaseProvider({
        name: "test-oauth",
        clientId: "cid",
        clientSecret: "csec",
        tokenEndpoint: "https://example.com/token",
        userInfoEndpoint: "https://example.com/user",
        mapProfile: (raw) => ({ providerUserId: raw.id }),
        fetchFn: async () => {
          const timeoutErr = new Error("The operation was aborted due to timeout");
          timeoutErr.name = "TimeoutError";
          throw timeoutErr;
        },
      });

      try {
        await provider.verifyAndExtract({ code: "mock_code" });
        expect.unreachable();
      } catch (err: any) {
        expect(err).toBeInstanceOf(EasyAuthError);
        expect(err.code).toBe("NETWORK_ERROR");
        expect(err.statusCode).toBe(502);
      }
    });
  });
});
