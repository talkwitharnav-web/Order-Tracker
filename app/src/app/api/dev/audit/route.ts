import { NextResponse } from "next/server";
import { query, initDb } from "@/lib/db";
import { logger } from "@/lib/logger";
import { requireAdmin } from "@/lib/auth";
import { parseJsonBody } from "@/lib/validate";

/**
 * Read-only view over order_status_events -- the append-only "who did what,
 * when" trail written by order create/status-change (see db.ts's table
 * comment and SYSTEM_MEMORY.md "Employee Attribution"). Nothing wrote this
 * out anywhere until now; this is the first reader. Admin-only, same gate
 * as every other /api/dev/* route.
 *
 * Reads restaurant_name/order_number directly off order_status_events
 * (denormalized at write time), NOT via a join to orders -- an admin hard-
 * deleting an order sets order_id to NULL on its events (ON DELETE SET NULL,
 * not CASCADE) rather than destroying them, specifically so this log keeps
 * showing what happened under a since-deleted order's name instead of that
 * history silently disappearing along with the row it describes.
 *
 * Optional filters: `restaurantName` narrows to one kitchen (matches
 * order_status_events.restaurant_name case-insensitively); `employeeName`
 * further narrows to one attributed person WITHIN that kitchen (an employee
 * name is only unique per-restaurant, not globally, so this is only
 * accepted alongside restaurantName -- see the 400 below).
 */
type AuditEventRow = {
  id: number;
  order_id: number | null;
  order_number: string;
  restaurant_name: string;
  from_status: string | null;
  to_status: string;
  employee_name: string | null;
  created_at: string;
};

export async function GET(request: Request) {
  logger.info("GET /api/dev/audit - request received");

  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  try {
    await initDb();

    const { searchParams } = new URL(request.url);
    const restaurantName = searchParams.get("restaurantName")?.trim() || null;
    const employeeName = searchParams.get("employeeName")?.trim() || null;

    if (employeeName && !restaurantName) {
      return NextResponse.json(
        { error: "employeeName filter requires restaurantName (employee names are only unique per kitchen)" },
        { status: 400 },
      );
    }

    const conditions: string[] = [];
    const params: unknown[] = [];

    if (restaurantName) {
      params.push(restaurantName);
      conditions.push(`LOWER(ose.restaurant_name) = LOWER($${params.length})`);
    }
    if (employeeName) {
      params.push(employeeName);
      conditions.push(`ose.employee_name = $${params.length}`);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    // Capped at 500 rows, same reasoning as /api/dev/db's order cap -- this
    // table is append-only and grows with every single status transition
    // (potentially several times per order), so an old busy kitchen could
    // otherwise ship years of history as one response on every page load.
    const events = (
      await query<AuditEventRow>(
        `SELECT ose.id, ose.order_id, ose.order_number, ose.restaurant_name,
                ose.from_status, ose.to_status, ose.employee_name, ose.created_at
         FROM order_status_events ose
         ${whereClause}
         ORDER BY ose.created_at DESC, ose.id DESC
         LIMIT 500`,
        params,
      )
    ).rows;

    // Restaurant list for the page's kitchen-search/select control -- drawn
    // from live restaurants only (not from event history), matching how
    // /admin/staff's kitchen picker sources its list, so a purged/renamed
    // kitchen never lingers in the filter options.
    const restaurantNames = (
      await query<{ name: string }>("SELECT name FROM restaurants WHERE deleted_at IS NULL ORDER BY name ASC")
    ).rows.map((r) => r.name);

    return NextResponse.json({ events, restaurantNames });
  } catch (err) {
    logger.error("GET /api/dev/audit - error processing request", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

/**
 * Wipes the entire audit trail -- separate from, and much rarer than,
 * Purge Database (which wipes restaurants/orders themselves). Same
 * exact-typed-confirmation-phrase pattern as Seed/Purge Database (see
 * SYSTEM_MEMORY.md and /api/dev/db's DELETE) but its own distinct phrase,
 * "PURGE AUDIT", so it can never be triggered by a copy-pasted or
 * muscle-memory "PURGE DATABASE" typed into the wrong modal.
 */
export async function DELETE(request: Request) {
  logger.warn("DELETE /api/dev/audit - request received to PURGE AUDIT LOG");

  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  try {
    const body = await parseJsonBody(request);
    const confirmation = body && typeof body === "object"
      ? (body as { confirmation?: unknown }).confirmation
      : undefined;
    if (confirmation !== "PURGE AUDIT") {
      return NextResponse.json({ error: "Type PURGE AUDIT to confirm" }, { status: 400 });
    }

    await initDb();

    logger.warn("DELETE /api/dev/audit - DELETING ALL AUDIT EVENTS...");
    await query("DELETE FROM order_status_events");
    logger.warn("DELETE /api/dev/audit - AUDIT LOG PURGED");

    return NextResponse.json({ message: "Audit log purged successfully" });
  } catch (err) {
    logger.error("DELETE /api/dev/audit - error processing request", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
