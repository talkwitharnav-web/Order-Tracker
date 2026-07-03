import { NextResponse } from "next/server";
import { getDb, initDb } from "@/lib/db";
import { logger } from "@/lib/logger";

export async function GET() {
  logger.info("GET /api/dev/db - request received");
  try {
    await initDb();
    const db = await getDb();

    logger.info("GET /api/dev/db - fetching all data...");
    const restaurants = await db.all("SELECT * FROM restaurants");
    const orders = await db.all("SELECT * FROM orders ORDER BY id DESC");
    logger.info("GET /api/dev/db - data fetched");

    return NextResponse.json({ restaurants, orders });
  } catch (err) {
    logger.error("GET /api/dev/db - error processing request", err);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 },
    );
  }
}

export async function DELETE() {
  logger.warn("DELETE /api/dev/db - request received to PURGE DATABASE");
  try {
    await initDb();
    const db = await getDb();

    logger.warn("DELETE /api/dev/db - DELETING ALL DATA...");
    await db.run("DELETE FROM orders");
    await db.run("DELETE FROM restaurants");
    logger.warn("DELETE /api/dev/db - DATABASE PURGED");

    // Re-run init to create tables again if they were dropped
    await initDb();

    return NextResponse.json({ message: "Database purged successfully" });
  } catch (err) {
    logger.error("DELETE /api/dev/db - error processing request", err);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 },
    );
  }
}
