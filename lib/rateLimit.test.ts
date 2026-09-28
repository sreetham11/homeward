import { describe, it, expect } from "vitest";
import {
  rateLimit,
  rateLimitKey,
  clientIpFromHeaders,
  rateLimitRejection,
} from "./rateLimit";

// Each test uses its own random key so tests never share a bucket in the module-level Map —
// avoids needing a reset hook just for tests.
function uniqueKey(label: string): string {
  return `test:${label}:${Math.random().toString(36).slice(2)}`;
}

describe("rateLimit", () => {
  it("allows requests up to and including the limit within a window", () => {
    const key = uniqueKey("basic");
    const now = 1_000_000;
    for (let i = 0; i < 5; i++) {
      expect(rateLimit(key, 5, 60_000, now + i).allowed).toBe(true);
    }
  });

  it("rejects the next request once the limit is exceeded within the same window", () => {
    const key = uniqueKey("exceed");
    const now = 1_000_000;
    for (let i = 0; i < 5; i++) rateLimit(key, 5, 60_000, now + i);

    const result = rateLimit(key, 5, 60_000, now + 5);
    expect(result.allowed).toBe(false);
    expect(result.retryAfterSeconds).toBeGreaterThan(0);
  });

  it("resets the count once the window has fully elapsed", () => {
    const key = uniqueKey("reset");
    const now = 1_000_000;
    for (let i = 0; i < 5; i++) rateLimit(key, 5, 60_000, now + i);
    expect(rateLimit(key, 5, 60_000, now + 5).allowed).toBe(false);

    // A full window later, the bucket should have reset rather than staying rejected forever.
    expect(rateLimit(key, 5, 60_000, now + 60_000).allowed).toBe(true);
  });

  it("tracks separate keys independently (one exhausted key never blocks another)", () => {
    const keyA = uniqueKey("a");
    const keyB = uniqueKey("b");
    const now = 2_000_000;
    for (let i = 0; i < 5; i++) rateLimit(keyA, 5, 60_000, now + i);

    expect(rateLimit(keyA, 5, 60_000, now + 5).allowed).toBe(false);
    expect(rateLimit(keyB, 5, 60_000, now + 5).allowed).toBe(true);
  });

  it("computes retryAfterSeconds as the time remaining in the current window", () => {
    const key = uniqueKey("retry-after");
    const now = 3_000_000;
    for (let i = 0; i < 2; i++) rateLimit(key, 2, 10_000, now);

    const result = rateLimit(key, 2, 10_000, now + 3_000);
    expect(result.allowed).toBe(false);
    expect(result.retryAfterSeconds).toBe(7); // 10s window - 3s elapsed = 7s left
  });
});

describe("rateLimitKey", () => {
  it("combines IP and recovery code, normalized to uppercase", () => {
    expect(rateLimitKey("1.2.3.4", "ab2c4d7h")).toBe("1.2.3.4:AB2C4D7H");
  });

  it("falls back to a distinct IP-only key when no recovery code is given", () => {
    expect(rateLimitKey("1.2.3.4")).toBe("1.2.3.4:no-code");
    expect(rateLimitKey("1.2.3.4", null)).toBe("1.2.3.4:no-code");
    expect(rateLimitKey("1.2.3.4", "")).toBe("1.2.3.4:no-code");
  });
});

describe("clientIpFromHeaders", () => {
  function headers(map: Record<string, string>) {
    return { get: (name: string) => map[name.toLowerCase()] ?? null };
  }

  it("prefers the first entry of x-forwarded-for", () => {
    expect(clientIpFromHeaders(headers({ "x-forwarded-for": "1.1.1.1, 2.2.2.2" }))).toBe("1.1.1.1");
  });

  it("falls back to x-real-ip when x-forwarded-for is absent", () => {
    expect(clientIpFromHeaders(headers({ "x-real-ip": "3.3.3.3" }))).toBe("3.3.3.3");
  });

  it("falls back to a constant when neither header is present", () => {
    expect(clientIpFromHeaders(headers({}))).toBe("unknown-ip");
  });
});

describe("rateLimitRejection", () => {
  it("builds a 429 shape with a Retry-After header of at least 1 second", () => {
    const rejection = rateLimitRejection(0);
    expect(rejection.status).toBe(429);
    expect(rejection.headers["Retry-After"]).toBe("1");
  });

  it("passes through a real retry time", () => {
    expect(rateLimitRejection(42).headers["Retry-After"]).toBe("42");
  });
});
