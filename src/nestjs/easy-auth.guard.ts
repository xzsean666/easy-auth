import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
  Inject,
  Optional,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { EasyAuthService } from "./easy-auth.service.js";
import { IS_PUBLIC_KEY } from "./constants.js";

/**
 * Universal NestJS CanActivate Guard for Easy Auth.
 * Automatically verifies Bearer JWT tokens, extracts User & metadata,
 * and attaches them to `request.user`, `request.userId`, and `request.userMetadata`.
 */
@Injectable()
export class EasyAuthGuard implements CanActivate {
  constructor(
    @Inject(EasyAuthService) private readonly authService: EasyAuthService,
    @Optional() @Inject(Reflector) private readonly reflector?: Reflector
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    // 1. Check if route or controller is marked as @Public()
    if (this.reflector) {
      const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
        context.getHandler(),
        context.getClass(),
      ]);
      if (isPublic) {
        return true;
      }
    }

    // 2. Extract Bearer token from incoming request
    const request = context.switchToHttp().getRequest();
    const authHeader = request.headers?.authorization;

    if (!authHeader || typeof authHeader !== "string" || !authHeader.startsWith("Bearer ")) {
      throw new UnauthorizedException("Missing or malformed Authorization header with Bearer token");
    }

    const token = authHeader.slice(7).trim();
    if (!token) {
      throw new UnauthorizedException("Empty Bearer token provided");
    }

    // 3. Verify token with EasyAuth
    try {
      const verifyResult = await this.authService.verify(token);

      // 4. Attach authenticated user details to request object
      request.user = verifyResult.user;
      request.userId = verifyResult.userId;
      request.userMetadata = verifyResult.metadata;
      request.authPayload = verifyResult.payload;

      return true;
    } catch (err: any) {
      throw new UnauthorizedException(err.message || "Invalid or expired authentication token");
    }
  }
}
