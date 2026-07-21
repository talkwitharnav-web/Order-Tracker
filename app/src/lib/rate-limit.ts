/**
 * Lightweight in-memory rate limiter, shared by every rate-limited route in
 * this app (login, PIN checks, order creation, autocomplete, etc). Keyed
 * per-caller-supplied string, not shared across processes — appropriate for
 * this app's single-instance deployment (see SYSTEM_MEMORY.md on the WS
 * hub's similar in-process assumption). Would need a shared store (Redis,
 * etc.) if this ever ran behind a load balancer with multiple instances.
 *
 * SLIDING WINDOW, NOT FIXED WINDOW -- this matters. A fixed-window counter
 * (reset every windowMs on a wall-clock boundary from the first request seen)
 * has two well-known problems, both reported live against orders-create on
 * 2026-07-21: (1) a burst that trips the cap in the first few seconds of a
 * window gets blocked for however long is LEFT in that window -- up to the
 * full windowMs, wildly disproportionate to how long the caller actually
 * spammed for; (2) a caller can burst right before a window boundary, then
 * burst again the instant the next window opens, getting two full-size
 * bursts close together with no smoothing between them. A sliding window
 * (keep exact timestamps, count how many fall within the last windowMs of
 * NOW on every check) fixes both: the block duration is always exactly
 * "wait until your oldest recent request ages out," proportional to the
 * actual overshoot, and there is no reset boundary to game.
 *
 * Kept as a real timestamp log per key (not a token-bucket refill-rate
 * model) because every existing call site already thinks in "N per
 * windowMs" terms (easy to reason about for a kitchen's actual usage
 * pattern, e.g. "30 orders/min = one every 2s"), and this app's traffic
 * volume is small enough that a per-key array of up to maxAttempts
 * timestamps is trivial memory (the largest limit in the app today is
 * 120/min, i.e. at most 120 numbers per key).
 *
 * ROUTER/PUBLIC-EXPOSURE READINESS (not active): today, every per-IP key
 * here is really per-*household* on a home LAN (several people/devices
 * sharing one router IP), so the current limits (10/min login, 120/min
 * anonymous lookups) are tuned generously with that in mind. Once this app
 * is reachable from the open internet, per-IP is a much more precise
 * signal (one real caller per IP, mostly), so these limits could be
 * tightened without hurting legitimate use, e.g.:
 *
 * const DEFAULT_MAX_ATTEMPTS = process.env.PUBLIC_DEPLOYMENT ? 5 : 10;
 *
 * Also worth adding at that point: a global (not per-IP) ceiling on total
 * requests/sec across all callers, since a distributed attack from many
 * different IPs entirely sidesteps a per-IP limiter -- not needed against
 * the LAN-only threat model this app has today.
 */
const requestLog = new Map<string, number[]>();

const DEFAULT_WINDOW_MS = 60_000;
const DEFAULT_MAX_ATTEMPTS = 10;

// Entries are only ever pruned lazily (on the next checkRateLimit call for
// that same key) -- a key from a client that never comes back (a one-off
// visitor's IP, a scripted attacker who moves on) would otherwise stay in
// the Map forever, an unbounded memory leak on a long-lived process. A
// generous stale threshold (10x the longest window any call site uses)
// keeps this sweep cheap and rare without needing per-call-site tuning.
const STALE_ENTRY_MS = 10 * 60_000;
const SWEEP_INTERVAL_MS = 5 * 60_000;

let lastSweep = Date.now();
function sweepStaleEntries(now: number): void {
  if (now - lastSweep < SWEEP_INTERVAL_MS) return;
  lastSweep = now;
  for (const [key, timestamps] of requestLog) {
    const newest = timestamps[timestamps.length - 1];
    if (newest === undefined || now - newest > STALE_ENTRY_MS) requestLog.delete(key);
  }
}

/**
 * Returns true if the request should be allowed, false if rate-limited.
 * Login/register routes rely on the default (10/min) — a tight cap makes
 * sense for credential-guessing throttling. Endpoints with a legitimately
 * higher-frequency, lower-risk usage pattern (e.g. autocomplete-as-you-type)
 * can pass a looser `{ windowMs, maxAttempts }` without affecting any other
 * caller's limit, since each call site's `key` keeps its own independent
 * counter regardless of which options it's called with.
 *
 * Sliding window: a request is allowed if fewer than `maxAttempts` requests
 * for this key have timestamps within the last `windowMs`, measured from
 * right now -- not from a fixed reset point. Timestamps older than the
 * window are dropped on every call, so the log for an active key never
 * grows past `maxAttempts` entries.
 */
export function checkRateLimit(
  key: string,
  options?: { windowMs?: number; maxAttempts?: number },
): boolean {
  const windowMs = options?.windowMs ?? DEFAULT_WINDOW_MS;
  const maxAttempts = options?.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
  const now = Date.now();
  sweepStaleEntries(now);

  const cutoff = now - windowMs;
  const existing = requestLog.get(key);
  const recent = existing ? existing.filter((t) => t > cutoff) : [];

  if (recent.length >= maxAttempts) {
    requestLog.set(key, recent);
    return false;
  }

  recent.push(now);
  requestLog.set(key, recent);
  return true;
}

export function getClientIp(req: Request): string {
  const forwardedFor = req.headers.get("x-forwarded-for");
  if (forwardedFor) return forwardedFor.split(",")[0].trim();
  return "unknown";
}
