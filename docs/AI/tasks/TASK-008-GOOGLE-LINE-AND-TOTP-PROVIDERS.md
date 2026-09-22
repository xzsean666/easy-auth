# TASK-008: Google、LINE 与 Google OTP (TOTP 6位数字验证码) Provider 实现

## Objective
扩展 Easy Auth 的内置认证驱动体系，提供开箱即用的：
1. `GoogleProvider`: 专有 Google 认证（支持 OAuth2 授权码交换与 Google ID Token 两种接入姿势）。
2. `LineProvider`: 专有 LINE 登录（支持 LINE Login v2.1 授权码交换与 ID Token 验签）。
3. `GoogleOtpProvider` (别名 `TotpProvider`): 专有基于 RFC 6238 的 6 位数字动态验证码（Google Authenticator 兼容，零外部依赖，自带 Secret 生成、URI 导出与时钟漂移容忍）。

## Scope
- `src/providers/google/index.ts`: GoogleProvider 实现
- `src/providers/line/index.ts`: LineProvider 实现
- `src/providers/totp/index.ts`: GoogleOtpProvider / TotpProvider 实现与 Base32 / HMAC-SHA1 RFC 6238 算法
- `src/providers/index.ts`: 导出新 Provider
- `src/index.ts`: 根导出
- `test/providers/google.test.ts`: 单测
- `test/providers/line.test.ts`: 单测
- `test/providers/totp.test.ts`: 单测
- `README.md`: 补充文档

## Allowed Files
- `src/providers/google/index.ts`
- `src/providers/line/index.ts`
- `src/providers/totp/index.ts`
- `src/providers/index.ts`
- `src/index.ts`
- `test/providers/google.test.ts`
- `test/providers/line.test.ts`
- `test/providers/totp.test.ts`
- `README.md`
- `docs/AI/tasks/TASK-008-GOOGLE-LINE-AND-TOTP-PROVIDERS.md`
- `docs/AI/TASK_INDEX.md`
- `docs/AI/SESSION_STATE.md`

## Dependencies
- `TASK-007` (SDK 门面就绪)

## Inputs and Outputs
- **Inputs**: Google OAuth/ID Token 凭据；LINE Login 凭据；Google OTP 6位数字及 Base32 密钥
- **Outputs**: 归一化身份（Google sub、LINE userId、OTP 账号标识）

## Acceptance Criteria
- [x] `GoogleProvider` 支持 `code` 换取 Token 与 `idToken` 两种登录模式。
- [x] `LineProvider` 支持 `code` 换取 Profile 与 `idToken` 验签。
- [x] `GoogleOtpProvider` 遵循 RFC 6238 标准，支持 6 位动态验证码校验，支持配置时钟容忍窗口（window），提供 `generateSecret()` 与 `generateTotpUri()` 辅助方法，且零第三方外部依赖（基于 `node:crypto`）。
- [x] 所有单元测试 100% 通过，构建无报错。

## Verification Commands
```bash
pnpm vitest run test/providers/google.test.ts
pnpm vitest run test/providers/line.test.ts
pnpm vitest run test/providers/totp.test.ts
pnpm test
pnpm run build
```

## Status
DONE

