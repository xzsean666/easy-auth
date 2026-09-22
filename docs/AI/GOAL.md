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

### Milestone 4: 常用 Provider 适配器实现与 SDK 门面封装 (已完成 ✅)
- [x] Provider 抽象契约 `AuthProvider` 与动态注册中心 `ProviderRegistry`
- [x] Web3 EVM 钱包签名认证 Provider（支持 EIP-191 personal_sign 与 EIP-4361 SIWE 消息校验）
- [x] OAuth 2.0 / OIDC 基础抽象与声明式通用 `OAuth2BaseProvider` 实现
- [x] 极简第三方 Auth 扩展流水线（支持函数式 1 行注册与通用模板）
- [x] SDK 主门面 `EasyAuth` 封装与统一请求鉴权 `auth.verify(token)` 直出一级 userId 与 metadata
- [x] 提供真实后端集成示例（Express / Fastify 接入示例）
- [x] 全链路端到端集成测试与生产级 README 文档


---

## 3. 验收基准与非目标

### 验收基准 (Acceptance Criteria)
1. **纯净无副作用**：SDK 核心逻辑不依赖特定 HTTP 框架（如 Express、Koa、Fastify），仅作为通用 TypeScript/Node.js 库运作。
2. **测试驱动可验证**：每个功能模块均配有自动化测试用例，核心认证与绑定逻辑具备完备的边界测试（异常输入、篡改签名、并发重复绑定等）。
3. **类型安全完备**：提供 100% 强类型推导与 TypeScript `.d.ts` 声明文件。

### 非目标 (Non-Goals)
- **非自建 UI 库**：Easy Auth 不提供前端弹窗 UI 组件，仅专注服务端 SDK 与标准协议契约。
- **非数据库强绑定 ORM**：不强迫用户绑定 Prisma 或 TypeORM，通过清晰的 `StorageAdapter` 接口适配外部持久化。
