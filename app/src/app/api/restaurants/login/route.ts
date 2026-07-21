import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { logger } from "@/lib/logger";
import bcrypt from "bcrypt";
import {
  createSessionToken,
  RESTAURANT_SESSION_COOKIE_NAME,
  SESSION_COOKIE_MAX_AGE_REMEMBERED,
  SESSION_COOKIE_MAX_AGE_DEFAULT,
  SESSION_COOKIE_SECURE,
} from "@/lib/session";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";
import { requireString, escapeLikePattern, parseJsonBody } from "@/lib/validate";
import { errJson, plainJson } from "@/lib/error-response";

// Fixed dummy hash so a not-found lookup still pays bcrypt's cost (see
// SECURITY_ATTACK_LOG.md F4 — without this, "restaurant not found" returned
// in ~10ms vs. ~80ms for "found, wrong password", letting an attacker
// enumerate real restaurant names purely from response timing). The hash
// itself is not a secret and never matches any real password.
const DUMMY_PASSWORD_HASH =
  "$2b$10$CwTycUXWue0Thq9StjUM0uJ8V8IvJs2jGiFH3rF0KwYNwHUsgnh8G";

export async function POST(req: Request) {
  logger.info("POST /api/restaurants/login - request received");

  if (!checkRateLimit(`restaurant-login:${getClientIp(req)}`)) {
    return errJson("RATE_LIMITED_LOGIN", 429);
  }

  try {
    const body = await parseJsonBody(req);
    if (body === null) {
      return plainJson("Malformed JSON body", 400);
    }
    const { name: rawName, password: rawPassword, rememberMe } =
      body as { name?: unknown; password?: unknown; rememberMe?: unknown };

    const name = requireString(rawName);
    const password = typeof rawPassword === "string" ? rawPassword : null;

    if (!name || !password) {
      return plainJson("Restaurant name and password are required", 400);
    }

    const result = await query(
      "SELECT * FROM restaurants WHERE name ILIKE $1 AND deleted_at IS NULL",
      [escapeLikePattern(name)],
    );
    const restaurant = result.rows[0];

    // Always run a bcrypt.compare, even when the restaurant doesn't exist,
    // so "not found" and "wrong password" take approximately the same time.
    const isPasswordValid = await bcrypt.compare(
      password,
      restaurant?.password ?? DUMMY_PASSWORD_HASH,
    );

    if (!restaurant || !isPasswordValid) {
      return errJson("INVALID_CREDENTIALS", 401);
    }

    logger.info(
      `POST /api/restaurants/login - restaurant "${name}" logged in successfully`,
    );

    const token = createSessionToken({ type: "restaurant", name: restaurant.name });
    const response = NextResponse.json({ message: "Login successful" });
    response.cookies.set(RESTAURANT_SESSION_COOKIE_NAME, token, {
      httpOnly: true,
      sameSite: "lax",
      secure: SESSION_COOKIE_SECURE,
      path: "/",
      maxAge: rememberMe ? SESSION_COOKIE_MAX_AGE_REMEMBERED : SESSION_COOKIE_MAX_AGE_DEFAULT,
    });
    return response;
  } catch (err) {
    logger.error("POST /api/restaurants/login - error processing request", err);
    return errJson("INTERNAL_ERROR", 500);
  }
}
