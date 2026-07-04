import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { logger } from "@/lib/logger";
import bcrypt from "bcrypt";
import {
  createSessionToken,
  SESSION_COOKIE_NAME,
  SESSION_COOKIE_MAX_AGE_REMEMBERED,
} from "@/lib/session";

export async function POST(req: Request) {
  logger.info("POST /api/restaurants/login - request received");
  try {
    const { name, password, rememberMe } = await req.json();

    if (!name || !password) {
      return NextResponse.json(
        { error: "Restaurant name and password are required" },
        { status: 400 },
      );
    }

    const result = await query(
      "SELECT * FROM restaurants WHERE name ILIKE $1",
      [name],
    );
    const restaurant = result.rows[0];

    console.log("Database lookup result for restaurant:", restaurant);

    if (!restaurant) {
      return NextResponse.json(
        { error: "Invalid credentials" },
        { status: 401 },
      );
    }

    const isPasswordValid = await bcrypt.compare(password, restaurant.password);

    console.log("Password validation result:", isPasswordValid);

    if (!isPasswordValid) {
      return NextResponse.json(
        { error: "Invalid credentials" },
        { status: 401 },
      );
    }

    logger.info(
      `POST /api/restaurants/login - restaurant "${name}" logged in successfully`,
    );

    const token = createSessionToken({ type: "restaurant", name: restaurant.name });
    const response = NextResponse.json({ message: "Login successful" });
    response.cookies.set(SESSION_COOKIE_NAME, token, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      ...(rememberMe ? { maxAge: SESSION_COOKIE_MAX_AGE_REMEMBERED } : {}),
    });
    return response;
  } catch (err) {
    logger.error("POST /api/restaurants/login - error processing request", err);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 },
    );
  }
}
