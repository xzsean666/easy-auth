import { describe, it, expect, beforeEach, vi } from "vitest";
import { D1StorageAdapter, D1SessionManager } from "../../src/d1/index.js";
import { EasyAuthError } from "../../src/core/errors.js";

/**
 * In-memory Mock D1 Database simulating Cloudflare D1 behavior
 */
class MockD1Database {
  public users = new Map<string, any>();
  public identities = new Map<string, any>();
  public activeBookmark: string | null = null;
  public batchCallCount = 0;

  constructor(bookmark?: string | null) {
    this.activeBookmark = bookmark || null;
  }

  withSession(bookmark: string) {
    const wrapped = new MockD1Database(bookmark);
    wrapped.users = this.users;
    wrapped.identities = this.identities;
    wrapped.batchCallCount = this.batchCallCount;
    return wrapped;
  }

  prepare(sql: string) {
    const self = this;
    let boundParams: any[] = [];

    const stmt = {
      bind(...params: any[]) {
        boundParams = params;
        return stmt;
      },

      async first<T = any>(): Promise<T | null> {
        const normalized = sql.trim().replace(/\s+/g, " ");

        // SELECT FROM users
        if (normalized.includes("SELECT id, metadata, created_at, updated_at FROM easy_auth_users WHERE id = ?")) {
          const id = boundParams[0];
          const row = self.users.get(id);
          return row ? ({ ...row } as T) : null;
        }

        // SELECT FROM identities
        if (normalized.includes("SELECT id, user_id, provider, provider_user_id, profile, created_at, updated_at FROM easy_auth_identities WHERE provider = ? AND provider_user_id = ?")) {
          const provider = boundParams[0];
          const providerUserId = boundParams[1];
          for (const row of self.identities.values()) {
            if (row.provider === provider && row.provider_user_id === providerUserId) {
              return { ...row } as T;
            }
          }
          return null;
        }

        return null;
      },

      async all<T = any>(): Promise<{ results: T[]; success: boolean; meta: any }> {
        const normalized = sql.trim().replace(/\s+/g, " ");

        // List identities by user_id
        if (normalized.includes("WHERE user_id = ?")) {
          const userId = boundParams[0];
          const results: any[] = [];
          for (const row of self.identities.values()) {
            if (row.user_id === userId) {
              results.push({ ...row });
            }
          }
          return {
            results: results as T[],
            success: true,
            meta: { bookmark: "bm_all_query" },
          };
        }

        return { results: [], success: true, meta: {} };
      },

      async run(): Promise<{ success: boolean; meta: any }> {
        const normalized = sql.trim().replace(/\s+/g, " ");

        // INSERT INTO easy_auth_users
        if (normalized.includes("INSERT INTO easy_auth_users")) {
          const [id, metadata, created_at, updated_at] = boundParams;
          if (self.users.has(id)) {
            throw new Error("UNIQUE constraint failed: easy_auth_users.id");
          }
          self.users.set(id, { id, metadata, created_at, updated_at });
          return { success: true, meta: { changes: 1, bookmark: `bm_user_${id}` } };
        }

        // UPDATE easy_auth_users
        if (normalized.includes("UPDATE easy_auth_users")) {
          const [metadata, updated_at, id] = boundParams;
          const user = self.users.get(id);
          if (user) {
            user.metadata = metadata;
            user.updated_at = updated_at;
            return { success: true, meta: { changes: 1, bookmark: `bm_update_${id}` } };
          }
          return { success: true, meta: { changes: 0 } };
        }

        // INSERT INTO easy_auth_identities
        if (normalized.includes("INSERT INTO easy_auth_identities")) {
          const [id, user_id, provider, provider_user_id, profile, created_at, updated_at] = boundParams;
          for (const existing of self.identities.values()) {
            if (existing.provider === provider && existing.provider_user_id === provider_user_id) {
              throw new Error("UNIQUE constraint failed: easy_auth_identities.provider, easy_auth_identities.provider_user_id");
            }
          }
          self.identities.set(id, { id, user_id, provider, provider_user_id, profile, created_at, updated_at });
          return { success: true, meta: { changes: 1, bookmark: `bm_idn_${id}` } };
        }

        // DELETE FROM easy_auth_identities
        if (normalized.includes("DELETE FROM easy_auth_identities")) {
          const userId = boundParams[0];
          const provider = boundParams[1];
          const providerUserId = boundParams[2];

          // Check minimum count clause
          if (normalized.includes("SELECT COUNT(*) FROM easy_auth_identities")) {
            let userCount = 0;
            for (const item of self.identities.values()) {
              if (item.user_id === userId) userCount++;
            }
            if (userCount <= 1) {
              return { success: true, meta: { changes: 0 } };
            }
          }

          let deleted = 0;
          for (const [id, item] of Array.from(self.identities.entries())) {
            if (item.user_id === userId && item.provider === provider && item.provider_user_id === providerUserId) {
              self.identities.delete(id);
              deleted++;
            }
          }
          return { success: true, meta: { changes: deleted, bookmark: "bm_del_done" } };
        }

        return { success: true, meta: { changes: 0 } };
      },
    };

    return stmt;
  }

  async batch(statements: any[]) {
    this.batchCallCount++;
    const results = [];
    for (const stmt of statements) {
      results.push(await stmt.run());
    }
    return results;
  }
}

describe("D1SessionManager", () => {
  it("should manage and wrap bookmarks correctly", () => {
    const manager = new D1SessionManager("bm_initial");
    expect(manager.getBookmark()).toBe("bm_initial");

    manager.setBookmark("bm_next");
    expect(manager.getBookmark()).toBe("bm_next");

    const mockDb = new MockD1Database();
    const wrapped = manager.wrapDatabase(mockDb);
    expect(wrapped.activeBookmark).toBe("bm_next");

    manager.clearBookmark();
    expect(manager.getBookmark()).toBeNull();
  });
});

describe("D1StorageAdapter", () => {
  let mockDb: MockD1Database;
  let adapter: D1StorageAdapter;

  beforeEach(() => {
    mockDb = new MockD1Database();
    adapter = new D1StorageAdapter({
      db: mockDb as any,
      autoInitTables: true,
    });
  });

  it("should throw error if db option is missing", () => {
    expect(() => new D1StorageAdapter({ db: null as any })).toThrowError(EasyAuthError);
  });

  it("should auto-init tables via single db.batch RPC", async () => {
    await adapter.ensureInit();
    expect(mockDb.batchCallCount).toBe(1);

    // Repeated calls should not run batch again (cached)
    await adapter.ensureInit();
    expect(mockDb.batchCallCount).toBe(1);
  });

  it("should create user and advance session bookmark", async () => {
    const user = await adapter.createUser({
      id: "usr_d1_01",
      metadata: { name: "Alice", role: "admin" },
    });

    expect(user.id).toBe("usr_d1_01");
    expect(user.metadata.name).toBe("Alice");
    expect(user.metadata.role).toBe("admin");
    expect(user.createdAt).toBeInstanceOf(Date);

    // Verify bookmark advanced
    expect(adapter.getBookmark()).toBe("bm_user_usr_d1_01");
  });

  it("should fetch user by ID", async () => {
    await adapter.createUser({
      id: "usr_d1_02",
      metadata: { plan: "pro" },
    });

    const found = await adapter.getUserById("usr_d1_02");
    expect(found).not.toBeNull();
    expect(found?.id).toBe("usr_d1_02");
    expect(found?.metadata.plan).toBe("pro");

    const missing = await adapter.getUserById("usr_non_existent");
    expect(missing).toBeNull();
  });

  it("should update user metadata and merge fields", async () => {
    await adapter.createUser({
      id: "usr_d1_03",
      metadata: { theme: "dark" },
    });

    const updated = await adapter.updateUserMetadata("usr_d1_03", {
      locale: "zh-CN",
    });

    expect(updated.metadata.theme).toBe("dark");
    expect(updated.metadata.locale).toBe("zh-CN");

    // Updating missing user should throw USER_NOT_FOUND
    await expect(
      adapter.updateUserMetadata("usr_missing", { foo: "bar" })
    ).rejects.toThrowError(EasyAuthError);
  });

  it("should create identity and prevent duplicates (anti-conflict)", async () => {
    await adapter.createUser({ id: "usr_d1_04" });

    const idn = await adapter.createIdentity({
      userId: "usr_d1_04",
      provider: "google",
      providerUserId: "google_sub_123",
      profile: { email: "alice@gmail.com" },
    });

    expect(idn.userId).toBe("usr_d1_04");
    expect(idn.provider).toBe("google");
    expect(idn.providerUserId).toBe("google_sub_123");
    expect(idn.profile?.email).toBe("alice@gmail.com");

    // Duplicate identity creation should throw IDENTITY_ALREADY_LINKED
    await expect(
      adapter.createIdentity({
        userId: "usr_d1_04",
        provider: "google",
        providerUserId: "google_sub_123",
      })
    ).rejects.toThrowError(EasyAuthError);

    // Non-existent user should throw USER_NOT_FOUND
    await expect(
      adapter.createIdentity({
        userId: "usr_non_exist",
        provider: "web3",
        providerUserId: "0x123",
      })
    ).rejects.toThrowError(EasyAuthError);
  });

  it("should get identity and list identities by userId", async () => {
    await adapter.createUser({ id: "usr_d1_05" });
    await adapter.createIdentity({
      userId: "usr_d1_05",
      provider: "web3",
      providerUserId: "0xabc",
    });
    await adapter.createIdentity({
      userId: "usr_d1_05",
      provider: "line",
      providerUserId: "line_999",
    });

    const fetched = await adapter.getIdentity("web3", "0xabc");
    expect(fetched).not.toBeNull();
    expect(fetched?.providerUserId).toBe("0xabc");

    const list = await adapter.listIdentitiesByUserId("usr_d1_05");
    expect(list).toHaveLength(2);
    expect(list.map((i) => i.provider)).toEqual(expect.arrayContaining(["web3", "line"]));
  });

  it("should delete identity with enforceMinimumCount (anti-lockout defense)", async () => {
    await adapter.createUser({ id: "usr_d1_06" });
    await adapter.createIdentity({
      userId: "usr_d1_06",
      provider: "google",
      providerUserId: "g_1",
    });
    await adapter.createIdentity({
      userId: "usr_d1_06",
      provider: "web3",
      providerUserId: "0x1",
    });

    // Unlinking when 2 exist should succeed
    const unlinked1 = await adapter.deleteIdentity("usr_d1_06", "google", "g_1", {
      enforceMinimumCount: true,
    });
    expect(unlinked1).toBe(true);

    // Unlinking the last identity MUST fail
    const unlinked2 = await adapter.deleteIdentity("usr_d1_06", "web3", "0x1", {
      enforceMinimumCount: true,
    });
    expect(unlinked2).toBe(false);

    // Direct deletion without enforceMinimumCount succeeds
    const unlinkedDirect = await adapter.deleteIdentity("usr_d1_06", "web3", "0x1");
    expect(unlinkedDirect).toBe(true);
  });
});
