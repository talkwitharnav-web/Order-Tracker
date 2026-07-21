import { NextResponse } from "next/server";
import { query, initDb } from "@/lib/db";
import { logger } from "@/lib/logger";
import { escapeLikePattern, requireString } from "@/lib/validate";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";
import { normalizeOrderLookupKey } from "@/lib/order-naming";
import { errJson } from "@/lib/error-response";

export async function GET(req: Request) {
  logger.info("GET /api/orders/search - request received");

  // Anonymous, public endpoint (same trust level as the customer tracker
  // itself) -- rate-limited like /api/restaurants/suggest so it can't be
  // used to enumerate order numbers/restaurant names at unlimited speed.
  if (!checkRateLimit(`orders-search:${getClientIp(req)}`, { windowMs: 60_000, maxAttempts: 120 })) {
    return errJson("RATE_LIMITED_GENERAL", 429);
  }

  try {
    await initDb();
    const { searchParams } = new URL(req.url);
    const restaurantName = requireString(searchParams.get("restaurant_name"));
    const orderNumber = requireString(searchParams.get("order_number"));
    const orderLookupKey = orderNumber ? normalizeOrderLookupKey(orderNumber) : "";

    if (!restaurantName || !orderNumber || !orderLookupKey) {
      return errJson("MISSING_SEARCH_FIELDS", 400);
    }

    // Narrow column list -- anonymous public lookup, only ship what the
    // customer tracker actually renders (see the identical note in
    // /api/orders GET).
    const result = await query(
      "SELECT id, order_number, restaurant_name, status, updated_at, acknowledged_at FROM orders WHERE restaurant_name ILIKE $1 AND order_lookup_key = $2 AND deleted_at IS NULL ORDER BY created_at DESC LIMIT 1",
      [escapeLikePattern(restaurantName), orderLookupKey],
    );
    const order = result.rows[0];

    if (!order) {
      return errJson("ORDER_NOT_FOUND", 404);
    }

    return NextResponse.json(order);
  } catch (err) {
    logger.error("GET /api/orders/search - error processing request", err);
    return errJson("INTERNAL_ERROR", 500);
  }
}
