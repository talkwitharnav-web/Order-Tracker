import { NextResponse } from "next/server";
import { query, getPool, initDb } from "@/lib/db";
import { logger } from "@/lib/logger";
import { broadcast } from "@/lib/ws-hub";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";
import { requireRestaurantOrAdmin } from "@/lib/auth";
import { parseJsonBody } from "@/lib/validate";
import { verifyActiveEmployee } from "@/lib/employee-auth";
import { errJson } from "@/lib/error-response";

function parseOrderId(id: string): number | null {
  if (!/^\d+$/.test(id)) return null;
  const n = Number(id);
  return Number.isSafeInteger(n) ? n : null;
}

/**
 * Two ways to reach this route, deliberately kept independent:
 *
 * 1. Customer-facing "Order Picked Up" button on the tracker page -- NO
 *    auth beyond the order id itself, unchanged from this route's original
 *    design, since it only lets a caller stop a display-only Complete-
 *    duration counter early. It can't change the order's real status,
 *    reveal anything, or affect any other order. Still rate-limited the
 *    same as every other anonymous endpoint against fast id enumeration.
 *    This path writes NO audit event -- an anonymous customer click isn't
 *    a staff action needing attribution.
 * 2. Kitchen-side "Mark as Picked Up" (added for staff who want to record a
 *    pickup themselves rather than wait for the customer). Opts in by
 *    sending `{employeeId}` in the body -- when present, this now requires
 *    a real kitchen/admin session AND a verified active employee, and
 *    writes an order_status_events row so it's attributed the same way any
 *    other order action is. Omitting employeeId keeps path 1's exact
 *    original unauthenticated behavior; sending it never weakens that path,
 *    it only ever adds a stricter opt-in one.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  logger.info(`POST /api/orders/${id}/acknowledge - request received`);

  if (!checkRateLimit(`orders-acknowledge:${getClientIp(request)}`, { windowMs: 60_000, maxAttempts: 120 })) {
    return errJson("RATE_LIMITED_GENERAL", 429);
  }

  const orderId = parseOrderId(id);
  if (orderId === null) {
    return errJson("INVALID_ORDER_ID", 400);
  }

  try {
    await initDb();

    const body = await parseJsonBody(request);
    const { employeeId } = (body && typeof body === "object" ? body : {}) as { employeeId?: unknown };

    const existing = await query<{ restaurant_name: string; order_number: string; status: string; complete_at: string | null }>(
      "SELECT restaurant_name, order_number, status, complete_at FROM orders WHERE id = $1 AND deleted_at IS NULL",
      [orderId],
    );
    if (existing.rows.length === 0 || existing.rows[0].complete_at === null) {
      return errJson("ACKNOWLEDGE_TARGET_NOT_FOUND", 404);
    }
    const order = existing.rows[0];

    let verifiedEmployee: { id: number; name: string } | null = null;
    if (employeeId !== undefined) {
      const auth = await requireRestaurantOrAdmin(order.restaurant_name);
      if (!auth.ok) return auth.response;

      const parsedId = typeof employeeId === "number" && Number.isSafeInteger(employeeId) ? employeeId : null;
      if (parsedId === null) {
        return errJson("INVALID_EMPLOYEE_ID", 400, "Invalid employeeId");
      }
      verifiedEmployee = await verifyActiveEmployee(order.restaurant_name, parsedId);
      if (!verifiedEmployee) {
        return errJson("INVALID_OR_INACTIVE_EMPLOYEE", 401);
      }
    }

    // Only meaningful for an order that has actually reached Complete --
    // acknowledging an already-acknowledged one is a harmless no-op (first
    // click wins, whether that first click was the customer's or staff's).
    if (verifiedEmployee) {
      const client = await getPool().connect();
      try {
        await client.query("BEGIN");
        const result = await client.query(
          `UPDATE orders SET acknowledged_at = COALESCE(acknowledged_at, NOW())
           WHERE id = $1 AND deleted_at IS NULL AND complete_at IS NOT NULL
           RETURNING id`,
          [orderId],
        );
        if (result.rowCount === 0) {
          await client.query("ROLLBACK");
          return NextResponse.json(
            { error: "Order not found, not yet complete, or has been deleted" },
            { status: 404 },
          );
        }
        await client.query(
          `INSERT INTO order_status_events (order_id, restaurant_name, order_number, from_status, to_status, employee_id, employee_name)
           VALUES ($1, $2, $3, NULL, 'PickedUp', $4, $5)`,
          [orderId, order.restaurant_name, order.order_number, verifiedEmployee.id, verifiedEmployee.name],
        );
        await client.query("COMMIT");
      } catch (err) {
        await client.query("ROLLBACK");
        throw err;
      } finally {
        client.release();
      }
    } else {
      const result = await query(
        `UPDATE orders SET acknowledged_at = COALESCE(acknowledged_at, NOW())
         WHERE id = $1 AND deleted_at IS NULL AND complete_at IS NOT NULL
         RETURNING id`,
        [orderId],
      );
      if (result.rowCount === 0) {
        return NextResponse.json(
          { error: "Order not found, not yet complete, or has been deleted" },
          { status: 404 },
        );
      }
    }

    logger.info(`POST /api/orders/${orderId}/acknowledge - acknowledged`, { employee: verifiedEmployee?.name ?? null });
    broadcast({ type: "order_updated", payload: { id: orderId, restaurant_name: order.restaurant_name } });
    return NextResponse.json({ message: "Order acknowledged" });
  } catch (err) {
    logger.error(`POST /api/orders/${id}/acknowledge - error processing request`, err);
    return errJson("INTERNAL_ERROR", 500);
  }
}
