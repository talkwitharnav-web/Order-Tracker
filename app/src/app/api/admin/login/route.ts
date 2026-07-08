import { NextResponse } from "next/server";
import { logger } from "@/lib/logger";
import {
  createSessionToken,
  ADMIN_SESSION_COOKIE_NAME,
  SESSION_COOKIE_MAX_AGE_REMEMBERED,
  SESSION_COOKIE_MAX_AGE_DEFAULT,
  SESSION_COOKIE_SECURE,
} from "@/lib/session";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";
import { parseJsonBody } from "@/lib/validate";

// Hardcoded admin credentials — same dev-only setup already used by the
// client-side gate this route replaces (see SYSTEM_MEMORY.md admin section).
const ADMIN_USERNAME = "darkglory";
const ADMIN_PASSWORD = "Re$t@ur@nt@dm!n";

// --- ROUTER/PUBLIC-EXPOSURE READINESS (not active, see CLAUDE.md "public
// exposure prep" entry) ---------------------------------------------------
// This file is the single highest-priority thing to change before ever
// exposing this app to an open router port. On a home LAN, "hardcoded admin
// password" is low-risk (only people on your WiFi can even reach it). On
// the open internet, it is a real, unthrottled-past-the-rate-limiter
// credential anyone can find by reading this public repo's source. Before
// going public, replace the two constants above with real secrets read from
// environment variables (never re-hardcode a new value in source, same
// mistake either way), e.g.:
//
// const ADMIN_USERNAME = process.env.ADMIN_USERNAME;
// const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
// if (!ADMIN_USERNAME || !ADMIN_PASSWORD) {
//   throw new Error("ADMIN_USERNAME/ADMIN_PASSWORD must be set before running with a public Host");
// }
//
// Also worth doing at the same time (not required to boot, but the second
// most important gap): a real IP-ban/lockout after N failed attempts, since
// checkRateLimit() below only slows brute-forcing, it doesn't stop it.
// ---------------------------------------------------------------------------

export async function POST(req: Request) {
  logger.info("POST /api/admin/login - request received");

  if (!checkRateLimit(`admin-login:${getClientIp(req)}`)) {
    return NextResponse.json({ error: "Too many login attempts. Try again in a minute." }, { status: 429 });
  }

  try {
    const body = await parseJsonBody(req);
    if (body === null) {
      return NextResponse.json({ error: "Malformed JSON body" }, { status: 400 });
    }
    const { username, password, rememberMe } =
      body as { username?: unknown; password?: unknown; rememberMe?: unknown };

    if (username !== ADMIN_USERNAME || password !== ADMIN_PASSWORD) {
      return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
    }

    const token = createSessionToken({ type: "admin" });
    const response = NextResponse.json({ message: "Login successful" });
    response.cookies.set(ADMIN_SESSION_COOKIE_NAME, token, {
      httpOnly: true,
      sameSite: "lax",
      secure: SESSION_COOKIE_SECURE,
      path: "/",
      maxAge: rememberMe ? SESSION_COOKIE_MAX_AGE_REMEMBERED : SESSION_COOKIE_MAX_AGE_DEFAULT,
    });
    return response;
  } catch (err) {
    logger.error("POST /api/admin/login - error processing request", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
