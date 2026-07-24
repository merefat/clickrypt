import { SetMetadata } from "@nestjs/common";

export interface ThrottleOptions {
  /** Max requests per window per IP+route. */
  limit: number;
  windowSeconds: number;
}

export const THROTTLE_KEY = "clickrypt:throttle";

/** Redis-backed fixed-window rate limit. Apply together with ThrottleGuard. */
export const Throttle = (options: ThrottleOptions) =>
  SetMetadata(THROTTLE_KEY, options);
