import { describe, it, expect, beforeEach } from "vitest";
import { AuthEngine } from "../../src/core/auth-engine.js";
import { MemoryStorageAdapter } from "../../src/storage/memory.js";
import { JwtService } from "../../src/jwt/jwt-service.js";
import { ProviderRegistry } from "../../src/providers/registry.js";
import { EasyAuthError } from "../../src/core/errors.js";

describe("AuthEngine", () => {
  let storage: MemoryStorageAdapter;
  let jwtService: JwtService;
  let registry: ProviderRegistry;
  let engine: AuthEngine;

  beforeEach(() => {
    storage = new MemoryStorageAdapter();
    jwtService = new JwtService({ secret: "test_secret_key_32_characters_long!!" });
    registry = new ProviderRegistry();

    // Register a mock web3 provider
    registry.registerFunction("web3", async (creds: { address: string }) => {
      if (!creds?.address) throw new EasyAuthError("INVALID_CREDENTIALS");
      return {
        providerUserId: creds.address.toLowerCase(),
        profile: { address: creds.address.toLowerCase() },
      };
    });

    // Register a mock google provider
    registry.registerFunction("google", async (creds: { sub: string; email?: string; name?: string }) => {
      if (!creds?.sub) throw new EasyAuthError("INVALID_CREDENTIALS");
      return {
        providerUserId: creds.sub,
        profile: { email: creds.email, name: creds.name },
      };
    });

    engine = new AuthEngine({
      storage,
      jwtService,
      registry,
    });
  });

  describe("Authentication Flow (First-time & Existing)", () => {
    it("should automatically create User and Identity on first login (isNewUser: true)", async () => {
      const result = await engine.authenticate("web3", { address: "0x1111111111111111111111111111111111111111" });

      expect(result.isNewUser).toBe(true);
      expect(result.user.id).toMatch(/^usr_/);
      expect(result.user.metadata.address).toBe("0x1111111111111111111111111111111111111111");
      expect(result.identity.provider).toBe("web3");
      expect(result.identity.providerUserId).toBe("0x1111111111111111111111111111111111111111");
      expect(result.identity.userId).toBe(result.user.id);
      expect(result.token).toBeTruthy();

      // Verify token
      const verified = await engine.verify(result.token);
      expect(verified.userId).toBe(result.user.id);
      expect(verified.metadata.address).toBe("0x1111111111111111111111111111111111111111");
    });

    it("should log into the existing user on subsequent login (isNewUser: false)", async () => {
      const first = await engine.authenticate("web3", { address: "0x2222222222222222222222222222222222222222" });
      expect(first.isNewUser).toBe(true);

      const second = await engine.authenticate("web3", { address: "0x2222222222222222222222222222222222222222" });
      expect(second.isNewUser).toBe(false);
      expect(second.user.id).toBe(first.user.id);
      expect(second.identity.id).toBe(first.identity.id);
    });

    it("should recover gracefully from parallel concurrent registrations of the same identity", async () => {
      // Simulate two parallel authenticate requests with identical credentials
      const [res1, res2] = await Promise.all([
        engine.authenticate("web3", { address: "0xcccccccccccccccccccccccccccccccccccccccc" }),
        engine.authenticate("web3", { address: "0xcccccccccccccccccccccccccccccccccccccccc" }),
      ]);

      // Both should succeed and resolve to the SAME unified user ID!
      expect(res1.user.id).toBe(res2.user.id);
      expect([res1.isNewUser, res2.isNewUser]).toContain(true);
      expect([res1.isNewUser, res2.isNewUser]).toContain(false);
    });
  });

  describe("Identity Linking", () => {
    it("should link a second identity to an existing user and allow login from either", async () => {
      // 1. Register with Web3
      const auth1 = await engine.authenticate("web3", { address: "0x3333333333333333333333333333333333333333" });
      const userId = auth1.user.id;

      // 2. Link Google account
      const linkedIdentity = await engine.linkIdentity(userId, "google", {
        sub: "google_sub_123",
        email: "alice@example.com",
        name: "Alice",
      });

      expect(linkedIdentity.userId).toBe(userId);
      expect(linkedIdentity.provider).toBe("google");
      expect(linkedIdentity.providerUserId).toBe("google_sub_123");

      // 3. Check list of identities
      const identities = await engine.listIdentities(userId);
      expect(identities).toHaveLength(2);

      // 4. Log in using the newly linked Google identity -> Should return the SAME user!
      const auth2 = await engine.authenticate("google", { sub: "google_sub_123" });
      expect(auth2.isNewUser).toBe(false);
      expect(auth2.user.id).toBe(userId);
    });

    it("should be idempotent when linking the same identity to the same user", async () => {
      const auth = await engine.authenticate("web3", { address: "0x4444444444444444444444444444444444444444" });
      const linkedAgain = await engine.linkIdentity(auth.user.id, "web3", {
        address: "0x4444444444444444444444444444444444444444",
      });

      expect(linkedAgain.id).toBe(auth.identity.id);
    });

    it("should reject linking if identity is already linked to another user (IDENTITY_ALREADY_LINKED)", async () => {
      // User A signs up with Google
      await engine.authenticate("google", { sub: "google_exclusive_sub" });

      // User B signs up with Web3
      const userB = await engine.authenticate("web3", { address: "0x5555555555555555555555555555555555555555" });

      // User B attempts to link User A's Google account
      await expect(
        engine.linkIdentity(userB.user.id, "google", { sub: "google_exclusive_sub" })
      ).rejects.toThrow(EasyAuthError);

      try {
        await engine.linkIdentity(userB.user.id, "google", { sub: "google_exclusive_sub" });
      } catch (err: any) {
        expect(err.code).toBe("IDENTITY_ALREADY_LINKED");
        expect(err.statusCode).toBe(409);
      }
    });

    it("should throw USER_NOT_FOUND when linking identity to a non-existent user", async () => {
      await expect(
        engine.linkIdentity("usr_non_existent", "web3", { address: "0x6666666666666666666666666666666666666666" })
      ).rejects.toThrow(EasyAuthError);
    });
  });

  describe("Anti-Lockout and Identity Unlinking", () => {
    it("should successfully unlink an identity when user has multiple identities", async () => {
      // 1. Create user with Web3
      const auth = await engine.authenticate("web3", { address: "0x7777777777777777777777777777777777777777" });
      // 2. Link Google
      await engine.linkIdentity(auth.user.id, "google", { sub: "google_to_unlink" });

      expect(await engine.listIdentities(auth.user.id)).toHaveLength(2);

      // 3. Unlink Google
      await engine.unlinkIdentity(auth.user.id, "google", "google_to_unlink");

      // 4. Verify only Web3 remains
      const remaining = await engine.listIdentities(auth.user.id);
      expect(remaining).toHaveLength(1);
      expect(remaining[0].provider).toBe("web3");
    });

    it("should throw CANNOT_UNLINK_LAST_IDENTITY when trying to unlink the only remaining identity", async () => {
      const auth = await engine.authenticate("web3", { address: "0x8888888888888888888888888888888888888888" });

      await expect(
        engine.unlinkIdentity(auth.user.id, "web3", "0x8888888888888888888888888888888888888888")
      ).rejects.toThrow(EasyAuthError);

      try {
        await engine.unlinkIdentity(auth.user.id, "web3", "0x8888888888888888888888888888888888888888");
      } catch (err: any) {
        expect(err.code).toBe("CANNOT_UNLINK_LAST_IDENTITY");
        expect(err.statusCode).toBe(400);
      }

      // Verify the identity was NOT deleted
      const list = await engine.listIdentities(auth.user.id);
      expect(list).toHaveLength(1);
    });

    it("should reject unlinking an identity that does not belong to the user", async () => {
      const userA = await engine.authenticate("web3", { address: "0x9999999999999999999999999999999999999999" });
      await engine.linkIdentity(userA.user.id, "google", { sub: "sub_a" });

      await expect(
        engine.unlinkIdentity(userA.user.id, "google", "foreign_sub")
      ).rejects.toThrow(EasyAuthError);
    });
  });

  describe("Token Verification (verify & verifyToken)", () => {
    it("should verify token in strong consistency mode (fetchUser: true)", async () => {
      const auth = await engine.authenticate("web3", { address: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" });
      // Update metadata in database
      await engine.updateMetadata(auth.user.id, { role: "moderator", customBadge: "gold" });

      const verified = await engine.verify(auth.token, { fetchUser: true });
      expect(verified.userId).toBe(auth.user.id);
      expect(verified.metadata.role).toBe("moderator");
      expect(verified.metadata.customBadge).toBe("gold");
      expect(verified.user.id).toBe(auth.user.id);
      expect(verified.payload.sub).toBe(auth.user.id);
    });

    it("should verify token in stateless mode (fetchUser: false)", async () => {
      const auth = await engine.authenticate("web3", { address: "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb" });

      const verified = await engine.verify(auth.token, { fetchUser: false });
      expect(verified.userId).toBe(auth.user.id);
      expect(verified.metadata.address).toBe("0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb");
      expect(verified.user.id).toBe(auth.user.id);
    });
  });
});
