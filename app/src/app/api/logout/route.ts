import { NextResponse } from "next/server";
import { ADMIN_SESSION_COOKIE_NAME, RESTAURANT_SESSION_COOKIE_NAME } from "@/lib/session";

export async function POST(req: Request) {
  const { type } = await req.json().catch(() => ({ type: undefined }));
  const response = NextResponse.json({ message: "Logged out" });

  if (type === "admin") {
    response.cookies.set(ADMIN_SESSION_COOKIE_NAME, "", { maxAge: 0, path: "/" });
  } else if (type === "restaurant") {
    response.cookies.set(RESTAURANT_SESSION_COOKIE_NAME, "", { maxAge: 0, path: "/" });
  } else {
    response.cookies.set(ADMIN_SESSION_COOKIE_NAME, "", { maxAge: 0, path: "/" });
    response.cookies.set(RESTAURANT_SESSION_COOKIE_NAME, "", { maxAge: 0, path: "/" });
  }
  return response;
}
