import { describe, it, expect, beforeEach } from "vitest";
import { MemoryStorageAdapter } from "../../src/storage/memory.js";
import { EasyAuthError } from "../../src/core/errors.js";

describe("MemoryStorageAdapter", () => {
  let storage: MemoryStorageAdapter;

  beforeEach(() => {
    storage = new MemoryStorageAdapter();
  });

  describe("User operations", () => {
    it("should create a user with auto-generated ID", async () => {
      const user = await storage.createUser({ metadata: { name: "Alice" } });
      expect(user.id).toMatch(/^usr_[a-f0-9]{16}$/);
      expect(user.metadata).toEqual({ name: "Alice" });
      expect(user.createdAt).toBeInstanceOf(Date);
      expect(user.updatedAt).toBeInstanceOf(Date);
    });

    it("should create a user with explicit ID", async () => {
      const user = await storage.createUser({ id: "custom_user_1", metadata: { role: "admin" } });
      expect(user.id).toBe("custom_user_1");
      expect(user.metadata.role).toBe("admin");
    });

    it("should get user by ID", async () => {
      const created = await storage.createUser({ metadata: { name: "Bob" } });
      const found = await storage.getUserById(created.id);
      expect(found).not.toBeNull();
      expect(found?.id).toBe(created.id);
      expect(found?.metadata.name).toBe("Bob");
    });

    it("should return null for non-existent user", async () => {
      const found = await storage.getUserById("usr_non_existent");
      expect(found).toBeNull();
    });

    it("should update user metadata and merge fields", async () => {
      const created = await storage.createUser({ metadata: { name: "Charlie", level: 1 } });
      const updated = await storage.updateUserMetadata(created.id, { level: 2, tag: "vip" });

      expect(updated.metadata).toEqual({ name: "Charlie", level: 2, tag: "vip" });
      expect(updated.updatedAt.getTime()).toBeGreaterThanOrEqual(created.updatedAt.getTime());

      // Fetch again to verify persistence
      const fetched = await storage.getUserById(created.id);
      expect(fetched?.metadata).toEqual({ name: "Charlie", level: 2, tag: "vip" });
    });

    it("should throw USER_NOT_FOUND when updating non-existent user", async () => {
      await expect(storage.updateUserMetadata("usr_404", { test: true })).rejects.toThrow(EasyAuthError);
      try {
        await storage.updateUserMetadata("usr_404", { test: true });
      } catch (err: any) {
        expect(err.code).toBe("USER_NOT_FOUND");
        expect(err.statusCode).toBe(404);
      }
    });

    it("should evict oldest user when maxEntries limit is reached", async () => {
      const boundedStorage = new MemoryStorageAdapter({ maxEntries: 2 });
      const u1 = await boundedStorage.createUser({ id: "user_1", metadata: { idx: 1 } });
      const u2 = await boundedStorage.createUser({ id: "user_2", metadata: { idx: 2 } });
      await boundedStorage.createIdentity({ userId: u1.id, provider: "test", providerUserId: "id_1" });

      expect(await boundedStorage.getUserById("user_1")).not.toBeNull();
      expect(await boundedStorage.getUserById("user_2")).not.toBeNull();

      // Creating a third user should evict user_1 and its linked identity
      await boundedStorage.createUser({ id: "user_3", metadata: { idx: 3 } });

      expect(await boundedStorage.getUserById("user_1")).toBeNull();
      expect(await boundedStorage.getIdentity("test", "id_1")).toBeNull();
      expect(await boundedStorage.getUserById("user_2")).not.toBeNull();
      expect(await boundedStorage.getUserById("user_3")).not.toBeNull();
    });
  });

  describe("Identity operations", () => {
    it("should create identity linked to user", async () => {
      const user = await storage.createUser({ metadata: { name: "Dave" } });
      const identity = await storage.createIdentity({
        userId: user.id,
        provider: "web3",
        providerUserId: "0x1234567890abcdef",
        profile: { address: "0x1234567890abcdef" },
      });

      expect(identity.id).toMatch(/^idn_[a-f0-9]{16}$/);
      expect(identity.userId).toBe(user.id);
      expect(identity.provider).toBe("web3");
      expect(identity.providerUserId).toBe("0x1234567890abcdef");
      expect(identity.profile?.address).toBe("0x1234567890abcdef");
      expect(identity.createdAt).toBeInstanceOf(Date);
    });

    it("should throw IDENTITY_ALREADY_LINKED if same provider and providerUserId exists", async () => {
      const user1 = await storage.createUser({ metadata: { name: "User1" } });
      const user2 = await storage.createUser({ metadata: { name: "User2" } });

      await storage.createIdentity({
        userId: user1.id,
        provider: "github",
        providerUserId: "gh_1001",
      });

      await expect(
        storage.createIdentity({
          userId: user2.id,
          provider: "github",
          providerUserId: "gh_1001",
        })
      ).rejects.toThrow(EasyAuthError);

      try {
        await storage.createIdentity({
          userId: user2.id,
          provider: "github",
          providerUserId: "gh_1001",
        });
      } catch (err: any) {
        expect(err.code).toBe("IDENTITY_ALREADY_LINKED");
        expect(err.statusCode).toBe(409);
      }
    });

    it("should throw USER_NOT_FOUND when creating identity for non-existent user", async () => {
      await expect(
        storage.createIdentity({
          userId: "usr_missing",
          provider: "google",
          providerUserId: "g_123",
        })
      ).rejects.toThrow(EasyAuthError);
    });

    it("should get identity by provider and providerUserId", async () => {
      const user = await storage.createUser({});
      await storage.createIdentity({
        userId: user.id,
        provider: "google",
        providerUserId: "sub_google_123",
      });

      const found = await storage.getIdentity("google", "sub_google_123");
      expect(found).not.toBeNull();
      expect(found?.userId).toBe(user.id);
      expect(found?.provider).toBe("google");

      const notFound = await storage.getIdentity("google", "other_sub");
      expect(notFound).toBeNull();
    });

    it("should list all identities for a user", async () => {
      const user = await storage.createUser({});
      await storage.createIdentity({
        userId: user.id,
        provider: "web3",
        providerUserId: "0xabc",
      });
      await storage.createIdentity({
        userId: user.id,
        provider: "google",
        providerUserId: "sub_123",
      });

      const list = await storage.listIdentitiesByUserId(user.id);
      expect(list).toHaveLength(2);
      expect(list.map((i) => i.provider)).toEqual(expect.arrayContaining(["web3", "google"]));

      const emptyList = await storage.listIdentitiesByUserId("usr_nobody");
      expect(emptyList).toEqual([]);
    });

    it("should delete identity", async () => {
      const user = await storage.createUser({});
      await storage.createIdentity({
        userId: user.id,
        provider: "web3",
        providerUserId: "0xabc",
      });

      // Try deleting with wrong user id -> returns false
      const wrongDelete = await storage.deleteIdentity("usr_wrong", "web3", "0xabc");
      expect(wrongDelete).toBe(false);

      // Delete with correct user id -> returns true
      const success = await storage.deleteIdentity(user.id, "web3", "0xabc");
      expect(success).toBe(true);

      // Verify it is gone
      const found = await storage.getIdentity("web3", "0xabc");
      expect(found).toBeNull();

      const list = await storage.listIdentitiesByUserId(user.id);
      expect(list).toHaveLength(0);
    });

    it("should clear all records", async () => {
      const user = await storage.createUser({});
      await storage.createIdentity({
        userId: user.id,
        provider: "web3",
        providerUserId: "0xabc",
      });

      storage.clear();
      expect(await storage.getUserById(user.id)).toBeNull();
      expect(await storage.getIdentity("web3", "0xabc")).toBeNull();
    });
  });
});
