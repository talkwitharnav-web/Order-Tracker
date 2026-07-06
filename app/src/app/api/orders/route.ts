import { NextResponse } from "next/server";
import { query, initDb } from "@/lib/db";
import { logger } from "@/lib/logger";
import { broadcast } from "@/lib/ws-hub";
import { requireRestaurantOrAdmin } from "@/lib/auth";
import { requireString, escapeLikePattern } from "@/lib/validate";

export async function POST(request: Request) {
  logger.info("POST /api/orders - request received");
  try {
    await initDb();
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Malformed JSON body" }, { status: 400 });
    }
    const { restaurant_name: rawRestaurantName, order_number: rawOrderNumber } =
      body as { restaurant_name?: unknown; order_number?: unknown };

    const restaurant_name = requireString(rawRestaurantName);
    const order_number = requireString(rawOrderNumber);

    if (!restaurant_name || !order_number) {
      logger.warn("POST /api/orders - validation error", {
        restaurant_name: rawRestaurantName,
        order_number: rawOrderNumber,
      });
      return NextResponse.json(
        { error: "restaurant_name and order_number are required (non-empty strings, max 200 chars)" },
        { status: 400 },
      );
    }

    const auth = await requireRestaurantOrAdmin(restaurant_name);
    if (!auth.ok) return auth.response;

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
  try {
    await initDb();
    const { searchParams } = new URL(request.url);
    const restaurant_name = searchParams.get("restaurant_name");
    const order_number = searchParams.get("order_number");

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

    const result = await query(
      "SELECT * FROM orders WHERE restaurant_name ILIKE $1 AND order_number ILIKE $2 AND deleted_at IS NULL ORDER BY created_at DESC LIMIT 1",
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
