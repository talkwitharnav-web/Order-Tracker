import { NextResponse } from "next/server";
import { getDb, initDb } from "@/lib/db";
import { logger } from "@/lib/logger";
import bcrypt from "bcrypt";

const SALT_ROUNDS = 10;

export async function POST() {
  logger.info("POST /api/dev/seed - request received");
  try {
    await initDb();
    const db = await getDb();

    logger.info("POST /api/dev/seed - clearing tables...");
    await db.exec("DELETE FROM orders");
    await db.exec("DELETE FROM restaurants");
    await db.exec("DELETE FROM sqlite_sequence WHERE name='orders'");
    await db.exec("DELETE FROM sqlite_sequence WHERE name='restaurants'");
    logger.info("POST /api/dev/seed - tables cleared");

    logger.info("POST /api/dev/seed - seeding database...");

    // Create a test restaurant
    const restaurantName = "The Golden Spoon";
    const password = "password123";
    const hashedPassword = await bcrypt.hash(password, SALT_ROUNDS);
    await db.run(
      "INSERT INTO restaurants (name, password) VALUES (?, ?)",
      restaurantName,
      hashedPassword,
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

    const stmt = await db.prepare(
      "INSERT INTO orders (order_number, restaurant_name, status) VALUES (?, ?, ?)",
    );

    for (const order of orders) {
      await stmt.run(`ORD-${order.num}`, restaurantName, order.status);
    }
    await stmt.finalize();
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
