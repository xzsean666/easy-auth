import {
  Controller,
  Post,
  Get,
  Patch,
  Param,
  Body,
  Headers,
  Query,
  HttpException,
  HttpStatus,
  Inject,
  UseGuards,
} from "@nestjs/common";
import { EasyAuthService } from "./easy-auth.service.js";
import { EasyAuthError } from "../core/errors.js";
import { EasyAuthGuard } from "./easy-auth.guard.js";
import { Public, CurrentUser } from "./decorators.js";
import type { User } from "../core/types.js";

const PROTECTED_METADATA_KEYS = [
  "role",
  "isAdmin",
  "roles",
  "permissions",
  "banned",
  "isBanned",
];

@Controller("api/auth")
@UseGuards(EasyAuthGuard)
export class EasyAuthController {
  constructor(@Inject(EasyAuthService) private readonly authService: EasyAuthService) {}

  private handleError(err: any): never {
    if (err instanceof EasyAuthError) {
      throw new HttpException(
        {
          statusCode: err.statusCode,
          error: err.code,
          message: err.message,
        },
        err.statusCode
      );
    }
    throw new HttpException(
      {
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        message: err?.message || "Internal authentication error",
      },
      HttpStatus.INTERNAL_SERVER_ERROR
    );
  }

  /**
   * Challenge Nonce generation endpoint for Web3 SIWE anti-replay authentication.
   * GET /api/auth/nonce?address=0x...
   */
  @Public()
  @Get("nonce")
  getNonce(@Query("address") address?: string) {
    const nonce = this.authService.generateNonce(address);
    return {
      statusCode: HttpStatus.OK,
      nonce,
      address: address ? address.toLowerCase() : undefined,
      expiresIn: 300,
    };
  }

  /**
   * Unified login endpoint.
   * POST /api/auth/login
   */
  @Public()
  @Post("login")
  async login(@Body() body: { loginType?: string; type?: string; provider?: string; credentials: any }) {
    const loginType = body?.loginType || body?.type || body?.provider;
    if (!loginType || !body?.credentials) {
      throw new HttpException(
        { statusCode: 400, error: "BAD_REQUEST", message: "Missing loginType (or provider) and credentials in request body" },
        HttpStatus.BAD_REQUEST
      );
    }

    try {
      const result = await this.authService.authenticate(loginType, body.credentials);
      return {
        statusCode: HttpStatus.OK,
        loginType: result.loginType,
        user: result.user,
        token: result.token,
        isNewUser: result.isNewUser,
        identity: result.identity,
      };
    } catch (err) {
      this.handleError(err);
    }
  }

  /**
   * Identity linking endpoint (protected: user links another identity to their account).
   * POST /api/auth/link
   */
  @Post("link")
  async link(
    @Body() body: { userId?: string; loginType?: string; type?: string; provider?: string; credentials: any },
    @CurrentUser("id") currentUserId?: string
  ) {
    const provider = body?.loginType || body?.type || body?.provider;
    if (!provider || !body?.credentials) {
      throw new HttpException(
        { statusCode: 400, error: "BAD_REQUEST", message: "Missing loginType (or provider), or credentials in request body" },
        HttpStatus.BAD_REQUEST
      );
    }

    // Anti-IDOR: Prevent linking to another user account
    if (body?.userId && currentUserId && body.userId !== currentUserId) {
      throw new HttpException(
        { statusCode: 403, error: "FORBIDDEN", message: "Cannot link identity to another user account" },
        HttpStatus.FORBIDDEN
      );
    }

    const targetUserId = currentUserId || body?.userId;
    if (!targetUserId) {
      throw new HttpException(
        { statusCode: 401, error: "UNAUTHORIZED", message: "Authentication required to link an identity" },
        HttpStatus.UNAUTHORIZED
      );
    }

    try {
      const identity = await this.authService.linkIdentity(targetUserId, provider, body.credentials);
      return {
        statusCode: HttpStatus.OK,
        identity,
      };
    } catch (err) {
      this.handleError(err);
    }
  }

  /**
   * Identity unlinking endpoint (protected with anti-lockout & anti-IDOR).
   * POST /api/auth/unlink
   */
  @Post("unlink")
  async unlink(
    @Body() body: { userId?: string; loginType?: string; type?: string; provider?: string; providerUserId: string },
    @CurrentUser("id") currentUserId?: string
  ) {
    const provider = body?.loginType || body?.type || body?.provider;
    if (!provider || !body?.providerUserId) {
      throw new HttpException(
        { statusCode: 400, error: "BAD_REQUEST", message: "Missing loginType (or provider), or providerUserId in request body" },
        HttpStatus.BAD_REQUEST
      );
    }

    // Anti-IDOR: Prevent unlinking another user account
    if (body?.userId && currentUserId && body.userId !== currentUserId) {
      throw new HttpException(
        { statusCode: 403, error: "FORBIDDEN", message: "Cannot unlink identity from another user account" },
        HttpStatus.FORBIDDEN
      );
    }

    const targetUserId = currentUserId || body?.userId;
    if (!targetUserId) {
      throw new HttpException(
        { statusCode: 401, error: "UNAUTHORIZED", message: "Authentication required to unlink an identity" },
        HttpStatus.UNAUTHORIZED
      );
    }

    try {
      await this.authService.unlinkIdentity(targetUserId, provider, body.providerUserId);
      return {
        statusCode: HttpStatus.OK,
        success: true,
      };
    } catch (err) {
      this.handleError(err);
    }
  }

  /**
   * User info endpoint based on Bearer token.
   * GET /api/auth/me
   */
  @Get("me")
  async me(
    @Headers("authorization") authHeader?: string,
    @CurrentUser() user?: User
  ) {
    if (user) {
      return {
        statusCode: HttpStatus.OK,
        userId: user.id,
        user,
        metadata: user.metadata,
      };
    }

    if (!authHeader?.startsWith("Bearer ")) {
      throw new HttpException(
        { statusCode: 401, error: "UNAUTHORIZED", message: "Missing or invalid Authorization header" },
        HttpStatus.UNAUTHORIZED
      );
    }

    const token = authHeader.slice(7).trim();
    try {
      const result = await this.authService.verify(token);
      return {
        statusCode: HttpStatus.OK,
        userId: result.userId,
        user: result.user,
        metadata: result.metadata,
      };
    } catch (err) {
      this.handleError(err);
    }
  }

  /**
   * List all linked identities for the current authenticated user.
   * GET /api/auth/identities?userId=xxx
   */
  @Get("identities")
  async listIdentities(
    @Query("userId") userId?: string,
    @CurrentUser("id") currentUserId?: string
  ) {
    // Anti-IDOR: Prevent enumerating identities of other users
    if (userId && currentUserId && userId !== currentUserId) {
      throw new HttpException(
        { statusCode: 403, error: "FORBIDDEN", message: "Cannot view identities of another user account" },
        HttpStatus.FORBIDDEN
      );
    }

    const targetUserId = currentUserId || userId;
    if (!targetUserId) {
      throw new HttpException(
        { statusCode: 401, error: "UNAUTHORIZED", message: "Authentication required to view identities" },
        HttpStatus.UNAUTHORIZED
      );
    }

    try {
      const identities = await this.authService.listIdentities(targetUserId);
      return {
        statusCode: HttpStatus.OK,
        identities,
      };
    } catch (err) {
      this.handleError(err);
    }
  }

  /**
   * Update current authenticated user's metadata (e.g. bind EVM address, profile fields, custom attributes).
   * PATCH /api/auth/metadata
   * POST /api/auth/metadata
   */
  @Patch("metadata")
  async updateMyMetadata(
    @CurrentUser() user: User,
    @Body() body: any
  ) {
    if (!user) {
      throw new HttpException(
        { statusCode: 401, error: "UNAUTHORIZED", message: "Authentication required to update metadata" },
        HttpStatus.UNAUTHORIZED
      );
    }

    const rawPatch = body?.metadata && typeof body.metadata === "object" ? body.metadata : body;

    // Security: Filter out protected privilege fields to prevent privilege escalation from userland API
    const sanitizedPatch: Record<string, any> = {};
    if (rawPatch && typeof rawPatch === "object") {
      for (const [key, value] of Object.entries(rawPatch)) {
        if (!PROTECTED_METADATA_KEYS.includes(key)) {
          sanitizedPatch[key] = value;
        }
      }
    }

    try {
      const updatedUser = await this.authService.updateUserMetadata(user.id, sanitizedPatch);
      return {
        statusCode: HttpStatus.OK,
        user: updatedUser,
        metadata: updatedUser.metadata,
      };
    } catch (err) {
      this.handleError(err);
    }
  }

  /**
   * Alias for updateMyMetadata using POST.
   * POST /api/auth/metadata
   */
  @Post("metadata")
  async updateMyMetadataPost(
    @CurrentUser() user: User,
    @Body() body: any
  ) {
    return this.updateMyMetadata(user, body);
  }
}
