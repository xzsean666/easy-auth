import {
  Controller,
  Post,
  Get,
  Param,
  Body,
  Headers,
  Query,
  Req,
  Res,
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
   * OAuth redirection initiator.
   * GET /api/auth/oauth/:provider
   */
  @Public()
  @Get("oauth/:provider")
  startOAuthByPath(
    @Param("provider") provider: string,
    @Query("redirect") redirect: string | undefined,
    @Req() req: any,
    @Res() res: any
  ) {
    return this.executeOAuthRedirect(provider, redirect, req, res);
  }

  /**
   * OAuth redirection initiator (named alias for common providers).
   * GET /api/auth/:provider(google|line|github|discord)
   */
  @Public()
  @Get(":provider(google|line|github|discord)")
  startOAuth(
    @Param("provider") provider: string,
    @Query("redirect") redirect: string | undefined,
    @Req() req: any,
    @Res() res: any
  ) {
    return this.executeOAuthRedirect(provider, redirect, req, res);
  }

  private executeOAuthRedirect(
    provider: string,
    redirect: string | undefined,
    req: any,
    res: any
  ) {
    const protocol = req?.headers?.["x-forwarded-proto"] || req?.protocol || "https";
    const host = req?.headers?.["x-forwarded-host"] || req?.get?.("host") || req?.headers?.host || "localhost";
    const defaultCallbackUri = `${protocol}://${host}/api/auth/callback/${provider}`;
    const envCallback =
      process.env[`${provider.toUpperCase()}_REDIRECT_URI`] ||
      process.env.AUTH_CALLBACK_URL;
    const backendCallbackUri = envCallback || defaultCallbackUri;

    const targetRedirect =
      redirect ||
      process.env.FRONTEND_URL ||
      process.env.DEFAULT_FRONTEND_URL ||
      `${protocol}://${host}`;

    const statePayload = Buffer.from(
      JSON.stringify({ redirect: targetRedirect, provider })
    ).toString("base64url");

    try {
      const authUrl = this.authService.getAuthorizationUrl(provider, {
        redirectUri: backendCallbackUri,
        state: statePayload,
      });
      if (res && typeof res.redirect === "function") {
        return res.redirect(authUrl);
      }
      return { statusCode: HttpStatus.FOUND, url: authUrl };
    } catch (err: any) {
      this.handleError(err);
    }
  }

  /**
   * Universal OAuth redirection callback handler.
   * GET /api/auth/callback/:provider
   */
  @Public()
  @Get("callback/:provider")
  async handleOAuthCallback(
    @Param("provider") provider: string,
    @Query("code") code: string | undefined,
    @Query("state") state: string | undefined,
    @Query("error") error: string | undefined,
    @Query("error_description") errorDescription: string | undefined,
    @Req() req: any,
    @Res() res: any
  ) {
    const protocol = req?.headers?.["x-forwarded-proto"] || req?.protocol || "https";
    const host = req?.headers?.["x-forwarded-host"] || req?.get?.("host") || req?.headers?.host || "localhost";

    let targetRedirect =
      process.env.FRONTEND_URL ||
      process.env.DEFAULT_FRONTEND_URL ||
      `${protocol}://${host}`;

    if (state) {
      try {
        const decoded = JSON.parse(Buffer.from(state, "base64url").toString("utf8"));
        if (decoded && typeof decoded.redirect === "string") {
          targetRedirect = decoded.redirect;
        }
      } catch (err) {
        // Fallback to default targetRedirect
      }
    }

    const appendParam = (url: string, key: string, value: string) => {
      const separator = url.includes("?") ? "&" : "?";
      return `${url}${separator}${key}=${encodeURIComponent(value)}`;
    };

    if (error || !code) {
      const errorMsg =
        errorDescription || error || `Authentication with ${provider} was cancelled or failed`;
      const errorUrl = appendParam(targetRedirect, "error", errorMsg);
      if (res && typeof res.redirect === "function") {
        return res.redirect(errorUrl);
      }
      return { statusCode: HttpStatus.FOUND, url: errorUrl, error: errorMsg };
    }

    try {
      const defaultCallbackUri = `${protocol}://${host}/api/auth/callback/${provider}`;
      const envCallback =
        process.env[`${provider.toUpperCase()}_REDIRECT_URI`] ||
        process.env.AUTH_CALLBACK_URL;
      const backendCallbackUri = envCallback || defaultCallbackUri;

      const result = await this.authService.authenticate(provider, {
        code,
        redirectUri: backendCallbackUri,
      });

      let successUrl = appendParam(targetRedirect, "token", result.token);
      successUrl = appendParam(successUrl, "userId", result.user.id);
      if (result.isNewUser) {
        successUrl = appendParam(successUrl, "isNewUser", "true");
      }
      if (res && typeof res.redirect === "function") {
        return res.redirect(successUrl);
      }
      return {
        statusCode: HttpStatus.FOUND,
        url: successUrl,
        token: result.token,
        userId: result.user.id,
      };
    } catch (err: any) {
      const errorUrl = appendParam(targetRedirect, "error", err.message || "Authentication exchange failed");
      if (res && typeof res.redirect === "function") {
        return res.redirect(errorUrl);
      }
      return { statusCode: HttpStatus.FOUND, url: errorUrl, error: err.message };
    }
  }
}
