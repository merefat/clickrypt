import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import type { Request } from "express";
import { RedisService } from "../redis/redis.service";
import type { AuthenticatedUser } from "./current-user.decorator";

export interface AccessTokenPayload {
  sub: string;
  email: string;
  orgId: string;
  orgRole: string;
  sid: string;
  jti?: string;
}

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly jwtService: JwtService,
    private readonly redis: RedisService
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const header = request.headers.authorization;
    if (!header?.startsWith("Bearer ")) {
      throw new UnauthorizedException("Missing access token");
    }

    let payload: AccessTokenPayload;
    try {
      payload = await this.jwtService.verifyAsync<AccessTokenPayload>(
        header.slice("Bearer ".length)
      );
    } catch {
      throw new UnauthorizedException("Invalid or expired access token");
    }

    // Sessions are revocable: logout / refresh-reuse detection deletes this key.
    const sessionAlive = await this.redis.exists(`session:sid:${payload.sid}`);
    if (!sessionAlive) {
      throw new UnauthorizedException("Session has been revoked");
    }

    const user: AuthenticatedUser = {
      id: payload.sub,
      email: payload.email,
      orgId: payload.orgId,
      orgRole: payload.orgRole,
      sessionId: payload.sid,
    };
    (request as Request & { user: AuthenticatedUser }).user = user;
    return true;
  }
}
