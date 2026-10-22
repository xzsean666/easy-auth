# GOAL.md — Easy Auth 核心目标与演进路线

> 本文件是 Easy Auth 项目的总目标与长期规划事实来源（Source of Truth）。
> 任何功能扩展与架构调整均需对齐本文档设定的目标与边界。

---

## 1. 项目定位与核心愿景

**Easy Auth** 是一个面向 Node.js 生态的**通用身份认证与多身份统一映射 SDK**。

### 核心价值主张
- **统一身份抽象**：任何登录方式（Web3 钱包、Google、LINE、X、Supabase）最终归一到全局唯一的 `User ID`。
- **业务后端零心智负担**：业务服务只管校验 Easy Auth 的统一 JWT 并使用 `User.id`，不再需要针对不同第三方认证编写繁琐碎片化的接入、验签与续签逻辑。
- **无缝多身份绑定（Identity Linking）**：允许用户在注册后，任意绑定与解绑多个不同平台的登录凭据（例如用 Google 登录后绑定 Web3 钱包，未来两者均可直接登录同一账户）。
- **可插拔高灵活性**：认证 Provider、存储引擎（Memory / Postgres / SQLite / KVDB）、JWT 算法均采用接口抽象，支持渐进式扩展。

---

## 2. 演进里程碑 (Milestones)

### Milestone 1: 文档系统与敏捷开发规范建立 (当前完成 ✅)
- [x] 确立 `AGENTS.md` 规范与 GitHub 账号路由规则 (`xzsean666`)
- [x] 确立 `docs/AI_AGENT_PROMPT.md` 与开发流程约束
- [x] 产出完整的系统架构设计（`docs/ARCHITECTURE.md` 与 `docs/AI/ARCHITECTURE.md`）
- [x] 产出 SDK 开发者接入规范（`docs/SPEC.md`）
- [x] 建立决策记录 `docs/AI/DECISIONS.md` 与任务索引 `docs/AI/TASK_INDEX.md`
- [x] 细化拆分首期执行任务卡并初始化 `docs/AI/SESSION_STATE.md`

### Milestone 2: 工程基建、核心领域模型与存储抽象 (已完成 ✅)
- [x] 基于 pnpm 初始化现代化 TypeScript 5.x 生产级工程骨架
- [x] 配置双格式编译构建流水线（ESM + CJS 双产物支持，基于 tsup）
- [x] 配置 Vitest 高性能测试套件与代码规范检查
- [x] 核心领域模型与类型定义（`User`、`Identity`、`Metadata`、`EasyAuthOptions`）
- [x] 统一异常与错误码体系设计（`EasyAuthError`、`ErrorCode`）
- [x] 存储层抽象接口（`StorageAdapter`）与内置零依赖 `MemoryStorageAdapter` 实现

### Milestone 3: JWT 子系统与核心认证绑定引擎 (已完成 ✅)
- [x] JWT 模块实现（基于 `jose` 现代标准库，支持 HS256/RS256 签名、验签、过期与防重放）
- [x] 核心认证引擎 `AuthEngine`：统一调度 Provider 提取身份
- [x] 首次登录（自动新建用户与身份映射）与二次复登（幂等匹配用户）
- [x] 身份关联（Identity Linking）安全机制：冲突排他性检测与事务一致性
- [x] 身份解绑（Identity Unlinking）安全防御：禁止解绑最后一个有效身份（Anti-Lockout）
- [x] 针对核心领域逻辑的 100% 覆盖率单元测试

### Milestone 5: 持久化数据库引擎与生态集成 (已完成 ✅)
- [x] 基于 Node.js 22+ 原生 `node:sqlite` 的持久化存储适配器与自动建表
- [x] PostgreSQL 存储适配器与自动建表
- [x] NestJS 零 Controller 自动化模块与 Guard 接入

### Milestone 6: 跨平台多生态解耦、Cloudflare D1 驱动与轻量 Client SDK (进行中 🚀)
- [ ] **核心运行时解耦与按需子路径分包**：
  - 解除主入口对 `@nestjs/*`、`node:fs`、`node:sqlite` 的静态硬捆绑。
  - 主入口 `easy-auth` 保持 100% Edge/Universal 纯净，兼容 Node.js、Cloudflare Workers、Next.js Edge、Bun。
  - 子路径按需加载：`easy-auth/nestjs`（NestJS）、`easy-auth/d1`（Cloudflare D1）、`easy-auth/client`（前端 Client）。
- [ ] **Cloudflare D1 生产级存储适配器 (深度参考 `cloudlflare-worker-kvdb`)**：
  - 基于 Cloudflare 原生 `D1Database` 实例实现 `D1StorageAdapter`。
  - 支持 `D1SessionManager` / `bookmark` (Read-Your-Own-Writes 一致性保证)，解决分布式只读副本脏读问题。
  - 高性能 Auto-DDL：基于 `db.batch(...)` 一次网络 RPC 完成表与索引建立。
- [ ] **易扩展的现代化前端 Client SDK (`easy-auth/client`)**：
  - 框架无关的 Vanilla JS / TS 前端核心客户端。
  - 内置可插拔的 `TokenStorageAdapter`（支持 `localStorage` / `sessionStorage` / Cookie / 自定义）。
  - 内置带 Token 自动注入与 401 拦截处理的高阶 `auth.fetch()`。
  - 提供轻量适配机制，为后续 React Hooks (`useEasyAuth`)、Vue 等上层生态提供易扩展底座。
- [ ] **Cloudflare Workers / Hono 端到端真实运行示例与回归测试**：
  - 提供 `examples/cloudflare-worker-hono.ts` 原型。
  - 编写全面的 D1 适配器与解耦单测，确保 100% 覆盖。

## 3. 验收基准与非目标

### 验收基准 (Acceptance Criteria)
1. **纯净无副作用**：SDK 核心逻辑不依赖特定 HTTP 框架（如 Express、Koa、Fastify），仅作为通用 TypeScript/Node.js 库运作。
2. **测试驱动可验证**：每个功能模块均配有自动化测试用例，核心认证与绑定逻辑具备完备的边界测试（异常输入、篡改签名、并发重复绑定等）。
3. **类型安全完备**：提供 100% 强类型推导与 TypeScript `.d.ts` 声明文件。

### 非目标 (Non-Goals)
- **非自建 UI 库**：Easy Auth 不提供前端弹窗 UI 组件，仅专注服务端 SDK 与标准协议契约。
- **非数据库强绑定 ORM**：不强迫用户绑定 Prisma 或 TypeORM，通过清晰的 `StorageAdapter` 接口适配外部持久化。
- **不向下兼容老旧 Node.js**：明确基线为 **Node.js >= 22.0.0**，不针对 Node 18/20 等老旧版本提供向后兼容、Polyfill 或降级兼容方案。
- **不内置本地传统账号密码**：严格专注第三方 OAuth / OIDC / Web3 外部身份治理。不维护密码表、不存密码散列。若业务需要自有账号密码体系，应独立构建专属的 OAuth 2.0 授权服务器（Authorization Server），再通过 `OAuth2BaseProvider` 标准化挂载对接。
