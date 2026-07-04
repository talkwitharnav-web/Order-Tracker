import { NextResponse } from "next/server";
import { query, initDb } from "@/lib/db";
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

    // Check if restaurant already exists (case-insensitive, matches how
    // order lookups treat restaurant_name — see SYSTEM_MEMORY.md)
    const existing = await query(
      "SELECT * FROM restaurants WHERE name ILIKE $1",
      [name],
    );
    if (existing.rows[0]) {
      return NextResponse.json(
        { error: "Restaurant with this name already exists" },
        { status: 409 },
      );
    }

    const hashedPassword = await bcrypt.hash(password, SALT_ROUNDS);

    try {
      await query(
        "INSERT INTO restaurants (name, password, raw_password) VALUES ($1, $2, $3)",
        [name, hashedPassword, password],
      );
    } catch (insertErr) {
      if (
        insertErr instanceof Error &&
        "code" in insertErr &&
        (insertErr as { code?: string }).code === "23505"
      ) {
        return NextResponse.json(
          { error: "Restaurant with this name already exists" },
          { status: 409 },
        );
      }
      throw insertErr;
    }

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
