import { describe, it, expect } from "vitest";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { EasyAuth, Web3Provider, EasyAuthError } from "../../src/index.js";

describe("EasyAuth End-to-End (E2E) Flow", () => {
  it("should complete full user lifecycle: Web3 login -> JWT verify -> link SMS -> dual login -> conflict prevention -> anti-lockout -> unlink", async () => {
    // 1. Initialize EasyAuth SDK facade
    const auth = new EasyAuth({
      jwt: {
        secret: "a_super_secret_jwt_key_that_is_32_characters_long!",
        expiresIn: "1h",
      },
      database: {
        type: "sqlite",
        path: ":memory:",
      },
      providers: [
        new Web3Provider({
          domain: "myapp.com",
        }),
      ],
    });

    // 2. Register dynamic functional provider (e.g. SMS verification)
    auth.registerProvider("sms-otp", async (creds: { phone: string; code: string }) => {
      if (creds.code !== "888888") {
        throw new EasyAuthError("INVALID_CREDENTIALS", "Invalid SMS verification code");
      }
      return {
        providerUserId: creds.phone,
        profile: { phone: creds.phone, phoneVerified: true },
      };
    });

    // 3. Web3 user signs a message and logs in
    const wallet = privateKeyToAccount(generatePrivateKey());
    const message = "myapp.com requests you to sign in with your account:\n" + wallet.address;
    const signature = await wallet.signMessage({ message });

    const loginResult = await auth.authenticate("web3", {
      address: wallet.address,
      signature,
      message,
    });

    expect(loginResult.isNewUser).toBe(true);
    expect(loginResult.user.id).toMatch(/^usr_/);
    expect(loginResult.user.metadata.address).toBe(wallet.address.toLowerCase());
    expect(loginResult.identity.provider).toBe("web3");
    expect(loginResult.identity.providerUserId).toBe(wallet.address.toLowerCase());
    expect(loginResult.token).toBeTruthy();

    const userId = loginResult.user.id;

    // 4. In API middleware, verify the bearer token
    const verifyResult = await auth.verify(loginResult.token);
    expect(verifyResult.userId).toBe(userId);
    expect(verifyResult.metadata.address).toBe(wallet.address.toLowerCase());
    expect(verifyResult.user.id).toBe(userId);
    expect(verifyResult.payload.sub).toBe(userId);

    // Also test verifyToken alias and stateless mode
    const statelessVerify = await auth.verifyToken(loginResult.token, { fetchUser: false });
    expect(statelessVerify.userId).toBe(userId);
    expect(statelessVerify.metadata.address).toBe(wallet.address.toLowerCase());

    // 5. User links SMS OTP identity to the account
    const linkedSms = await auth.linkIdentity(userId, "sms-otp", {
      phone: "+15550001111",
      code: "888888",
    });
    expect(linkedSms.userId).toBe(userId);
    expect(linkedSms.provider).toBe("sms-otp");
    expect(linkedSms.providerUserId).toBe("+15550001111");

    // Check that user now has 2 linked identities
    const allIdentities = await auth.listIdentities(userId);
    expect(allIdentities).toHaveLength(2);
    expect(allIdentities.map((i) => i.provider)).toEqual(expect.arrayContaining(["web3", "sms-otp"]));

    // 6. User logs in with SMS OTP -> MUST resolve to the SAME user ID!
    const smsLogin = await auth.authenticate("sms-otp", {
      phone: "+15550001111",
      code: "888888",
    });
    expect(smsLogin.isNewUser).toBe(false);
    expect(smsLogin.user.id).toBe(userId);

    // 7. Conflict prevention: another user tries to link the same phone number
    const anotherWallet = privateKeyToAccount(generatePrivateKey());
    const anotherMsg = "myapp.com requests you to sign in with your account:\n" + anotherWallet.address;
    const anotherSig = await anotherWallet.signMessage({ message: anotherMsg });

    const user2Login = await auth.authenticate("web3", {
      address: anotherWallet.address,
      signature: anotherSig,
      message: anotherMsg,
    });

    await expect(
      auth.linkIdentity(user2Login.user.id, "sms-otp", {
        phone: "+15550001111",
        code: "888888",
      })
    ).rejects.toThrow(EasyAuthError);

    try {
      await auth.linkIdentity(user2Login.user.id, "sms-otp", {
        phone: "+15550001111",
        code: "888888",
      });
    } catch (err: any) {
      expect(err.code).toBe("IDENTITY_ALREADY_LINKED");
      expect(err.statusCode).toBe(409);
    }

    // 8. Anti-Lockout defense: User 2 has only 1 identity, tries to unlink it -> BLOCKED
    await expect(
      auth.unlinkIdentity(user2Login.user.id, "web3", anotherWallet.address.toLowerCase())
    ).rejects.toThrow(EasyAuthError);

    try {
      await auth.unlinkIdentity(user2Login.user.id, "web3", anotherWallet.address.toLowerCase());
    } catch (err: any) {
      expect(err.code).toBe("CANNOT_UNLINK_LAST_IDENTITY");
      expect(err.statusCode).toBe(400);
    }

    // 9. Original User 1 unlinks Web3 identity -> ALLOWED because SMS OTP is still attached
    await auth.unlinkIdentity(userId, "web3", wallet.address.toLowerCase());

    const remainingIdentities = await auth.listIdentities(userId);
    expect(remainingIdentities).toHaveLength(1);
    expect(remainingIdentities[0].provider).toBe("sms-otp");

    // 10. Now unlinking SMS OTP should be BLOCKED because it became the last one!
    await expect(
      auth.unlinkIdentity(userId, "sms-otp", "+15550001111")
    ).rejects.toThrow(EasyAuthError);
  });
});
