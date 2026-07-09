import { NextResponse } from "next/server";
import { query, initDb } from "@/lib/db";
import { logger } from "@/lib/logger";
import { requireAdmin } from "@/lib/auth";
import { parseJsonBody } from "@/lib/validate";

type RestaurantRow = { id: number; name: string; password: string; raw_password: string | null; deleted_at: string | null };

export async function GET() {
  logger.info("GET /api/dev/db - request received");

  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  try {
    await initDb();

    // Capped at the most recent 500 rows each -- these are unbounded-growth
    // tables (orders/deleted orders are never purged automatically) with no
    // pagination UI on the admin/db page, so an old dev install with years
    // of history would otherwise ship its entire order history as one JSON
    // response on every single page load/refresh. Restaurants aren't capped
    // since that table only grows with real registrations, not every order
    // ever placed -- realistically stays small.
    // Restaurants no longer have a soft-delete state -- admin DELETE is a
    // real, permanent delete (kitchens' own order-delete stays soft, see
    // the Deleted Orders query below), so there is no "deleted restaurants"
    // row set to query anymore.
    logger.info("GET /api/dev/db - fetching all data...");
    const restaurantRows = (await query<RestaurantRow>("SELECT * FROM restaurants WHERE deleted_at IS NULL")).rows;
    const orders = (await query("SELECT * FROM orders WHERE deleted_at IS NULL ORDER BY id DESC LIMIT 500")).rows;

    const deletedOrders = (
      await query("SELECT * FROM orders WHERE deleted_at IS NOT NULL ORDER BY deleted_at DESC LIMIT 500")
    ).rows;

    logger.info("GET /api/dev/db - data fetched");

    return NextResponse.json({
      restaurants: restaurantRows,
      orders,
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

export async function DELETE(request: Request) {
  logger.warn("DELETE /api/dev/db - request received to PURGE DATABASE");

  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  try {
    const body = await parseJsonBody(request);
    const confirmation = body && typeof body === "object"
      ? (body as { confirmation?: unknown }).confirmation
      : undefined;
    if (confirmation !== "PURGE DATABASE") {
      return NextResponse.json({ error: "Type PURGE DATABASE to confirm" }, { status: 400 });
    }

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
