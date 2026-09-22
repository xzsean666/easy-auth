/**
 * Express.js Integration Example for Easy Auth SDK
 *
 * Demonstrates:
 * 1. Initializing EasyAuth with Web3 & Custom Providers
 * 2. Handling Login with `auth.authenticate()`
 * 3. Middleware token verification with `const { userId, metadata } = await auth.verify(token)`
 * 4. Linking & unlinking external identities (with Anti-Lockout protection)
 */

import {
  EasyAuth,
  Web3Provider,
  OAuth2BaseProvider,
  EasyAuthError,
  type User,
} from "easy-auth";

// 1. Initialize EasyAuth SDK Facade
export const auth = new EasyAuth({
  jwt: {
    secret: process.env.JWT_SECRET || "your-production-256-bit-secret-key-32chars",
    expiresIn: "7d",
  },
  // In production, provide a persistent database adapter (e.g. PostgresStorageAdapter)
  // By default, uses built-in high-performance MemoryStorageAdapter
  providers: [
    new Web3Provider({
      domain: "example.com", // SIWE anti-phishing protection
    }),
    new OAuth2BaseProvider({
      name: "github",
      clientId: process.env.GITHUB_CLIENT_ID || "mock_github_client_id",
      clientSecret: process.env.GITHUB_CLIENT_SECRET || "mock_github_client_secret",
      tokenEndpoint: "https://github.com/login/oauth/access_token",
      userInfoEndpoint: "https://api.github.com/user",
      mapProfile: (rawUser) => ({
        providerUserId: String(rawUser.id),
        profile: {
          username: rawUser.login,
          name: rawUser.name,
          avatar: rawUser.avatar_url,
          email: rawUser.email,
        },
      }),
    }),
  ],
});

// Register a functional SMS OTP provider with one line of code
auth.registerProvider("sms", async (creds: { phone: string; code: string }) => {
  // In real life, verify against your SMS gateway / Redis
  if (creds.code !== "123456") {
    throw new EasyAuthError("INVALID_CREDENTIALS", "Invalid SMS verification code");
  }
  return {
    providerUserId: creds.phone,
    profile: { phone: creds.phone },
  };
});

/**
 * Minimal mock Express request/response interfaces for demonstration
 */
export interface AuthenticatedRequest {
  headers: Record<string, string | undefined>;
  body: any;
  userId?: string;
  userMetadata?: Record<string, any>;
  user?: User;
}

export interface MockResponse {
  status(code: number): MockResponse;
  json(data: any): void;
}

/**
 * 2. Express Authentication Middleware
 *
 * Verifies the bearer JWT token in a single call.
 * Extracts userId, metadata, and user object without boilerplate!
 */
export async function authMiddleware(
  req: AuthenticatedRequest,
  res: MockResponse,
  next: () => void
): Promise<void> {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    res.status(401).json({ error: "Missing or malformed Authorization header" });
    return;
  }

  const token = authHeader.slice(7);

  try {
    // 💡 Verify token and immediately unpack userId and metadata!
    const { userId, metadata, user } = await auth.verify(token);

    // Attach to request context for downstream route handlers
    req.userId = userId;
    req.userMetadata = metadata;
    req.user = user;

    next();
  } catch (err: any) {
    const statusCode = err instanceof EasyAuthError ? err.statusCode : 401;
    res.status(statusCode).json({
      error: err.message || "Invalid or expired token",
      code: err.code || "TOKEN_INVALID",
    });
  }
}

/**
 * 3. Unified Login Controller
 *
 * Handles logins across any registered provider (Web3, GitHub, SMS, etc.)
 */
export async function handleLogin(req: AuthenticatedRequest, res: MockResponse): Promise<void> {
  const { provider, credentials } = req.body;

  try {
    const result = await auth.authenticate(provider, credentials);

    res.status(200).json({
      token: result.token,
      user: result.user,
      isNewUser: result.isNewUser,
    });
  } catch (err: any) {
    const status = err instanceof EasyAuthError ? err.statusCode : 400;
    res.status(status).json({
      error: err.message,
      code: err.code,
    });
  }
}

/**
 * 4. Protected Route Example
 */
export async function getProfile(req: AuthenticatedRequest, res: MockResponse): Promise<void> {
  // Access strongly-typed userId and userMetadata directly from request
  res.status(200).json({
    userId: req.userId,
    profile: req.userMetadata,
    user: req.user,
  });
}

/**
 * 5. Identity Linking Controller
 */
export async function handleLinkIdentity(req: AuthenticatedRequest, res: MockResponse): Promise<void> {
  const { provider, credentials } = req.body;

  try {
    const identity = await auth.linkIdentity(req.userId!, provider, credentials);
    res.status(200).json({
      message: "Identity linked successfully",
      identity,
    });
  } catch (err: any) {
    const status = err instanceof EasyAuthError ? err.statusCode : 400;
    res.status(status).json({
      error: err.message,
      code: err.code,
    });
  }
}

/**
 * 6. Identity Unlinking Controller (Protected by Anti-Lockout)
 */
export async function handleUnlinkIdentity(req: AuthenticatedRequest, res: MockResponse): Promise<void> {
  const { provider, providerUserId } = req.body;

  try {
    await auth.unlinkIdentity(req.userId!, provider, providerUserId);
    res.status(200).json({
      message: "Identity unlinked successfully",
    });
  } catch (err: any) {
    const status = err instanceof EasyAuthError ? err.statusCode : 400;
    res.status(status).json({
      error: err.message,
      code: err.code,
    });
  }
}
