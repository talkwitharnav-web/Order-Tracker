import sqlite3 from "sqlite3";
import { open, Database } from "sqlite";

let db: Database | null = null;

export async function getDb() {
  if (!db) {
    db = await open({
      filename: "./orders.db",
      driver: sqlite3.Database,
    });
  }
  return db;
}

export async function initDb() {
  const db = await getDb();
  await db.exec(`
    CREATE TABLE IF NOT EXISTS orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_number TEXT NOT NULL,
      restaurant_name TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'Received',
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);
  await db.exec(`
    CREATE TABLE IF NOT EXISTS restaurants (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      password TEXT NOT NULL
    );
  `);

  // Add raw_password column if it doesn't exist, for backwards compatibility
  try {
    await db.exec('ALTER TABLE restaurants ADD COLUMN raw_password TEXT');
  } catch (e) {
    if (e instanceof Error && e.message.includes('duplicate column name')) {
      // Column already exists, which is fine.
    } else {
      throw e;
    }
  }

  await db.exec(`
    CREATE INDEX IF NOT EXISTS idx_orders_updated_at ON orders (updated_at);
  `);

  // A migration to add 'created_at' to orders if it doesn't exist.
  try {
    await db.exec('ALTER TABLE orders ADD COLUMN created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP');
  } catch (e) {
     if (e instanceof Error && e.message.includes('duplicate column name')) {
      // Column already exists, which is fine.
    } else {
      throw e;
    }
  }
}
