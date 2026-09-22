import * as _nestjs_common from '@nestjs/common';
import { DynamicModule, HttpStatus, CanActivate, ExecutionContext } from '@nestjs/common';
import { g as EasyAuthOptions, e as EasyAuth, d as AuthResult, V as VerifyOptions, j as VerifyResult, I as Identity, U as User } from '../easy-auth-91JYYcLB.js';
import { Reflector } from '@nestjs/core';

interface EasyAuthModuleOptions extends EasyAuthOptions {
    /**
     * Route prefix for built-in EasyAuthController.
     * Defaults to 'api/auth'.
     */
    routePrefix?: string;
    /**
     * Whether to disable registering the built-in EasyAuthController.
     * Defaults to false.
     */
    disableController?: boolean;
    /**
     * Whether to register EasyAuthGuard as a global guard.
     * Defaults to false.
     */
    globalGuard?: boolean;
    /**
     * Optional secret for bootstrapping the initial administrator account.
     */
    adminBootstrapSecret?: string;
}
declare class EasyAuthService {
    readonly options: EasyAuthModuleOptions;
    readonly auth: EasyAuth;
    constructor(options: EasyAuthModuleOptions);
    /**
     * Authenticate a user with third-party credentials.
     */
    authenticate(provider: string, credentials: any): Promise<AuthResult>;
    /**
     * Verify an incoming JWT bearer token and extract user & metadata.
     */
    verify(token: string, options?: VerifyOptions): Promise<VerifyResult>;
    /**
     * Link a new third-party identity to an existing user account.
     */
    linkIdentity(userId: string, provider: string, credentials: any): Promise<Identity>;
    /**
     * Unlink a third-party identity with anti-lockout protection.
     */
    unlinkIdentity(userId: string, provider: string, providerUserId: string): Promise<void>;
    /**
     * Get user by ID.
     */
    getUser(id: string): Promise<User | null>;
    /**
     * List all identities linked to a user.
     */
    listIdentities(userId: string): Promise<Identity[]>;
    /**
     * Generates a single-use cryptographically random nonce for Web3 authentication anti-replay.
     */
    generateNonce(address?: string, ttlMs?: number): string;
    /**
     * Validates and consumes a single-use nonce.
     */
    consumeNonce(nonce: string, address?: string): boolean;
    /**
     * Updates user metadata.
     */
    updateUserMetadata(userId: string, patch: Record<string, any>): Promise<User>;
    /**
     * Alias for updateUserMetadata.
     */
    updateMetadata(userId: string, patch: Record<string, any>): Promise<User>;
}

interface EasyAuthModuleAsyncOptions {
    imports?: any[];
    useFactory: (...args: any[]) => Promise<EasyAuthModuleOptions> | EasyAuthModuleOptions;
    inject?: any[];
}
declare class EasyAuthModule {
    /**
     * Synchronous static registration of EasyAuthModule.
     */
    static forRoot(options: EasyAuthModuleOptions): DynamicModule;
    /**
     * Asynchronous registration of EasyAuthModule using factory function.
     */
    static forRootAsync(asyncOptions: EasyAuthModuleAsyncOptions): DynamicModule;
}

declare class EasyAuthController {
    private readonly authService;
    constructor(authService: EasyAuthService);
    private handleError;
    /**
     * Challenge Nonce generation endpoint for Web3 SIWE anti-replay authentication.
     * GET /api/auth/nonce?address=0x...
     */
    getNonce(address?: string): {
        statusCode: HttpStatus;
        nonce: string;
        address: string | undefined;
        expiresIn: number;
    };
    /**
     * Unified login endpoint.
     * POST /api/auth/login
     */
    login(body: {
        loginType?: string;
        type?: string;
        provider?: string;
        credentials: any;
    }): Promise<{
        statusCode: HttpStatus;
        loginType: string;
        user: User;
        token: string;
        isNewUser: boolean;
        identity: Identity;
    }>;
    /**
     * Identity linking endpoint (protected: user links another identity to their account).
     * POST /api/auth/link
     */
    link(body: {
        userId?: string;
        loginType?: string;
        type?: string;
        provider?: string;
        credentials: any;
    }, currentUserId?: string): Promise<{
        statusCode: HttpStatus;
        identity: Identity;
    }>;
    /**
     * Identity unlinking endpoint (protected with anti-lockout & anti-IDOR).
     * POST /api/auth/unlink
     */
    unlink(body: {
        userId?: string;
        loginType?: string;
        type?: string;
        provider?: string;
        providerUserId: string;
    }, currentUserId?: string): Promise<{
        statusCode: HttpStatus;
        success: boolean;
    }>;
    /**
     * User info endpoint based on Bearer token.
     * GET /api/auth/me
     */
    me(authHeader?: string, user?: User): Promise<{
        statusCode: HttpStatus;
        userId: string;
        user: User;
        metadata: Record<string, any>;
    }>;
    /**
     * List all linked identities for the current authenticated user.
     * GET /api/auth/identities?userId=xxx
     */
    listIdentities(userId?: string, currentUserId?: string): Promise<{
        statusCode: HttpStatus;
        identities: Identity[];
    }>;
    /**
     * Update current authenticated user's metadata (e.g. bind EVM address, profile fields).
     * PATCH /api/auth/metadata
     * POST /api/auth/metadata
     */
    updateMyMetadata(user: User, body: any): Promise<{
        statusCode: HttpStatus;
        user: User;
        metadata: Record<string, any>;
    }>;
    /**
     * Alias for updateMyMetadata using POST.
     * POST /api/auth/metadata
     */
    updateMyMetadataPost(user: User, body: any): Promise<{
        statusCode: HttpStatus;
        user: User;
        metadata: Record<string, any>;
    }>;
    /**
     * Update target user's metadata by an administrator.
     * PATCH /api/auth/admin/users/:userId/metadata
     */
    updateAdminUserMetadata(targetUserId: string, currentUser: User, body: any): Promise<{
        statusCode: HttpStatus;
        user: User;
        metadata: Record<string, any>;
    }>;
    /**
     * Alias for updateAdminUserMetadata using POST.
     * POST /api/auth/admin/users/:userId/metadata
     */
    updateAdminUserMetadataPost(targetUserId: string, currentUser: User, body: any): Promise<{
        statusCode: HttpStatus;
        user: User;
        metadata: Record<string, any>;
    }>;
    /**
     * Bootstrap initial admin account using a configured server secret.
     * POST /api/auth/admin/bootstrap
     */
    bootstrapAdmin(body: {
        userId: string;
        secret: string;
    }): Promise<{
        statusCode: HttpStatus;
        success: boolean;
        user: User;
        metadata: Record<string, any>;
    }>;
}

/**
 * Universal NestJS CanActivate Guard for Easy Auth.
 * Automatically verifies Bearer JWT tokens, extracts User & metadata,
 * and attaches them to `request.user`, `request.userId`, and `request.userMetadata`.
 */
declare class EasyAuthGuard implements CanActivate {
    private readonly authService;
    private readonly reflector?;
    constructor(authService: EasyAuthService, reflector?: Reflector | undefined);
    canActivate(context: ExecutionContext): Promise<boolean>;
}

/**
 * Parameter decorator to extract the current authenticated User (or a specific property)
 * injected by EasyAuthGuard.
 *
 * @example
 * ```typescript
 * @Get('profile')
 * @UseGuards(EasyAuthGuard)
 * getProfile(@CurrentUser() user: User) {
 *   return user;
 * }
 *
 * @Get('user-id')
 * @UseGuards(EasyAuthGuard)
 * getUserId(@CurrentUser('id') userId: string) {
 *   return userId;
 * }
 * ```
 */
declare const CurrentUser: (...dataOrPipes: (string | _nestjs_common.ParameterDecoratorOptions | _nestjs_common.PipeTransform<any, any> | _nestjs_common.Type<_nestjs_common.PipeTransform<any, any>> | undefined)[]) => ParameterDecorator;
/**
 * Decorator to mark a route or controller as public, bypassing EasyAuthGuard.
 *
 * @example
 * ```typescript
 * @Public()
 * @Get('public-info')
 * getPublicInfo() {
 *   return { status: 'ok' };
 * }
 * ```
 */
declare const Public: () => _nestjs_common.CustomDecorator<string>;

declare const EASY_AUTH_OPTIONS = "EASY_AUTH_OPTIONS";
declare const EASY_AUTH_INSTANCE = "EASY_AUTH_INSTANCE";
declare const IS_PUBLIC_KEY = "easy_auth:is_public";

export { CurrentUser, EASY_AUTH_INSTANCE, EASY_AUTH_OPTIONS, EasyAuthController, EasyAuthGuard, EasyAuthModule, type EasyAuthModuleAsyncOptions, type EasyAuthModuleOptions, EasyAuthService, IS_PUBLIC_KEY, Public };
