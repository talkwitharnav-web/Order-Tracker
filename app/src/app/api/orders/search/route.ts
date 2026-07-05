import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { logger } from "@/lib/logger";
import { escapeLikePattern } from "@/lib/validate";

export async function GET(req: Request) {
  logger.info("GET /api/orders/search - request received");
  try {
    const { searchParams } = new URL(req.url);
    const restaurantName = searchParams.get("restaurant_name");
    const orderNumber = searchParams.get("order_number");

    if (!restaurantName || !orderNumber) {
      return NextResponse.json(
        { error: "Restaurant name and order number are required" },
        { status: 400 },
      );
    }

    const result = await query(
      "SELECT * FROM orders WHERE restaurant_name ILIKE $1 AND order_number ILIKE $2 ORDER BY created_at DESC LIMIT 1",
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
