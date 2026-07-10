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
      order_lookup_key TEXT GENERATED ALWAYS AS (regexp_replace(upper(order_number), '[^A-Z0-9]', '', 'g')) STORED,
      restaurant_name TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'Received',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      deleted_at TIMESTAMPTZ,
      received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      preparing_at TIMESTAMPTZ,
      complete_at TIMESTAMPTZ,
      status_transition_token TEXT,
      status_transition_at TIMESTAMPTZ
    );
  `);
  await db.query(`
    CREATE TABLE IF NOT EXISTS restaurants (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      password TEXT NOT NULL,
      raw_password TEXT,
      deleted_at TIMESTAMPTZ,
      complete_cap_hours REAL NOT NULL DEFAULT 12
    );
  `);
  // deleted_at didn't exist in earlier versions of this schema -- ADD COLUMN
  // IF NOT EXISTS makes both of the CREATE TABLEs above safe to run again
  // unchanged against a database that already has these tables without it.
  await db.query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;`);
  await db.query(`ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;`);
  // Per-status entry timestamps, each set ONCE the first time an order
  // enters that status (see the PUT /api/orders/[id] route) -- unlike
  // updated_at (overwritten on every change), these let admin/db compute
  // how long an order actually spent in each individual status after the
  // fact, not just its most recent transition.
  //
  // received_at is added WITHOUT a NOT NULL/DEFAULT constraint here on
  // purpose: `ALTER TABLE ... ADD COLUMN ... DEFAULT NOW()` backfills every
  // *existing* row with the migration's own run-time, not each row's real
  // creation time, which would be wrong history for any order that already
  // existed before this column was added. Nullable-first + one explicit
  // backfill from created_at (correct for every pre-existing row, since
  // every order starts life as Received) + a separate follow-up ALTER to
  // add the NOT NULL/DEFAULT constraint afterward gets both a correct
  // backfill AND "free" received_at on every future INSERT.
  await db.query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS received_at TIMESTAMPTZ;`);
  await db.query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS preparing_at TIMESTAMPTZ;`);
  await db.query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS complete_at TIMESTAMPTZ;`);
  await db.query(`UPDATE orders SET received_at = created_at WHERE received_at IS NULL;`);
  await db.query(`ALTER TABLE orders ALTER COLUMN received_at SET NOT NULL;`);
  await db.query(`ALTER TABLE orders ALTER COLUMN received_at SET DEFAULT NOW();`);
  // Set by the customer tracker's "Order Picked Up" button once an order
  // reaches Complete -- stops the Complete-duration counter early instead
  // of always running to the kitchen's complete_cap_hours fallback. No
  // auth beyond already knowing the restaurant+order name (same anonymous
  // trust level as every other customer-tracker read/action -- this only
  // lets someone stop a timer early, not see or change anything sensitive).
  await db.query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS acknowledged_at TIMESTAMPTZ;`);
  // One-time token for the kitchen's short Undo window. Every genuine
  // forward transition replaces it; successful Undo clears it. Keeping the
  // token server-side prevents an old toast or another tab from reverting a
  // newer status change.
  await db.query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS status_transition_token TEXT;`);
  await db.query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS status_transition_at TIMESTAMPTZ;`);
  // Human-readable order_number remains exactly what the kitchen entered;
  // this generated key makes customer lookup and duplicate prevention ignore
  // harmless differences in spaces, punctuation, and case. Generated in
  // Postgres so every insert path (including dev seed/imports) stays aligned
  // with the same invariant without trusting each caller to populate it.
  await db.query(`
    ALTER TABLE orders
    ADD COLUMN IF NOT EXISTS order_lookup_key TEXT
    GENERATED ALWAYS AS (regexp_replace(upper(order_number), '[^A-Z0-9]', '', 'g')) STORED;
  `);
  // Per-kitchen fallback cap on the live-ticking Complete duration, in case
  // a customer never clicks "Order Picked Up" -- REAL (not INTEGER) so a
  // kitchen can set a fractional value (e.g. 0.5 for 30 minutes) if they
  // want a tighter cap than a whole hour. Defaults to 12h, matching "who's
  // picking up an order 12 hours later" as the deliberately generous
  // fallback ceiling.
  await db.query(`ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS complete_cap_hours REAL NOT NULL DEFAULT 12;`);
  await db.query(`
    CREATE INDEX IF NOT EXISTS idx_orders_updated_at ON orders (updated_at);
  `);
  // Canonical uniqueness: "Pager 14", "PAGER14", and "pager-14" are the
  // same live pickup identifier. Create the replacement before dropping the
  // older case-only index, so a migration collision fails closed and leaves
  // the existing protection intact for manual resolution.
  await db.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_unique_restaurant_lookup
    ON orders (LOWER(restaurant_name), order_lookup_key) WHERE deleted_at IS NULL;
  `);
  await db.query(`DROP INDEX IF EXISTS idx_orders_unique_restaurant_order;`);
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
  // The Kitchen Dashboard polls GET /api/orders/restaurant/[name] every 5s
  // per open tab, filtering on `restaurant_name ILIKE $1 AND deleted_at IS
  // NULL` -- the single most frequently-run query in the app. A plain ILIKE
  // can't use a normal btree index; this expression index matches the
  // LOWER(restaurant_name) comparison the query planner can derive from an
  // exact-match ILIKE pattern (no wildcards are ever used here, only a
  // fully-escaped literal name), so lookups stay index-backed as order
  // volume grows instead of falling back to a sequential scan.
  await db.query(`
    CREATE INDEX IF NOT EXISTS idx_orders_restaurant_live
    ON orders (LOWER(restaurant_name)) WHERE deleted_at IS NULL;
  `);

  // Per-employee identities within a kitchen account, for attributing WHO
  // made a status change (see SYSTEM_MEMORY.md "Employee Attribution") --
  // separate from the restaurant's own login, which remains the single
  // device-level kitchen session. PIN, not password: verified fresh on each
  // status-changing action rather than establishing its own session/cookie,
  // matching how real POS systems attribute frequent per-order actions
  // without a full per-employee login/logout cycle.
  await db.query(`
    CREATE TABLE IF NOT EXISTS restaurant_employees (
      id SERIAL PRIMARY KEY,
      restaurant_id INTEGER NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'employee',
      pin_hash TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      deleted_at TIMESTAMPTZ
    );
  `);
  // Case-insensitive uniqueness per kitchen, live rows only -- mirrors
  // idx_restaurants_unique_name_ci's reasoning so a deactivated employee's
  // name can be reused by a new hire immediately.
  await db.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_restaurant_employees_unique_name_ci
    ON restaurant_employees (restaurant_id, LOWER(name)) WHERE deleted_at IS NULL;
  `);
  await db.query(`
    CREATE INDEX IF NOT EXISTS idx_restaurant_employees_restaurant_live
    ON restaurant_employees (restaurant_id) WHERE deleted_at IS NULL;
  `);

  // Kitchen-defined display labels ("Chef", "Cashier", "Dishwasher", ...),
  // purely cosmetic/organizational -- see SYSTEM_MEMORY.md "Employee
  // Attribution". Distinct from `restaurant_employees.account_type` below,
  // which is the fixed manager/employee value that actually controls
  // Staff-tab/admin access; a role_id has no permission effect on its own.
  await db.query(`
    CREATE TABLE IF NOT EXISTS restaurant_roles (
      id SERIAL PRIMARY KEY,
      restaurant_id INTEGER NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
  await db.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_restaurant_roles_unique_name_ci
    ON restaurant_roles (restaurant_id, LOWER(name));
  `);

  // account_type is the original `role` column's actual meaning (manager vs
  // "everyone else who can be attributed to an action") -- split out under
  // its own name once `role` also needed to mean "kitchen-defined display
  // label" (role_id, below), which are two different concepts that used to
  // be conflated in one column. Backfill from the pre-existing `role`
  // values ('manager' stays 'manager'; the former default 'cashier' and
  // anything else becomes 'employee', matching the terminology rename --
  // "cashier" implied only front-of-house staff change status, when
  // actually anyone can).
  await db.query(`ALTER TABLE restaurant_employees ADD COLUMN IF NOT EXISTS account_type TEXT;`);
  await db.query(`UPDATE restaurant_employees SET account_type = 'manager' WHERE account_type IS NULL AND role = 'manager';`);
  await db.query(`UPDATE restaurant_employees SET account_type = 'employee' WHERE account_type IS NULL;`);
  await db.query(`ALTER TABLE restaurant_employees ALTER COLUMN account_type SET NOT NULL;`);
  await db.query(`ALTER TABLE restaurant_employees ALTER COLUMN account_type SET DEFAULT 'employee';`);

  // Nullable FK to the kitchen's own custom role labels -- null means "no
  // custom label set", which is a normal, common state (a kitchen that
  // never bothered defining roles), not an error.
  await db.query(`ALTER TABLE restaurant_employees ADD COLUMN IF NOT EXISTS role_id INTEGER REFERENCES restaurant_roles(id) ON DELETE SET NULL;`);

  // PIN length is chosen per-employee at creation time (4 or 6 digits) --
  // bcrypt itself doesn't care, but the PIN pad UI needs to know how many
  // dots/digits to render when THIS employee is the one entering their PIN.
  // Backfilled to 4 for any employee created before this column existed
  // (every PIN accepted so far has in fact been 4-6 digits per the existing
  // PIN_PATTERN validator, and 4 was the only length actually reachable
  // through the UI before the toggle existed).
  await db.query(`ALTER TABLE restaurant_employees ADD COLUMN IF NOT EXISTS pin_length SMALLINT;`);
  await db.query(`UPDATE restaurant_employees SET pin_length = 4 WHERE pin_length IS NULL;`);
  await db.query(`ALTER TABLE restaurant_employees ALTER COLUMN pin_length SET NOT NULL;`);
  await db.query(`ALTER TABLE restaurant_employees ALTER COLUMN pin_length SET DEFAULT 4;`);

  // Append-only audit trail of every status transition, separate from
  // orders' own single-row status/timestamp columns -- those only ever hold
  // the CURRENT status and the FIRST time each stage was entered, so they
  // can't show a full history (e.g. an admin override bouncing a status back
  // and forth) or who performed each individual step. employee_id is
  // nullable: God Mode admin overrides and any transition made before an
  // employee PIN is supplied still record an event, just without attribution,
  // rather than silently skipping the audit row entirely.
  await db.query(`
    CREATE TABLE IF NOT EXISTS order_status_events (
      id SERIAL PRIMARY KEY,
      order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
      from_status TEXT,
      to_status TEXT NOT NULL,
      employee_id INTEGER REFERENCES restaurant_employees(id) ON DELETE SET NULL,
      employee_name TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
  await db.query(`
    CREATE INDEX IF NOT EXISTS idx_order_status_events_order_id
    ON order_status_events (order_id);
  `);
}
