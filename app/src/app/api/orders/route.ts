import { NextResponse } from "next/server";
import { query, initDb } from "@/lib/db";
import { logger } from "@/lib/logger";
import { broadcast } from "@/lib/ws-hub";

export async function POST(request: Request) {
  logger.info("POST /api/orders - request received");
  try {
    await initDb();
    const { restaurant_name, order_number } = await request.json();

    if (!restaurant_name || !order_number) {
      logger.warn("POST /api/orders - validation error", {
        restaurant_name,
        order_number,
      });
      return NextResponse.json(
        { error: "restaurant_name and order_number are required" },
        { status: 400 },
      );
    }

    const result = await query(
      "INSERT INTO orders (restaurant_name, order_number) VALUES ($1, $2) RETURNING id",
      [restaurant_name, order_number],
    );

    const id = result.rows[0].id;

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
      "SELECT * FROM orders WHERE restaurant_name = $1 AND order_number = $2",
      [restaurant_name, order_number],
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
