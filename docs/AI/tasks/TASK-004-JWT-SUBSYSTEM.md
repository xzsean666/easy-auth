# TASK-004: JWT 签发、校验与过期管理子系统 (基于 jose)

## Objective
基于业界标准现代加密库 `jose`，实现 Easy Auth 的 JWT 统一签发、验签与失效管理模块，支持将 `User.id` 作为核心 Subject，并提供配置化的过期与算法管理。

## Scope
- `src/jwt/types.ts`: JWT 配置、Payload 接口
- `src/jwt/jwt-service.ts`: `JwtService` 类实现（`sign(user, options)`、`verify(token)`）
- `test/jwt/jwt-service.test.ts`: 针对签发、正常验签、过期 Token 拦截、非法签名拦截的完备测试

## Allowed Files
- `src/jwt/types.ts`
- `src/jwt/jwt-service.ts`
- `src/jwt/index.ts`
- `test/jwt/jwt-service.test.ts`

## Dependencies
- `TASK-003` (核心类型与错误系统)

## Inputs and Outputs
- **Inputs**: `JwtConfig` (secret 或密钥对, issuer, audience, expiresIn)
- **Outputs**: 纯净、高效的 JWT 签发验签子系统

## Acceptance Criteria
- [x] 能够签发带有 `sub: user.id` 与 `metadata` 摘要的标准 JWT。
- [x] 验签能够精确区分：签名无效（TOKEN_INVALID）与过期（TOKEN_EXPIRED）。
- [x] 验签通过后可准确解包出 `userId` (`sub`) 及载荷中的 `metadata`。
- [x] 单元测试覆盖率达 100%。

## Verification Commands
```bash
pnpm vitest run test/jwt/jwt-service.test.ts
```

## Risks and Assumptions
- 密钥由配置传入，不使用默认硬编码固定秘钥。

## Status
DONE

