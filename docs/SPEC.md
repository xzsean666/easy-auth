# Easy Auth SDK 开发者使用规范 (Developer Specification)

> 本规范定义了外部 Node.js / TypeScript 后端如何安装、配置与使用 `easy-auth` SDK。
> 使得任何后端应用都能以最少的心智负担快速接入多端身份认证。

---

## 1. 快速接入一览

```typescript
import { EasyAuth, MemoryStorageAdapter, Web3Provider, GoogleProvider } from "easy-auth";

// 1. 初始化 SDK 门面
const auth = new EasyAuth({
  jwt: {
    secret: process.env.JWT_SECRET || "your-256-bit-secret",
    expiresIn: "7d",
  },
  storage: new MemoryStorageAdapter(), // 生产环境可替换为数据库适配器
  providers: [
    new Web3Provider({
      domain: "example.com", // 用于防钓鱼与重放攻击 (SIWE)
    }),
    new GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    }),
  ],
});

// 2. 在业务端 API 中处理登录
app.post("/api/auth/login", async (req, res) => {
  const { provider, credentials } = req.body;
  
  // 核心统一登录接口
  const result = await auth.authenticate(provider, credentials);
  
  // 返回统一的 User 与 JWT Token
  res.json({
    user: result.user,
    token: result.token,
    isNewUser: result.isNewUser,
  });
});

// 3. 在中间件中验证请求 Token (完全走同一个 SDK)
app.use(async (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Missing token" });
  }

  const token = authHeader.slice(7);
  try {
    // 核心统一验证接口：直接返回用户 ID 与 metadata
    const { userId, metadata, user } = await auth.verify(token);
    
    // 挂载到请求上下文供后续业务路由使用
    req.userId = userId;
    req.userMetadata = metadata;
    req.user = user;
    
    next();
  } catch (err) {
    res.status(401).json({ error: "Invalid token" });
  }
});
```

---

## 2. 核心数据类型定义

### 2.1 User
统一的用户对象实体：
```typescript
export interface User {
  id: string;                      // 唯一用户 ID (例如: usr_2k5Xg9...)
  metadata: Record<string, any>;   // 用户画像 (name, avatar, email 等)
  createdAt: Date;                 // 首次注册时间
  updatedAt: Date;                 // 最近资料更新时间
}
```

### 2.2 Identity
外部登录凭据关联对象：
```typescript
export interface Identity {
  id: string;                      // 身份记录唯一主键 (例如: idn_8hT3...)
  userId: string;                  // 归属的 Easy Auth User.id
  provider: string;                // 提供方标识 (如 "web3", "google", "line", "x")
  providerUserId: string;          // 第三方平台全局唯一 ID (如钱包地址或 Google sub)
  profile?: Record<string, any>;   // 来自 Provider 的原始基础资料快照
  createdAt: Date;                 // 首次关联时间
  updatedAt: Date;                 // 最近活跃/更新时间
}
```

### 2.3 AuthResult
认证成功后的响应结构：
```typescript
export interface AuthResult {
  user: User;                      // 统一用户实体
  identity: Identity;              // 本次用于登录的 Identity
  token: string;                   // 统一签发的 JWT 字符串
  isNewUser: boolean;              // 是否为首次注册创建的用户
}
```

### 2.4 VerifyResult
业务后端在调用 `auth.verify(token)` 后的验证返回结果：
```typescript
export interface VerifyResult {
  userId: string;                  // 全局统一 User ID (等同于 user.id)
  metadata: Record<string, any>;   // 用户画像/元数据快照 (name, avatar, 角色等)
  user: User;                      // 完整的标准 User 实体
  payload: EasyAuthJwtPayload;     // 底层解码的 JWT Payload 原始内容
}
```

---

## 3. SDK 核心 API 方法

### `auth.authenticate(providerName, credentials)`
- **说明**：统一认证入口。若首次使用该身份则自动新建用户；若该身份已被绑定则直接登录对应用户。
- **参数**：
  - `providerName: string`: 目标 Provider 名称（如 `"web3"`, `"google"`）
  - `credentials: unknown`: 对应 Provider 要求的凭证载荷
- **返回**：`Promise<AuthResult>`

### `auth.verify(token, options?)` (别名: `auth.verifyToken`)
- **说明**：业务后端鉴权与中间件核心方法，**完全走同一个 SDK 即可完成请求验签与用户信息提取**。
- **参数**：
  - `token: string`: 请求头中的 Bearer JWT 字符串
  - `options?: VerifyOptions`:
    - `fetchUser?: boolean`: 是否从存储层实时拉取最新 User（默认为 `true` 强一致；设为 `false` 则直接从 JWT 载荷提取，实现无状态零 IO 极速验签）
- **返回**：`Promise<VerifyResult>`
- **典型用法**：
  ```typescript
  // 业务后端直接解构获取用户 ID 和 metadata，无需额外查询
  const { userId, metadata, user } = await auth.verify(token);
  console.log(`User ${userId} with name: ${metadata.name}`);
  ```
- **异常**：若 Token 无效、已过期或签名错误，抛出 `EasyAuthError`（Code: `TOKEN_INVALID` / `TOKEN_EXPIRED`）。

### `auth.linkIdentity(userId, providerName, credentials)`
- **说明**：将新的登录方式绑定至已有 User。
- **前置**：必须提供有效的待绑定凭据。
- **冲突防范**：若待绑定的第三方身份已经被其他 User 绑定，抛出 `IDENTITY_ALREADY_LINKED`。
- **返回**：`Promise<Identity>`

### `auth.unlinkIdentity(userId, providerName, providerUserId)`
- **说明**：解除已有用户绑定的某一身份凭据。
- **安全约束**：若当前用户仅剩这一个有效 Identity，拒绝解绑并抛出 `CANNOT_UNLINK_LAST_IDENTITY`。
- **返回**：`Promise<void>`

### `auth.listIdentities(userId)`
- **说明**：查询指定用户当前已绑定的所有外部身份。
- **返回**：`Promise<Identity[]>`

### `auth.updateUserMetadata(userId, patch)`
- **说明**：更新用户的通用 Metadata（如昵称、头像）。
- **返回**：`Promise<User>`

---

## 4. 极简接入新的第三方 Auth (Extensibility Guide)

Easy Auth 核心遵循 **开闭原则（Open-Closed Principle）**：核心的统一用户建档、多身份关联、防锁死保护与统一 JWT 签发已全部封装在内核中，**接入任何新的第三方 Auth 绝不需要修改任何核心源码**。

系统提供 **3 种极简接入姿势**，从轻量脚本到企业级 OAuth2 均能以最少代码接入：

### 4.1 核心微契约接口 (Micro-Contract)
所有第三方 Provider 的本质契约只有一个极简方法：
```typescript
export interface AuthProvider<TCredentials = any, TProfile = any> {
  readonly name: string; // 唯一名称，如 "github", "discord", "apple", "custom-sms"
  verifyAndExtract(credentials: TCredentials): Promise<ExtractedIdentity<TProfile>>;
}

export interface ExtractedIdentity<TProfile = any> {
  providerUserId: string;          // 该平台的全局唯一用户标识 (必须小写或标准唯一串)
  profile?: TProfile;              // 可选的资料快照 (将同步合并到 User.metadata)
}
```

---

### 4.2 接入方式 1：函数式秒级注册 (适合自定义短信、Telegram、内部 SSO)
无需定义任何类，直接用一行函数注册到 `EasyAuth` 实例中：

```typescript
// 示例：接入自定义短信验证码登录
auth.registerProvider("sms-otp", async (credentials: { phone: string; code: string }) => {
  const isValid = await verifySmsCode(credentials.phone, credentials.code);
  if (!isValid) throw new EasyAuthError("INVALID_CREDENTIALS", "SMS code invalid or expired");

  return {
    providerUserId: credentials.phone, // 以手机号作为唯一标识
    profile: { phone: credentials.phone },
  };
});

// 立即生效！前端或客户端直接调用：
const result = await auth.authenticate("sms-otp", { phone: "+8613800000000", code: "123456" });
```

---

### 4.3 接入方式 2：声明式通用 OAuth2 / OIDC 基类 (适合 GitHub、Discord、Apple、Slack 等)
针对标准 OAuth2 授权码流程，Easy Auth 提供内置的 `OAuth2BaseProvider`，**只需填写 Endpoint 配置和字段映射，无需编写任何网络请求或 Token 交换代码**：

```typescript
import { OAuth2BaseProvider } from "easy-auth";

// 示例：仅需 10 行声明式配置接入 GitHub 登录
const githubProvider = new OAuth2BaseProvider({
  name: "github",
  clientId: process.env.GITHUB_CLIENT_ID!,
  clientSecret: process.env.GITHUB_CLIENT_SECRET!,
  tokenEndpoint: "https://github.com/login/oauth/access_token",
  userInfoEndpoint: "https://api.github.com/user",
  // 提取唯一 ID 与画像映射
  mapProfile: (rawUser) => ({
    providerUserId: String(rawUser.id),
    profile: {
      name: rawUser.name || rawUser.login,
      avatar: rawUser.avatar_url,
      email: rawUser.email,
    },
  }),
});

auth.registerProvider(githubProvider);

// 客户端提交前端拿到的 oauth code 即可完成登录/绑定：
const result = await auth.authenticate("github", { code: "oauth_code_from_frontend" });
```

---

### 4.4 接入方式 3：类实现模式 (适合 Web3 签名、Supabase 等复杂校验)
对于包含椭圆曲线签名、非对称加解密或自定义 SDK 的复杂验证场景，实现 `AuthProvider` 接口即可：

```typescript
import { AuthProvider, ExtractedIdentity, EasyAuthError } from "easy-auth";
import { verifyMessage } from "viem";

export class Web3Provider implements AuthProvider<Web3Credentials> {
  readonly name = "web3";

  constructor(private options?: { domain?: string }) {}

  async verifyAndExtract(credentials: Web3Credentials): Promise<ExtractedIdentity> {
    const { address, signature, message } = credentials;
    
    // 1. 验证签名真实性
    const isValid = await verifyMessage({
      address: address as `0x${string}`,
      message,
      signature: signature as `0x${string}`,
    });

    if (!isValid) {
      throw new EasyAuthError("INVALID_CREDENTIALS", "Web3 signature verification failed");
    }

    // 2. 规范化并返回身份 (钱包地址统一转小写，防大小写分歧)
    return {
      providerUserId: address.toLowerCase(),
      profile: { address: address.toLowerCase() },
    };
  }
}
```

---

### 4.5 动态注册与热插拔
所有 Provider 均支持以下两种方式加载：
1. **构造函数集中配置**：`new EasyAuth({ providers: [new Web3Provider(), githubProvider] })`
2. **运行时动态注入**：`auth.registerProvider(new AnyNewProvider())`

注入后，系统自动支持：
- `auth.authenticate("my-provider", creds)`（登录与自动新用户创建）
- `auth.linkIdentity(userId, "my-provider", creds)`（与已有用户账户绑定）
- 自动继承唯一性约束与防死锁保护。

---

## 5. 存储适配器契约 (StorageAdapter)

Easy Auth 不锁死任何数据库。只要实现 `StorageAdapter` 接口即可替换底层持久化设施：

```typescript
export interface StorageAdapter {
  // User 操作
  createUser(data: { id: string; metadata?: Record<string, any> }): Promise<User>;
  getUserById(id: string): Promise<User | null>;
  updateUserMetadata(id: string, metadata: Record<string, any>): Promise<User>;
  
  // Identity 操作
  createIdentity(data: Omit<Identity, "id" | "createdAt" | "updatedAt">): Promise<Identity>;
  getIdentity(provider: string, providerUserId: string): Promise<Identity | null>;
  listIdentitiesByUserId(userId: string): Promise<Identity[]>;
  deleteIdentity(userId: string, provider: string, providerUserId: string): Promise<boolean>;
}
```

---

## 6. 统一错误码体系

Easy Auth 所有抛出的异常均为 `EasyAuthError` 实例，包含统一的 `code` 标识：

| 错误代码 (Code) | HTTP 推荐状态码 | 说明 |
|---|---|---|
| `PROVIDER_NOT_FOUND` | 400 | 请求的 Provider 未注册或不支持 |
| `INVALID_CREDENTIALS` | 401 | 第三方凭据无效（如签名不匹配、Token 失效） |
| `TOKEN_INVALID` | 401 | JWT 签名错误、结构篡改 |
| `TOKEN_EXPIRED` | 401 | JWT 已过期 |
| `USER_NOT_FOUND` | 404 | 指定的 User ID 不存在 |
| `IDENTITY_ALREADY_LINKED` | 409 | 该身份已被其他用户绑定 |
| `CANNOT_UNLINK_LAST_IDENTITY` | 400 | 不能解除用户的最后一个登录方式 |
| `STORAGE_ERROR` | 500 | 底层数据库/存储驱动故障 |

---

## 7. 内置持久化数据库引擎 (SQLite & PostgreSQL)

除内存存储 `MemoryStorageAdapter` 外，Easy Auth 原生内置了对 SQLite 和 PostgreSQL 的持久化支持：

### 7.1 SQLite (Node.js 22+ 原生驱动，零配置)
```typescript
import { EasyAuth, SqliteStorageAdapter } from "easy-auth";

// 方式 A：显式传递 SqliteStorageAdapter
const auth = new EasyAuth({
  jwt: { secret: "your-secret" },
  storage: new SqliteStorageAdapter({ path: "./data/auth.db" }),
  // ...
});

// 方式 B：快捷 database 配置 (自动完成表结构初始化)
const auth = new EasyAuth({
  jwt: { secret: "your-secret" },
  database: {
    type: "sqlite",
    path: "./data/auth.db", // 默认为 ./easy-auth.sqlite
  },
});
```

### 7.2 PostgreSQL (生产级数据库)
```typescript
import { EasyAuth, PostgresStorageAdapter } from "easy-auth";
import { Pool } from "pg";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const auth = new EasyAuth({
  jwt: { secret: "your-secret" },
  database: {
    type: "postgres",
    pool, // 传入连接池实例或直接指定 PostgresStorageAdapter
  },
});
```

---

## 8. NestJS 极简无 Controller 接入套件

Easy Auth 为 NestJS 开发者提供了开箱即用的自动化模块，彻底省去编写控制器样板代码：

### 8.1 引入模块 (自动暴露 REST API)
```typescript
// app.module.ts
import { Module } from '@nestjs/common';
import { EasyAuthModule } from 'easy-auth/nestjs';
import { Web3Provider, GoogleProvider } from 'easy-auth';

@Module({
  imports: [
    EasyAuthModule.forRoot({
      database: { type: 'sqlite', path: './auth.db' },
      jwt: { secret: process.env.JWT_SECRET! },
      providers: [
        new Web3Provider(),
        new GoogleProvider({ clientId: process.env.GOOGLE_CLIENT_ID! }),
      ],
      routePrefix: '/api/auth', // 自动挂载路由，默认为 /api/auth
    }),
  ],
})
export class AppModule {}
```
**自动激活的端点**：
- `POST /api/auth/login` (接收 `{ provider, credentials }`，返回 `{ user, token, isNewUser }`)
- `POST /api/auth/link` (多身份关联)
- `POST /api/auth/unlink` (身份解绑)
- `GET  /api/auth/me` (当前登录用户信息)
- `GET  /api/auth/identities` (名下所有绑定身份列表)

### 8.2 业务控制器中使用守卫与装饰器
```typescript
// user.controller.ts
import { Controller, Get, UseGuards } from '@nestjs/common';
import { EasyAuthGuard, CurrentUser } from 'easy-auth/nestjs';
import type { User } from 'easy-auth';

@Controller('users')
@UseGuards(EasyAuthGuard)
export class UserController {
  @Get('profile')
  getProfile(@CurrentUser() user: User) {
    return { status: 'success', user };
  }
}
```

