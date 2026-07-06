import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import {
  verifySessionToken,
  ADMIN_SESSION_COOKIE_NAME,
  RESTAURANT_SESSION_COOKIE_NAME,
} from "@/lib/session";

export async function GET() {
  const cookieStore = await cookies();

  const adminPayload = verifySessionToken(cookieStore.get(ADMIN_SESSION_COOKIE_NAME)?.value);
  const isAdmin = adminPayload?.type === "admin";

  const restaurantPayload = verifySessionToken(cookieStore.get(RESTAURANT_SESSION_COOKIE_NAME)?.value);
  const restaurantName = restaurantPayload?.type === "restaurant" ? restaurantPayload.name : undefined;

  // Admin and restaurant sessions are independent cookies and can both be
  // valid at once (e.g. an admin who is also logged into a kitchen in the
  // same browser) -- report both rather than only the admin session, which
  // used to make a valid, remembered restaurant session invisible to
  // /restaurant's session check whenever an admin session also existed.
  // `type`/`authenticated` are kept for backward compatibility with callers
  // that only ever cared about the admin session (the gateway page, admin/db).
  return NextResponse.json({
    authenticated: isAdmin || !!restaurantName,
    type: isAdmin ? "admin" : restaurantName ? "restaurant" : undefined,
    name: restaurantName,
    admin: isAdmin,
    restaurant: restaurantName ? { name: restaurantName } : null,
  });
}
