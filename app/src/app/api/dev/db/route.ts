import { NextResponse } from "next/server";
import { query, initDb } from "@/lib/db";
import { logger } from "@/lib/logger";
import { requireAdmin } from "@/lib/auth";
import { parseJsonBody, escapeLikePattern } from "@/lib/validate";
import { errJson } from "@/lib/error-response";

type RestaurantRow = { id: number; name: string; password: string; raw_password: string | null; deleted_at: string | null };

const PAGE_SIZE = 150;
const SORTABLE_COLUMNS = new Set(["id", "created_at"]);
const LIVE_STATUSES = new Set(["Received", "Preparing", "Complete"]);

/**
 * Orders are windowed with real Postgres keyset pagination instead of ever
 * loading a fixed "most recent 500" snapshot -- that cap silently hid any
 * order older than the current top-500 system-wide, with no way to reach
 * further. The admin/db page now keeps only a small sliding window of rows
 * in memory and asks for the next/previous page as the user scrolls near
 * either edge (Gmail/Discord/iMessage-style virtualized list) -- full
 * history is reachable, just streamed in small pages instead of shipped in
 * one payload, and rows scrolled far away are evicted client-side.
 *
 * Live and deleted orders share ONE query/window (not two separately-paged
 * sections) -- `includeDeleted` toggles whether deleted rows are eligible at
 * all, and `statusFilter` can include the literal "Deleted" alongside
 * Received/Preparing/Complete, since a single scrollable table showing both
 * only makes sense as one ordered result set, not two independently-paged
 * ones stitched together client-side.
 *
 * Keyset (not OFFSET) pagination: `cursor` is the last-seen row's sort-key
 * value (id, or created_at ISO string) from the previous page, `direction`
 * says whether to continue forward (further from the top, scrolling down)
 * or backward (back toward the top, e.g. after scrolling away and back up).
 * OFFSET pagination would silently re-shift under concurrent inserts/
 * deletes; keyset pagination stays stable regardless of what else changes
 * in the table between requests.
 */
function buildOrderQuery(params: {
  includeDeleted: boolean;
  orderSearch: string | null;
  restaurantNames: string[];
  statusFilter: string[];
  sortKey: "id" | "created_at";
  sortDirection: "asc" | "desc";
  cursor: string | null;
  direction: "forward" | "backward";
}) {
  const { includeDeleted, orderSearch, restaurantNames, statusFilter, sortKey, sortDirection, cursor, direction } = params;
  const conditions: string[] = [];
  const values: unknown[] = [];

  if (!includeDeleted) {
    conditions.push("deleted_at IS NULL");
  } else if (statusFilter.length > 0) {
    // A status filter is active while deleted rows are visible: "Deleted" is
    // a lifecycle marker, not a real `status` value, so it has to be
    // expressed as its own OR branch rather than folded into `status = ANY`.
    const liveStatuses = statusFilter.filter((s) => LIVE_STATUSES.has(s));
    const wantsDeleted = statusFilter.includes("Deleted");
    if (wantsDeleted && liveStatuses.length > 0) {
      values.push(liveStatuses);
      conditions.push(`(deleted_at IS NOT NULL OR status = ANY($${values.length}))`);
    } else if (wantsDeleted) {
      conditions.push("deleted_at IS NOT NULL");
    } else if (liveStatuses.length > 0) {
      values.push(liveStatuses);
      conditions.push(`(deleted_at IS NULL AND status = ANY($${values.length}))`);
    }
  }
  // When statusFilter only targets live statuses (deleted rows not shown at
  // all), it's a plain AND condition -- no OR-branch needed.
  if (!includeDeleted && statusFilter.length > 0) {
    values.push(statusFilter);
    conditions.push(`status = ANY($${values.length})`);
  }

  if (orderSearch) {
    values.push(`%${escapeLikePattern(orderSearch)}%`);
    conditions.push(`order_number ILIKE $${values.length}`);
  }
  if (restaurantNames.length > 0) {
    values.push(restaurantNames);
    conditions.push(`restaurant_name = ANY($${values.length})`);
  }

  // The effective direction of "give me the next page" flips when the caller
  // wants ascending order vs descending -- e.g. sorted ascending by id,
  // paging forward (scrolling toward higher ids) means id > cursor, but
  // sorted descending it means id < cursor. `direction: "backward"` (paging
  // back toward the top of whatever order is active) always flips it again.
  const wantsGreater = sortDirection === "asc" ? direction === "forward" : direction === "backward";
  const cursorColumn = sortKey === "id" ? "id" : "created_at";
  if (cursor !== null) {
    values.push(cursor);
    conditions.push(`${cursorColumn} ${wantsGreater ? ">" : "<"} $${values.length}`);
  }

  // Fetching one extra row is the cheapest reliable way to know `hasMore`
  // without a separate COUNT(*) query (which would scan the whole filtered
  // set just to answer true/false).
  values.push(PAGE_SIZE + 1);
  const orderClause = `${cursorColumn} ${wantsGreater ? "ASC" : "DESC"}`;
  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
  const sql = `SELECT * FROM orders ${whereClause} ORDER BY ${orderClause} LIMIT $${values.length}`;
  return { sql, values };
}

export async function GET(request: Request) {
  logger.info("GET /api/dev/db - request received");

  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  try {
    await initDb();

    const { searchParams } = new URL(request.url);
    const orderSearch = searchParams.get("orderSearch")?.trim() || null;
    const restaurantNamesParam = searchParams.get("restaurantNames")?.trim() || null;
    const restaurantNames = restaurantNamesParam ? restaurantNamesParam.split(",").filter(Boolean) : [];
    const statusFilterParam = searchParams.get("statusFilter")?.trim() || null;
    const statusFilter = statusFilterParam ? statusFilterParam.split(",").filter(Boolean) : [];
    const sortKeyParam = searchParams.get("sortKey") || "id";
    const sortKey = SORTABLE_COLUMNS.has(sortKeyParam) ? (sortKeyParam as "id" | "created_at") : "id";
    const sortDirection = searchParams.get("sortDirection") === "asc" ? "asc" : "desc";
    const cursor = searchParams.get("cursor");
    const direction = searchParams.get("direction") === "backward" ? "backward" : "forward";
    const includeDeleted = searchParams.get("includeDeleted") === "1";
    // First load of a fresh window (no cursor yet): the client also wants a
    // total deleted-orders count for the "Deleted (N)" toggle button label,
    // which a plain windowed page can't otherwise derive on its own.
    const wantCounts = searchParams.get("wantCounts") === "1";

    logger.info("GET /api/dev/db - fetching page...");
    const { sql, values } = buildOrderQuery({
      includeDeleted,
      orderSearch,
      restaurantNames,
      statusFilter,
      sortKey,
      sortDirection,
      cursor,
      direction,
    });
    const rows = (await query(sql, values)).rows;
    const hasMore = rows.length > PAGE_SIZE;
    const pageRows = hasMore ? rows.slice(0, PAGE_SIZE) : rows;
    // Paging backward (toward the top) arrives in the opposite row order from
    // what the UI wants to prepend, since the SQL had to sort the other way
    // to find "the PAGE_SIZE rows immediately above the cursor". Flip it back
    // before returning so the client never has to know about this detail.
    if (direction === "backward") pageRows.reverse();

    let restaurantRows: RestaurantRow[] = [];
    let deletedCount: number | undefined;
    if (!cursor) {
      // Only fetch the (small, uncapped) restaurants table on the very first
      // request of a fresh window -- every subsequent page request just
      // needs more order rows.
      restaurantRows = (await query<RestaurantRow>("SELECT * FROM restaurants WHERE deleted_at IS NULL")).rows;
    }
    if (wantCounts) {
      const result = await query<{ count: string }>("SELECT COUNT(*) FROM orders WHERE deleted_at IS NOT NULL");
      deletedCount = Number(result.rows[0].count);
    }

    logger.info("GET /api/dev/db - page fetched");

    return NextResponse.json({
      rows: pageRows,
      hasMore,
      ...(cursor ? {} : { restaurants: restaurantRows }),
      ...(deletedCount !== undefined ? { deletedCount } : {}),
    });
  } catch (err) {
    logger.error("GET /api/dev/db - error processing request", err);
    return errJson("INTERNAL_ERROR", 500);
  }
}

export async function DELETE(request: Request) {
  logger.warn("DELETE /api/dev/db - request received to PURGE DATABASE");

  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  try {
    const body = await parseJsonBody(request);
    const confirmation = body && typeof body === "object"
      ? (body as { confirmation?: unknown }).confirmation
      : undefined;
    if (confirmation !== "PURGE DATABASE") {
      return errJson("CONFIRMATION_PHRASE_MISMATCH", 400, "Type PURGE DATABASE to confirm");
    }

    await initDb();

    logger.warn("DELETE /api/dev/db - DELETING ALL DATA...");
    await query("DELETE FROM orders");
    await query("DELETE FROM restaurants");
    logger.warn("DELETE /api/dev/db - DATABASE PURGED");

    // Re-run init to create tables again if they were dropped
    await initDb();

    return NextResponse.json({ message: "Database purged successfully" });
  } catch (err) {
    logger.error("DELETE /api/dev/db - error processing request", err);
    return errJson("INTERNAL_ERROR", 500);
  }
}
