import { createParamDecorator, ExecutionContext, SetMetadata } from "@nestjs/common";
import { IS_PUBLIC_KEY } from "./constants.js";
import type { User } from "../core/types.js";

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
export const CurrentUser = createParamDecorator(
  (data: keyof User | string | undefined, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest();
    const user = request.user;

    if (!user) {
      return null;
    }

    return data ? (user as any)[data] : user;
  }
);

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
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
