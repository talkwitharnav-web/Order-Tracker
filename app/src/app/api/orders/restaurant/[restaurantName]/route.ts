import { NextResponse } from "next/server";
import { query, initDb } from "@/lib/db";
import { logger } from "@/lib/logger";
import { requireRestaurantOrAdmin } from "@/lib/auth";
import { escapeLikePattern } from "@/lib/validate";

// This route had no LIMIT at all -- fine for a normal kitchen's realistic
// active-order count (dozens, not thousands), since it only ever returns
// not-yet-Complete orders plus Complete orders from the last 5 minutes, not
// admin/db's full cross-restaurant history. But an abandoned/pathological
// kitchen that never advances orders (or a stress-test account) could still
// grow this response unboundedly over time, and this endpoint is polled
// every 5 seconds by the kitchen dashboard -- unlike admin/db, there's no
// scroll-triggered pagination here (the dashboard is meant to be a live,
// glanceable, all-on-screen board, not a scrollable archive), so the fix is
// a generous safety cap server-side rather than client-side windowing.
// Newest-first by id keeps the most recently created work in view if a
// kitchen ever somehow exceeds this, rather than silently showing only its
// oldest, longest-stale orders.
const MAX_ACTIVE_ORDERS = 1000;

export async function GET(request: Request, { params }: { params: Promise<{ restaurantName: string }> }) {
  const { restaurantName } = await params;
  const { searchParams } = new URL(request.url);
  const status = searchParams.get("status");

  logger.info(
    `GET /api/orders/restaurant/${restaurantName}?status=${status || ""} - request received`,
  );

  const auth = await requireRestaurantOrAdmin(restaurantName);
  if (!auth.ok) return auth.response;

  try {
    await initDb();

    logger.info(
      `GET /api/orders/restaurant/${restaurantName} - fetching orders`,
    );

    let sql = `SELECT * FROM orders WHERE restaurant_name ILIKE $1 AND deleted_at IS NULL`;
    const queryParams: any[] = [escapeLikePattern(restaurantName)];

    // Stored status values are always the Kitchen/API vocabulary
    // (Received|Preparing|Complete, case-insensitive on write per
    // orders/[id]/route.ts) -- see SYSTEM_MEMORY.md's status-vocab-mismatch
    // quirk. This previously checked against the Customer vocabulary
    // (Received|Making|Finished), which never matches a real stored value,
    // so an explicit ?status= filter always fell through to the "ignore
    // filter" branch, and that branch's own 'Finished' cutoff check was
    // always true (no row is ever literally 'Finished'), so completed
    // orders never actually aged out of the default view.
    if (status && ["Received", "Preparing", "Complete"].includes(status)) {
      sql += ` AND status ILIKE $2`;
      queryParams.push(status);
    } else {
      const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
      sql += ` AND (status NOT ILIKE 'Complete' OR updated_at > $2)`;
      queryParams.push(fiveMinutesAgo);
    }

    queryParams.push(MAX_ACTIVE_ORDERS);
    sql += ` ORDER BY id DESC LIMIT $${queryParams.length}`;

    const result = await query(sql, queryParams);
    const orders = result.rows;

    logger.info(
      `GET /api/orders/restaurant/${restaurantName} - found ${orders.length} orders`,
    );
    return NextResponse.json(orders);
  } catch (err) {
    logger.error(
      `GET /api/orders/restaurant/${restaurantName} - error processing request`,
      err,
    );
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 },
    );
  }
}
