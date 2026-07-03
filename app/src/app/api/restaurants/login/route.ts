import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { logger } from "@/lib/logger";
import bcrypt from "bcrypt";

export async function POST(req: Request) {
  logger.info("POST /api/restaurants/login - request received");
  try {
    const { name, password } = await req.json();

    if (!name || !password) {
      return NextResponse.json(
        { error: "Restaurant name and password are required" },
        { status: 400 },
      );
    }

    const db = await getDb();
    const restaurant = await db.get(
      "SELECT * FROM restaurants WHERE name = ?",
      name,
    );

    if (!restaurant) {
      return NextResponse.json(
        { error: "Invalid credentials" },
        { status: 401 },
      );
    }

    const isPasswordValid = await bcrypt.compare(password, restaurant.password);

    if (!isPasswordValid) {
      return NextResponse.json(
        { error: "Invalid credentials" },
        { status: 401 },
      );
    }

    logger.info(
      `POST /api/restaurants/login - restaurant "${name}" logged in successfully`,
    );
    // In a real application, you would return a token (e.g., JWT)
    return NextResponse.json({ message: "Login successful" });
  } catch (err) {
    logger.error("POST /api/restaurants/login - error processing request", err);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 },
    );
  }
}
