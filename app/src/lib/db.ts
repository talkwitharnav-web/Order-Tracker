import { Pool, QueryResultRow } from "pg";

let pool: Pool | null = null;

export function getPool() {
  if (!pool) {
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
    });
  }
  return pool;
}

export async function query<T extends QueryResultRow = QueryResultRow>(
  text: string,
  params?: unknown[],
) {
  return getPool().query<T>(text, params);
}

export async function initDb() {
  const db = getPool();
  await db.query(`
    CREATE TABLE IF NOT EXISTS orders (
      id SERIAL PRIMARY KEY,
      order_number TEXT NOT NULL,
      restaurant_name TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'Received',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
  await db.query(`
    CREATE TABLE IF NOT EXISTS restaurants (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      password TEXT NOT NULL,
      raw_password TEXT
    );
  `);
  await db.query(`
    CREATE INDEX IF NOT EXISTS idx_orders_updated_at ON orders (updated_at);
  `);
  // Case-insensitive uniqueness: prevents the same order (e.g. "ASDF"/"asdf")
  // being created twice for a restaurant regardless of which client (Kitchen
  // vs Customer) normalized casing differently.
  await db.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_unique_restaurant_order
    ON orders (LOWER(restaurant_name), LOWER(order_number));
  `);
  // Same reasoning as above, applied to restaurant registration: the plain
  // UNIQUE on name is case-sensitive, so "Golden Spoon" and "GOLDEN SPOON"
  // could otherwise both register and desync login/lookup behavior.
  await db.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_restaurants_unique_name_ci
    ON restaurants (LOWER(name));
  `);
}
