import { NextResponse } from "next/server";
import { query, initDb } from "@/lib/db";
import { logger } from "@/lib/logger";
import { errJson } from "@/lib/error-response";

export async function GET() {
  try {
    await initDb();
    const result = await query<{ count: string }>("SELECT COUNT(*) FROM restaurants WHERE deleted_at IS NULL");
    const count = Number(result.rows[0].count);
    return NextResponse.json({ count });
  } catch (err) {
    logger.error("GET /api/restaurants - error processing request", err);
    return errJson("INTERNAL_ERROR", 500);
  }
}
