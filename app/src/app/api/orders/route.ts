import { NextResponse } from "next/server";
import { query, initDb } from "@/lib/db";
import { logger } from "@/lib/logger";
import { broadcast } from "@/lib/ws-hub";
import { requireRestaurantOrAdmin } from "@/lib/auth";
import { requireString, requireSafeName, escapeLikePattern, parseJsonBody } from "@/lib/validate";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";

export async function POST(request: Request) {
  logger.info("POST /api/orders - request received");
  try {
    await initDb();
    const body = await parseJsonBody(request);
    if (body === null) {
      return NextResponse.json({ error: "Malformed JSON body" }, { status: 400 });
    }
    const { restaurant_name: rawRestaurantName, order_number: rawOrderNumber } =
      body as { restaurant_name?: unknown; order_number?: unknown };

    // requireSafeName (not requireString) -- these values get stored and
    // rendered back out (kitchen dashboard, customer tracker, admin/db), so
    // they're restricted to a display-safe character set rather than just
    // "any non-empty string" (see SECURITY_ATTACK_LOG.md's stored-XSS
    // finding: React's JSX auto-escaping already prevents script execution
    // in this app's own UI, but a stored `<img onerror=...>`-style payload
    // would still execute in any non-React consumer of this data).
    const restaurant_name = requireSafeName(rawRestaurantName);
    const order_number = requireSafeName(rawOrderNumber);

    if (!restaurant_name || !order_number) {
      logger.warn("POST /api/orders - validation error", {
        restaurant_name: rawRestaurantName,
        order_number: rawOrderNumber,
      });
      return NextResponse.json(
        { error: "restaurant_name and order_number are required (letters, numbers, spaces, and basic punctuation only, max 200 chars)" },
        { status: 400 },
      );
    }

    const auth = await requireRestaurantOrAdmin(restaurant_name);
    if (!auth.ok) return auth.response;

    // Keyed per-restaurant (not per-IP) -- a legitimately busy kitchen
    // behind one NAT'd connection shouldn't get throttled like an
    // attacker, but no real kitchen creates orders faster than this
    // sustained (30/min = one every 2s). Admin isn't exempt: if an admin
    // is scripting order creation that fast, it's not a real order either.
    if (!checkRateLimit(`orders-create:${restaurant_name.toLowerCase()}`, { windowMs: 60_000, maxAttempts: 30 })) {
      logger.warn("POST /api/orders - rate limited", { restaurant_name });
      return NextResponse.json(
        { error: "Too many orders created too quickly. Slow down a moment." },
        { status: 429 },
      );
    }

    let id: number;
    try {
      const result = await query(
        "INSERT INTO orders (restaurant_name, order_number) VALUES ($1, $2) RETURNING id",
        [restaurant_name, order_number],
      );
      id = result.rows[0].id;
    } catch (insertErr) {
      if (
        insertErr instanceof Error &&
        "code" in insertErr &&
        (insertErr as { code?: string }).code === "23505"
      ) {
        logger.warn("POST /api/orders - duplicate order rejected", {
          restaurant_name,
          order_number,
        });
        return NextResponse.json(
          { error: `An order named "${order_number}" already exists for this restaurant` },
          { status: 409 },
        );
      }
      throw insertErr;
    }

    logger.info("POST /api/orders - order created successfully", {
      orderId: id,
    });

    const order = {
      id,
      restaurant_name,
      order_number,
      status: "Received",
    };

    broadcast({ type: "order_updated", payload: order });

    return NextResponse.json(order);
  } catch (err) {
    logger.error("POST /api/orders - error processing request", err);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 },
    );
  }
}

export async function GET(request: Request) {
  logger.info("GET /api/orders - request received");

  // Anonymous, public lookup (duplicate of /api/orders/search) -- same
  // rate limit as that route and /api/restaurants/suggest, since this is
  // an equally valid way to enumerate order/restaurant names otherwise.
  if (!checkRateLimit(`orders-search:${getClientIp(request)}`, { windowMs: 60_000, maxAttempts: 120 })) {
    return NextResponse.json({ error: "Too many requests. Slow down a moment." }, { status: 429 });
  }

  try {
    await initDb();
    const { searchParams } = new URL(request.url);
    const restaurant_name = requireString(searchParams.get("restaurant_name"));
    const order_number = requireString(searchParams.get("order_number"));

    logger.info("GET /api/orders - tracking order", {
      restaurant_name,
      order_number,
    });

    if (!restaurant_name || !order_number) {
      logger.warn("GET /api/orders - validation error", {
        restaurant_name,
        order_number,
      });
      return NextResponse.json(
        { error: "restaurant_name and order_number are required" },
        { status: 400 },
      );
    }

    // Narrow column list -- this is the anonymous public customer-tracker
    // lookup, so it should only ever ship the columns that page actually
    // renders (id/order_number/restaurant_name/status/updated_at/
    // acknowledged_at), not every column that exists today or gets added
    // later (e.g. internal timing columns have no reason to reach an
    // anonymous caller).
    const result = await query(
      "SELECT id, order_number, restaurant_name, status, updated_at, acknowledged_at FROM orders WHERE restaurant_name ILIKE $1 AND order_number ILIKE $2 AND deleted_at IS NULL ORDER BY created_at DESC LIMIT 1",
      [escapeLikePattern(restaurant_name), escapeLikePattern(order_number)],
    );
    const order = result.rows[0];

    if (!order) {
      logger.warn("GET /api/orders - order not found", {
        restaurant_name,
        order_number,
      });
      return NextResponse.json({ error: "Order not found" }, { status: 404 });
    }

    logger.info("GET /api/orders - order found", { order });
    return NextResponse.json(order);
  } catch (err) {
    logger.error("GET /api/orders - error processing request", err);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 },
    );
  }
}
