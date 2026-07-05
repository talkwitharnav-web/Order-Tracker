import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import {
  verifySessionToken,
  ADMIN_SESSION_COOKIE_NAME,
  RESTAURANT_SESSION_COOKIE_NAME,
} from "./session";

/** Verified admin session, or a 401 response to return as-is from the route handler. */
export async function requireAdmin(): Promise<{ ok: true } | { ok: false; response: NextResponse }> {
  const cookieStore = await cookies();
  const payload = verifySessionToken(cookieStore.get(ADMIN_SESSION_COOKIE_NAME)?.value);
  if (payload?.type === "admin") return { ok: true };
  return { ok: false, response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
}

/** True if the current request carries a valid admin session — for routes that only need to branch behavior for admin, not hard-gate on it. */
export async function isAdminRequest(): Promise<boolean> {
  const cookieStore = await cookies();
  const payload = verifySessionToken(cookieStore.get(ADMIN_SESSION_COOKIE_NAME)?.value);
  return payload?.type === "admin";
}

/**
 * Verified session for ANY logged-in caller — admin or any kitchen. For
 * routes that expose no restaurant-specific data (so there's nothing to
 * scope access to) but still shouldn't be reachable by a fully anonymous
 * caller, e.g. the server health check.
 */
export async function requireAnyAuthenticated(): Promise<{ ok: true } | { ok: false; response: NextResponse }> {
  const cookieStore = await cookies();

  const adminPayload = verifySessionToken(cookieStore.get(ADMIN_SESSION_COOKIE_NAME)?.value);
  if (adminPayload?.type === "admin") return { ok: true };

  const restaurantPayload = verifySessionToken(cookieStore.get(RESTAURANT_SESSION_COOKIE_NAME)?.value);
  if (restaurantPayload?.type === "restaurant") return { ok: true };

  return { ok: false, response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
}

/**
 * Verified session for either an admin, or the restaurant named `restaurantName`
 * (case-insensitive, matching how the rest of the app treats restaurant names).
 * Lets a kitchen manage its own orders while still letting admin manage any.
 */
export async function requireRestaurantOrAdmin(
  restaurantName: string,
): Promise<{ ok: true } | { ok: false; response: NextResponse }> {
  const cookieStore = await cookies();

  const adminPayload = verifySessionToken(cookieStore.get(ADMIN_SESSION_COOKIE_NAME)?.value);
  if (adminPayload?.type === "admin") return { ok: true };

  const restaurantPayload = verifySessionToken(cookieStore.get(RESTAURANT_SESSION_COOKIE_NAME)?.value);
  if (
    restaurantPayload?.type === "restaurant" &&
    restaurantPayload.name.toLowerCase() === restaurantName.toLowerCase()
  ) {
    return { ok: true };
  }

  return { ok: false, response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
}
