import { NextResponse } from "next/server";
import { query, initDb } from "@/lib/db";
import { logger } from "@/lib/logger";
import { requireAdmin } from "@/lib/auth";

export async function GET() {
  logger.info("GET /api/dev/db - request received");

  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  try {
    await initDb();

    logger.info("GET /api/dev/db - fetching all data...");
    const restaurants = (await query("SELECT * FROM restaurants")).rows;
    const orders = (await query("SELECT * FROM orders ORDER BY id DESC")).rows;
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

  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  try {
    await initDb();

    logger.warn("DELETE /api/dev/db - DELETING ALL DATA...");
    await query("DELETE FROM orders");
    await query("DELETE FROM restaurants");
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
