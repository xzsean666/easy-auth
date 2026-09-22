import { describe, it, expect, afterEach } from "vitest";
import { EasyAuth } from "../../src/easy-auth.js";
import { SqliteStorageAdapter } from "../../src/storage/sqlite.js";
import { existsSync, unlinkSync } from "node:fs";

describe("EasyAuth Default Storage (Persistence Guarantee)", () => {
  const testDbFile = "./test-default-persistence.sqlite";

  afterEach(() => {
    if (existsSync(testDbFile)) {
      try {
        unlinkSync(testDbFile);
      } catch {}
    }
  });

  it("should default to persistent SqliteStorageAdapter instead of MemoryStorageAdapter", async () => {
    process.env.EASY_AUTH_DB_PATH = testDbFile;

    // 1. Initialize with zero storage options specified
    const auth = new EasyAuth({
      jwt: {
        secret: "test-secret-key-that-is-long-enough-for-hs256",
      },
    });

    // 2. Storage MUST be SqliteStorageAdapter
    expect(auth.storage).toBeInstanceOf(SqliteStorageAdapter);

    // 3. User operations MUST write to persistent SQLite file
    const user = await auth.storage.createUser({
      metadata: { persistent: true, reason: "Never lose user data" },
    });

    // 4. File must exist on disk!
    expect(existsSync(testDbFile)).toBe(true);

    // 5. Query user back
    const fetched = await auth.storage.getUserById(user.id);
    expect(fetched?.metadata.persistent).toBe(true);

    delete process.env.EASY_AUTH_DB_PATH;
  });
});
