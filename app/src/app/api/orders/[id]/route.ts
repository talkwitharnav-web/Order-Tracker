import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { query, getPool, initDb } from "@/lib/db";
import { logger } from "@/lib/logger";
import { broadcast } from "@/lib/ws-hub";
import { requireRestaurantOrAdmin, isAdminRequest } from "@/lib/auth";
import { parseJsonBody } from "@/lib/validate";
import { resolveOrderActionEmployee } from "@/lib/employee-auth";

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
    const { status, undoToken, employeeId, pin, pinLength } = body as {
      status?: unknown;
      undoToken?: unknown;
      employeeId?: unknown;
      pin?: unknown;
      pinLength?: unknown;
    };

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

    // Verified fresh against THIS order's restaurant on every call -- never
    // trust employeeId alone for attribution. Skipped entirely for Undo
    // (below, Undo reverses the kitchen's own immediately-prior mistake
    // within an 8-second window, not a new attributable action) and for a
    // genuine admin God Mode override -- but "genuine" requires no pin/
    // employeeId to have actually been sent, not merely isAdmin being true.
    // isAdminRequest() only reports whether an admin_session cookie EXISTS,
    // and SYSTEM_MEMORY.md documents that a browser may validly hold both an
    // admin_session AND a restaurant_session at once (e.g. admin console open
    // in one tab, kitchen dashboard logged in and actively used in another).
    // Bypassing on isAdmin alone silently discarded a real employee's PIN
    // attribution any time this coincidence occurred, even though the action
    // came from the kitchen UI with a real verified PIN, not from admin.
    const isGenuineAdminOverride = isAdmin && employeeId === undefined && pin === undefined;
    const employeeCheck = typeof undoToken === "string"
      ? { ok: true as const, employee: null }
      : await resolveOrderActionEmployee(currentOrder.restaurant_name, isGenuineAdminOverride, employeeId, pin, pinLength);
    if (!employeeCheck.ok) return employeeCheck.response;
    const verifiedEmployee = employeeCheck.employee;

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

    // Transactional so the audit event can never exist without the status
    // change actually landing (or vice versa) -- a crash/error between the
    // two would otherwise leave an inconsistent audit trail.
    const client = await getPool().connect();
    let updatedOrder: UpdatedOrder;
    try {
      await client.query("BEGIN");
      const result = await client.query<UpdatedOrder>(
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
        await client.query("ROLLBACK");
        return NextResponse.json(
          { error: "Order changed in another tab. Refreshing the latest status." },
          { status: 409 },
        );
      }

      await client.query(
        `INSERT INTO order_status_events (order_id, restaurant_name, order_number, from_status, to_status, employee_id, employee_name)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          orderId,
          currentOrder.restaurant_name,
          currentOrder.order_number,
          currentOrder.status,
          canonicalStatus,
          verifiedEmployee?.id ?? null,
          verifiedEmployee?.name ?? null,
        ],
      );

      await client.query("COMMIT");
      updatedOrder = result.rows[0];
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }

    logger.info(`PUT /api/orders/${orderId} - status updated successfully`, {
      employee: verifiedEmployee?.name ?? null,
    });

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

    const body = await parseJsonBody(request);
    const { employeeId, pin, pinLength } = (body && typeof body === "object" ? body : {}) as {
      employeeId?: unknown;
      pin?: unknown;
      pinLength?: unknown;
    };

    const existing = await query<{ restaurant_name: string; order_number: string; status: string }>(
      "SELECT restaurant_name, order_number, status FROM orders WHERE id = $1 AND deleted_at IS NULL",
      [orderId],
    );
    if (existing.rows.length === 0) {
      return NextResponse.json({ error: "Order not found" }, { status: 404 });
    }

    const auth = await requireRestaurantOrAdmin(existing.rows[0].restaurant_name);
    if (!auth.ok) return auth.response;

    // Same PIN-attribution rule as create/status-change (see SYSTEM_MEMORY.md
    // "Employee Attribution"): mandatory once this kitchen has >=1 employee,
    // optional (no roster to attribute to) if it has none. And same fix as
    // the coexisting-admin-session bug above -- "genuine admin override"
    // requires no pin/employeeId to have actually been sent, not merely an
    // admin_session cookie existing alongside a real kitchen session.
    const isAdmin = await isAdminRequest();
    const isGenuineAdminOverride = isAdmin && employeeId === undefined && pin === undefined;
    const employeeCheck = await resolveOrderActionEmployee(
      existing.rows[0].restaurant_name,
      isGenuineAdminOverride,
      employeeId,
      pin,
      pinLength,
    );
    if (!employeeCheck.ok) return employeeCheck.response;
    const verifiedEmployee = employeeCheck.employee;

    // Admin deletes are real/permanent (matches the Purge button's
    // semantics — an admin choosing to delete a specific row means it's
    // actually gone, not just hidden). A kitchen deleting its own order
    // still soft-deletes (deleted_at), recoverable via admin/db's Deleted
    // view, same as before — this asymmetry is intentional, not a bug.
    //
    // This branch must key off isGenuineAdminOverride, NOT the raw isAdmin
    // flag -- isAdmin only means an admin_session cookie exists, and a
    // browser can validly hold both an admin_session and a restaurant_session
    // at once (see SYSTEM_MEMORY.md). Using raw isAdmin here previously
    // caused a real kitchen employee's PIN-verified delete to get silently
    // HARD-deleted (unrecoverable, and orphaned from admin/db's Deleted view
    // entirely) any time an admin happened to also be logged in on that
    // browser, even though attribution above already correctly resolved a
    // real employee, not admin.
    //
    // Transactional so the audit event can never exist without the delete
    // actually landing (or vice versa) -- same reasoning as create/status-
    // change. The audit event is written BEFORE a genuine admin hard-delete
    // so order_id still points at a live row at insert time; ON DELETE SET
    // NULL then keeps the row's own restaurant_name/order_number as the
    // durable record once the order itself is gone (see db.ts's table comment).
    const client = await getPool().connect();
    let result: { rowCount: number | null };
    try {
      await client.query("BEGIN");

      await client.query(
        `INSERT INTO order_status_events (order_id, restaurant_name, order_number, from_status, to_status, employee_id, employee_name)
         VALUES ($1, $2, $3, $4, 'Deleted', $5, $6)`,
        [
          orderId,
          existing.rows[0].restaurant_name,
          existing.rows[0].order_number,
          existing.rows[0].status,
          verifiedEmployee?.id ?? null,
          verifiedEmployee?.name ?? null,
        ],
      );

      result = isGenuineAdminOverride
        ? await client.query("DELETE FROM orders WHERE id = $1", [orderId])
        : await client.query("UPDATE orders SET deleted_at = NOW() WHERE id = $1 AND deleted_at IS NULL", [orderId]);

      if (result.rowCount === 0) {
        await client.query("ROLLBACK");
        logger.warn(`DELETE /api/orders/${orderId} - order not found`);
        return NextResponse.json({ error: "Order not found" }, { status: 404 });
      }

      await client.query("COMMIT");
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }

    logger.info(`DELETE /api/orders/${orderId} - order ${isGenuineAdminOverride ? "permanently deleted" : "soft-deleted"} successfully`);

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
