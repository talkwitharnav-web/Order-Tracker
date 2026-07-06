import { NextResponse } from "next/server";
import { getPool } from "@/lib/db";
import { logger } from "@/lib/logger";
import { requireAnyAuthenticated } from "@/lib/auth";

export type HealthTier = "healthy" | "ok" | "bad" | "terrible";

// Thresholds are on DB round-trip latency for a trivial `SELECT 1` — the
// simplest available signal for "is Postgres actually responsive right now",
// distinct from whether the TCP connection itself is up (a slow/overloaded
// DB answers eventually; a dead one never does, which is what the DB_DOWN
// path below covers).
const LATENCY_OK_MS = 50;
const LATENCY_BAD_MS = 300;

export async function GET() {
  // Any logged-in caller (admin or a kitchen) can read this — it exposes no
  // restaurant-specific data, just aggregate server/DB signals, so there's
  // nothing to scope per-restaurant the way order routes are. Still fully
  // gated server-side (the cookie is httpOnly and verified here, not on the
  // client), so this can never be unlocked by editing client state in
  // devtools — only a real, valid session cookie gets a response.
  const auth = await requireAnyAuthenticated();
  if (!auth.ok) return auth.response;

  const pool = getPool();
  const started = Date.now();
  let dbLatencyMs: number | null = null;
  let dbError: string | null = null;
  let dbSizeBytes: number | null = null;

  try {
    await pool.query("SELECT 1");
    dbLatencyMs = Date.now() - started;
    // pg_database_size() needs the target database's name, not the
    // connection's own name assumption -- current_database() is always
    // correct regardless of what DATABASE_URL's path segment says.
    const sizeResult = await pool.query<{ size: string }>("SELECT pg_database_size(current_database())::text AS size");
    dbSizeBytes = Number(sizeResult.rows[0]?.size ?? null) || null;
  } catch (err) {
    dbError = err instanceof Error ? err.message : "Unknown DB error";
    logger.error("GET /api/health - DB check failed", err);
  }

  const globalForWs = globalThis as unknown as { __orderTrackerWsClients?: Set<unknown> };
  const wsClientCount = globalForWs.__orderTrackerWsClients?.size ?? 0;

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
      sizeBytes: dbSizeBytes,
      pool: {
        total: pool.totalCount,
        idle: pool.idleCount,
        waiting: pool.waitingCount,
      },
    },
    ws: {
      connectedClients: wsClientCount,
    },
    checkedAt: new Date().toISOString(),
  });
}
