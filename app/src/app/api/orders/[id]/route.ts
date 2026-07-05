import { NextResponse } from "next/server";
import { query, initDb } from "@/lib/db";
import { logger } from "@/lib/logger";
import { broadcast } from "@/lib/ws-hub";
import { requireRestaurantOrAdmin, isAdminRequest } from "@/lib/auth";

// Forward-only lifecycle (see SYSTEM_MEMORY.md §2 status-vocab quirk — this
// is the API-vocabulary set, unrelated to the customer-facing display
// vocabulary). Previously the API accepted ANY of these three regardless of
// the order's current status, so a request could revert Complete->Received
// or skip straight to Complete with no intermediate step — the UI's
// StatusStepper only allows the next step, but that was a client-only
// constraint (see SECURITY_ATTACK_LOG.md F10). Keyed lowercase since the
// route already treats status case-insensitively.
const STATUS_ORDER = ["received", "preparing", "complete"];

function isForwardTransition(current: string, next: string): boolean {
  const from = STATUS_ORDER.indexOf(current.toLowerCase());
  const to = STATUS_ORDER.indexOf(next.toLowerCase());
  if (from === -1 || to === -1) return false;
  return to === from || to === from + 1;
}

function parseOrderId(id: string): number | null {
  if (!/^\d+$/.test(id)) return null;
  const n = Number(id);
  return Number.isSafeInteger(n) ? n : null;
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  logger.info(`PUT /api/orders/${id} - request received`);

  const orderId = parseOrderId(id);
  if (orderId === null) {
    return NextResponse.json({ error: "Invalid order id" }, { status: 400 });
  }

  try {
    await initDb();
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Malformed JSON body" }, { status: 400 });
    }
    const { status } = body as { status?: unknown };

    logger.info(`PUT /api/orders/${orderId} - updating status`, { status });

    const allowedStatuses = ["Received", "Preparing", "Complete"];

    if (
      typeof status !== "string" ||
      !allowedStatuses.map(s => s.toLowerCase()).includes(status.toLowerCase())
    ) {
      logger.warn(`PUT /api/orders/${orderId} - validation error: Invalid status "${status}"`);
      return NextResponse.json({ error: "Invalid status" }, { status: 400 });
    }

    const existing = await query<{ restaurant_name: string; status: string }>(
      "SELECT restaurant_name, status FROM orders WHERE id = $1",
      [orderId],
    );
    if (existing.rows.length === 0) {
      return NextResponse.json({ error: "Order not found" }, { status: 404 });
    }

    const auth = await requireRestaurantOrAdmin(existing.rows[0].restaurant_name);
    if (!auth.ok) return auth.response;

    // Admin can force any transition (existing "God Mode" override
    // precedent); a kitchen can only move its own order forward one step.
    const isAdmin = await isAdminRequest();
    if (!isAdmin && !isForwardTransition(existing.rows[0].status, status)) {
      logger.warn(
        `PUT /api/orders/${orderId} - rejected out-of-order transition "${existing.rows[0].status}" -> "${status}"`,
      );
      return NextResponse.json(
        { error: `Cannot change status from "${existing.rows[0].status}" to "${status}"` },
        { status: 409 },
      );
    }

    const result = await query(
      "UPDATE orders SET status = $1, updated_at = NOW() WHERE id = $2",
      [status, orderId],
    );

    if (result.rowCount === 0) {
      logger.warn(`PUT /api/orders/${orderId} - order not found`);
      return NextResponse.json({ error: "Order not found" }, { status: 404 });
    }

    logger.info(`PUT /api/orders/${orderId} - status updated successfully`);

    broadcast({
      type: "order_updated",
      payload: { id: orderId, status, restaurant_name: existing.rows[0].restaurant_name },
    });

    return NextResponse.json({ id: orderId, status });
  } catch (err) {
    logger.error(`PUT /api/orders/${id} - error processing request`, err);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 },
    );
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  logger.info(`DELETE /api/orders/${id} - request received`);

  const orderId = parseOrderId(id);
  if (orderId === null) {
    return NextResponse.json({ error: "Invalid order id" }, { status: 400 });
  }

  try {
    await initDb();

    const existing = await query<{ restaurant_name: string }>(
      "SELECT restaurant_name FROM orders WHERE id = $1",
      [orderId],
    );
    if (existing.rows.length === 0) {
      return NextResponse.json({ error: "Order not found" }, { status: 404 });
    }

    const auth = await requireRestaurantOrAdmin(existing.rows[0].restaurant_name);
    if (!auth.ok) return auth.response;

    logger.info(`DELETE /api/orders/${orderId} - deleting order`);

    const result = await query("DELETE FROM orders WHERE id = $1", [orderId]);

    if (result.rowCount === 0) {
      logger.warn(`DELETE /api/orders/${orderId} - order not found`);
      return NextResponse.json({ error: "Order not found" }, { status: 404 });
    }

    logger.info(`DELETE /api/orders/${orderId} - order deleted successfully`);

    broadcast({
      type: "order_deleted",
      payload: { id: orderId, restaurant_name: existing.rows[0].restaurant_name },
    });

    return NextResponse.json({ message: "Order deleted successfully" });
  } catch (err) {
    logger.error(`DELETE /api/orders/${id} - error processing request`, err);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 },
    );
  }
}
