import { Pool, QueryResultRow } from "pg";
import { logger } from "@/lib/logger";

let pool: Pool | null = null;

export function getPool() {
  if (!pool) {
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      connectionTimeoutMillis: 5000,
      statement_timeout: 10000,
      query_timeout: 10000,
    });
    // An idle pooled client can emit a background 'error' (e.g. Postgres
    // restarting, network blip) with no request in flight to catch it —
    // without this listener that's an unhandled 'error' event, which is
    // fatal and crashes the whole Node process (server.js and all in-flight
    // requests along with it), not just the one bad connection.
    pool.on("error", (err) => {
      logger.error("Postgres pool - idle client error (connection dropped, pool will recover)", err);
    });
  }
  return pool;
}

// Error codes/messages worth retrying: connection refused/reset (DB was
// briefly unreachable, e.g. Docker container restarting) and Postgres
// admin-shutdown/crash codes. Anything else (bad SQL, constraint violation,
// auth failure) is a real error and retrying it would just waste time and
// re-throw the identical failure.
const RETRYABLE_CODES = new Set([
  "ECONNREFUSED",
  "ECONNRESET",
  "ETIMEDOUT",
  "57P01", // admin_shutdown
  "57P02", // crash_shutdown
  "57P03", // cannot_connect_now
]);

function isRetryable(err: unknown): boolean {
  const code = (err as { code?: string } | undefined)?.code;
  return typeof code === "string" && RETRYABLE_CODES.has(code);
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Runs a query, retrying transient connection failures with a short
 * exponential backoff (100ms, 300ms) before giving up. This only retries
 * failure modes that are safe to blindly redo (the statement never reached
 * Postgres, or Postgres itself bounced) — anything else is rethrown
 * immediately on the first attempt.
 */
export async function query<T extends QueryResultRow = QueryResultRow>(
  text: string,
  params?: unknown[],
) {
  const delays = [100, 300];
  let attempt = 0;
  for (;;) {
    try {
      return await getPool().query<T>(text, params);
    } catch (err) {
      if (attempt >= delays.length || !isRetryable(err)) throw err;
      logger.warn("db.query - transient error, retrying", {
        attempt: attempt + 1,
        code: (err as { code?: string }).code,
      });
      await sleep(delays[attempt]);
      attempt += 1;
    }
  }
}

// initDb() only ever CREATEs (tables/indexes "IF NOT EXISTS") — nothing in
// this codebase ever DROPs them (the "purge" route deletes rows, not
// tables), so once it has succeeded once in this process there is nothing
// left for it to do. Every mutating route calls it unconditionally though,
// which meant 6 extra round-trip queries to Postgres on every single order
// create/update/delete and restaurant register/delete/password-reset call.
// Memoizing the in-flight/completed promise turns that into a one-time cost
// per process instead of a per-request one, with identical end behavior — if
// it fails, the promise is cleared so the next request retries it instead of
// permanently caching a failure.
let initDbPromise: Promise<void> | null = null;

export async function initDb() {
  if (!initDbPromise) {
    initDbPromise = runInitDb().catch((err) => {
      initDbPromise = null;
      throw err;
    });
  }
  return initDbPromise;
}

async function runInitDb() {
  const db = getPool();
  await db.query(`
    CREATE TABLE IF NOT EXISTS orders (
      id SERIAL PRIMARY KEY,
      order_number TEXT NOT NULL,
      restaurant_name TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'Received',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      deleted_at TIMESTAMPTZ
    );
  `);
  await db.query(`
    CREATE TABLE IF NOT EXISTS restaurants (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      password TEXT NOT NULL,
      raw_password TEXT,
      deleted_at TIMESTAMPTZ
    );
  `);
  // deleted_at didn't exist in earlier versions of this schema -- ADD COLUMN
  // IF NOT EXISTS makes both of the CREATE TABLEs above safe to run again
  // unchanged against a database that already has these tables without it.
  await db.query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;`);
  await db.query(`ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;`);
  await db.query(`
    CREATE INDEX IF NOT EXISTS idx_orders_updated_at ON orders (updated_at);
  `);
  // Case-insensitive uniqueness: prevents the same order (e.g. "ASDF"/"asdf")
  // being created twice for a restaurant regardless of which client (Kitchen
  // vs Customer) normalized casing differently. Scoped to live (non-deleted)
  // orders only -- a soft-deleted "ORD1" must not block a brand new "ORD1"
  // from being created for the same restaurant.
  await db.query(`DROP INDEX IF EXISTS idx_orders_unique_restaurant_order;`);
  await db.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_unique_restaurant_order
    ON orders (LOWER(restaurant_name), LOWER(order_number)) WHERE deleted_at IS NULL;
  `);
  // Same reasoning as above, applied to restaurant registration: the plain
  // UNIQUE on name is case-sensitive, so "Golden Spoon" and "GOLDEN SPOON"
  // could otherwise both register and desync login/lookup behavior. Scoped
  // to live restaurants only -- a soft-deleted restaurant's name is stored
  // encrypted (see lib/crypto.ts), not as plaintext, specifically so it
  // never collides with this index and a new registration can reuse the
  // name immediately.
  await db.query(`DROP INDEX IF EXISTS idx_restaurants_unique_name_ci;`);
  await db.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_restaurants_unique_name_ci
    ON restaurants (LOWER(name)) WHERE deleted_at IS NULL;
  `);
}
