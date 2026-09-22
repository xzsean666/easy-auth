# Easy Auth 系统架构设计 (Architecture Specification)

> 本文档是 Easy Auth 的核心架构设计事实来源（Source of Truth）。
> 面向人类开发者与 AI 代理，全面定义系统定位、核心抽象模型、模块拆分、关键交互流程与工程落地规范。

---

## 1. 项目定位

**Easy Auth** 是一个面向 Node.js / TypeScript 生态的**通用多源身份认证与身份关联 SDK**。

后端应用在接入 Easy Auth 后，无需自行实现不同登录方式的认证鉴权、用户身份存储、多登录方式关联绑定、JWT 签发与验证等复杂且易错的逻辑。

Easy Auth 将异构的多方认证方式统一映射并聚拢到一个内部统一的 `User` 实体。

### 支持与规划的认证方式
- **Web3 Wallet**（以太坊/EVM 钱包签名验证，如 EIP-4361 / SIWE 或标准 Personal Sign）
- **OAuth 2.0 / OIDC Providers**（Google、LINE、X / Twitter、GitHub 等）
- **外部 Auth 服务**（Supabase Auth、Firebase Auth 等）
- **自定义 Provider**（开发者可通过 Provider 抽象接口灵活接入任意第三方体系）

### 核心目标与哲学
> **Any login → One User → One User ID**

---

## 2. 核心概念与抽象三元组

Easy Auth 的全系统设计高度收敛于三个核心抽象实体：

```text
Provider ──(Authenticate)──> Identity ──(BelongsTo)──> User
```

```
┌─────────────────────────────────────────────────────────────┐
│                            User                             │
│  - id: "usr_abc123"                                         │
│  - metadata: { name: "Alice", avatar: "https://..." }       │
│  - createdAt: Date                                          │
│  - updatedAt: Date                                          │
│                                                             │
│  ┌─────────────────┐ ┌─────────────────┐ ┌────────────────┐ │
│  │ Google Identity │ │  Web3 Identity  │ │ LINE Identity  │ │
│  │ (providerUserId)│ │ (walletAddress) │ │ (lineSubId)    │ │
│  └─────────────────┘ └─────────────────┘ └────────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

### 1. User (统一用户)
Easy Auth 内部统一的全局用户实体。
- 业务系统只需要持久化并依赖 `User.id`（例如：`usr_c78a...`），业务逻辑无需关心用户最初或本次是通过什么方式登录。
- 属性包含：`id`, `metadata`, `createdAt`, `updatedAt`。

### 2. Identity (外部绑定身份)
用户所绑定的具体外部身份凭据。
- 属性包含：
  - `id`: 身份记录唯一标识。
  - `userId`: 所属的 Easy Auth `User.id`。
  - `provider`: 身份来源标识（例如：`google`, `web3`, `line`, `x`, `supabase`）。
  - `providerUserId`: 第三方平台下的唯一标识（例如：Google 的 `sub`，Web3 的小写钱包地址，LINE 的 `userId`）。
  - `profile`: 第三方同步的原始基础资料快照。
  - `createdAt`: 绑定时间。
  - `updatedAt`: 最近更新时间。
- **约束规则**：
  - 一个 User 可以绑定多个不同（甚至相同 Provider 的多个）Identity。
  - 同一个 Identity（`provider + providerUserId`）在全系统中具有全局唯一性，**只能属于一个 User**。

### 3. JWT (业务统一通行证)
Easy Auth 向业务后端与客户端提供格式统一、自包含或可查验的 JWT。
- JWT Payload 的核心 Subject (`sub`) 为 Easy Auth 的 `User.id`。
- 业务后端通过 Easy Auth SDK 快速验证 JWT 签名、有效性与权限，直接解析获得对应的 `User` 与基础上下文。

---

## 3. 总体架构分层

```text
                     ┌────────────────────────┐
                     │    Client / Frontend   │
                     └───────────┬────────────┘
                                 │
                     Login / Link Identity / Request
                                 │
                                 ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                           Easy Auth SDK                                 │
│                                                                         │
│   ┌─────────────────────────────────────────────────────────────────┐   │
│   │                        EasyAuth Facade                          │   │
│   │   .authenticate()    .verifyJwt()    .link()    .unlink()       │   │
│   └───────────────┬─────────────────────────┬───────────────────────┘   │
│                   │                         │                           │
│   ┌───────────────▼───────────────┐ ┌───────▼───────────────────────┐   │
│   │         AuthEngine            │ │         JwtService            │   │
│   │  - 首次登录/找回映射           │ │  - 统一 JWT 签发               │   │
│   │  - Identity 绑定/解绑防护      │ │  - 签名校验与过期管理          │   │
│   │  - 基础认证防重与竞争控制     │ │  - Payload 装配与解包          │   │
│   └───────────────┬───────────────┘ └───────────────────────────────┘   │
│                   │                                                     │
│   ┌───────────────▼───────────────┐ ┌───────────────────────────────┐   │
│   │      Provider Registry        │ │       Storage Adapter         │   │
│   │  ┌──────────┐ ┌──────────┐    │ │  - User & Identity CRUD       │   │
│   │  │   Web3   │ │  Google  │    │ │  - 事务性保障与并发冲突处理   │   │
│   │  ├──────────┤ ├──────────┤    │ │  - 内存驱动 / 数据库驱动      │   │
│   │  │   LINE   │ │    X     │    │ │    (Postgres/SQLite/KVDB等)   │   │
│   │  └──────────┴ └──────────┘    │ │                               │   │
│   └───────────────────────────────┘ └───────────────────────────────┘   │
└────────────────────────────────────┬────────────────────────────────────┘
                                     │
                                     ▼
                           ┌──────────────────┐
                           │ Backend Business │
                           │   (App Server)   │
                           └──────────────────┘
```

---

## 4. 认证与生命周期流程 (Authentication Flow)

### 4.1 登录流程 (首次与老用户复登)

```text
客户端/业务端提供凭据 (例如 Web3 签名或 OAuth 授权码/Token)
                      ↓
           EasyAuth.authenticate(provider, payload)
                      ↓
           Provider.verifyAndExtract(payload)
                      ↓
           得到标准化的 ProviderIdentity:
           { provider: "web3", providerUserId: "0x123..." }
                      ↓
           StorageAdapter.findIdentity(provider, providerUserId)
                      │
        ┌─────────────┴─────────────┐
        ▼                           ▼
    [身份已存在]                 [身份不存在]
        │                           │
  加载对应 User              StorageAdapter.createUser()
        │                           │
        │                    StorageAdapter.createIdentity()
        │                           │
        └─────────────┬─────────────┘
                      ↓
            JwtService.sign({ sub: user.id })
                      ↓
      返回 { user, identity, token, isNewUser }
```

### 4.2 身份关联流程 (Identity Linking)

当用户已通过某个 Provider 登录（已拥有当前有效的 `User: usr_001`），希望将新的登录方式（例如 Web3 钱包）关联至该账户：

```text
已登录上下文 (User: usr_001)
                      ↓
           EasyAuth.linkIdentity(currentUserId, provider, payload)
                      ↓
           Provider.verifyAndExtract(payload)
                      ↓
           得到目标 ProviderIdentity:
           { provider: "web3", providerUserId: "0x789..." }
                      ↓
           StorageAdapter.findIdentity(provider, providerUserId)
                      │
        ┌─────────────┴─────────────┐
        ▼                           ▼
    [身份已存在]                 [身份不存在]
        │                           │
  已属于当前 User?                  │
   ├── 是 -> 幂等返回成功           │
   └── 否 -> 抛出冲突异常           │
       (IDENTITY_ALREADY_LINKED)    │
                                    │
                                    ↓
                     StorageAdapter.createIdentity({
                       userId: currentUserId,
                       provider,
                       providerUserId,
                       ...
                     })
                                    ↓
                     返回最新关联后的 Identities 列表
```

### 4.3 身份解绑流程 (Identity Unlinking)

```text
已登录上下文 (User: usr_001)
                      ↓
           EasyAuth.unlinkIdentity(currentUserId, provider, providerUserId)
                      ↓
           查询该 User 当前拥有的所有有效 Identities
                      ↓
           总数 <= 1 ?
            ├── 是 -> 抛出安全异常 (CANNOT_UNLINK_LAST_IDENTITY)
            └── 否 -> 执行解除关联
                      ↓
           StorageAdapter.deleteIdentity(userId, provider, providerUserId)
                      ↓
           返回解绑成功
```

---

## 5. Identity Linking 的安全原则与红线

1. **强认证前置**：任何关联操作必须验证待绑定 Provider 的有效凭证（如签名有效、OAuth Token 校验有效），严禁根据未经校验的第三方 ID 裸绑定。
2. **全局独占性**：一个物理身份（`provider + providerUserId`）在同一时刻只能绑定到一个 `User`。若发现已被其他 User 绑定，必须拒绝关联并提示冲突。
3. **不可孤儿化 (Anti-Lockout)**：一个用户解除关联时，系统必须校验其剩余可用认证方式。**严禁解绑用户的最后一个有效登录凭据**，避免产生永久无法登入的死号。
4. **并发控制**：在创建和关联 Identity 时，存储层必须具备唯一约束（Unique Constraint）或原子锁，防御并发绑定竞争（Race Condition）。

---

## 6. User Metadata 规范

`User.metadata` 用于存放与具体认证方式解耦的用户通用业务画像：
```typescript
interface UserMetadata {
  name?: string;
  nickname?: string;
  avatar?: string;
  email?: string;
  locale?: string;
  custom?: Record<string, unknown>;
}
```
- **职责清晰**：Metadata 仅作为用户资料的承载体，**绝不作为系统鉴权的唯一凭据**。真正稳定的身份锚点永远是全局唯一的 `User.id`。
- **可更新**：提供 `updateUserMetadata(userId, patch)`，支持全量或局部字段合并。

---

## 7. JWT 与统一验证子系统 (JWT & Verification Subsystem)

Easy Auth 承担 JWT 的完整生命周期管理（签发、结构装配、验签、过期与用户信息解析）：
- **算法选择**：默认支持业界标准的 HS256（共享对称秘钥）与 RS256/ES256（非对称公私钥对）。
- **标准 Payload 结构**：
  ```typescript
  interface EasyAuthJwtPayload {
    sub: string;                      // Easy Auth User ID (如 usr_xxx)
    iss: string;                      // 签发机构 (默认 "easy-auth")
    aud?: string;                     // 适用客户端/业务系统
    iat: number;                      // 签发时间戳
    exp: number;                      // 过期时间戳
    metadata?: Record<string, any>;   // 基础元数据快照 (无状态模式下支持直接读取)
    identities?: string[];            // 当前已绑定的 Provider 摘要
  }
  ```

### 7.1 统一请求验证架构 (Verify Flow)

**业务后端完全通过同一个 Easy Auth SDK 实例进行鉴权**，无需任何第三方 JWT 繁琐配置或手动查询：

```text
客户端 HTTP 请求 (携带 Bearer <token>)
               ↓
业务后端中间件 (Express / Fastify / NestJS / Hono 等)
               ↓
   const { userId, metadata, user } = await auth.verify(token);
               │
               ▼
   ┌──────────────────────────────────────────────┐
   │            EasyAuth.verify(token)            │
   │                                              │
   │ 1. 签名与时间戳校验 (JwtService)             │
   │    ├── 验证失败 -> 抛出 TOKEN_INVALID / EXPIRED
   │    └── 验证成功 -> 解析出 sub (userId)        │
   │                                              │
   │ 2. 用户与元数据组装 (双模式支持)              │
   │    ├── [强一致模式 (默认)]:                  │
   │    │   通过 StorageAdapter.getUserById(sub)  │
   │    │   实时获取数据库中最新的 metadata       │
   │    └── [极速无状态模式 (fetchUser: false)]:  │
   │        直接解包 JWT Payload 携带的 metadata  │
   │                                              │
   │ 3. 封装返回 VerifyResult:                    │
   │    { userId, metadata, user, payload }       │
   └──────────────────────────────────────────────┘
               ↓
业务后端获取到强类型的 userId 与 metadata，直接流转业务逻辑
```

这一设计的核心价值：
1. **统一门面**：登录走 `auth.authenticate`，验证走 `auth.verify`，全套心智完全闭环。
2. **零胶水代码**：业务后端无需手写 `jwt.verify`，也无需手写 `db.findUserById(decoded.sub)`，SDK 一步到位返回 `userId` 和 `metadata`。

---

## 8. 模块划分与工程组织

Easy Auth 整体采用分层、清晰边界的单体 SDK 架构（支持 pnpm 管理）：

```text
src/
├── core/                  # 核心领域模型与认证引擎
│   ├── auth-engine.ts     # 认证与绑定编排引擎
│   ├── types.ts           # User, Identity, Metadata, Session 类型
│   └── errors.ts          # 统一错误分类 (EasyAuthError)
├── jwt/                   # JWT 签发与验证子系统
│   ├── jwt-service.ts     # JWT 编解码、签名与验签器
│   └── types.ts           # Token 配置与 Payload 定义
├── providers/             # 认证适配器体系
│   ├── base.ts            # Provider 接口契约 (AuthProvider)
│   ├── registry.ts        # Provider 注册表与分发
│   ├── web3/              # Web3 EVM 钱包签名认证 Provider
│   ├── google/            # Google OAuth 认证 Provider
│   ├── line/              # LINE OAuth 认证 Provider
│   ├── x/                 # X / Twitter OAuth 认证 Provider
│   └── supabase/          # Supabase Auth 适配 Provider
├── storage/               # 存储抽象层
│   ├── base.ts            # StorageAdapter 接口契约
│   ├── memory.ts          # 零依赖内置内存存储 (测试/快速启动)
│   └── ...                # 外置/SQL/KVDB 适配扩展
└── index.ts               # SDK 统一门面导出 (EasyAuth)
```

---

## 9. 扩展性原则与设计契约

1. **添加新 Provider 零侵入**：
   - 新增 Provider 仅需实现 `AuthProvider` 接口（定义 `name` 与 `verifyAndExtract(payload)`），并在初始化时注册到 `easyAuth.registerProvider(new MyProvider())`。
   - 核心 `User`、`Identity` 与 `JWT` 逻辑不需要任何修改。
2. **存储层即插即用**：
   - `StorageAdapter` 定义了最精简的存取契约：`getUser`、`createUser`、`getIdentity`、`createIdentity`、`deleteIdentity` 等。
   - 默认自带高可用内存驱动 `MemoryStorageAdapter`（支持单元测试与本地开发）；生产环境可直接接入 PostgreSQL、MySQL、SQLite 或 KVDB。

---

## 10. 极简第三方 Auth 插件架构与扩展流水线 (Extensible Provider Architecture)

为确保开发者接入任意未知第三方登录时“**开发成本最低、心智负担最小、稳定性最高**”，Easy Auth 采用高度标准化的插件扩展流水线：

```text
       ┌────────────────────────────────────────────────────────┐
       │             Any 3rd-Party Auth Provider                │
       │                                                        │
       │  [形态 1: 函数式] auth.registerProvider("name", fn)    │
       │  [形态 2: 声明式] new OAuth2BaseProvider({ ... })       │
       │  [形态 3: 类扩展] class MyProvider implements Auth...  │
       └───────────────────────────┬────────────────────────────┘
                                   │ verifyAndExtract(creds)
                                   ▼
              ┌────────────────────────────────────────┐
              │           Normalized Output            │
              │  {                                     │
              │    providerUserId: "clean_unique_id",  │
              │    profile?: { ... }                   │
              │  }                                     │
              └────────────────────┬───────────────────┘
                                   │
                                   ▼
    ┌─────────────────────────────────────────────────────────────┐
    │                      Easy Auth 内核管道                      │
    │                                                             │
    │  1. 幂等用户建档或老用户找回 (Auto Create / Match)         │
    │  2. 多身份关联互斥校验 (Link / Anti-Conflict)              │
    │  3. 账户防孤立锁死安全拦截 (Anti-Lockout)                  │
    │  4. 统一签发以 User.id 为 Subject 的 JWT                   │
    └─────────────────────────────────────────────────────────────┘
```

### 接入三原则
1. **纯粹函数化验证**：Provider 仅充当“验证器与信息提取器”。Provider 内部严禁直接触碰数据库、严禁签发 Token，只输出标准化的 `providerUserId` 与基础资料快照。
2. **标识小写归一化 (Identifier Normalization)**：Provider 负责将外部标识清洗为全局唯一格式（例如钱包地址统一 `toLowerCase()`、邮箱统一去空格小写），底层内核负责全局独占性保障。
3. **零配置依赖注入**：通过 `OAuth2BaseProvider` 基类，标准 OAuth2 服务（如 GitHub、Discord、Apple、飞书等）仅需提供几个 URL 字符串与字段映射，无需接入方引入庞大的第三方官方 SDK。

