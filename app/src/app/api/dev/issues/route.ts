import { NextResponse } from "next/server";
import { query, initDb } from "@/lib/db";
import { logger } from "@/lib/logger";
import { requireAdmin } from "@/lib/auth";
import { errJson } from "@/lib/error-response";

/**
 * Read-only admin view over reported_issues -- the bug/feedback reports
 * submitted from /help/errors's "Report an Issue" button (see
 * api/issues/route.ts POST). Admin-only, same gate as every other
 * /api/dev/* route; NOT in server.js's PUBLIC_ALLOWED_PREFIXES, so it 404s
 * for non-localhost hosts exactly like /api/dev/audit does.
 */
type ReportedIssueRow = {
  id: number;
  description: string;
  restaurant_name: string | null;
  context: string | null;
  contact: string | null;
  status: string;
  created_at: string;
};

export async function GET() {
  logger.info("GET /api/dev/issues - request received");

  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  try {
    await initDb();

    // Capped at 500 rows, same reasoning as /api/dev/audit -- this table
    // only ever grows, so an old install with a lot of history shouldn't
    // ship years of reports as one response on every page load.
    const issues = (
      await query<ReportedIssueRow>(
        `SELECT id, description, restaurant_name, context, contact, status, created_at
         FROM reported_issues
         ORDER BY created_at DESC, id DESC
         LIMIT 500`,
      )
    ).rows;

    return NextResponse.json({ issues });
  } catch (err) {
    logger.error("GET /api/dev/issues - error processing request", err);
    return errJson("INTERNAL_ERROR", 500);
  }
}
