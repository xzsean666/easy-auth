import { verifyMessage, isAddress } from "viem";
import type { AuthProvider, ExtractedIdentity } from "../base.js";
import { EasyAuthError } from "../../core/errors.js";

export interface Web3Credentials {
  address: string;
  signature: string;
  message: string;
  /**
   * Single-use challenge nonce (optional if included in message)
   */
  nonce?: string;
}

export interface Web3ProviderOptions {
  /**
   * Domain name to verify in the signed message (useful for EIP-4361 SIWE anti-phishing)
   */
  domain?: string;

  /**
   * Enforce strict EIP-4361 header matching:
   * `^${domain} wants you to sign in with your Ethereum account:`
   * Defaults to false for broader compatibility.
   */
  strictDomainMatch?: boolean;

  /**
   * Expected statement substring in the signed message
   */
  statement?: string;

  /**
   * Enforce expiration time and not-before timestamps when present in EIP-4361 messages.
   * Defaults to true.
   */
  verifyTimestamps?: boolean;

  /**
   * Callback to validate and consume single-use nonces (anti-replay defense).
   */
  validateNonce?: (address: string, nonce: string, message: string) => Promise<boolean> | boolean;

  /**
   * Optional Viem PublicClient to support ERC-1271 smart contract wallet verification (Safe, Argent, AA)
   */
  client?: any;
}

export interface Web3Profile {
  address: string;
}

/**
 * Web3 EVM wallet signature authentication provider.
 * Supports standard EIP-191 personal_sign and EIP-4361 SIWE message validation.
 * Normalizes all wallet addresses to lowercase.
 */
export class Web3Provider implements AuthProvider<Web3Credentials, Web3Profile> {
  readonly name = "web3";
  readonly type = "wallet";
  private readonly domain?: string;
  private readonly statement?: string;
  private readonly strictDomainMatch: boolean;
  private readonly verifyTimestamps: boolean;
  private validateNonce?: (address: string, nonce: string, message: string) => Promise<boolean> | boolean;
  private readonly client?: any;

  constructor(options?: Web3ProviderOptions) {
    this.domain = options?.domain;
    this.statement = options?.statement;
    this.strictDomainMatch = options?.strictDomainMatch ?? false;
    this.verifyTimestamps = options?.verifyTimestamps ?? true;
    this.validateNonce = options?.validateNonce;
    this.client = options?.client;
  }

  /**
   * Returns true if a nonce validator callback is registered.
   */
  hasNonceValidator(): boolean {
    return typeof this.validateNonce === "function";
  }

  /**
   * Attach or replace the nonce validator callback (e.g. from EasyAuth nonce manager).
   */
  setNonceValidator(fn: (address: string, nonce: string, message: string) => Promise<boolean> | boolean): this {
    this.validateNonce = fn;
    return this;
  }

  async verifyAndExtract(credentials: Web3Credentials): Promise<ExtractedIdentity<Web3Profile>> {
    if (!credentials) {
      throw new EasyAuthError("INVALID_CREDENTIALS", "Web3 credentials are required.");
    }

    const { address, signature, message } = credentials;

    if (!address || typeof address !== "string" || !isAddress(address.toLowerCase())) {
      throw new EasyAuthError("INVALID_CREDENTIALS", `Invalid Ethereum address: "${address}".`);
    }

    if (!signature || typeof signature !== "string" || !signature.startsWith("0x")) {
      throw new EasyAuthError("INVALID_CREDENTIALS", "Signature must be a non-empty hex string starting with 0x.");
    }

    if (!message || typeof message !== "string" || message.trim().length === 0) {
      throw new EasyAuthError("INVALID_CREDENTIALS", "Message must be a non-empty string.");
    }

    // 1. Anti-phishing domain check
    if (this.domain) {
      if (this.strictDomainMatch) {
        const escaped = this.domain.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        const siweHeader = new RegExp(`^${escaped}(:\\d+)? wants you to sign in with your Ethereum account:`, "m");
        if (!siweHeader.test(message)) {
          throw new EasyAuthError(
            "INVALID_CREDENTIALS",
            `Web3 signature verification failed: message does not match strict EIP-4361 domain header for "${this.domain}".`
          );
        }
      } else {
        const domainPattern = new RegExp(`\\b${this.domain.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i");
        if (!domainPattern.test(message)) {
          throw new EasyAuthError(
            "INVALID_CREDENTIALS",
            `Web3 signature verification failed: message does not match expected domain "${this.domain}".`
          );
        }
      }
    }

    const normalizedAddress = address.toLowerCase();

    // 1.1 Anti-spoofing (EIP-4361 Section 5): Verify address in SIWE header matches signing address
    const siweHeaderAddressMatch = message.match(
      /wants you to sign in with your Ethereum account:\s*[\r\n]+\s*(0x[a-fA-F0-9]{40})/i
    );
    if (siweHeaderAddressMatch) {
      const headerAddress = siweHeaderAddressMatch[1].toLowerCase();
      if (headerAddress !== normalizedAddress) {
        throw new EasyAuthError(
          "INVALID_CREDENTIALS",
          `Web3 signature verification failed: address declared in SIWE message ("${headerAddress}") does not match credentials address ("${normalizedAddress}").`
        );
      }
    }

    // 2. Statement check
    if (this.statement && !message.includes(this.statement)) {
      throw new EasyAuthError(
        "INVALID_CREDENTIALS",
        "Web3 signature verification failed: message does not contain the required statement."
      );
    }

    // 3. EIP-4361 Timestamps check (anti-expiration replay)
    if (this.verifyTimestamps) {
      const expMatch = message.match(/Expiration Time:\s*([^\n\r]+)/i);
      if (expMatch) {
        const expDate = new Date(expMatch[1].trim());
        if (!isNaN(expDate.getTime()) && Date.now() > expDate.getTime()) {
          throw new EasyAuthError("INVALID_CREDENTIALS", "Web3 signature verification failed: message has expired.");
        }
      }

      const nbfMatch = message.match(/Not Before:\s*([^\n\r]+)/i);
      if (nbfMatch) {
        const nbfDate = new Date(nbfMatch[1].trim());
        if (!isNaN(nbfDate.getTime()) && Date.now() < nbfDate.getTime()) {
          throw new EasyAuthError("INVALID_CREDENTIALS", "Web3 signature verification failed: message is not yet valid (Not Before).");
        }
      }
    }

    // 4. Anti-replay Nonce validation
    if (this.validateNonce) {
      let nonce = credentials.nonce;
      if (!nonce) {
        const nonceMatch = message.match(/Nonce:\s*([a-zA-Z0-9]+)/i);
        if (nonceMatch) nonce = nonceMatch[1];
      }
      if (!nonce) {
        throw new EasyAuthError("INVALID_CREDENTIALS", "Nonce is required for Web3 authentication anti-replay verification.");
      }
      const isNonceValid = await this.validateNonce(normalizedAddress, nonce, message);
      if (!isNonceValid) {
        throw new EasyAuthError(
          "INVALID_CREDENTIALS",
          "Web3 nonce verification failed: nonce is invalid, expired, or already consumed."
        );
      }
    }

    // 5. Signature verification (supports EOA and ERC-1271 contract accounts via client)
    let isValid = false;
    try {
      if (this.client && typeof this.client.verifyMessage === "function") {
        isValid = await this.client.verifyMessage({
          address: normalizedAddress as `0x${string}`,
          message,
          signature: signature as `0x${string}`,
        });
      } else {
        isValid = await verifyMessage({
          address: normalizedAddress as `0x${string}`,
          message,
          signature: signature as `0x${string}`,
        });
      }
    } catch (err: any) {
      throw new EasyAuthError("INVALID_CREDENTIALS", `Web3 signature verification failed: ${err.message}`, err);
    }

    if (!isValid) {
      throw new EasyAuthError("INVALID_CREDENTIALS", "Web3 signature verification failed: signature does not match address.");
    }

    return {
      providerUserId: normalizedAddress,
      profile: {
        address: normalizedAddress,
      },
    };
  }
}
