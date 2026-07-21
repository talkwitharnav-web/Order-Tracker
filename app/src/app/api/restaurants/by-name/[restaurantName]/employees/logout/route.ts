import { NextResponse } from "next/server";
import { query, initDb } from "@/lib/db";
import { logger } from "@/lib/logger";
import { broadcast } from "@/lib/ws-hub";
import { requireRestaurantOrAdmin } from "@/lib/auth";
import { parseJsonBody } from "@/lib/validate";
import { verifyActiveEmployee } from "@/lib/employee-auth";
import { errJson, plainJson } from "@/lib/error-response";

/**
 * Records that a signed-in employee tapped "Logout Staff" (see
 * lib/employee-session.ts / Dashboard.tsx's handleLogoutStaff) -- the
 * ONE-TIME PIN sign-in this kitchen used for the rest of the shift is
 * ending, distinct from the kitchen itself logging out entirely (which
 * intentionally does NOT call this route or write any audit event; see
 * restauranthome/page.tsx's handleLogout).
 *
 * Writes an order_status_events row with `to_status: 'EmployeeLogout'` (a
 * lifecycle marker, not a real order status, same pattern as the existing
 * 'Deleted'/'PickedUp' markers) and no order_id/order_number -- an employee
 * logout has no associated order at all. Requires no PIN of its own: the
 * PIN was already verified once at staff sign-in, and self-service sign-OUT
 * needs no re-authentication anywhere else in this app either.
 */
export async function POST(request: Request, { params }: { params: Promise<{ restaurantName: string }> }) {
  const { restaurantName } = await params;
  logger.info(`POST /api/restaurants/by-name/${restaurantName}/employees/logout - request received`);

  const auth = await requireRestaurantOrAdmin(restaurantName);
  if (!auth.ok) return auth.response;

  await initDb();

  try {
    const body = await parseJsonBody(request);
    const { employeeId } = (body && typeof body === "object" ? body : {}) as { employeeId?: unknown };

    const parsedId = typeof employeeId === "number" && Number.isSafeInteger(employeeId) ? employeeId : null;
    if (parsedId === null) {
      return plainJson("employeeId is required", 400);
    }

    const employee = await verifyActiveEmployee(restaurantName, parsedId);
    if (!employee) {
      return errJson("INVALID_OR_INACTIVE_EMPLOYEE", 401);
    }

    // restaurant_name is denormalized directly (not looked up per-order,
    // there's no order here) -- the caller-provided restaurantName is
    // already the authenticated/authorized one per requireRestaurantOrAdmin
    // above, same trust level as every other write on this route family.
    await query(
      `INSERT INTO order_status_events (order_id, restaurant_name, order_number, from_status, to_status, employee_id, employee_name)
       VALUES (NULL, $1, NULL, NULL, 'EmployeeLogout', $2, $3)`,
      [restaurantName, employee.id, employee.name],
    );

    logger.info(`POST /api/restaurants/by-name/${restaurantName}/employees/logout - ${employee.name} logged out`);
    broadcast({ type: "order_updated", payload: { restaurant_name: restaurantName } });

    return NextResponse.json({ message: "Logged out" });
  } catch (err) {
    logger.error(`POST /api/restaurants/by-name/${restaurantName}/employees/logout - error processing request`, err);
    return errJson("INTERNAL_ERROR", 500);
  }
}
