import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { logger } from "@/lib/logger";
import { escapeLikePattern, requireString } from "@/lib/validate";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";

// Suggestion list is capped server-side regardless of what a caller asks
// for — this is a public, unauthenticated endpoint (restaurant names are
// not sensitive, same trust level as the existing public /api/restaurants
// count endpoint), so the cap exists purely to bound response size/DB work
// per request, not to hide data.
const MAX_RESULTS = 50;
const DEFAULT_RESULTS = 5;

/**
 * GET /api/restaurants/suggest?q=<partial name>&limit=<n>
 *
 * Ranked, case-insensitive restaurant-name autocomplete for the anonymous
 * customer tracker's search box. Ranking tiers (best match first):
 *   1. Exact match (case-insensitive)
 *   2. Prefix match ("golden" matches "Golden Spoon")
 *   3. Word-boundary match ("spoon" matches "The Golden Spoon" at a word start)
 *   4. Substring match anywhere else ("olden" matches "Golden Spoon")
 * Within a tier, shorter names rank first (a closer overall match to a
 * short query) and ties break alphabetically for stable ordering. This is
 * one query, not four round-trips — the CASE expression computes a rank
 * integer Postgres can sort by directly, using the same trusted
 * parameterized-ILIKE + escapeLikePattern() pattern as every other
 * order/restaurant lookup in this app (see SYSTEM_MEMORY.md's ILIKE
 * wildcard-escaping note) — never string-interpolated, so this carries the
 * same SQL-injection guarantees as the rest of the codebase.
 */
export async function GET(req: Request) {
  // Distinct, more generous limiter than the login/register routes' 10/min —
  // this endpoint is meant to be hit on every keystroke while typing, so a
  // 10/min cap would break normal use almost immediately. Still bounded, so
  // a scripted scraper can't hammer it into an unbounded read amplifier.
  if (!checkRateLimit(`restaurant-suggest:${getClientIp(req)}`, { windowMs: 60_000, maxAttempts: 120 })) {
    return NextResponse.json({ error: "Too many requests. Slow down a moment." }, { status: 429 });
  }

  const { searchParams } = new URL(req.url);
  const rawQuery = searchParams.get("q");
  const q = requireString(rawQuery, 100);

  if (!q) {
    return NextResponse.json({ suggestions: [] });
  }

  const rawLimit = Number(searchParams.get("limit"));
  const limit = Number.isInteger(rawLimit) && rawLimit > 0 ? Math.min(rawLimit, MAX_RESULTS) : DEFAULT_RESULTS;

  try {
    const escaped = escapeLikePattern(q);
    const result = await query<{ name: string }>(
      `
      SELECT name FROM restaurants
      WHERE name ILIKE $1 AND deleted_at IS NULL
      ORDER BY
        CASE
          WHEN name ILIKE $2 THEN 0
          WHEN name ILIKE $3 THEN 1
          WHEN name ILIKE $4 THEN 2
          ELSE 3
        END,
        LENGTH(name) ASC,
        name ASC
      LIMIT $5
      `,
      [
        `%${escaped}%`, // WHERE: anything containing the query
        escaped, // exact match tier — must use the escaped form too, or a literal "%"/"_" typed by the user would act as a wildcard here instead of matching literally
        `${escaped}%`, // prefix match tier
        `% ${escaped}%`, // word-boundary match tier (preceded by a space)
        limit,
      ],
    );

    return NextResponse.json({ suggestions: result.rows.map((r) => r.name) });
  } catch (err) {
    logger.error("GET /api/restaurants/suggest - error processing request", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
