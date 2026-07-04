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
  if (adminPayload?.type === "admin") {
    return NextResponse.json({ authenticated: true, type: "admin" });
  }

  const restaurantPayload = verifySessionToken(cookieStore.get(RESTAURANT_SESSION_COOKIE_NAME)?.value);
  if (restaurantPayload?.type === "restaurant") {
    return NextResponse.json({ authenticated: true, type: "restaurant", name: restaurantPayload.name });
  }

  return NextResponse.json({ authenticated: false });
}
