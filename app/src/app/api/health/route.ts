import { NextResponse } from "next/server";
import { getPool } from "@/lib/db";
import { logger } from "@/lib/logger";
import { cookies } from "next/headers";
import { requireAnyAuthenticated, isAdminRequest } from "@/lib/auth";
import { ADMIN_SESSION_COOKIE_NAME, RESTAURANT_SESSION_COOKIE_NAME } from "@/lib/session";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";
import { errJson } from "@/lib/error-response";

export type HealthTier = "healthy" | "ok" | "bad" | "terrible";

// Thresholds are on DB round-trip latency for a trivial `SELECT 1` — the
// simplest available signal for "is Postgres actually responsive right now",
// distinct from whether the TCP connection itself is up (a slow/overloaded
// DB answers eventually; a dead one never does, which is what the DB_DOWN
// path below covers).
const LATENCY_OK_MS = 50;
const LATENCY_BAD_MS = 300;

// HealthPin's own polling is only ever every 1.5s at its fastest (while the
// popover is actively hovered/tapped) — but that's a client-side courtesy,
// not an enforcement mechanism. Any authenticated caller (any registered
// kitchen account, free to create) could script requests to this route far
// faster than that, and each call does 2 real Postgres round-trips
// (SELECT 1 + pg_database_size), so an unthrottled loop here is a real way
// to load the DB pool under the guise of "just checking health". Capped
// generously above the legitimate 1.5s client cadence so real usage is
// never affected, only a scripted hammer is.
const RATE_LIMIT_WINDOW_MS = 10_000;
const RATE_LIMIT_MAX_REQUESTS = 20;

export async function GET(request: Request) {
  // Any logged-in caller (admin or a kitchen) can read this — it exposes no
  // restaurant-specific data, just aggregate server/DB signals, so there's
  // nothing to scope per-restaurant the way order routes are. Still fully
  // gated server-side (the cookie is httpOnly and verified here, not on the
  // client), so this can never be unlocked by editing client state in
  // devtools — only a real, valid session cookie gets a response.
  const auth = await requireAnyAuthenticated();
  if (!auth.ok) return auth.response;

  // Keyed by the caller's own session cookie, not raw IP -- getClientIp()
  // returns the literal string "unknown" for every localhost caller with no
  // X-Forwarded-For header (see CLAUDE.md's ".141 machine" lesson on
  // /api/restaurants/register), which would otherwise put every tab/admin
  // page/kitchen dashboard on this dev machine into ONE shared bucket. A
  // kitchen dashboard tab and an admin/db tab open side by side each poll
  // independently and would trip each other's rate limit long before either
  // one was actually abusive. The session cookie value is already an
  // unforgeable per-login identity (HMAC-signed, see session.ts), so it's a
  // strictly better key than IP here even once this app is reachable
  // remotely -- falls back to IP only for the unreachable case where
  // requireAnyAuthenticated() passed but somehow no cookie value is read.
  const cookieStore = await cookies();
  const sessionKey =
    cookieStore.get(ADMIN_SESSION_COOKIE_NAME)?.value ??
    cookieStore.get(RESTAURANT_SESSION_COOKIE_NAME)?.value ??
    getClientIp(request);
  if (!checkRateLimit(`health:${sessionKey}`, { windowMs: RATE_LIMIT_WINDOW_MS, maxAttempts: RATE_LIMIT_MAX_REQUESTS })) {
    return errJson("RATE_LIMITED_HEALTH", 429);
  }

  const isAdmin = await isAdminRequest();
  const pool = getPool();
  const started = Date.now();
  let dbLatencyMs: number | null = null;
  let dbError: string | null = null;
  let dbSizeBytes: number | null = null;
  let auditSizeBytes: number | null = null;

  try {
    await pool.query("SELECT 1");
    dbLatencyMs = Date.now() - started;
    // pg_database_size() needs the target database's name, not the
    // connection's own name assumption -- current_database() is always
    // correct regardless of what DATABASE_URL's path segment says.
    const sizeResult = await pool.query<{ size: string }>("SELECT pg_database_size(current_database())::text AS size");
    dbSizeBytes = Number(sizeResult.rows[0]?.size ?? null) || null;
    // pg_total_relation_size (not pg_relation_size) so this includes the
    // table's own indexes (idx_order_status_events_order_id/restaurant_name)
    // too -- matches how the DB-wide figure above already counts everything,
    // not just raw heap pages, so the two numbers stay comparable at a glance.
    const auditSizeResult = await pool.query<{ size: string }>(
      "SELECT pg_total_relation_size('order_status_events')::text AS size",
    );
    auditSizeBytes = Number(auditSizeResult.rows[0]?.size ?? null) || null;
  } catch (err) {
    // Full error text (which can include internal connection details) is
    // always logged server-side, but only echoed to the caller when they're
    // an admin -- a self-registered kitchen account can see the DB is down
    // (tier: "terrible") without also being handed raw driver error strings.
    logger.error("GET /api/health - DB check failed", err);
    const rawMessage = err instanceof Error ? err.message : "Unknown DB error";
    dbError = isAdmin ? rawMessage : "Database check failed";
  }

  const globalForWs = globalThis as unknown as { __orderTrackerWsClients?: Set<unknown> };
  const wsClientCount = globalForWs.__orderTrackerWsClients?.size ?? 0;
  // DB size/pool internals are admin-only detail -- a self-registered
  // kitchen account still gets its tier/latency (the actual "is this
  // usable right now" signal HealthPin needs) but not infrastructure
  // internals that have no bearing on their own kitchen's usability (see
  // SECURITY_ATTACK_LOG.md's "Health Endpoint Leaks Infrastructure
  // Details" finding -- registration being open made "any authenticated
  // caller" a much lower bar than intended when this endpoint was designed).

  let tier: HealthTier;
  if (dbError !== null) {
    tier = "terrible";
  } else if (pool.waitingCount > 0 || (dbLatencyMs !== null && dbLatencyMs > LATENCY_BAD_MS)) {
    tier = "bad";
  } else if (dbLatencyMs !== null && dbLatencyMs > LATENCY_OK_MS) {
    tier = "ok";
  } else {
    tier = "healthy";
  }

  return NextResponse.json({
    tier,
    db: {
      connected: dbError === null,
      latencyMs: dbLatencyMs,
      error: dbError,
      sizeBytes: isAdmin ? dbSizeBytes : null,
      auditSizeBytes: isAdmin ? auditSizeBytes : null,
      pool: isAdmin ? { total: pool.totalCount, idle: pool.idleCount, waiting: pool.waitingCount } : null,
    },
    ws: {
      connectedClients: isAdmin ? wsClientCount : null,
    },
    checkedAt: new Date().toISOString(),
  });
}
