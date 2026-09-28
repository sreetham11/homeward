// Basic in-memory, best-effort rate limiter for endpoints that accept a recovery code — see
// each app/api/*/route.ts's call site for which key (IP+code, or IP alone) it uses.
//
// LIMITATION — read before relying on this for anything beyond a demo: this state lives in a
// plain in-memory Map scoped to a single running process. On serverless (Vercel and similar),
// each invocation can land on a different, ephemeral instance with its own memory — instances
// spin up and tear down independently and share nothing — so this only enforces a best-effort
// PER-INSTANCE limit, not a real global one across a deployment. It raises the bar against
// casual brute-forcing of recovery codes and stops a single hot instance from being hammered,
// but a determined attacker spreading requests across many invocations/regions can exceed it.
// A real guarantee needs a shared store — this project already scaffolds Upstash Redis env vars
// (UPSTASH_REDIS_REST_URL/_TOKEN, see .env.local.example) for exactly this kind of shared
// state, just not wired up to rate limiting today.
//
// Fixed-window counter, not sliding — the simplest correct option for "basic" limiting. A burst
// right at a window boundary can momentarily allow close to 2x the limit; accepted tradeoff for
// a demo-scale prototype, not a production guarantee.

interface Bucket {
  count: number;
  windowStart: number;
}

const buckets = new Map<string, Bucket>();

// Opportunistic cleanup on each call so `buckets` doesn't grow unboundedly over the lifetime of
// a long-lived process (local `next dev`/`next start`, or a warm serverless instance reused
// across invocations) — every distinct IP+code pair would otherwise get an entry that lives
// forever.
const CLEANUP_INTERVAL_MS = 5 * 60 * 1000;
let lastCleanup = 0;

function cleanupStaleBuckets(nowMs: number, windowMs: number): void {
  if (nowMs - lastCleanup < CLEANUP_INTERVAL_MS) return;
  lastCleanup = nowMs;
  for (const [key, bucket] of buckets) {
    if (nowMs - bucket.windowStart > windowMs) buckets.delete(key);
  }
}

export const DEFAULT_RATE_LIMIT = 20;
export const DEFAULT_RATE_LIMIT_WINDOW_MS = 60_000;

export interface RateLimitResult {
  allowed: boolean;
  /** Seconds until the current window resets. 0 when allowed. */
  retryAfterSeconds: number;
}

/**
 * Allows up to `limit` calls per `windowMs` for a given key. Pure aside from the shared
 * module-level Map — `nowMs` is a parameter rather than an internal `Date.now()` call, so this
 * is deterministically testable, same pattern as lib/silenceCheck.ts's findSilentPatients.
 */
export function rateLimit(
  key: string,
  limit: number = DEFAULT_RATE_LIMIT,
  windowMs: number = DEFAULT_RATE_LIMIT_WINDOW_MS,
  nowMs: number = Date.now(),
): RateLimitResult {
  cleanupStaleBuckets(nowMs, windowMs);

  const bucket = buckets.get(key);
  if (!bucket || nowMs - bucket.windowStart >= windowMs) {
    buckets.set(key, { count: 1, windowStart: nowMs });
    return { allowed: true, retryAfterSeconds: 0 };
  }

  bucket.count += 1;
  if (bucket.count > limit) {
    const retryAfterSeconds = Math.max(1, Math.ceil((bucket.windowStart + windowMs - nowMs) / 1000));
    return { allowed: false, retryAfterSeconds };
  }
  return { allowed: true, retryAfterSeconds: 0 };
}

/**
 * Best-effort client IP from standard proxy headers (Vercel and most reverse proxies set
 * x-forwarded-for). Falls back to a constant so requests with neither header share one bucket
 * instead of silently bypassing rate limiting entirely.
 */
export function clientIpFromHeaders(headers: { get(name: string): string | null }): string {
  const forwarded = headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0];
    if (first && first.trim()) return first.trim();
  }
  const realIp = headers.get("x-real-ip");
  if (realIp && realIp.trim()) return realIp.trim();
  return "unknown-ip";
}

/**
 * Combines IP + recovery code into one bucket key. Keying on both (not just one) matters:
 * IP alone would let one abusive client exhaust every other patient's rate limit from a single
 * source; code alone would let a botnet spread requests across many IPs to bypass the limit
 * entirely for a single guessed/known code. Codes are case-insensitive (see
 * lib/planStore.ts's generation alphabet), so this normalizes to uppercase first so one code's
 * limit isn't accidentally split across two buckets by casing alone.
 */
export function rateLimitKey(ip: string, recoveryCode?: string | null): string {
  return recoveryCode ? `${ip}:${recoveryCode.trim().toUpperCase()}` : `${ip}:no-code`;
}

export interface RateLimitRejection {
  status: 429;
  body: { error: string };
  headers: { "Retry-After": string };
}

/** Framework-agnostic shape for a 429 response — callers (each app route.ts) wrap this in
 * NextResponse.json themselves, keeping this file free of a next/server import so it stays
 * trivially unit-testable without a Next.js runtime. */
export function rateLimitRejection(retryAfterSeconds: number): RateLimitRejection {
  return {
    status: 429,
    body: { error: "Too many requests for this recovery code. Please wait and try again." },
    headers: { "Retry-After": String(Math.max(1, retryAfterSeconds)) },
  };
}
