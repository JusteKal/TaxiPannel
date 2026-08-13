import type { Context, MiddlewareHandler } from "hono";
import { PanelError } from "../models/errors";

// Only trust X-Forwarded-For when something in front of us actually rewrites it.
// If this is true and nothing does, any client can forge its own rate-limit key.
const TRUST_PROXY = process.env.TRUST_PROXY === "true";

interface Window {
  count: number;
  resetAt: number;
}

interface Limiter {
  windows: Map<string, Window>;
  windowMs: number;
}

// One janitor sweeps every limiter instance, so adding a new per-route limiter
// costs nothing extra.
const registry: Limiter[] = [];

export interface RateLimitOptions {
  limit: number;
  windowMs: number;
  /** Distinguishes per-route buckets that share a client key. */
  bucket?: string;
}

export function rateLimit(options: RateLimitOptions): MiddlewareHandler {
  const limiter: Limiter = { windows: new Map(), windowMs: options.windowMs };
  registry.push(limiter);
  const prefix = options.bucket ? `${options.bucket}:` : "";

  return async (c, next) => {
    const key = prefix + clientKey(c);
    const now = Date.now();
    const existing = limiter.windows.get(key);

    if (!existing || existing.resetAt <= now) {
      limiter.windows.set(key, { count: 1, resetAt: now + options.windowMs });
      return next();
    }

    existing.count++;
    if (existing.count > options.limit) {
      const retryAfter = Math.ceil((existing.resetAt - now) / 1000);
      c.header("Retry-After", String(retryAfter));
      throw new PanelError(429, "rateLimited", "Too many requests", { retryAfter });
    }
    return next();
  };
}

function clientKey(c: Context): string {
  if (TRUST_PROXY) {
    const forwarded = c.req.header("x-forwarded-for");
    if (forwarded) {
      // Last hop: the one our own proxy appended. Earlier entries are attacker-controlled.
      const hops = forwarded.split(",");
      const peer = hops[hops.length - 1]?.trim();
      if (peer) return peer;
    }
  }
  const server = c.env as { requestIP?: (req: Request) => { address: string } | null } | undefined;
  return server?.requestIP?.(c.req.raw)?.address ?? "unknown";
}

export function startRateLimitJanitor(): void {
  const timer = setInterval(
    () => {
      const now = Date.now();
      for (const limiter of registry) {
        for (const [key, window] of limiter.windows) {
          if (window.resetAt <= now) limiter.windows.delete(key);
        }
      }
    },
    5 * 60 * 1000,
  );
  timer.unref?.();
}
