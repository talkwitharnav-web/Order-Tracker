import { NextResponse } from "next/server";
import { query, initDb } from "@/lib/db";
import { logger } from "@/lib/logger";

export async function GET() {
  logger.info("GET /api/seed - request received");
  try {
    await initDb();

    logger.info("GET /api/seed - clearing orders table");
    await query("DELETE FROM orders");
    await query("ALTER SEQUENCE orders_id_seq RESTART WITH 1");

    logger.info("GET /api/seed - seeding database with sample orders");
    const orders = [
      {
        order_number: "101",
        restaurant_name: "Burger Joint",
        status: "Preparing",
      },
      {
        order_number: "202",
        restaurant_name: "Taco Stand",
        status: "Received",
      },
      {
        order_number: "303",
        restaurant_name: "Pizza Place",
        status: "Complete",
      },
    ];

    for (const order of orders) {
      await query(
        "INSERT INTO orders (order_number, restaurant_name, status) VALUES ($1, $2, $3)",
        [order.order_number, order.restaurant_name, order.status],
      );
    }

    logger.info("GET /api/seed - database seeded successfully");
    return NextResponse.json({ message: "Database seeded successfully" });
  } catch (err) {
    logger.error("GET /api/seed - error processing request", err);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 },
    );
  }
}
