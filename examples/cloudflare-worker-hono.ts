/**
 * Production-ready Cloudflare Workers + Hono + Easy Auth Example
 *
 * Demonstrates:
 * 1. Cloudflare D1 StorageAdapter integration with Read-Your-Own-Writes (RYW) bookmark consistency
 * 2. Web3 EVM wallet signature authentication & Google OAuth authentication
 * 3. Edge-level authentication middleware for protecting downstream API routes
 *
 * Deployment:
 * Ensure `wrangler.toml` includes:
 * ```toml
 * compatibility_flags = ["nodejs_compat"]
 * [[d1_databases]]
 * binding = "DB"
 * database_name = "easy-auth-db"
 * database_id = "xxxx-xxxx-xxxx"
 * ```
 */

import { Hono } from "hono";
import { EasyAuth, Web3Provider, GoogleProvider } from "easy-auth";
import { D1StorageAdapter } from "easy-auth/d1";

// 1. Define Worker Bindings environment interface
export interface Env {
  DB: any; // Cloudflare D1Database binding
  JWT_SECRET: string;
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
}

// 2. Define custom request variables
export interface Variables {
  userId: string;
  user: any;
}

const app = new Hono<{ Bindings: Env; Variables: Variables }>();

// Helper function to instantiate EasyAuth for the current request
function createAuth(env: Env, requestBookmark?: string | null): EasyAuth {
  return new EasyAuth({
    jwt: {
      secret: env.JWT_SECRET || "default-secret-at-least-32-characters-long",
      expiresIn: "7d",
    },
    storage: new D1StorageAdapter({
      db: env.DB,
      bookmark: requestBookmark,
      autoInitTables: true, // Automatically bootstraps tables and indexes via db.batch() on first run
    }),
    providers: [
      // Web3 EVM wallet signature provider
      new Web3Provider({
        domain: "myapp.workers.dev",
      }),
      // Google OAuth provider
      new GoogleProvider({
        clientId: env.GOOGLE_CLIENT_ID || "mock-google-client-id",
        clientSecret: env.GOOGLE_CLIENT_SECRET,
      }),
    ],
  });
}

// 3. Health check route
app.get("/", (c) => {
  return c.json({
    status: "ok",
    service: "easy-auth-cloudflare-worker",
    runtime: "Cloudflare Workers / Edge V8",
  });
});

// 4. Unified Authentication Endpoint: POST /api/auth/login
app.post("/api/auth/login", async (c) => {
  const requestBookmark = c.req.header("x-d1-bookmark") || null;
  const auth = createAuth(c.env, requestBookmark);

  const { provider, credentials } = await c.req.json();
  if (!provider || !credentials) {
    return c.json({ error: "Missing 'provider' or 'credentials'" }, 400);
  }

  try {
    const result = await auth.authenticate(provider, credentials);

    // Capture and return updated session bookmark to client for Read-Your-Own-Writes consistency
    const latestBookmark = (auth.storage as D1StorageAdapter).getBookmark();
    if (latestBookmark) {
      c.header("x-d1-bookmark", latestBookmark);
    }

    return c.json({
      status: "success",
      user: result.user,
      token: result.token,
      isNewUser: result.isNewUser,
    });
  } catch (err: any) {
    return c.json(
      {
        error: err.code || "AUTH_FAILED",
        message: err.message,
      },
      err.statusCode || 400
    );
  }
});

// 5. Edge Authentication Guard Middleware
app.use("/api/protected/*", async (c, next) => {
  const authHeader = c.req.header("Authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return c.json({ error: "UNAUTHORIZED", message: "Missing or malformed Authorization header" }, 401);
  }

  const token = authHeader.slice(7);
  const auth = createAuth(c.env, c.req.header("x-d1-bookmark"));

  try {
    // Zero-IO or DB-verified token decoding directly at the edge
    const { userId, user } = await auth.verify(token);
    c.set("userId", userId);
    c.set("user", user);
    await next();
  } catch (err: any) {
    return c.json({ error: "TOKEN_INVALID", message: err.message }, 401);
  }
});

// 6. Protected Business API
app.get("/api/protected/me", (c) => {
  const user = c.get("user");
  const userId = c.get("userId");

  return c.json({
    message: "Welcome to Edge-protected route!",
    userId,
    user,
  });
});

export default app;
