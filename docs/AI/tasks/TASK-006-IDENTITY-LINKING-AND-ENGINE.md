# TASK-006: 核心认证引擎与多身份关联解绑逻辑 (Anti-Lockout)

## Objective
实现 Easy Auth 的核心业务引擎 `AuthEngine`，负责认证登录主流程调度、用户与身份自动建立、JWT 签发联动、多身份关联（Identity Linking）排他性冲突处理，以及解绑身份时的 Anti-Lockout（禁止解绑最后一个身份）安全防范。

## Scope
- `src/core/auth-engine.ts`: `AuthEngine` 核心逻辑实现
  - `authenticate(providerName, credentials)`: 登录与自动注册
  - `linkIdentity(userId, providerName, credentials)`: 身份关联
  - `unlinkIdentity(userId, providerName, providerUserId)`: 身份解绑与安全防护
  - `listIdentities(userId)`: 身份列表
  - `updateMetadata(userId, patch)`: 元数据更新
- `test/core/auth-engine.test.ts`: 涵盖首次登录、老用户登录、多身份关联、跨用户绑定冲突、解绑最后一个身份受阻等完整用例

## Allowed Files
- `src/core/auth-engine.ts`
- `src/core/index.ts`
- `test/core/auth-engine.test.ts`

## Dependencies
- `TASK-004` (JWT 子系统)
- `TASK-005` (Provider 抽象层与注册表)

## Inputs and Outputs
- **Inputs**: 凭证、Provider 标识、用户 ID
- **Outputs**: 统一的 `AuthResult`、`Identity` 记录与异常安全拦截

## Acceptance Criteria
- [x] 首次登录自动创建 User 与 Identity，返回带有新用户标记 `isNewUser: true`。
- [x] 同一身份再次登录直接匹配现有 User，`isNewUser: false`。
- [x] 支持成功关联第二个 Identity 至现有用户，后续该新 Identity 登录自动指向同一 User。
- [x] 试图关联已属于其他用户的 Identity 时，抛出 `IDENTITY_ALREADY_LINKED`。
- [x] 试图解绑用户的最后一个 Identity 时，抛出 `CANNOT_UNLINK_LAST_IDENTITY`。

## Verification Commands
```bash
pnpm vitest run test/core/auth-engine.test.ts
```

## Risks and Assumptions
- 需确保解绑时的并发数量判定准确，防止并发请求同时绕过最后身份检查。

## Status
DONE

