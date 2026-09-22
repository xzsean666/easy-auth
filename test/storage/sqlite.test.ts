import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { SqliteStorageAdapter } from "../../src/storage/sqlite.js";
import { EasyAuthError } from "../../src/core/errors.js";
import { unlinkSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

describe("SqliteStorageAdapter", () => {
  let storage: SqliteStorageAdapter;

  beforeEach(() => {
    storage = new SqliteStorageAdapter({ path: ":memory:" });
  });

  afterEach(() => {
    storage.close();
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

      // Fetch again to verify persistence in SQLite
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
  });

  describe("Identity operations", () => {
    let userId: string;

    beforeEach(async () => {
      const user = await storage.createUser({ metadata: { name: "IdentityOwner" } });
      userId = user.id;
    });

    it("should create an identity successfully", async () => {
      const identity = await storage.createIdentity({
        userId,
        provider: "google",
        providerUserId: "google_sub_12345",
        profile: { email: "owner@gmail.com" },
      });

      expect(identity.id).toMatch(/^idn_[a-f0-9]{16}$/);
      expect(identity.userId).toBe(userId);
      expect(identity.provider).toBe("google");
      expect(identity.providerUserId).toBe("google_sub_12345");
      expect(identity.profile?.email).toBe("owner@gmail.com");
      expect(identity.createdAt).toBeInstanceOf(Date);
    });

    it("should get identity by provider and providerUserId", async () => {
      await storage.createIdentity({
        userId,
        provider: "web3",
        providerUserId: "0x1111222233334444555566667777888899990000",
      });

      const found = await storage.getIdentity("web3", "0x1111222233334444555566667777888899990000");
      expect(found).not.toBeNull();
      expect(found?.userId).toBe(userId);
      expect(found?.provider).toBe("web3");
    });

    it("should return null for non-existent identity", async () => {
      const found = await storage.getIdentity("google", "missing_id");
      expect(found).toBeNull();
    });

    it("should throw IDENTITY_ALREADY_LINKED if same provider and providerUserId is created twice", async () => {
      await storage.createIdentity({
        userId,
        provider: "line",
        providerUserId: "line_user_abc",
      });

      // Another user tries to link same line identity
      const anotherUser = await storage.createUser({ metadata: { name: "Another" } });

      await expect(
        storage.createIdentity({
          userId: anotherUser.id,
          provider: "line",
          providerUserId: "line_user_abc",
        })
      ).rejects.toThrow(EasyAuthError);

      try {
        await storage.createIdentity({
          userId: anotherUser.id,
          provider: "line",
          providerUserId: "line_user_abc",
        });
      } catch (err: any) {
        expect(err.code).toBe("IDENTITY_ALREADY_LINKED");
        expect(err.statusCode).toBe(409);
      }
    });

    it("should throw USER_NOT_FOUND if linking identity to non-existent user", async () => {
      await expect(
        storage.createIdentity({
          userId: "usr_ghost",
          provider: "google",
          providerUserId: "ghost_sub",
        })
      ).rejects.toThrow(EasyAuthError);
    });

    it("should list all identities belonging to a user", async () => {
      await storage.createIdentity({ userId, provider: "google", providerUserId: "g1" });
      await storage.createIdentity({ userId, provider: "web3", providerUserId: "0xabc" });

      const identities = await storage.listIdentitiesByUserId(userId);
      expect(identities).toHaveLength(2);
      expect(identities.map((i) => i.provider)).toEqual(["google", "web3"]);
    });

    it("should return empty array if user has no identities", async () => {
      const user = await storage.createUser({ metadata: {} });
      const identities = await storage.listIdentitiesByUserId(user.id);
      expect(identities).toEqual([]);
    });

    it("should delete identity successfully", async () => {
      await storage.createIdentity({ userId, provider: "google", providerUserId: "g_del" });

      const deleted = await storage.deleteIdentity(userId, "google", "g_del");
      expect(deleted).toBe(true);

      const found = await storage.getIdentity("google", "g_del");
      expect(found).toBeNull();
    });

    it("should return false when trying to delete identity not belonging to user", async () => {
      await storage.createIdentity({ userId, provider: "google", providerUserId: "g_someone" });

      const deleted = await storage.deleteIdentity("wrong_user_id", "google", "g_someone");
      expect(deleted).toBe(false);
    });
  });

  describe("File persistence verification", () => {
    const tempDbPath = join(tmpdir(), `easy-auth-test-${Date.now()}.sqlite`);

    afterEach(() => {
      if (existsSync(tempDbPath)) {
        try {
          unlinkSync(tempDbPath);
        } catch {}
      }
    });

    it("should persist data to SQLite file across different adapter instances", async () => {
      // 1. First instance creates data
      const db1 = new SqliteStorageAdapter({ path: tempDbPath });
      const user = await db1.createUser({ metadata: { persistence: "solid" } });
      await db1.createIdentity({
        userId: user.id,
        provider: "web3",
        providerUserId: "0xpersist",
      });
      db1.close();

      // 2. Second instance opens the exact same file
      const db2 = new SqliteStorageAdapter({ path: tempDbPath });
      const loadedUser = await db2.getUserById(user.id);
      expect(loadedUser).not.toBeNull();
      expect(loadedUser?.metadata.persistence).toBe("solid");

      const loadedIdentity = await db2.getIdentity("web3", "0xpersist");
      expect(loadedIdentity).not.toBeNull();
      expect(loadedIdentity?.userId).toBe(user.id);
      db2.close();
    });
  });
});
