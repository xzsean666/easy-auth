import { describe, it, expect } from "vitest";
import * as MainExports from "../src/index.js";
import * as NestExports from "../src/nestjs/index.js";

describe("Subpath & Runtime Decoupling", () => {
  it("main core entrypoint should be decoupled from NestJS", () => {
    // Main package exports should NOT contain NestJS decorators or modules
    expect((MainExports as any).EasyAuthModule).toBeUndefined();
    expect((MainExports as any).EasyAuthGuard).toBeUndefined();
    expect((MainExports as any).CurrentUser).toBeUndefined();

    // Main core essentials MUST be present
    expect(MainExports.EasyAuth).toBeDefined();
    expect(MainExports.AuthEngine).toBeDefined();
    expect(MainExports.JwtService).toBeDefined();
    expect(MainExports.MemoryStorageAdapter).toBeDefined();
    expect(MainExports.Web3Provider).toBeDefined();
  });

  it("nestjs subpath should export all NestJS components correctly", () => {
    expect(NestExports.EasyAuthModule).toBeDefined();
    expect(NestExports.EasyAuthGuard).toBeDefined();
    expect(NestExports.EasyAuthService).toBeDefined();
    expect(NestExports.EasyAuthController).toBeDefined();
    expect(NestExports.CurrentUser).toBeDefined();
    expect(NestExports.Public).toBeDefined();
  });
});
