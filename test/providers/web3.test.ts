import { describe, it, expect } from "vitest";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { Web3Provider } from "../../src/providers/web3/index.js";
import { EasyAuthError } from "../../src/core/errors.js";

describe("Web3Provider", () => {
  const privateKey = generatePrivateKey();
  const account = privateKeyToAccount(privateKey);
  const provider = new Web3Provider();

  describe("Valid Signatures", () => {
    it("should successfully verify signature and return lowercase address", async () => {
      const message = "Sign in to Easy Auth: nonce-123456";
      const signature = await account.signMessage({ message });

      const result = await provider.verifyAndExtract({
        address: account.address,
        signature,
        message,
      });

      expect(result.providerUserId).toBe(account.address.toLowerCase());
      expect(result.profile?.address).toBe(account.address.toLowerCase());
    });

    it("should normalize checksummed addresses to lowercase", async () => {
      const message = "Hello Web3";
      const signature = await account.signMessage({ message });

      const result = await provider.verifyAndExtract({
        address: account.address.toUpperCase().replace("0X", "0x"),
        signature,
        message,
      });

      expect(result.providerUserId).toBe(account.address.toLowerCase());
    });
  });

  describe("Domain and Statement Validation", () => {
    it("should pass when message matches configured domain", async () => {
      const domainProvider = new Web3Provider({ domain: "example.com" });
      const message = "example.com wants you to sign in with your Ethereum account:\n" + account.address;
      const signature = await account.signMessage({ message });

      const result = await domainProvider.verifyAndExtract({
        address: account.address,
        signature,
        message,
      });

      expect(result.providerUserId).toBe(account.address.toLowerCase());
    });

    it("should fail when message does not match configured domain", async () => {
      const domainProvider = new Web3Provider({ domain: "example.com" });
      const message = "phishing-site.com wants you to sign in";
      const signature = await account.signMessage({ message });

      await expect(
        domainProvider.verifyAndExtract({
          address: account.address,
          signature,
          message,
        })
      ).rejects.toThrow(EasyAuthError);

      try {
        await domainProvider.verifyAndExtract({
          address: account.address,
          signature,
          message,
        });
      } catch (err: any) {
        expect(err.code).toBe("INVALID_CREDENTIALS");
      }
    });

    it("should pass when message contains required statement", async () => {
      const statementProvider = new Web3Provider({ statement: "I agree to Terms of Service" });
      const message = "Welcome! I agree to Terms of Service. Nonce: 888";
      const signature = await account.signMessage({ message });

      const result = await statementProvider.verifyAndExtract({
        address: account.address,
        signature,
        message,
      });

      expect(result.providerUserId).toBe(account.address.toLowerCase());
    });

    it("should fail when message misses required statement", async () => {
      const statementProvider = new Web3Provider({ statement: "I agree to Terms of Service" });
      const message = "Hello without terms agreement";
      const signature = await account.signMessage({ message });

      await expect(
        statementProvider.verifyAndExtract({
          address: account.address,
          signature,
          message,
        })
      ).rejects.toThrow(EasyAuthError);
    });
  });

  describe("Tampering & Invalid Credentials", () => {
    it("should fail when message is altered after signing", async () => {
      const message = "Real message";
      const signature = await account.signMessage({ message });

      await expect(
        provider.verifyAndExtract({
          address: account.address,
          signature,
          message: "Tampered message",
        })
      ).rejects.toThrow(EasyAuthError);
    });

    it("should fail when address does not belong to signer", async () => {
      const otherAccount = privateKeyToAccount(generatePrivateKey());
      const message = "Test message";
      const signature = await account.signMessage({ message });

      await expect(
        provider.verifyAndExtract({
          address: otherAccount.address,
          signature,
          message,
        })
      ).rejects.toThrow(EasyAuthError);
    });

    it("should fail for malformed address", async () => {
      await expect(
        provider.verifyAndExtract({
          address: "not-an-eth-address",
          signature: "0x123",
          message: "hello",
        })
      ).rejects.toThrow(EasyAuthError);
    });

    it("should fail for missing credentials", async () => {
      await expect(provider.verifyAndExtract(null as any)).rejects.toThrow(EasyAuthError);
    });
  });

  describe("Anti-Replay Nonce & EIP-4361 Security", () => {
    it("should enforce single-use nonce via validateNonce callback", async () => {
      const usedNonces = new Set<string>();
      const replayProvider = new Web3Provider({
        validateNonce: async (_address, nonce) => {
          if (usedNonces.has(nonce)) return false;
          usedNonces.add(nonce);
          return true;
        },
      });

      const message = "Sign in to Easy Auth\nNonce: nonce_xyz_123";
      const signature = await account.signMessage({ message });

      // First authentication succeeds and consumes the nonce
      const res = await replayProvider.verifyAndExtract({
        address: account.address,
        signature,
        message,
        nonce: "nonce_xyz_123",
      });
      expect(res.providerUserId).toBe(account.address.toLowerCase());

      // Second authentication with the exact same intercepted signature MUST fail
      await expect(
        replayProvider.verifyAndExtract({
          address: account.address,
          signature,
          message,
          nonce: "nonce_xyz_123",
        })
      ).rejects.toThrow(EasyAuthError);
    });

    it("should extract nonce automatically from message body", async () => {
      let extractedNonce = "";
      const nonceProvider = new Web3Provider({
        validateNonce: async (_addr, nonce) => {
          extractedNonce = nonce;
          return true;
        },
      });

      const message = "myapp.com wants you to sign in\nNonce: myautononce888";
      const signature = await account.signMessage({ message });

      await nonceProvider.verifyAndExtract({
        address: account.address,
        signature,
        message,
      });

      expect(extractedNonce).toBe("myautononce888");
    });

    it("should reject expired EIP-4361 messages", async () => {
      const expProvider = new Web3Provider({ verifyTimestamps: true });
      const expiredTime = new Date(Date.now() - 60000).toISOString();
      const message = `example.com wants you to sign in\nExpiration Time: ${expiredTime}`;
      const signature = await account.signMessage({ message });

      await expect(
        expProvider.verifyAndExtract({
          address: account.address,
          signature,
          message,
        })
      ).rejects.toThrow(EasyAuthError);
    });

    it("should enforce strict EIP-4361 domain header matching when strictDomainMatch is true", async () => {
      const strictProvider = new Web3Provider({
        domain: "example.com",
        strictDomainMatch: true,
      });

      // Valid SIWE format
      const validMsg = "example.com wants you to sign in with your Ethereum account:\n" + account.address;
      const validSig = await account.signMessage({ message: validMsg });
      const res = await strictProvider.verifyAndExtract({
        address: account.address,
        signature: validSig,
        message: validMsg,
      });
      expect(res.providerUserId).toBe(account.address.toLowerCase());

      // Phishing format containing domain in body but not in SIWE header
      const phishingMsg = "evil.com wants you to sign in. Partner: example.com";
      const phishingSig = await account.signMessage({ message: phishingMsg });
      await expect(
        strictProvider.verifyAndExtract({
          address: account.address,
          signature: phishingSig,
          message: phishingMsg,
        })
      ).rejects.toThrow(EasyAuthError);
    });
  });
});
