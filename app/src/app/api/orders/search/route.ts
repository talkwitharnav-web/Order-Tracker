import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { logger } from "@/lib/logger";

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

    const db = await getDb();
    const order = await db.get(
      "SELECT * FROM orders WHERE restaurant_name = ? AND order_number = ?",
      [restaurantName, orderNumber],
    );

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
