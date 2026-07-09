import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { query, initDb } from "@/lib/db";
import { logger } from "@/lib/logger";
import { broadcast } from "@/lib/ws-hub";
import { requireRestaurantOrAdmin, isAdminRequest } from "@/lib/auth";
import { parseJsonBody } from "@/lib/validate";

// Forward-only lifecycle (see SYSTEM_MEMORY.md §2 status-vocab quirk — this
// is the API-vocabulary set, unrelated to the customer-facing display
// vocabulary). Previously the API accepted ANY of these three regardless of
// the order's current status, so a request could revert Complete->Received
// or skip straight to Complete with no intermediate step — the UI's
// StatusStepper only allows the next step, but that was a client-only
// constraint (see SECURITY_ATTACK_LOG.md F10). Keyed lowercase since the
// route already treats status case-insensitively.
const STATUS_ORDER = ["received", "preparing", "complete"];
const UNDO_WINDOW_SECONDS = 8;

// Maps a status to the column that records the FIRST time an order ever
// entered it -- unlike updated_at (overwritten on every change), these are
// set once via COALESCE(column, NOW()) and never touched again, so admin/db
// can compute how long an order actually spent in each individual status
// after the fact (see lib/order-duration.ts). An admin forcing a backward
// transition (God Mode override) does NOT erase a later status's already-
// recorded timestamp -- COALESCE only fills in a column that's still null.
const STATUS_TIMESTAMP_COLUMN: Record<string, string> = {
  received: "received_at",
  preparing: "preparing_at",
  complete: "complete_at",
};

const PREVIOUS_STATUS: Record<string, string> = {
  preparing: "Received",
  complete: "Preparing",
};

type UpdatedOrder = {
  id: number;
  restaurant_name: string;
  order_number: string;
  status: string;
  updated_at: string;
  received_at: string;
  preparing_at: string | null;
  complete_at: string | null;
  acknowledged_at: string | null;
  status_transition_token: string | null;
  status_transition_at: string | null;
};

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
    const body = await parseJsonBody(request);
    if (body === null) {
      return NextResponse.json({ error: "Malformed JSON body" }, { status: 400 });
    }
    const { status, undoToken } = body as { status?: unknown; undoToken?: unknown };

    logger.info(`PUT /api/orders/${orderId} - updating status`, { status });

    const allowedStatuses = ["Received", "Preparing", "Complete"] as const;

    const canonicalStatus = typeof status === "string"
      ? allowedStatuses.find((allowed) => allowed.toLowerCase() === status.toLowerCase())
      : undefined;

    if (!canonicalStatus) {
      logger.warn(`PUT /api/orders/${orderId} - validation error: Invalid status "${status}"`);
      return NextResponse.json({ error: "Invalid status" }, { status: 400 });
    }

    if (undoToken !== undefined && (typeof undoToken !== "string" || !/^[0-9a-f-]{36}$/i.test(undoToken))) {
      return NextResponse.json({ error: "Invalid undo token" }, { status: 400 });
    }

    const existing = await query<UpdatedOrder>(
      `SELECT id, restaurant_name, order_number, status, updated_at,
              received_at, preparing_at, complete_at, acknowledged_at,
              status_transition_token, status_transition_at
       FROM orders WHERE id = $1 AND deleted_at IS NULL`,
      [orderId],
    );
    if (existing.rows.length === 0) {
      return NextResponse.json({ error: "Order not found" }, { status: 404 });
    }

    const auth = await requireRestaurantOrAdmin(existing.rows[0].restaurant_name);
    if (!auth.ok) return auth.response;

    const isAdmin = await isAdminRequest();
    const currentOrder = existing.rows[0];
    const currentStatus = currentOrder.status.toLowerCase();
    const nextStatus = canonicalStatus.toLowerCase();

    if (typeof undoToken === "string") {
      const previousStatus = PREVIOUS_STATUS[currentStatus];
      if (!previousStatus || previousStatus.toLowerCase() !== nextStatus) {
        return NextResponse.json({ error: "This status change cannot be undone" }, { status: 409 });
      }

      // Undo removes only the timestamp created by the mistaken step. Earlier
      // status timestamps remain intact, so duration reporting resumes as if
      // that accidental tap never happened.
      const mistakenTimestampColumn = STATUS_TIMESTAMP_COLUMN[currentStatus];
      const undoResult = await query<UpdatedOrder>(
        `UPDATE orders
         SET status = $1,
             updated_at = NOW(),
             ${mistakenTimestampColumn} = NULL,
             status_transition_token = NULL,
             status_transition_at = NULL
         WHERE id = $2
           AND deleted_at IS NULL
           AND LOWER(status) = $3
           AND status_transition_token = $4
           AND status_transition_at >= NOW() - INTERVAL '${UNDO_WINDOW_SECONDS} seconds'
           AND (LOWER(status) <> 'complete' OR acknowledged_at IS NULL)
         RETURNING id, restaurant_name, order_number, status, updated_at,
                   received_at, preparing_at, complete_at, acknowledged_at,
                   status_transition_token, status_transition_at`,
        [previousStatus, orderId, currentStatus, undoToken],
      );

      if (undoResult.rows.length === 0) {
        return NextResponse.json(
          { error: "Undo expired or the order changed in another tab" },
          { status: 409 },
        );
      }

      const undoneOrder = undoResult.rows[0];
      broadcast({
        type: "order_updated",
        payload: { id: orderId, status: undoneOrder.status, restaurant_name: undoneOrder.restaurant_name },
      });
      return NextResponse.json({ order: undoneOrder, undone: true });
    }

    // Admin can force any transition (existing "God Mode" override
    // precedent); a kitchen can only move its own order forward one step.
    if (!isAdmin && !isForwardTransition(currentOrder.status, canonicalStatus)) {
      logger.warn(
        `PUT /api/orders/${orderId} - rejected out-of-order transition "${currentOrder.status}" -> "${canonicalStatus}"`,
      );
      return NextResponse.json(
        { error: `Cannot change status from "${currentOrder.status}" to "${canonicalStatus}"` },
        { status: 409 },
      );
    }

    if (currentStatus === nextStatus) {
      return NextResponse.json({ order: currentOrder, undo: null });
    }

    // Column name comes from a fixed lookup keyed by the already-validated
    // lowercase status, never from raw user input -- safe to splice into
    // the SQL text (there's no parameterized way to make a column name
    // itself a bind variable).
    const timestampColumn = STATUS_TIMESTAMP_COLUMN[nextStatus];
    const canUndo = !isAdmin && STATUS_ORDER.indexOf(nextStatus) === STATUS_ORDER.indexOf(currentStatus) + 1;
    const transitionToken = canUndo ? randomUUID() : null;
    const result = await query<UpdatedOrder>(
      `UPDATE orders
       SET status = $1,
           updated_at = NOW(),
           ${timestampColumn} = COALESCE(${timestampColumn}, NOW()),
           status_transition_token = $2,
           status_transition_at = CASE WHEN $2::text IS NULL THEN NULL ELSE NOW() END
       WHERE id = $3
         AND deleted_at IS NULL
         ${isAdmin ? "" : "AND LOWER(status) = $4"}
       RETURNING id, restaurant_name, order_number, status, updated_at,
                 received_at, preparing_at, complete_at, acknowledged_at,
                 status_transition_token, status_transition_at`,
      isAdmin
        ? [canonicalStatus, transitionToken, orderId]
        : [canonicalStatus, transitionToken, orderId, currentStatus],
    );

    if (result.rows.length === 0) {
      return NextResponse.json(
        { error: "Order changed in another tab. Refreshing the latest status." },
        { status: 409 },
      );
    }

    logger.info(`PUT /api/orders/${orderId} - status updated successfully`);

    const updatedOrder = result.rows[0];

    broadcast({
      type: "order_updated",
      payload: { id: orderId, status: updatedOrder.status, restaurant_name: updatedOrder.restaurant_name },
    });

    return NextResponse.json({
      order: updatedOrder,
      undo: transitionToken
        ? {
            token: transitionToken,
            previousStatus: currentOrder.status,
            expiresInMs: UNDO_WINDOW_SECONDS * 1000,
          }
        : null,
    });
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
      "SELECT restaurant_name FROM orders WHERE id = $1 AND deleted_at IS NULL",
      [orderId],
    );
    if (existing.rows.length === 0) {
      return NextResponse.json({ error: "Order not found" }, { status: 404 });
    }

    const auth = await requireRestaurantOrAdmin(existing.rows[0].restaurant_name);
    if (!auth.ok) return auth.response;

    // Admin deletes are real/permanent (matches the Purge button's
    // semantics — an admin choosing to delete a specific row means it's
    // actually gone, not just hidden). A kitchen deleting its own order
    // still soft-deletes (deleted_at), recoverable via admin/db's Deleted
    // view, same as before — this asymmetry is intentional, not a bug.
    const isAdmin = await isAdminRequest();
    const result = isAdmin
      ? await query("DELETE FROM orders WHERE id = $1", [orderId])
      : await query("UPDATE orders SET deleted_at = NOW() WHERE id = $1 AND deleted_at IS NULL", [orderId]);

    if (result.rowCount === 0) {
      logger.warn(`DELETE /api/orders/${orderId} - order not found`);
      return NextResponse.json({ error: "Order not found" }, { status: 404 });
    }

    logger.info(`DELETE /api/orders/${orderId} - order ${isAdmin ? "permanently deleted" : "soft-deleted"} successfully`);

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
