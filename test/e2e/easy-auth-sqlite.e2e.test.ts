import { describe, it, expect } from "vitest";
import { EasyAuth } from "../../src/easy-auth.js";
import { Web3Provider } from "../../src/providers/web3/index.js";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";

describe("EasyAuth with SQLite Database E2E", () => {
  it("should authenticate, persist user & identity to SQLite, and verify tokens", async () => {
    // 1. Generate real EVM wallet
    const privateKey = generatePrivateKey();
    const account = privateKeyToAccount(privateKey);
    const domain = "testapp.com";
    const statement = "Sign in with Ethereum to the app.";
    const uri = "https://testapp.com/login";
    const version = "1";
    const chainId = 1;
    const nonce = "B2x9PqZa";
    const issuedAt = new Date().toISOString();

    const siweMessage = `${domain} wants you to sign in with your Ethereum account:
${account.address}

${statement}

URI: ${uri}
Version: ${version}
Chain ID: ${chainId}
Nonce: ${nonce}
Issued At: ${issuedAt}`;

    const signature = await account.signMessage({ message: siweMessage });

    // 2. Initialize EasyAuth with SQLite database
    const auth = new EasyAuth({
      jwt: {
        secret: "sqlite-e2e-secret-key-that-is-long-enough",
        expiresIn: "1h",
      },
      database: {
        type: "sqlite",
        path: ":memory:",
      },
      providers: [
        new Web3Provider({ domain }),
      ],
    });

    // 3. Authenticate via Web3
    const authResult = await auth.authenticate("web3", {
      address: account.address,
      message: siweMessage,
      signature,
    });

    expect(authResult.isNewUser).toBe(true);
    expect(authResult.user.id).toMatch(/^usr_/);
    expect(authResult.token).toBeTruthy();

    // 4. Verify token and check that user comes from SQLite storage
    const verifyResult = await auth.verify(authResult.token);
    expect(verifyResult.userId).toBe(authResult.user.id);
    expect(verifyResult.user.id).toBe(authResult.user.id);

    // 5. Query user directly through storage to confirm persistence
    const userInDb = await auth.storage.getUserById(authResult.user.id);
    expect(userInDb).not.toBeNull();
    expect(userInDb?.id).toBe(authResult.user.id);

    const identitiesInDb = await auth.storage.listIdentitiesByUserId(authResult.user.id);
    expect(identitiesInDb).toHaveLength(1);
    expect(identitiesInDb[0].provider).toBe("web3");
    expect(identitiesInDb[0].providerUserId).toBe(account.address.toLowerCase());
  });
});
