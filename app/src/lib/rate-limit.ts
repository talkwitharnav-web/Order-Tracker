/**
 * Lightweight in-memory rate limiter for login attempts. Keyed per-IP, not
 * shared across processes — appropriate for this app's single-instance
 * deployment (see SYSTEM_MEMORY.md on the WS hub's similar in-process
 * assumption). Would need a shared store (Redis, etc.) if this ever ran
 * behind a load balancer with multiple instances.
 */
const attempts = new Map<string, { count: number; windowStart: number }>();

const DEFAULT_WINDOW_MS = 60_000;
const DEFAULT_MAX_ATTEMPTS = 10;

/**
 * Returns true if the request should be allowed, false if rate-limited.
 * Login/register routes rely on the default (10/min) — a tight cap makes
 * sense for credential-guessing throttling. Endpoints with a legitimately
 * higher-frequency, lower-risk usage pattern (e.g. autocomplete-as-you-type)
 * can pass a looser `{ windowMs, maxAttempts }` without affecting any other
 * caller's limit, since each call site's `key` keeps its own independent
 * counter regardless of which options it's called with.
 */
export function checkRateLimit(
  key: string,
  options?: { windowMs?: number; maxAttempts?: number },
): boolean {
  const windowMs = options?.windowMs ?? DEFAULT_WINDOW_MS;
  const maxAttempts = options?.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
  const now = Date.now();
  const entry = attempts.get(key);

  if (!entry || now - entry.windowStart > windowMs) {
    attempts.set(key, { count: 1, windowStart: now });
    return true;
  }

  if (entry.count >= maxAttempts) {
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
