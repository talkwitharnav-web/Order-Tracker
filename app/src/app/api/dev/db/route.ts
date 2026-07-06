import { NextResponse } from "next/server";
import { query, initDb } from "@/lib/db";
import { logger } from "@/lib/logger";
import { requireAdmin } from "@/lib/auth";
import { decryptFromStorage } from "@/lib/crypto";

type RestaurantRow = { id: number; name: string; password: string; raw_password: string | null; deleted_at: string | null };

export async function GET() {
  logger.info("GET /api/dev/db - request received");

  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  try {
    await initDb();

    logger.info("GET /api/dev/db - fetching all data...");
    const restaurantRows = (await query<RestaurantRow>("SELECT * FROM restaurants WHERE deleted_at IS NULL")).rows;
    const orders = (await query("SELECT * FROM orders WHERE deleted_at IS NULL ORDER BY id DESC")).rows;

    const deletedRestaurantRows = (
      await query<RestaurantRow>("SELECT * FROM restaurants WHERE deleted_at IS NOT NULL ORDER BY deleted_at DESC")
    ).rows;
    const deletedOrders = (
      await query("SELECT * FROM orders WHERE deleted_at IS NOT NULL ORDER BY deleted_at DESC")
    ).rows;

    // Deleted restaurants' names are encrypted at rest (see lib/crypto.ts) so
    // the live UNIQUE index frees up their name immediately -- decrypt here
    // purely for admin display in the Deleted view, never written back.
    // Guarded per-row: a single undecryptable name (e.g. the encryption key
    // was rotated by an unpersisted-key fallback since that row was
    // deleted -- see crypto.ts's loadOrCreateKey) must not throw and take
    // down this entire endpoint's live data along with it.
    const deletedRestaurants = deletedRestaurantRows.map((r) => {
      try {
        return { ...r, name: decryptFromStorage(r.name) };
      } catch (err) {
        logger.error(`GET /api/dev/db - failed to decrypt name for deleted restaurant id=${r.id}`, err);
        return { ...r, name: "[undecryptable]" };
      }
    });

    logger.info("GET /api/dev/db - data fetched");

    return NextResponse.json({
      restaurants: restaurantRows,
      orders,
      deletedRestaurants,
      deletedOrders,
    });
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
