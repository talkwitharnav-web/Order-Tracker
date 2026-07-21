import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { logger } from "@/lib/logger";
import { escapeLikePattern, requireString, isSafeName } from "@/lib/validate";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";
import { errJson } from "@/lib/error-response";

// Suggestion list is capped server-side regardless of what a caller asks
// for, purely to bound response size/DB work per request.
const MAX_RESULTS = 50;
const DEFAULT_RESULTS = 5;

// A single-character query (or worse, iterating "a" through "z"/"0" through
// "9") turns this endpoint into a full-database-enumeration oracle in ~36
// requests, since almost every registered name contains at least one common
// letter (see SECURITY_ATTACK_LOG.md's "Unauthenticated Restaurant Name
// Enumeration" finding). Requiring a real minimum query length doesn't
// break the legitimate autocomplete use case (nobody meaningfully searches
// for a restaurant by one letter) but makes single-character-sweep
// enumeration require a combinatorially larger number of requests, which
// the tightened per-IP rate limit below then actually bounds.
const MIN_QUERY_LENGTH = 3;

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
  // Tightened from the original 120/min after a security assessment showed
  // this endpoint, combined with short/single-character queries, could
  // enumerate the entire restaurants table (see SECURITY_ATTACK_LOG.md).
  // 30/min is still comfortably above real per-keystroke typing speed
  // (debounced client-side to one request per ~200ms of pause, so a human
  // typing a whole name rarely fires more than a handful of requests) while
  // meaningfully slowing a scripted enumeration sweep.
  if (!checkRateLimit(`restaurant-suggest:${getClientIp(req)}`, { windowMs: 60_000, maxAttempts: 30 })) {
    return errJson("RATE_LIMITED_GENERAL", 429);
  }

  const { searchParams } = new URL(req.url);
  const rawQuery = searchParams.get("q");
  const q = requireString(rawQuery, 100);

  // See MIN_QUERY_LENGTH above -- returning an empty list (not an error) for
  // a too-short query keeps the client's autocomplete UX unchanged (it
  // already only opens the dropdown once there are suggestions), it just
  // means a 1-2 character query never triggers a DB lookup at all.
  if (!q || q.length < MIN_QUERY_LENGTH) {
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

    // Filters out (rather than rejecting the whole request over) any row
    // whose name isn't in the display-safe character set -- registration
    // now enforces this going forward (requireSafeName), but this endpoint
    // also guards against any name that predates that fix (e.g. names
    // created during the security assessment that found this gap) ever
    // being suggested/leaked again.
    const suggestions = result.rows.map((r) => r.name).filter(isSafeName);
    return NextResponse.json({ suggestions });
  } catch (err) {
    logger.error("GET /api/restaurants/suggest - error processing request", err);
    return errJson("INTERNAL_ERROR", 500);
  }
}
