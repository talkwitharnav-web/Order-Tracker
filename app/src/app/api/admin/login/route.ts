import { NextResponse } from "next/server";
import { logger } from "@/lib/logger";
import {
  createSessionToken,
  SESSION_COOKIE_NAME,
  SESSION_COOKIE_MAX_AGE_REMEMBERED,
} from "@/lib/session";

// Hardcoded admin credentials — same dev-only setup already used by the
// client-side gate this route replaces (see SYSTEM_MEMORY.md admin section).
const ADMIN_USERNAME = "darkglory";
const ADMIN_PASSWORD = "Re$t@ur@nt@dm!n";

export async function POST(req: Request) {
  logger.info("POST /api/admin/login - request received");
  try {
    const { username, password, rememberMe } = await req.json();

    if (username !== ADMIN_USERNAME || password !== ADMIN_PASSWORD) {
      return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
    }

    const token = createSessionToken({ type: "admin" });
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
    logger.error("POST /api/admin/login - error processing request", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
