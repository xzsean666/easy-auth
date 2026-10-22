# TASK_INDEX.md — Easy Auth 任务索引全景

> 本文件是 Easy Auth 任务规划与执行状态的全局索引。
> 状态定义：`TODO` -> `IN_PROGRESS` -> `REVIEW` -> `DONE` (或 `BLOCKED`)。

---

## 1. 任务全景视图 (Task Overview)

| Task ID | 名称 | 预估耗时 | 依赖 | 状态 | 关联文件 |
|---|---|---|---|---|---|
| [TASK-001](file:///ssd0/git/easy-auth/docs/AI/tasks/TASK-001-DOCUMENTATION-SYSTEM.md) | 建立 Easy Auth 文档体系与 AI 敏捷规范 | 45m | 无 | **DONE** ✅ | 全套文档 |
| [TASK-002](file:///ssd0/git/easy-auth/docs/AI/tasks/TASK-002-PROJECT-SCAFFOLD.md) | 初始化 pnpm + TypeScript 5 + Vitest + tsup 工程脚手架 | 45m | TASK-001 | **DONE** ✅ | `package.json`, `tsconfig.json`, `tsup.config.ts`, `vitest.config.ts` |
| [TASK-003](file:///ssd0/git/easy-auth/docs/AI/tasks/TASK-003-CORE-MODELS-AND-STORE.md) | 核心模型定义、错误体系与 MemoryStorage 适配器实现 | 60m | TASK-002 | **DONE** ✅ | `src/core/types.ts`, `src/core/errors.ts`, `src/storage/` |
| [TASK-004](file:///ssd0/git/easy-auth/docs/AI/tasks/TASK-004-JWT-SUBSYSTEM.md) | JWT 签发、校验与过期管理子系统 (基于 jose) | 45m | TASK-003 | **DONE** ✅ | `src/jwt/` |
| [TASK-005](file:///ssd0/git/easy-auth/docs/AI/tasks/TASK-005-PROVIDER-LAYER-AND-WEB3.md) | Provider 抽象契约、注册表与 Web3 钱包签名认证实现 | 60m | TASK-003 | **DONE** ✅ | `src/providers/` |
| [TASK-006](file:///ssd0/git/easy-auth/docs/AI/tasks/TASK-006-IDENTITY-LINKING-AND-ENGINE.md) | 核心认证引擎与多身份关联解绑逻辑 (Anti-Lockout) | 75m | TASK-004, TASK-005 | **DONE** ✅ | `src/core/auth-engine.ts` |
| [TASK-007](file:///ssd0/git/easy-auth/docs/AI/tasks/TASK-007-SDK-FACADE-AND-EXAMPLES.md) | SDK 统一门面封装、全链路端到端测试与使用示例 | 60m | TASK-006 | **DONE** ✅ | `src/index.ts`, `test/e2e/`, `examples/` |
| [TASK-008](file:///ssd0/git/easy-auth/docs/AI/tasks/TASK-008-GOOGLE-LINE-AND-TOTP-PROVIDERS.md) | Google、LINE 与 Google OTP (TOTP 6位数字验证码) Provider 实现 | 60m | TASK-007 | **DONE** ✅ | `src/providers/google/`, `src/providers/line/`, `src/providers/totp/` |
| [TASK-009](file:///ssd0/git/easy-auth/docs/AI/tasks/TASK-009-DATABASE-STORAGE-ADAPTERS.md) | SQLite 与 PostgreSQL 持久化存储适配器实现 | 60m | TASK-003, TASK-007 | **DONE** ✅ | `src/storage/sqlite.ts`, `src/storage/postgres.ts` |
| [TASK-010](file:///ssd0/git/easy-auth/docs/AI/tasks/TASK-010-NESTJS-INTEGRATION.md) | NestJS 零 Controller 自动化模块与 Guard 接入实现 | 60m | TASK-009 | **DONE** ✅ | `src/nestjs/` |
| [TASK-011](file:///ssd0/git/easy-auth/docs/AI/tasks/TASK-011-MULTI-PLATFORM-SUBPATH-DECOUPLING.md) | 核心运行时解耦与子路径按需分包体系 (解除 NestJS 与 Node fs 顶层硬捆绑) | 60m | TASK-007, TASK-010 | **DONE** ✅ | `package.json`, `tsup.config.ts`, `src/index.ts`, `src/easy-auth.ts` |
| [TASK-012](file:///ssd0/git/easy-auth/docs/AI/tasks/TASK-012-CLOUDFLARE-D1-STORAGE-ADAPTER.md) | Cloudflare D1 存储适配器与 RYW Session 优化 (参考 kvdb) | 60m | TASK-011 | **DONE** ✅ | `src/d1/` |

| [TASK-013](file:///ssd0/git/easy-auth/docs/AI/tasks/TASK-013-CLIENT-SDK.md) | 框架无关的前端轻量扩展 Client SDK (easy-auth/client) | 60m | TASK-011 | **DONE** ✅ | `src/client/` |
| [TASK-014](file:///ssd0/git/easy-auth/docs/AI/tasks/TASK-014-CLOUDFLARE-HONO-EXAMPLE-AND-TESTS.md) | Cloudflare Worker + Hono 真实接入示例与全链路回归验证 | 45m | TASK-011, TASK-012, TASK-013 | **DONE** ✅ | `examples/cloudflare-worker-hono.ts`, `README.md` |



---

## 2. 状态流转规则

```text
TODO -> IN_PROGRESS -> REVIEW -> DONE
                    \-> BLOCKED
```

- **TODO**：任务就绪，等待安排。
- **IN_PROGRESS**：当前 Session 正在集中处理的任务（单 Session 最多 1 个）。
- **REVIEW**：代码已完成，正在等待自动化测试、构建校验或审查。
- **DONE**：验收条件全部达成，测试全绿，文档已同步更新。
- **BLOCKED**：遇到外部依赖或无法解决的环境障碍。

---

## 3. 当前执行焦点

- **当前活跃里程碑**：Milestone 6: 跨平台多生态解耦、Cloudflare D1 驱动与轻量 Client SDK
- **当前任务**：`TASK-011: 核心运行时解耦与子路径按需分包体系`
- **状态总结**：已完成架构设计与技术规格制定，准备启动 TASK-011 执行！







