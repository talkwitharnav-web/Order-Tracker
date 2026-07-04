import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { verifySessionToken, SESSION_COOKIE_NAME } from "@/lib/session";

export async function GET() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  const payload = verifySessionToken(token);

  if (!payload) {
    return NextResponse.json({ authenticated: false });
  }

  if (payload.type === "restaurant") {
    return NextResponse.json({ authenticated: true, type: "restaurant", name: payload.name });
  }
  return NextResponse.json({ authenticated: true, type: "admin" });
}
