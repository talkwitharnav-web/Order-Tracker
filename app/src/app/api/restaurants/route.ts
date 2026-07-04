import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { logger } from "@/lib/logger";

export async function GET() {
  try {
    const result = await query<{ count: string }>("SELECT COUNT(*) FROM restaurants");
    const count = Number(result.rows[0].count);
    return NextResponse.json({ count });
  } catch (err) {
    logger.error("GET /api/restaurants - error processing request", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
