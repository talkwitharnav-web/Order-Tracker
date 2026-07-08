import { NextResponse } from "next/server";
import { query, initDb } from "@/lib/db";
import { logger } from "@/lib/logger";
import bcrypt from "bcrypt";
import {
  createSessionToken,
  RESTAURANT_SESSION_COOKIE_NAME,
  SESSION_COOKIE_MAX_AGE_DEFAULT,
  SESSION_COOKIE_MAX_AGE_REMEMBERED,
  SESSION_COOKIE_SECURE,
} from "@/lib/session";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";
import { requireSafeName, escapeLikePattern, parseJsonBody } from "@/lib/validate";

const SALT_ROUNDS = 10;
const MIN_PASSWORD_LENGTH = 8;

export async function POST(req: Request) {
  logger.info("POST /api/restaurants/register - request received");

  // Registration was previously unauthenticated AND unthrottled, unlike the
  // login routes — an attacker could flood it to bloat the restaurants table
  // and force a full bcrypt hash (cost 10) server-side per request with zero
  // credentials (see SECURITY_ATTACK_LOG.md F8). Tighter than the login
  // routes' 10/min default -- a failed login attempt costs an attacker
  // nothing extra to repeat, but each registration permanently creates a
  // real row, so mass account creation (DB pollution, visible immediately
  // via the public suggest endpoint) is throttled harder than credential
  // guessing.
  if (!checkRateLimit(`register:${getClientIp(req)}`, { windowMs: 60_000, maxAttempts: 5 })) {
    return NextResponse.json({ error: "Too many registration attempts. Try again in a minute." }, { status: 429 });
  }

  try {
    await initDb();
    const body = await parseJsonBody(req);
    if (body === null) {
      return NextResponse.json({ error: "Malformed JSON body" }, { status: 400 });
    }
    const { name: rawName, password: rawPassword, rememberMe } =
      body as { name?: unknown; password?: unknown; rememberMe?: unknown };

    const name = requireSafeName(rawName);
    // Passwords legitimately need a wide character set (symbols, unicode,
    // etc.) so they don't go through requireSafeName/requireString's
    // stripping -- but a raw null byte still reaches Postgres unmodified via
    // the raw_password column (see lib/session.ts/SYSTEM_MEMORY.md on that
    // being intentional plaintext-storage debt) and Postgres text columns
    // cannot store \0 at all, which previously surfaced as an unhandled 500
    // instead of a clean 400 (see SECURITY_ATTACK_LOG.md's "Null Byte
    // Injection" finding).
    const password =
      typeof rawPassword === "string" &&
      rawPassword.length >= MIN_PASSWORD_LENGTH &&
      rawPassword.length <= 200 &&
      !rawPassword.includes("\0")
        ? rawPassword
        : null;

    if (!name) {
      return NextResponse.json(
        { error: "Restaurant name is required (letters, numbers, spaces, and basic punctuation only, max 200 chars)" },
        { status: 400 },
      );
    }
    if (!password) {
      return NextResponse.json(
        { error: `Password must be ${MIN_PASSWORD_LENGTH}-200 characters` },
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
      secure: SESSION_COOKIE_SECURE,
      path: "/",
      maxAge: rememberMe ? SESSION_COOKIE_MAX_AGE_REMEMBERED : SESSION_COOKIE_MAX_AGE_DEFAULT,
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
