import { NextResponse } from "next/server";
import { getDb, initDb } from "@/lib/db";
import { logger } from "@/lib/logger";
import bcrypt from "bcrypt";

const SALT_ROUNDS = 10;

export async function POST(req: Request) {
  logger.info("POST /api/restaurants/register - request received");
  try {
    await initDb();
    const { name, password } = await req.json();

    if (!name || !password) {
      return NextResponse.json(
        { error: "Restaurant name and password are required" },
        { status: 400 },
      );
    }

    const db = await getDb();

    // Check if restaurant already exists
    const existingRestaurant = await db.get(
      "SELECT * FROM restaurants WHERE name = ?",
      name,
    );
    if (existingRestaurant) {
      return NextResponse.json(
        { error: "Restaurant with this name already exists" },
        { status: 409 },
      );
    }

    const hashedPassword = await bcrypt.hash(password, SALT_ROUNDS);

    const stmt = await db.prepare(
      "INSERT INTO restaurants (name, password) VALUES (?, ?)",
    );
    await stmt.run(name, hashedPassword);
    await stmt.finalize();

    logger.info(
      `POST /api/restaurants/register - restaurant "${name}" created successfully`,
    );
    return NextResponse.json(
      { message: "Restaurant registered successfully" },
      { status: 201 },
    );
  } catch (err) {
    logger.error(
      "POST /api/restaurants/register - error processing request",
      err,
    );
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 },
    );
  }
}
