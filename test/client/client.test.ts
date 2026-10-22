import { describe, it, expect, beforeEach, vi } from "vitest";
import { EasyAuthClient, MemoryTokenStorage } from "../../src/client/index.js";
import { EasyAuthError } from "../../src/core/errors.js";

describe("EasyAuthClient", () => {
  let storage: MemoryTokenStorage;
  let mockFetch: ReturnType<typeof vi.fn>;
  let unauthorizedCb: ReturnType<typeof vi.fn>;
  let client: EasyAuthClient;

  beforeEach(() => {
    storage = new MemoryTokenStorage();
    mockFetch = vi.fn();
    unauthorizedCb = vi.fn();

    client = new EasyAuthClient({
      baseUrl: "https://api.test.com",
      routePrefix: "/api/auth",
      storage,
      fetchFn: mockFetch as any,
      onUnauthorized: unauthorizedCb,
    });
  });

  it("should initialize in unauthenticated state", async () => {
    expect(await client.isAuthenticated()).toBe(false);
    expect(await client.getToken()).toBeNull();
    expect(await client.getUser()).toBeNull();
  });

  it("should successfully login, store tokens, and notify listeners", async () => {
    const mockUser = {
      id: "usr_alice",
      metadata: { name: "Alice" },
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        token: "jwt_token_123",
        user: mockUser,
        isNewUser: true,
      }),
    });

    const stateChanges: any[] = [];
    client.onAuthStateChange((user) => {
      stateChanges.push(user);
    });

    const res = await client.login("google", { idToken: "mock_id_token" });

    expect(res.token).toBe("jwt_token_123");
    expect(res.user.id).toBe("usr_alice");
    expect(await client.getToken()).toBe("jwt_token_123");
    expect(await client.isAuthenticated()).toBe(true);

    // Verify persisted into storage
    expect(storage.getItem("easy_auth_token")).toBe("jwt_token_123");
    expect(storage.getItem("easy_auth_user")).toContain("usr_alice");

    // Verify listeners notified
    expect(stateChanges[stateChanges.length - 1]?.id).toBe("usr_alice");
  });

  it("should throw EasyAuthError on login failure", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 401,
      statusText: "Unauthorized",
      json: async () => ({
        code: "INVALID_CREDENTIALS",
        message: "Invalid token",
      }),
    });

    await expect(client.login("google", { idToken: "bad_token" })).rejects.toThrowError(EasyAuthError);
    expect(await client.isAuthenticated()).toBe(false);
  });

  it("should send Bearer token when linking identity", async () => {
    storage.setItem("easy_auth_token", "active_jwt");

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        id: "idn_web3",
        provider: "web3",
        providerUserId: "0x123",
      }),
    });

    const linked = await client.link("web3", { address: "0x123" });
    expect(linked.provider).toBe("web3");

    // Check request header
    expect(mockFetch).toHaveBeenCalledWith(
      "https://api.test.com/api/auth/link",
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: "Bearer active_jwt",
        }),
      })
    );
  });

  it("should unlink identity successfully", async () => {
    storage.setItem("easy_auth_token", "active_jwt");

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ success: true }),
    });

    const result = await client.unlink("web3", "0x123");
    expect(result).toBe(true);
  });

  it("should fetch current user via getMe()", async () => {
    storage.setItem("easy_auth_token", "active_jwt");

    const userObj = { id: "usr_alice", metadata: {} };
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => userObj,
    });

    const user = await client.getMe();
    expect(user?.id).toBe("usr_alice");
    expect(await client.getUser()).toEqual(userObj);
  });

  it("should clear credentials and notify on logout()", async () => {
    storage.setItem("easy_auth_token", "active_jwt");
    storage.setItem("easy_auth_user", JSON.stringify({ id: "usr_alice" }));

    const stateChanges: any[] = [];
    client.onAuthStateChange((user) => stateChanges.push(user));

    await client.logout();

    expect(await client.getToken()).toBeNull();
    expect(await client.isAuthenticated()).toBe(false);
    expect(storage.getItem("easy_auth_token")).toBeNull();
    expect(stateChanges[stateChanges.length - 1]).toBeNull();
  });

  it("client.fetch should auto-inject Authorization header", async () => {
    storage.setItem("easy_auth_token", "active_jwt");

    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
    });

    await client.fetch("https://api.test.com/api/data");

    expect(mockFetch).toHaveBeenCalledWith(
      "https://api.test.com/api/data",
      expect.objectContaining({
        headers: expect.any(Headers),
      })
    );

    const callHeaders = mockFetch.mock.calls[0][1].headers as Headers;
    expect(callHeaders.get("Authorization")).toBe("Bearer active_jwt");
  });

  it("client.fetch should handle 401 by triggering logout and onUnauthorized callback", async () => {
    storage.setItem("easy_auth_token", "expired_jwt");

    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 401,
    });

    const res = await client.fetch("https://api.test.com/api/protected");
    expect(res.status).toBe(401);

    // Verify logged out
    expect(await client.getToken()).toBeNull();
    expect(storage.getItem("easy_auth_token")).toBeNull();

    // Verify onUnauthorized callback called
    expect(unauthorizedCb).toHaveBeenCalledTimes(1);
  });
});
