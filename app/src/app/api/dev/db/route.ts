import { NextResponse } from "next/server";
import { query, initDb } from "@/lib/db";
import { logger } from "@/lib/logger";
import { requireAdmin } from "@/lib/auth";
import { parseJsonBody, escapeLikePattern } from "@/lib/validate";

type RestaurantRow = { id: number; name: string; password: string; raw_password: string | null; deleted_at: string | null };

export async function GET(request: Request) {
  logger.info("GET /api/dev/db - request received");

  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  try {
    await initDb();

    // Default (no search/filter): capped at the most recent 500 rows each --
    // these are unbounded-growth tables (orders/deleted orders are never
    // purged automatically) with no pagination UI on the admin/db page, so an
    // old dev install with years of history would otherwise ship its entire
    // order history as one JSON response on every single page load/refresh.
    //
    // BUT that same cap silently broke the order search box: an order older
    // than the current top-500 (by id) is invisible to search/restaurant-
    // filter no matter what you type, even though it's completely live --
    // confirmed live when a kitchen's only order aged out of the window
    // after ~1300 newer test orders landed, and neither the search box nor
    // the restaurant filter could find it anymore. So when the caller
    // actually supplies orderSearch/restaurantNames, run a real targeted
    // Postgres query instead of relying on the capped default payload --
    // still capped at 500 MATCHING rows (a search this broad returning
    // thousands of rows isn't useful either), but no longer blind to
    // anything outside the unfiltered "most recent" window.
    const { searchParams } = new URL(request.url);
    const orderSearch = searchParams.get("orderSearch")?.trim() || null;
    const restaurantNamesParam = searchParams.get("restaurantNames")?.trim() || null;
    const restaurantNames = restaurantNamesParam ? restaurantNamesParam.split(",").filter(Boolean) : [];

    logger.info("GET /api/dev/db - fetching all data...");
    const restaurantRows = (await query<RestaurantRow>("SELECT * FROM restaurants WHERE deleted_at IS NULL")).rows;

    const hasSearchOrFilter = orderSearch !== null || restaurantNames.length > 0;

    let orders;
    let deletedOrders;
    if (hasSearchOrFilter) {
      const conditions: string[] = [];
      const params: unknown[] = [];
      if (orderSearch) {
        params.push(`%${escapeLikePattern(orderSearch)}%`);
        conditions.push(`order_number ILIKE $${params.length}`);
      }
      if (restaurantNames.length > 0) {
        params.push(restaurantNames);
        conditions.push(`restaurant_name = ANY($${params.length})`);
      }
      const whereClause = conditions.join(" AND ");

      orders = (
        await query(
          `SELECT * FROM orders WHERE deleted_at IS NULL AND ${whereClause} ORDER BY id DESC LIMIT 500`,
          params,
        )
      ).rows;
      deletedOrders = (
        await query(
          `SELECT * FROM orders WHERE deleted_at IS NOT NULL AND ${whereClause} ORDER BY deleted_at DESC LIMIT 500`,
          params,
        )
      ).rows;
    } else {
      orders = (await query("SELECT * FROM orders WHERE deleted_at IS NULL ORDER BY id DESC LIMIT 500")).rows;
      deletedOrders = (
        await query("SELECT * FROM orders WHERE deleted_at IS NOT NULL ORDER BY deleted_at DESC LIMIT 500")
      ).rows;
    }

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
