import { describe, it, expect, vi, beforeEach } from "vitest";
import { PostgresStorageAdapter } from "../../src/storage/postgres.js";
import { EasyAuthError } from "../../src/core/errors.js";

describe("PostgresStorageAdapter", () => {
  let mockQuery: ReturnType<typeof vi.fn>;
  let storage: PostgresStorageAdapter;

  beforeEach(() => {
    mockQuery = vi.fn().mockImplementation(async (sql: string, params?: any[]) => {
      if (sql.includes("CREATE TABLE")) {
        return { rows: [], rowCount: 0 };
      }
      return { rows: [], rowCount: 0 };
    });

    storage = new PostgresStorageAdapter({
      query: mockQuery,
      autoInitTables: true,
    });
  });

  describe("Initialization (Auto DDL)", () => {
    it("should execute table creation on first query", async () => {
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 }); // for DDL
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 }); // for getUserById

      await storage.getUserById("usr_123");

      expect(mockQuery).toHaveBeenCalledTimes(2);
      expect(mockQuery.mock.calls[0][0]).toContain("CREATE TABLE IF NOT EXISTS easy_auth_users");
      expect(mockQuery.mock.calls[0][0]).toContain("CREATE TABLE IF NOT EXISTS easy_auth_identities");
    });
  });

  describe("User operations", () => {
    it("should create user and serialize metadata", async () => {
      const mockUserRow = {
        id: "usr_pg_1",
        metadata: { role: "developer", tier: "gold" },
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      mockQuery.mockImplementation(async (sql: string) => {
        if (sql.includes("CREATE TABLE")) return { rows: [] };
        if (sql.includes("INSERT INTO easy_auth_users")) {
          return { rows: [mockUserRow], rowCount: 1 };
        }
        return { rows: [] };
      });

      const user = await storage.createUser({
        id: "usr_pg_1",
        metadata: { role: "developer", tier: "gold" },
      });

      expect(user.id).toBe("usr_pg_1");
      expect(user.metadata).toEqual({ role: "developer", tier: "gold" });
      expect(user.createdAt).toBeInstanceOf(Date);
    });

    it("should get user by ID", async () => {
      const mockUserRow = {
        id: "usr_pg_found",
        metadata: JSON.stringify({ name: "PostgresUser" }),
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      mockQuery.mockImplementation(async (sql: string, params?: any[]) => {
        if (sql.includes("CREATE TABLE")) return { rows: [] };
        if (sql.includes("SELECT") && params?.[0] === "usr_pg_found") {
          return { rows: [mockUserRow], rowCount: 1 };
        }
        return { rows: [], rowCount: 0 };
      });

      const user = await storage.getUserById("usr_pg_found");
      expect(user).not.toBeNull();
      expect(user?.id).toBe("usr_pg_found");
      expect(user?.metadata.name).toBe("PostgresUser");
    });

    it("should return null for non-existent user", async () => {
      mockQuery.mockImplementation(async () => ({ rows: [], rowCount: 0 }));

      const user = await storage.getUserById("usr_missing");
      expect(user).toBeNull();
    });

    it("should update user metadata and merge fields", async () => {
      const existingUserRow = {
        id: "usr_pg_update",
        metadata: { counter: 1 },
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      const updatedUserRow = {
        id: "usr_pg_update",
        metadata: { counter: 1, added: "field" },
        created_at: existingUserRow.created_at,
        updated_at: new Date().toISOString(),
      };

      mockQuery.mockImplementation(async (sql: string, params?: any[]) => {
        if (sql.includes("CREATE TABLE")) return { rows: [] };
        if (sql.includes("SELECT") && params?.[0] === "usr_pg_update") {
          return { rows: [existingUserRow], rowCount: 1 };
        }
        if (sql.includes("UPDATE easy_auth_users")) {
          return { rows: [updatedUserRow], rowCount: 1 };
        }
        return { rows: [], rowCount: 0 };
      });

      const updated = await storage.updateUserMetadata("usr_pg_update", { added: "field" });
      expect(updated.metadata).toEqual({ counter: 1, added: "field" });
    });
  });

  describe("Identity operations", () => {
    it("should create identity successfully", async () => {
      const mockUserRow = {
        id: "usr_owner",
        metadata: {},
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      const mockIdentityRow = {
        id: "idn_pg_1",
        user_id: "usr_owner",
        provider: "web3",
        provider_user_id: "0x123",
        profile: { address: "0x123" },
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      mockQuery.mockImplementation(async (sql: string, params?: any[]) => {
        if (sql.includes("CREATE TABLE")) return { rows: [] };
        if (sql.includes("SELECT id, metadata") && params?.[0] === "usr_owner") {
          return { rows: [mockUserRow], rowCount: 1 };
        }
        if (sql.includes("SELECT id, user_id, provider") && params?.[0] === "web3") {
          return { rows: [], rowCount: 0 }; // no existing identity
        }
        if (sql.includes("INSERT INTO easy_auth_identities")) {
          return { rows: [mockIdentityRow], rowCount: 1 };
        }
        return { rows: [], rowCount: 0 };
      });

      const identity = await storage.createIdentity({
        userId: "usr_owner",
        provider: "web3",
        providerUserId: "0x123",
        profile: { address: "0x123" },
      });

      expect(identity.id).toBe("idn_pg_1");
      expect(identity.userId).toBe("usr_owner");
      expect(identity.provider).toBe("web3");
    });

    it("should throw IDENTITY_ALREADY_LINKED if Postgres returns 23505 unique error", async () => {
      mockQuery.mockImplementation(async (sql: string, params?: any[]) => {
        if (sql.includes("CREATE TABLE")) return { rows: [] };
        if (sql.includes("SELECT id, metadata")) {
          return { rows: [{ id: "usr_1", metadata: {}, created_at: new Date(), updated_at: new Date() }] };
        }
        if (sql.includes("SELECT id, user_id")) {
          return { rows: [] };
        }
        if (sql.includes("INSERT INTO easy_auth_identities")) {
          const err: any = new Error("duplicate key value violates unique constraint");
          err.code = "23505";
          throw err;
        }
        return { rows: [] };
      });

      await expect(
        storage.createIdentity({
          userId: "usr_1",
          provider: "google",
          providerUserId: "duplicate_sub",
        })
      ).rejects.toThrow(EasyAuthError);
    });

    it("should delete identity and return true if rowCount > 0", async () => {
      mockQuery.mockImplementation(async (sql: string) => {
        if (sql.includes("CREATE TABLE")) return { rows: [] };
        if (sql.includes("DELETE FROM easy_auth_identities")) {
          return { rows: [], rowCount: 1 };
        }
        return { rows: [] };
      });

      const deleted = await storage.deleteIdentity("usr_1", "web3", "0xabc");
      expect(deleted).toBe(true);
    });
  });
});
