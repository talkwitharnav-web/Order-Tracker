import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { logger } from "@/lib/logger";
import { escapeLikePattern, requireString } from "@/lib/validate";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";

export async function GET(req: Request) {
  logger.info("GET /api/orders/search - request received");

  // Anonymous, public endpoint (same trust level as the customer tracker
  // itself) -- rate-limited like /api/restaurants/suggest so it can't be
  // used to enumerate order numbers/restaurant names at unlimited speed.
  if (!checkRateLimit(`orders-search:${getClientIp(req)}`, { windowMs: 60_000, maxAttempts: 120 })) {
    return NextResponse.json({ error: "Too many requests. Slow down a moment." }, { status: 429 });
  }

  try {
    const { searchParams } = new URL(req.url);
    const restaurantName = requireString(searchParams.get("restaurant_name"));
    const orderNumber = requireString(searchParams.get("order_number"));

    if (!restaurantName || !orderNumber) {
      return NextResponse.json(
        { error: "Restaurant name and order number are required" },
        { status: 400 },
      );
    }

    // Narrow column list -- anonymous public lookup, only ship what the
    // customer tracker actually renders (see the identical note in
    // /api/orders GET).
    const result = await query(
      "SELECT id, order_number, restaurant_name, status, updated_at, acknowledged_at FROM orders WHERE restaurant_name ILIKE $1 AND order_number ILIKE $2 AND deleted_at IS NULL ORDER BY created_at DESC LIMIT 1",
      [escapeLikePattern(restaurantName), escapeLikePattern(orderNumber)],
    );
    const order = result.rows[0];

    if (!order) {
      return NextResponse.json({ error: "Order not found" }, { status: 404 });
    }

    return NextResponse.json(order);
  } catch (err) {
    logger.error("GET /api/orders/search - error processing request", err);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 },
    );
  }
}
