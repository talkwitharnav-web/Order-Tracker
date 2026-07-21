import { NextResponse } from "next/server";
import { query, initDb } from "@/lib/db";
import { logger } from "@/lib/logger";
import { requireAdmin } from "@/lib/auth";
import { errJson, plainJson } from "@/lib/error-response";

function parseOrderId(id: string): number | null {
  if (!/^\d+$/.test(id)) return null;
  const n = Number(id);
  return Number.isSafeInteger(n) ? n : null;
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  logger.info(`POST /api/orders/${id}/undelete - request received`);

  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const orderId = parseOrderId(id);
  if (orderId === null) {
    return plainJson("Invalid order id", 400);
  }

  try {
    await initDb();

    // The order's (restaurant_name, order_number) pair might already be
    // live again (e.g. the kitchen re-created "ORD1" after deleting the
    // original) -- the partial unique index only guards live rows, so
    // un-deleting this one would collide. Reject with a clear error rather
    // than let the UPDATE fail with a raw constraint-violation message.
    const existing = await query<{ restaurant_name: string; order_number: string; order_lookup_key: string }>(
      "SELECT restaurant_name, order_number, order_lookup_key FROM orders WHERE id = $1 AND deleted_at IS NOT NULL",
      [orderId],
    );
    const row = existing.rows[0];
    if (!row) {
      return errJson("DELETED_ORDER_NOT_FOUND", 404);
    }

    const clash = await query(
      "SELECT 1 FROM orders WHERE LOWER(restaurant_name) = LOWER($1) AND order_lookup_key = $2 AND deleted_at IS NULL",
      [row.restaurant_name, row.order_lookup_key],
    );
    if (clash.rows.length > 0) {
      return errJson("ORDER_NAME_TAKEN_UNDELETE", 409, `Cannot restore -- an order named "${row.order_number}" already exists for this restaurant`);
    }

    const result = await query(
      "UPDATE orders SET deleted_at = NULL WHERE id = $1 AND deleted_at IS NOT NULL",
      [orderId],
    );
    if (result.rowCount === 0) {
      return errJson("DELETED_ORDER_NOT_FOUND", 404);
    }

    logger.info(`POST /api/orders/${orderId}/undelete - order restored successfully`);
    return NextResponse.json({ message: "Order restored successfully" });
  } catch (err) {
    logger.error(`POST /api/orders/${id}/undelete - error processing request`, err);
    return errJson("INTERNAL_ERROR", 500);
  }
}
