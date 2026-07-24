import { Injectable, Logger, OnModuleDestroy } from "@nestjs/common";
import Redis from "ioredis";

@Injectable()
export class RedisService implements OnModuleDestroy {
  private readonly client: Redis;
  private readonly logger = new Logger(RedisService.name);

  constructor() {
    this.client = new Redis(
      process.env.REDIS_URL ?? "redis://localhost:6379",
      {
        maxRetriesPerRequest: 3,
        lazyConnect: false,
        retryStrategy: (times) => {
          const delay = Math.min(times * 50, 2000);
          this.logger.warn(`Redis connection attempt ${times} failed, retrying in ${delay}ms`);
          return delay;
        },
      }
    );

    this.client.on("error", (error) => {
      this.logger.error(`Redis connection error: ${error.message}`);
    });

    this.client.on("connect", () => {
      this.logger.log("Redis connected successfully");
    });

    this.client.on("close", () => {
      this.logger.warn("Redis connection closed");
    });
  }

  get raw(): Redis {
    return this.client;
  }

  // Proxy common Redis methods
  get(key: string): Promise<string | null> {
    return this.client.get(key);
  }

  set(
    key: string,
    value: string | Buffer,
    ...rest: unknown[]
  ): Promise<string | null> {
    // Pass through EX/TTL args: set(key, val, "EX", seconds)
    if (rest.length >= 2) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (this.client.set as any)(key, value, rest[0], rest[1]);
    }
    return this.client.set(key, value);
  }

  del(...keys: string[]): Promise<number> {
    return this.client.del(...keys);
  }

  exists(...keys: string[]): Promise<number> {
    return this.client.exists(...keys);
  }

  incr(key: string): Promise<number> {
    return this.client.incr(key);
  }

  expire(key: string, seconds: number): Promise<number> {
    return this.client.expire(key, seconds);
  }

  async onModuleDestroy() {
    await this.client.quit();
  }
}
