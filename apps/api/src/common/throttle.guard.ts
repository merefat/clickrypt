import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
} from "@nestjs/common";
import type { Request } from "express";
import { RedisService } from "../redis/redis.service";
import { THROTTLE_KEY, type ThrottleOptions } from "./throttle.decorator";

const DEFAULTS: ThrottleOptions = { limit: 10, windowSeconds: 60 };

@Injectable()
export class ThrottleGuard implements CanActivate {
  constructor(
    private readonly redis: RedisService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (process.env.NODE_ENV === "test" || process.env.NODE_ENV !== "production" || !this.redis) {
      return true;
    }

    const handler = context.getHandler();
    const cls = context.getClass();
    const options =
      (Reflect.getMetadata(THROTTLE_KEY, handler) as ThrottleOptions) ??
      (Reflect.getMetadata(THROTTLE_KEY, cls) as ThrottleOptions) ??
      DEFAULTS;

    const request = context.switchToHttp().getRequest<Request>();
    const ip = request.ip ?? "unknown";
    const key = `ratelimit:${request.method}:${request.path}:${ip}`;

    const count = await this.redis.incr(key);
    if (count === 1) {
      await this.redis.expire(key, options.windowSeconds);
    }
    if (count > options.limit) {
      throw new HttpException(
        "Too many requests. Please try again later.",
        HttpStatus.TOO_MANY_REQUESTS
      );
    }
    return true;
  }
}
