/**
 * Lightweight in-memory rate limiter for login attempts. Keyed per-IP, not
 * shared across processes — appropriate for this app's single-instance
 * deployment (see SYSTEM_MEMORY.md on the WS hub's similar in-process
 * assumption). Would need a shared store (Redis, etc.) if this ever ran
 * behind a load balancer with multiple instances.
 */
const attempts = new Map<string, { count: number; windowStart: number }>();

const WINDOW_MS = 60_000;
const MAX_ATTEMPTS = 10;

/** Returns true if the request should be allowed, false if rate-limited. */
export function checkRateLimit(key: string): boolean {
  const now = Date.now();
  const entry = attempts.get(key);

  if (!entry || now - entry.windowStart > WINDOW_MS) {
    attempts.set(key, { count: 1, windowStart: now });
    return true;
  }

  if (entry.count >= MAX_ATTEMPTS) {
    return false;
  }

  entry.count += 1;
  return true;
}

export function getClientIp(req: Request): string {
  const forwardedFor = req.headers.get("x-forwarded-for");
  if (forwardedFor) return forwardedFor.split(",")[0].trim();
  return "unknown";
}
