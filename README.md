# Easy Auth 🔐

> **Universal Multi-Provider Authentication & Identity Linking SDK for Node.js & TypeScript**  
> *Any login → One User → One User ID*

[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-blue.svg)](https://www.typescriptlang.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

**Easy Auth** is a lightweight, zero-boilerplate authentication orchestration SDK designed for modern Node.js and TypeScript backends. It flattens disparate login methods (Web3 Wallets, Google, GitHub, LINE, X, SMS OTP, etc.) into a single unified `User` model, manages multi-identity account linking, and issues standard JWT tokens.

With Easy Auth, business servers don't need to write glue code or database schemas for every third-party login provider. **One SDK handles both authentication and middleware token verification.**

---

## 🌟 Key Features

- 🌐 **Unified Identity Abstraction**: Normalizes all external identities into a single `User` with a persistent `User.id` (`usr_...`).
- 🔗 **Identity Linking & Multi-Login**: Link multiple wallets, social accounts, and phone numbers to the same user. Log in with any of them to reach the same account.
- 🛡️ **Anti-Lockout Protection**: Prevents users from unlinking their last remaining authentication method, avoiding permanently orphaned accounts.
- ⚡ **Streamlined Verification**: Verify incoming Bearer tokens in one line: `const { userId, metadata } = await auth.verify(token)`.
- 🔌 **Extensible in 3 Ways**:
  1. **Functional (1 line)** for custom SMS, Telegram, or internal SSO.
  2. **Declarative (`OAuth2BaseProvider`)** for standard OAuth2/OIDC providers (GitHub, Discord, Google, etc.).
  3. **Class-based (`AuthProvider`)** for cryptographic signatures (Web3 EVM wallets) or custom SDKs.
- 📦 **Dual Output (ESM & CJS)**: Works out of the box with `import` and `require`.
- 💾 **Native Database Persistence**: Built-in SQLite (Node.js 22+ `node:sqlite` zero-dependency engine) and PostgreSQL support, with automatic table initialization (Auto-DDL).
- 🦁 **NestJS Zero-Controller Module**: Plug & play `EasyAuthModule` with zero controller boilerplate, auto-routing, `@CurrentUser()`, and `EasyAuthGuard`.

---

## 📦 Installation

```bash
pnpm add easy-auth
# or
npm install easy-auth
```

---

## 🚀 Quick Start

### 1. Initialize EasyAuth (Zero-Config Persistent SQLite or PostgreSQL)

```typescript
import {
  EasyAuth,
  Web3Provider,
  GoogleProvider,
  LineProvider,
  GoogleOtpProvider,
} from "easy-auth";

export const auth = new EasyAuth({
  jwt: {
    secret: process.env.JWT_SECRET || "your-32-characters-secure-secret-key!",
    expiresIn: "7d",
  },
  // 💾 Zero-config SQLite database (auto-creates tables!):
  database: {
    type: "sqlite",
    path: "./data/auth.db", // Or ':memory:' for memory mode
  },
  // Or for PostgreSQL in production:
  // database: { type: "postgres", pool: pgPool },
  providers: [
    // 1. Web3 EVM Wallet
    new Web3Provider({ domain: "example.com" }),

    // 2. Google (supports OAuth2 code and Google ID Token)
    new GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    }),

    // 3. LINE Login v2.1
    new LineProvider({
      channelId: process.env.LINE_CHANNEL_ID!,
      channelSecret: process.env.LINE_CHANNEL_SECRET,
    }),

    // 4. Google Authenticator 6-digit dynamic OTP (RFC 6238 TOTP with rate limiting & anti-bruteforce)
    new GoogleOtpProvider({
      secret: async (account) => await db.findUserTotpSecret(account),
      maxFailedAttempts: 5,
    }),
  ],
});
```

### 2. Handle Login in Your API

```typescript
// Express / Fastify / Hono route
app.post("/api/auth/login", async (req, res) => {
  const { provider, credentials } = req.body;

  // Single unified login method
  const result = await auth.authenticate(provider, credentials);

  res.json({
    token: result.token,
    user: result.user,
    isNewUser: result.isNewUser,
  });
});
```

### 3. Verify Tokens in Your Middleware (One Line!)

```typescript
app.use(async (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Missing token" });
  }

  const token = authHeader.slice(7);
  try {
    // 💡 Unpack userId and user metadata directly!
    const { userId, metadata, user } = await auth.verify(token);

    req.userId = userId;
    req.userMetadata = metadata;
    req.user = user;

    next();
  } catch (err) {
    res.status(401).json({ error: "Invalid or expired token" });
  }
});
```

---

## 🦁 NestJS Integration (Zero-Controller Setup)

With `easy-auth/nestjs`, you **never have to write repetitive Auth controllers again**:

### 1. Import `EasyAuthModule` in `app.module.ts`:
```typescript
import { Module } from "@nestjs/common";
import { EasyAuthModule } from "easy-auth/nestjs";
import { Web3Provider, GoogleProvider } from "easy-auth";

@Module({
  imports: [
    EasyAuthModule.forRoot({
      // Auto-creates SQLite tables locally, or pass PostgreSQL pool in production:
      database: { type: "sqlite", path: "./data/auth.db" },
      jwt: { secret: process.env.JWT_SECRET! },
      providers: [
        new Web3Provider({ domain: "localhost:3000" }),
        new GoogleProvider({ clientId: process.env.GOOGLE_CLIENT_ID! }),
      ],
      routePrefix: "/api/auth", // Automatically handles /login, /link, /unlink, /me, /identities!
    }),
  ],
})
export class AppModule {}
```

### 2. Protect Business Endpoints with `@CurrentUser()` & `EasyAuthGuard`:
```typescript
import { Controller, Get, UseGuards } from "@nestjs/common";
import { EasyAuthGuard, CurrentUser } from "easy-auth/nestjs";
import type { User } from "easy-auth";

@Controller("orders")
export class OrderController {
  @Get("my-orders")
  @UseGuards(EasyAuthGuard)
  getMyOrders(@CurrentUser() user: User) {
    return { userId: user.id, metadata: user.metadata };
  }
}
```

---

## 🧩 Adding New Providers (Extensibility Guide)

### Approach 1: Functional Registration (1 Line)
Ideal for SMS verification, OTP, Telegram bots, or custom backends:

```typescript
auth.registerProvider("sms-otp", async (credentials: { phone: string; code: string }) => {
  const isValid = await verifySmsCode(credentials.phone, credentials.code);
  if (!isValid) throw new EasyAuthError("INVALID_CREDENTIALS", "Invalid SMS code");

  return {
    providerUserId: credentials.phone,
    profile: { phone: credentials.phone },
  };
});
```

### Approach 2: Declarative `OAuth2BaseProvider`
No HTTP boilerplate needed. Provide endpoints and profile mapping:

```typescript
const discordProvider = new OAuth2BaseProvider({
  name: "discord",
  clientId: process.env.DISCORD_CLIENT_ID!,
  clientSecret: process.env.DISCORD_CLIENT_SECRET!,
  tokenEndpoint: "https://discord.com/api/oauth2/token",
  userInfoEndpoint: "https://discord.com/api/users/@me",
  mapProfile: (rawUser) => ({
    providerUserId: rawUser.id,
    profile: {
      username: rawUser.username,
      avatar: rawUser.avatar,
      email: rawUser.email,
    },
  }),
});

auth.registerProvider(discordProvider);
```

### Approach 3: Class-Based Provider
Implement `AuthProvider` for custom cryptography or non-standard protocols:

```typescript
import { AuthProvider, ExtractedIdentity, EasyAuthError } from "easy-auth";

export class CustomApiKeyProvider implements AuthProvider<{ apiKey: string }> {
  readonly name = "api-key";

  async verifyAndExtract(credentials: { apiKey: string }): Promise<ExtractedIdentity> {
    const keyInfo = await db.findKey(credentials.apiKey);
    if (!keyInfo) {
      throw new EasyAuthError("INVALID_CREDENTIALS", "API key not found");
    }
    return {
      providerUserId: keyInfo.ownerId,
      profile: { tier: keyInfo.tier },
    };
  }
}
```

---

## 🔢 Google OTP (Google Authenticator 6-Digit TOTP)

Easy Auth treats Google Authenticator / TOTP as a first-class, standard `AuthProvider`:

```typescript
import { EasyAuth, GoogleOtpProvider } from "easy-auth";

// 1. Generate a secret & QR code URI for user setup
const secret = GoogleOtpProvider.generateSecret(); // -> Base32 secret string
const uri = GoogleOtpProvider.generateTotpUri({
  secret,
  accountName: "alice@example.com",
  issuer: "MyAwesomeApp",
}); // -> otpauth://totp/MyAwesomeApp:alice%40example.com?secret=...

// 2. Authenticate or link using the 6-digit code
// If options.secret was configured with a secret or resolver:
const result = await auth.authenticate("totp", {
  account: "alice@example.com",
  code: "123456",
});

// Or if allowClientSecret: true was explicitly configured on provider:
// const result = await auth.authenticate("totp", { account: "alice@example.com", code: "123456", secret });

// Or verify token standalone:
const isValid = GoogleOtpProvider.verifyToken(secret, "123456");
```

---

## 🔗 Identity Linking & Unlinking

```typescript
// 1. Link a new login method to an existing user
const newIdentity = await auth.linkIdentity(currentUserId, "github", { code: "oauth_code" });

// 2. View all linked identities
const identities = await auth.listIdentities(currentUserId);
// -> [{ provider: "web3", ... }, { provider: "github", ... }]

// 3. Unlink an identity (safe: blocked if it's the last identity!)
await auth.unlinkIdentity(currentUserId, "web3", "0x123...");
```

---

## 🗄️ Storage Adapters

Easy Auth decouples persistence through the `StorageAdapter` interface:

```typescript
export interface StorageAdapter {
  createUser(data: CreateUserData): Promise<User>;
  getUserById(id: string): Promise<User | null>;
  updateUserMetadata(id: string, metadata: Record<string, any>): Promise<User>;

  createIdentity(data: CreateIdentityData): Promise<Identity>;
  getIdentity(provider: string, providerUserId: string): Promise<Identity | null>;
  listIdentitiesByUserId(userId: string): Promise<Identity[]>;
  deleteIdentity(userId: string, provider: string, providerUserId: string): Promise<boolean>;
}
```

Implement this interface to connect PostgreSQL, MySQL, SQLite, MongoDB, or Redis/KVDB.

---

## ⚠️ Error Codes

All errors thrown by Easy Auth are instances of `EasyAuthError`:

| Code | HTTP Status | Description |
|---|---|---|
| `PROVIDER_NOT_FOUND` | 400 | Requested provider is not registered |
| `INVALID_CREDENTIALS` | 401 | Third-party signature or token invalid |
| `TOKEN_INVALID` | 401 | JWT signature verification failed or malformed |
| `TOKEN_EXPIRED` | 401 | JWT has expired |
| `USER_NOT_FOUND` | 404 | Specified User ID does not exist |
| `IDENTITY_ALREADY_LINKED` | 409 | This external identity is already linked to another user |
| `CANNOT_UNLINK_LAST_IDENTITY` | 400 | Cannot unlink the only remaining login method (Anti-Lockout) |
| `CONFIG_ERROR` | 500 | Missing mandatory configuration (e.g. JWT secret) |

---

## 🧪 Testing & Building

```bash
# Run tests
pnpm test

# Typecheck
pnpm run typecheck

# Build dual outputs (ESM + CJS)
pnpm run build
```

---

## 📄 License

[MIT](LICENSE) © [xzsean666](https://github.com/xzsean666)
