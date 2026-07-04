import { NextResponse } from "next/server";
import { query, initDb } from "@/lib/db";
import { logger } from "@/lib/logger";
import bcrypt from "bcrypt";

const SALT_ROUNDS = 10;

export async function POST() {
  logger.info("POST /api/dev/seed - request received");
  try {
    await initDb();

    logger.info("POST /api/dev/seed - clearing tables...");
    await query("DELETE FROM orders");
    await query("DELETE FROM restaurants");
    await query("ALTER SEQUENCE orders_id_seq RESTART WITH 1");
    await query("ALTER SEQUENCE restaurants_id_seq RESTART WITH 1");
    logger.info("POST /api/dev/seed - tables cleared");

    logger.info("POST /api/dev/seed - seeding database...");

    // Create a test restaurant
    const restaurantName = "The Golden Spoon";
    const password = "password123";
    const hashedPassword = await bcrypt.hash(password, SALT_ROUNDS);
    await query(
      "INSERT INTO restaurants (name, password, raw_password) VALUES ($1, $2, $3)",
      [restaurantName, hashedPassword, password],
    );
    logger.info(`POST /api/dev/seed - created restaurant: ${restaurantName}`);

    // Create sample orders
    const orders = [
      { num: "101", status: "Received" },
      { num: "102", status: "Received" },
      { num: "103", status: "Preparing" },
      { num: "104", status: "Preparing" },
      { num: "105", status: "Complete" },
    ];

    for (const order of orders) {
      await query(
        "INSERT INTO orders (order_number, restaurant_name, status) VALUES ($1, $2, $3)",
        [`ORD-${order.num}`, restaurantName, order.status],
      );
    }
    logger.info(`POST /api/dev/seed - created ${orders.length} sample orders`);

    logger.info("POST /api/dev/seed - database seeded successfully");
    return NextResponse.json({ message: "Database seeded successfully" });
  } catch (err) {
    logger.error("POST /api/dev/seed - error processing request", err);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 },
    );
  }
}
