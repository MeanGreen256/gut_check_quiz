import { afterEach, expect, it, vi } from "vitest";
import { createRateLimiter } from "../lib/rate-limit";
afterEach(() => vi.unstubAllEnvs());
it("expires windows and bounds memory without trusting forwarded chains", () => {
  vi.stubEnv("VERCEL", "1");
  const limit = createRateLimiter(1, 100, 1);
  const headers = new Headers({ "x-vercel-forwarded-for": "192.0.2.1" });
  expect(limit(headers, 0)).toBe(false);
  expect(limit(headers, 1)).toBe(true);
  expect(limit(new Headers({ "x-vercel-forwarded-for": "192.0.2.2" }), 1)).toBe(true);
  expect(limit(headers, 100)).toBe(false);
});
it("spoofed x-forwarded-for does not create fresh buckets", () => {
  const limit = createRateLimiter(1);
  expect(limit(new Headers({ "x-forwarded-for": "a" }))).toBe(false);
  expect(limit(new Headers({ "x-forwarded-for": "b" }))).toBe(true);
});
