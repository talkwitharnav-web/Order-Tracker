import { NextResponse } from "next/server";
import { query, initDb } from "@/lib/db";
import { logger } from "@/lib/logger";
import bcrypt from "bcrypt";
import {
  createSessionToken,
  RESTAURANT_SESSION_COOKIE_NAME,
  SESSION_COOKIE_MAX_AGE_DEFAULT,
} from "@/lib/session";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";
import { requireString, escapeLikePattern } from "@/lib/validate";

const SALT_ROUNDS = 10;

export async function POST(req: Request) {
  logger.info("POST /api/restaurants/register - request received");

  // Registration was previously unauthenticated AND unthrottled, unlike the
  // login routes — an attacker could flood it to bloat the restaurants table
  // and force a full bcrypt hash (cost 10) server-side per request with zero
  // credentials (see SECURITY_ATTACK_LOG.md F8). Same limiter/key shape as
  // the login routes.
  if (!checkRateLimit(`register:${getClientIp(req)}`)) {
    return NextResponse.json({ error: "Too many registration attempts. Try again in a minute." }, { status: 429 });
  }

  try {
    await initDb();
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "Malformed JSON body" }, { status: 400 });
    }
    const { name: rawName, password: rawPassword } =
      body as { name?: unknown; password?: unknown };

    const name = requireString(rawName);
    const password = typeof rawPassword === "string" && rawPassword.length > 0 && rawPassword.length <= 200
      ? rawPassword
      : null;

    if (!name || !password) {
      return NextResponse.json(
        { error: "Restaurant name and password are required (non-empty strings, max 200 chars)" },
        { status: 400 },
      );
    }

    // Check if restaurant already exists (case-insensitive, matches how
    // order lookups treat restaurant_name — see SYSTEM_MEMORY.md)
    const existing = await query(
      "SELECT * FROM restaurants WHERE name ILIKE $1 AND deleted_at IS NULL",
      [escapeLikePattern(name)],
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

    // Registering logs the kitchen straight in — no reason to make a
    // first-time signup immediately re-enter the same credentials they just typed.
    const token = createSessionToken({ type: "restaurant", name });
    const response = NextResponse.json(
      { message: "Restaurant registered successfully" },
      { status: 201 },
    );
    response.cookies.set(RESTAURANT_SESSION_COOKIE_NAME, token, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: SESSION_COOKIE_MAX_AGE_DEFAULT,
    });
    return response;
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
