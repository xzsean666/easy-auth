import "reflect-metadata";
import { describe, it, expect, beforeEach } from "vitest";
import { Test, TestingModule } from "@nestjs/testing";
import { UnauthorizedException, ExecutionContext } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { EasyAuthModule } from "../../src/nestjs/easy-auth.module.js";
import { EasyAuthService } from "../../src/nestjs/easy-auth.service.js";
import { EasyAuthController } from "../../src/nestjs/easy-auth.controller.js";
import { EasyAuthGuard } from "../../src/nestjs/easy-auth.guard.js";
import { IS_PUBLIC_KEY } from "../../src/nestjs/constants.js";

describe("NestJS Integration (EasyAuthModule)", () => {
  let moduleRef: TestingModule;
  let authService: EasyAuthService;
  let authController: EasyAuthController;
  let authGuard: EasyAuthGuard;

  beforeEach(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [
        EasyAuthModule.forRoot({
          jwt: {
            secret: "nestjs-integration-super-secret-key-12345",
            expiresIn: "1h",
          },
          database: {
            type: "sqlite",
            path: ":memory:",
          },
        }),
      ],
    }).compile();

    authService = moduleRef.get<EasyAuthService>(EasyAuthService);
    authController = moduleRef.get<EasyAuthController>(EasyAuthController);
    authGuard = moduleRef.get<EasyAuthGuard>(EasyAuthGuard);

    // Register a mock provider for testing controller flows
    authService.auth.registerProvider("test-provider", async (creds: { username: string }) => {
      return {
        providerUserId: creds.username,
        profile: { username: creds.username },
      };
    });
  });

  describe("EasyAuthController endpoints", () => {
    it("should handle login endpoint with loginType and return user + token + loginType", async () => {
      const res = await authController.login({
        loginType: "test-provider",
        credentials: { username: "nest_user" },
      });

      expect(res.statusCode).toBe(200);
      expect(res.loginType).toBe("test-provider");
      expect(res.isNewUser).toBe(true);
      expect(res.user.id).toMatch(/^usr_/);
      expect(res.token).toBeTruthy();
      expect(res.user.metadata.lastLoginType).toBe("test-provider");
      expect(res.user.metadata.lastLoginAt).toBeDefined();
    });

    it("should handle me endpoint using bearer token", async () => {
      const loginRes = await authController.login({
        provider: "test-provider",
        credentials: { username: "me_user" },
      });

      const meRes = await authController.me(`Bearer ${loginRes.token}`);
      expect(meRes.statusCode).toBe(200);
      expect(meRes.userId).toBe(loginRes.user.id);
      expect(meRes.user.id).toBe(loginRes.user.id);
    });

    it("should handle identity linking, listing, and unlinking", async () => {
      // 1. Initial login
      const loginRes = await authController.login({
        provider: "test-provider",
        credentials: { username: "link_test_user" },
      });

      const userId = loginRes.user.id;

      // 2. Link a second identity
      authService.auth.registerProvider("provider-two", async (c: { email: string }) => ({
        providerUserId: c.email,
        profile: { email: c.email },
      }));

      const linkRes = await authController.link({
        userId,
        provider: "provider-two",
        credentials: { email: "user@example.com" },
      });
      expect(linkRes.statusCode).toBe(200);
      expect(linkRes.identity.provider).toBe("provider-two");

      // 3. List identities
      const listRes = await authController.listIdentities(userId);
      expect(listRes.statusCode).toBe(200);
      expect(listRes.identities).toHaveLength(2);

      // 4. Unlink second identity
      const unlinkRes = await authController.unlink({
        userId,
        provider: "provider-two",
        providerUserId: "user@example.com",
      });
      expect(unlinkRes.statusCode).toBe(200);
      expect(unlinkRes.success).toBe(true);

      // 5. Verify only 1 identity remains
      const afterList = await authController.listIdentities(userId);
      expect(afterList.identities).toHaveLength(1);
    });

    it("should issue anti-replay nonce and authenticate Web3 SIWE sign-in", async () => {
      // Create Web3 provider pre-wired with EasyAuth's nonce validation
      const web3 = authService.auth.createWeb3Provider({
        domain: "nestapp.io",
      });
      authService.auth.registerProvider(web3);

      const wallet = privateKeyToAccount(generatePrivateKey());

      // 1. Client requests challenge nonce
      const nonceRes = authController.getNonce(wallet.address);
      expect(nonceRes.statusCode).toBe(200);
      expect(nonceRes.nonce).toHaveLength(16);
      expect(nonceRes.address).toBe(wallet.address.toLowerCase());

      // 2. Client constructs and signs SIWE message containing the nonce
      const message = `nestapp.io wants you to sign in with your Ethereum account:\n${wallet.address}\n\nNonce: ${nonceRes.nonce}`;
      const signature = await wallet.signMessage({ message });

      // 3. Client logs in via POST /api/auth/login
      const loginRes = await authController.login({
        loginType: "web3",
        credentials: {
          address: wallet.address,
          signature,
          message,
          nonce: nonceRes.nonce,
        },
      });

      expect(loginRes.statusCode).toBe(200);
      expect(loginRes.loginType).toBe("web3");
      expect(loginRes.isNewUser).toBe(true);
      expect(loginRes.user.id).toMatch(/^usr_/);
      expect(loginRes.identity.providerUserId).toBe(wallet.address.toLowerCase());

      // 4. Replay attack: An attacker intercepts the exact same payload and tries to replay login -> MUST FAIL
      await expect(
        authController.login({
          loginType: "web3",
          credentials: {
            address: wallet.address,
            signature,
            message,
            nonce: nonceRes.nonce,
          },
        })
      ).rejects.toThrow();
    });

    it("should allow user to update metadata but strip protected privilege fields (anti-privilege escalation)", async () => {
      const loginRes = await authController.login({
        provider: "test-provider",
        credentials: { username: "meta_user" },
      });

      const updateRes = await authController.updateMyMetadata(loginRes.user, {
        wallet_address: "0x1234567890123456789012345678901234567890",
        bio: "Web3 Builder",
        role: "admin", // MUST BE STRIPPED
        isAdmin: true, // MUST BE STRIPPED
        permissions: ["*"], // MUST BE STRIPPED
      });

      expect(updateRes.statusCode).toBe(200);
      expect(updateRes.metadata.wallet_address).toBe("0x1234567890123456789012345678901234567890");
      expect(updateRes.metadata.bio).toBe("Web3 Builder");
      expect(updateRes.metadata.role).toBeUndefined();
      expect(updateRes.metadata.isAdmin).toBeUndefined();
      expect(updateRes.metadata.permissions).toBeUndefined();

      // However, direct server-side calls via authService.updateUserMetadata are unrestricted
      const serverUpdated = await authService.updateUserMetadata(loginRes.user.id, {
        role: "admin",
        isAdmin: true,
      });
      expect(serverUpdated.metadata.role).toBe("admin");
      expect(serverUpdated.metadata.isAdmin).toBe(true);
    });
  });

  describe("EasyAuthGuard", () => {
    it("should allow request with valid Bearer token and attach user to request", async () => {
      const loginRes = await authController.login({
        provider: "test-provider",
        credentials: { username: "guard_user" },
      });

      const mockRequest: any = {
        headers: {
          authorization: `Bearer ${loginRes.token}`,
        },
      };

      const mockContext = {
        switchToHttp: () => ({
          getRequest: () => mockRequest,
        }),
        getHandler: () => ({}),
        getClass: () => ({}),
      } as unknown as ExecutionContext;

      const canActivate = await authGuard.canActivate(mockContext);
      expect(canActivate).toBe(true);
      expect(mockRequest.user).toBeDefined();
      expect(mockRequest.userId).toBe(loginRes.user.id);
    });

    it("should throw UnauthorizedException if authorization header is missing", async () => {
      const mockRequest: any = { headers: {} };
      const mockContext = {
        switchToHttp: () => ({
          getRequest: () => mockRequest,
        }),
        getHandler: () => ({}),
        getClass: () => ({}),
      } as unknown as ExecutionContext;

      await expect(authGuard.canActivate(mockContext)).rejects.toThrow(UnauthorizedException);
    });

    it("should allow request without token if route is marked as @Public()", async () => {
      const reflector = moduleRef.get<Reflector>(Reflector);
      const handlerFn = () => {};
      Reflect.defineMetadata(IS_PUBLIC_KEY, true, handlerFn);

      const guardWithReflector = new EasyAuthGuard(authService, reflector);

      const mockRequest: any = { headers: {} };
      const mockContext = {
        switchToHttp: () => ({
          getRequest: () => mockRequest,
        }),
        getHandler: () => handlerFn,
        getClass: () => class TestClass {},
      } as unknown as ExecutionContext;

      const allowed = await guardWithReflector.canActivate(mockContext);
      expect(allowed).toBe(true);
    });
  });
});
