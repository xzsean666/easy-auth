/**
 * Example: Zero-Controller NestJS Integration with Easy Auth
 *
 * This example demonstrates:
 * 1. Mounting EasyAuthModule with persistent SQLite database (zero configuration).
 * 2. Complete absence of custom AuthController (Easy Auth exposes /api/auth/* automatically).
 * 3. Protecting business endpoints using EasyAuthGuard and injecting @CurrentUser().
 */

import "reflect-metadata";
import { Module, Controller, Get, UseGuards } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { EasyAuthModule, EasyAuthGuard, CurrentUser, Public } from "../src/nestjs/index.js";
import { Web3Provider, GoogleProvider } from "../src/index.js";
import type { User } from "../src/core/types.js";

// 1. Business Controller: ONLY write your business logic!
@Controller("orders")
export class OrderController {
  /**
   * Protected route: requires valid Bearer token.
   * Directly injects authenticated User model into parameter.
   */
  @Get("my-orders")
  @UseGuards(EasyAuthGuard)
  getMyOrders(@CurrentUser() user: User) {
    return {
      message: `Orders fetched for User: ${user.id}`,
      metadata: user.metadata,
      orders: [
        { id: "ord_101", item: "Premium Subscription", amount: 99.0 },
        { id: "ord_102", item: "Cloud Storage Add-on", amount: 19.0 },
      ],
    };
  }

  /**
   * Public route: accessible without token
   */
  @Public()
  @Get("catalog")
  getCatalog() {
    return {
      items: ["Basic Plan", "Pro Plan", "Enterprise"],
    };
  }
}

// 2. Application Module: Wire EasyAuthModule with ONE line!
@Module({
  imports: [
    EasyAuthModule.forRoot({
      // Database: Use persistent SQLite file (or PostgreSQL by setting type: 'postgres', pool)
      database: {
        type: "sqlite",
        path: "./data/easy-auth.db",
      },
      jwt: {
        secret: process.env.JWT_SECRET || "a-super-secret-32-chars-jwt-key!",
        expiresIn: "7d",
      },
      providers: [
        // Web3 EVM wallet signature authentication
        new Web3Provider({ domain: "localhost:3000" }),

        // Google OAuth2 login
        new GoogleProvider({
          clientId: process.env.GOOGLE_CLIENT_ID || "mock-google-client-id",
        }),
      ],
      // Route prefix for auto-exposed endpoints: defaults to '/api/auth'
      routePrefix: "/api/auth",
    }),
  ],
  controllers: [OrderController],
})
export class AppModule {}

// 3. Bootstrap
async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  console.log("🚀 NestJS server started on http://localhost:3000");
  console.log("👉 Auto-registered endpoints (NO CONTROLLER WRITTEN):");
  console.log("   - POST http://localhost:3000/api/auth/login");
  console.log("   - POST http://localhost:3000/api/auth/link");
  console.log("   - POST http://localhost:3000/api/auth/unlink");
  console.log("   - GET  http://localhost:3000/api/auth/me");
  console.log("   - GET  http://localhost:3000/api/auth/identities");
  console.log("👉 Business endpoints:");
  console.log("   - GET  http://localhost:3000/orders/my-orders (Protected by EasyAuthGuard)");
  console.log("   - GET  http://localhost:3000/orders/catalog   (Public)");

  // await app.listen(3000);
}

if (process.env.NODE_ENV !== "test") {
  bootstrap();
}
