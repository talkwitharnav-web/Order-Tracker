import { NextResponse } from "next/server";
import { query, initDb } from "@/lib/db";
import { logger } from "@/lib/logger";

export async function GET() {
  try {
    await initDb();
    const result = await query<{ count: string }>("SELECT COUNT(*) FROM restaurants WHERE deleted_at IS NULL");
    const count = Number(result.rows[0].count);
    return NextResponse.json({ count });
  } catch (err) {
    logger.error("GET /api/restaurants - error processing request", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
