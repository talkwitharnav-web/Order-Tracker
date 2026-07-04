import { NextResponse } from "next/server";
import { logger } from "@/lib/logger";
import {
  createSessionToken,
  ADMIN_SESSION_COOKIE_NAME,
  SESSION_COOKIE_MAX_AGE_REMEMBERED,
  SESSION_COOKIE_MAX_AGE_DEFAULT,
} from "@/lib/session";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";

// Hardcoded admin credentials — same dev-only setup already used by the
// client-side gate this route replaces (see SYSTEM_MEMORY.md admin section).
const ADMIN_USERNAME = "darkglory";
const ADMIN_PASSWORD = "Re$t@ur@nt@dm!n";

export async function POST(req: Request) {
  logger.info("POST /api/admin/login - request received");

  if (!checkRateLimit(`admin-login:${getClientIp(req)}`)) {
    return NextResponse.json({ error: "Too many login attempts. Try again in a minute." }, { status: 429 });
  }

  try {
    const { username, password, rememberMe } = await req.json();

    if (username !== ADMIN_USERNAME || password !== ADMIN_PASSWORD) {
      return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
    }

    const token = createSessionToken({ type: "admin" });
    const response = NextResponse.json({ message: "Login successful" });
    response.cookies.set(ADMIN_SESSION_COOKIE_NAME, token, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: rememberMe ? SESSION_COOKIE_MAX_AGE_REMEMBERED : SESSION_COOKIE_MAX_AGE_DEFAULT,
    });
    return response;
  } catch (err) {
    logger.error("POST /api/admin/login - error processing request", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
