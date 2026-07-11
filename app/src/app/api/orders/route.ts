import { NextResponse } from "next/server";
import { query, getPool, initDb } from "@/lib/db";
import { logger } from "@/lib/logger";
import { broadcast } from "@/lib/ws-hub";
import { requireRestaurantOrAdmin, isAdminRequest } from "@/lib/auth";
import { requireString, requireSafeName, escapeLikePattern, parseJsonBody } from "@/lib/validate";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";
import { normalizeOrderLookupKey } from "@/lib/order-naming";
import { resolveOrderActionEmployee } from "@/lib/employee-auth";

export async function POST(request: Request) {
  logger.info("POST /api/orders - request received");
  try {
    await initDb();
    const body = await parseJsonBody(request);
    if (body === null) {
      return NextResponse.json({ error: "Malformed JSON body" }, { status: 400 });
    }
    const { restaurant_name: rawRestaurantName, order_number: rawOrderNumber, employeeId, pin, pinLength } =
      body as { restaurant_name?: unknown; order_number?: unknown; employeeId?: unknown; pin?: unknown; pinLength?: unknown };

    // requireSafeName (not requireString) -- these values get stored and
    // rendered back out (kitchen dashboard, customer tracker, admin/db), so
    // they're restricted to a display-safe character set rather than just
    // "any non-empty string" (see SECURITY_ATTACK_LOG.md's stored-XSS
    // finding: React's JSX auto-escaping already prevents script execution
    // in this app's own UI, but a stored `<img onerror=...>`-style payload
    // would still execute in any non-React consumer of this data).
    const restaurant_name = requireSafeName(rawRestaurantName);
    const order_number = requireSafeName(rawOrderNumber);
    const order_lookup_key = order_number ? normalizeOrderLookupKey(order_number) : "";

    if (!restaurant_name || !order_number || !order_lookup_key) {
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

    // Admin creating an order directly (e.g. via dev/seed-adjacent tooling)
    // bypasses PIN attribution the same way admin status overrides do -- a
    // distinct, already-logged path, not a staff floor action. But that only
    // holds when admin genuinely didn't send a pin/employeeId -- isAdmin here
    // just means an admin_session cookie EXISTS, and a browser can validly
    // hold both an admin_session and a restaurant_session at once (admin
    // console open in one tab, kitchen dashboard actively used in another).
    // Bypassing purely on isAdmin silently discarded a real employee's PIN
    // attribution whenever that coincidence occurred, even though the create
    // request came from the kitchen UI with a real verified PIN.
    const isAdmin = await isAdminRequest();
    const isGenuineAdminOverride = isAdmin && employeeId === undefined && pin === undefined;
    const employeeCheck = await resolveOrderActionEmployee(
      restaurant_name,
      isGenuineAdminOverride,
      employeeId,
      pin,
      pinLength,
    );
    if (!employeeCheck.ok) return employeeCheck.response;
    const verifiedEmployee = employeeCheck.employee;

    let order: {
      id: number;
      restaurant_name: string;
      order_number: string;
      status: "Received";
      received_at: string;
      preparing_at: string | null;
      complete_at: string | null;
      acknowledged_at: string | null;
    };
    // Transactional so the audit event can never exist without the order
    // actually landing (or vice versa) -- same reasoning as the status-change
    // route's transaction.
    const client = await getPool().connect();
    try {
      await client.query("BEGIN");
      const result = await client.query(
        `INSERT INTO orders (restaurant_name, order_number)
         VALUES ($1, $2)
         RETURNING id, restaurant_name, order_number, status, received_at, preparing_at, complete_at, acknowledged_at`,
        [restaurant_name, order_number],
      );
      order = result.rows[0] as typeof order;

      await client.query(
        `INSERT INTO order_status_events (order_id, restaurant_name, order_number, from_status, to_status, employee_id, employee_name)
         VALUES ($1, $2, $3, NULL, $4, $5, $6)`,
        [order.id, order.restaurant_name, order.order_number, order.status, verifiedEmployee?.id ?? null, verifiedEmployee?.name ?? null],
      );

      await client.query("COMMIT");
    } catch (insertErr) {
      await client.query("ROLLBACK");
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
    } finally {
      client.release();
    }

    logger.info("POST /api/orders - order created successfully", {
      orderId: order.id,
      employee: verifiedEmployee?.name ?? null,
    });

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
    const order_lookup_key = order_number ? normalizeOrderLookupKey(order_number) : "";

    logger.info("GET /api/orders - tracking order", {
      restaurant_name,
      order_number,
    });

    if (!restaurant_name || !order_number || !order_lookup_key) {
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
      "SELECT id, order_number, restaurant_name, status, updated_at, acknowledged_at FROM orders WHERE restaurant_name ILIKE $1 AND order_lookup_key = $2 AND deleted_at IS NULL ORDER BY created_at DESC LIMIT 1",
      [escapeLikePattern(restaurant_name), order_lookup_key],
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
