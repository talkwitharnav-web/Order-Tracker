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
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);
  await db.exec(`
    CREATE TABLE IF NOT EXISTS restaurants (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      password TEXT NOT NULL,
      raw_password TEXT NOT NULL
    );
  `);
  await db.exec(`
    CREATE INDEX IF NOT EXISTS idx_orders_updated_at ON orders (updated_at);
  `);
}
