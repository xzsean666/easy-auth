# DECISIONS.md — Easy Auth 关键架构决策记录 (ADR)

> 本文件记录 Easy Auth 项目在架构演进过程中做出的关键技术决策与权衡考量。
> 任何后续开发者与 AI 均不得随意推翻已记录的决策，除非有明确的业务或架构升级需要。

---

## ADR-001: 采用“Provider → Identity → User”三元组解耦模型

- **状态**: Accepted (已采纳)
- **背景**: 传统认证系统经常把用户和登录方式绑死（例如 Users 表直接有 `google_id`, `wallet_address` 等字段），这导致每增加一种登录方式就要修改 Users 表，并且极难支持一个人拥有多个钱包或多个第三方号。
- **决策**:
  - 将用户实体 `User` 与登录凭据 `Identity` 彻底拆开。
  - 一个 `User` 拥有一对多的 `Identity`。
  - 一个 `Identity` 由 `(provider, providerUserId)` 唯一确定，全局独占归属于一个 `User`。
- **后果**:
  - 优点：新增任何 Provider 均零破坏核心表与核心逻辑；天然支持无缝身份关联（Identity Linking）。
  - 代价：查询用户时需关联或联合查询一次 Identity 关系，但通过良好索引可实现微秒级检索。

---

## ADR-002: 统一签发业务 JWT，以 Easy Auth User ID 为唯一 Subject

- **状态**: Accepted (已采纳)
- **背景**: 如果业务系统直接使用第三方返回的 Token（例如 Google ID Token 或 Web3 签名），业务后端不仅需要针对每种第三方引入校验 SDK，还要频繁处理 Token 格式不一致、刷新机制不同的问题。
- **决策**:
  - 无论用户通过何种途径完成登录，Easy Auth 统一在服务端签发内部标准的 JWT。
  - JWT 的 `sub` 始终是 Easy Auth 的全局统一 `User.id`。
  - 业务后端的各个业务接口与鉴权中间件，只需信任与校验 Easy Auth 签发的 JWT。
- **后果**:
  - 优点：业务应用彻底从第三方 OAuth / 签名繁杂逻辑中解脱，心智模型极简。
  - 代价：需要管理统一的 JWT 密钥或公私钥对。

---

## ADR-003: 强制实施 Anti-Lockout（防止账户锁死）防御原则

- **状态**: Accepted (已采纳)
- **背景**: 在多身份关联系统中，如果允许用户自由解绑所有 Identity，用户可能误删最后一个登录凭据，导致该账户成为永久无法登入的“孤儿账户”。
- **决策**:
  - 在 `unlinkIdentity` 执行前，强制统计该用户当前名下的有效 Identity 数量。
  - 若数量小于等于 1，拒绝解绑并立即抛出 `CANNOT_UNLINK_LAST_IDENTITY` 异常。
- **后果**:
  - 确保任何存量账户至少保留一种可用的登录通道。

---

## ADR-004: JWT 底层采用现代化轻量库 `jose`

- **状态**: Accepted (已采纳)
- **背景**: 传统的 `jsonwebtoken` 存在依赖庞大、类型支持老旧、不支持 Web Crypto API 等问题。
- **决策**:
  - 选用标准驱动的 `jose` 库作为底层 JWT 签名与验签引擎。
- **后果**:
  - 零重型原生编译依赖，兼容 Node.js 18+、Serverless、Cloudflare Workers 等各运行环境，性能极高且纯净安全。

---

## ADR-005: 存储层采用可插拔 Adapter 抽象，并内置内存驱动

- **状态**: Accepted (已采纳)
- **背景**: 作为通用开源 SDK，不能预先强制要求用户安装特定的数据库（如 PostgreSQL 或 Redis）。
- **决策**:
  - 定义清晰轻巧的 `StorageAdapter` 接口。
  - 核心内置零依赖的 `MemoryStorageAdapter`，让用户在开发、测试阶段无需起任何数据库即可 `new EasyAuth()` 跑通。
  - 生产环境可通过实现适配器接入 Postgres、MySQL、SQLite、MongoDB 或 KVDB。
- **后果**:
  - 极大降低使用门槛，提升开发者体验。

---

## ADR-006: 采用 pnpm + TypeScript 5.x + tsup (ESM/CJS 双产物)

- **状态**: Accepted (已采纳)
- **背景**: Node.js 生态目前处于 CommonJS 与 ESM 的混用时期，外部后端可能有旧的项目使用 `require()`，也有现代项目使用 `import`。
- **决策**:
  - 使用 pnpm 作为包管理器。
  - 使用 TypeScript 5.x 严格类型校验。
  - 使用 `tsup` 同时打包输出 ESM (`.mjs`) 与 CJS (`.cjs`)，并导出完整的 TypeScript 类型定义 `.d.ts`。
- **后果**:
  - 无论调用方项目使用 ESM 还是 CommonJS，均能零摩擦导入。

---

## ADR-008: 统一验证接口 `auth.verify(token)` 直出一级 `userId` 与 `metadata`

- **状态**: Accepted (已采纳)
- **背景**: 业务后端的请求拦截鉴权（如 Express / Fastify 中间件）每次验证 Token 时，最关心的核心上下文是：当前调用者是谁（`userId`），以及他的属性画像是什么（`metadata`，如权限角色、昵称等）。如果 SDK 仅返回原始 JWT payload 或仅返回 `userId`，业务端还需要额外手写一次数据库查询才能拿到 `metadata`，带来胶水代码与维护心智负担。
- **决策**:
  - SDK 提供统一顶层入口 `const { userId, metadata, user } = await auth.verify(token, options?)`。
  - 支持双模式：
    1. 默认强一致模式：自动查验存储层获取最新 `User.metadata`。
    2. 无状态快路径模式：可直接从 JWT Payload 解包获取基础 metadata。
- **后果**:
  - 接入方后端在中间件中只需调用本 SDK 的一行代码即可完成全部验签与用户信息提取，体验极佳。

---

## ADR-009: 极简第三方 Auth 插件体系与声明式接入模板

- **状态**: Accepted (已采纳)
- **背景**: 外部业务系统可能使用各类冷门或专有的登录方式（如企业私有微信/飞书 OAuth、Discord、Telegram WebApp、自建短信网关、Web3 各类 L2 链签名等）。如果每次接入新方式都需要等待 SDK 官方发版，或者接入代码需要编写几十行胶水代码，将严重阻碍开发者采纳。
- **决策**:
  - 契约最小化：`AuthProvider` 接口仅约束 `name` 和 `verifyAndExtract(creds)` 单一异步方法。
  - 多姿势快速接入：
    1. 提供通用声明式基类 `OAuth2BaseProvider`，用户仅需配置 Token/UserInfo URL 和 1 个字段映射回调，零网络样板代码即可接入任何 OAuth2 提供方。
    2. 提供函数式动态注册接口 `auth.registerProvider(name, async (creds) => ({ providerUserId, profile }))`。
    3. 支持运行时动态注册，开箱自动接入内核的防冲突与 Anti-Lockout 保护链。
- **后果**:
  - 新增任意第三方 Auth 无需侵入 SDK 内核，可在 5-10 行代码内极速完成。

---

## ADR-010: 内置 SQLite 与 PostgreSQL 持久化存储引擎与自动建表 (Auto-DDL)

- **状态**: Accepted (已采纳)
- **背景**: 默认的 `MemoryStorageAdapter` 在应用重启后会丢失所有注册用户与身份关联数据。开发者希望在实例化 `EasyAuth` 时直接指定数据库，并同时支持本地轻量 SQLite 和线上 PostgreSQL。
- **决策**:
  - 新增 `SqliteStorageAdapter`：利用 Node.js 22+ 原生内置的 `node:sqlite` (`DatabaseSync`)，零额外 C++ 编译或外部依赖，支持本地单文件与内存持久化。
  - 新增 `PostgresStorageAdapter`：接受标准 `pg.Pool` 或 SQL 执行器，支持高并发云端 PostgreSQL。
  - 自动 DDL：首次启动时自动检测并建表（`easy_auth_users`, `easy_auth_identities`），免除手动运行 SQL 脚本的痛苦。
  - 简化配置：`new EasyAuth({ database: { type: 'sqlite', path: './data.db' } })` 自动装配对应 Adapter。
- **后果**:
  - 开发者初始化即可拥有真实数据库持久化，且能在开发（SQLite）与生产（PostgreSQL）之间平滑迁移。

---

## ADR-011: NestJS 零样板自动化模块与 Guard 设计

- **状态**: Accepted (已采纳)
- **背景**: 在 NestJS 体系中，编写 Controller、Service、Route Handler 和 Guard 存在大量高度重复的代码。
- **决策**:
  - 提供 `EasyAuthModule.forRoot(options)` 动态模块，自动注入预设控制器（处理 `/login`, `/link`, `/unlink`, `/me`, `/identities` 等端点），用户在 NestJS 中无需编写任何 Auth 控制器代码。
  - 提供 `EasyAuthGuard`，自动验签 `Bearer <token>` 并注入 `req.user`。
  - 提供 `@CurrentUser()` 与 `@Public()` 装饰器。
- **后果**:
  - NestJS 开发者引入模块即可拥有完整认证 API 与守卫，彻底消灭控制器样板代码。

---

## ADR-012: 默认启用持久化 SQLite 数据库（彻底废弃默认内存丢失数据策略）

- **状态**: Accepted (已采纳)
- **背景**: 开发者强烈要求开箱即持久化，坚决杜绝因为使用内存存储而在服务重启后丢失已注册用户与身份关联数据。
- **决策**:
  - `EasyAuth` 实例化默认存储直接绑定为持久化 SQLite 文件（默认路径为 `./easy-auth.sqlite`，或读取 `process.env.EASY_AUTH_DB_PATH`）。
  - `SqliteStorageAdapter` 默认路径同样升级为 `./easy-auth.sqlite`，不再默认指向 `:memory:`。
  - 仅在开发者显式配置 `database: { type: 'memory' }` 或 `path: ':memory:'` 时才启用内存临时模式（主要供特定轻量隔离单测使用）。
- **后果**:
  - 开发者无论是初次初始化、写测试用例还是上线运行，用户数据默认 100% 写入磁盘 SQLite 数据库，彻底保障数据持久不丢失。


