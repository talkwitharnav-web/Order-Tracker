import { NextResponse } from "next/server";
import { query, initDb } from "@/lib/db";
import { logger } from "@/lib/logger";
import { requireRestaurantOrAdmin } from "@/lib/auth";
import { parseJsonBody } from "@/lib/validate";
import { errJson } from "@/lib/error-response";

const MIN_HOURS = 0.1; // 6 minutes -- a real floor, not effectively "off"
const MAX_HOURS = 168; // 1 week -- generous upper bound, still finite

/**
 * A kitchen's own self-service settings -- currently just
 * complete_cap_hours (how long the customer tracker's "time in Complete"
 * counter runs before capping, absent an explicit "Order Picked Up" click).
 * Keyed by restaurant NAME (not id) since the Kitchen Dashboard only ever
 * carries its own restaurant's name string, not its DB id -- matches
 * /api/orders/restaurant/[restaurantName]'s existing name-keyed pattern
 * rather than plumbing an id through several more layers of props.
 * Kitchen-authenticated for its OWN restaurant (or admin for any), unlike
 * every other restaurant-management route (rename/password/delete), which
 * are admin-only -- this one setting is deliberately self-service per the
 * "each kitchen has the ability to change" ask.
 */
export async function GET(request: Request, { params }: { params: Promise<{ restaurantName: string }> }) {
  const { restaurantName } = await params;

  const auth = await requireRestaurantOrAdmin(restaurantName);
  if (!auth.ok) return auth.response;

  await initDb();
  const result = await query<{ complete_cap_hours: number }>(
    "SELECT complete_cap_hours FROM restaurants WHERE LOWER(name) = LOWER($1) AND deleted_at IS NULL",
    [restaurantName],
  );
  if (result.rows.length === 0) {
    return errJson("RESTAURANT_NOT_FOUND", 404);
  }

  return NextResponse.json({ completeCapHours: result.rows[0].complete_cap_hours });
}

export async function PUT(request: Request, { params }: { params: Promise<{ restaurantName: string }> }) {
  const { restaurantName } = await params;
  logger.info(`PUT /api/restaurants/by-name/${restaurantName}/settings - request received`);

  const auth = await requireRestaurantOrAdmin(restaurantName);
  if (!auth.ok) return auth.response;

  await initDb();

  try {
    const body = await parseJsonBody(request);
    if (body === null) {
      return errJson("MALFORMED_JSON", 400);
    }
    const { completeCapHours: rawHours } = body as { completeCapHours?: unknown };

    if (typeof rawHours !== "number" || !Number.isFinite(rawHours) || rawHours < MIN_HOURS || rawHours > MAX_HOURS) {
      return errJson("INVALID_PICKUP_WINDOW", 400, `completeCapHours must be a number between ${MIN_HOURS} and ${MAX_HOURS}`);
    }

    const result = await query(
      "UPDATE restaurants SET complete_cap_hours = $1 WHERE LOWER(name) = LOWER($2) AND deleted_at IS NULL",
      [rawHours, restaurantName],
    );
    if (result.rowCount === 0) {
      return errJson("RESTAURANT_NOT_FOUND", 404);
    }

    logger.info(`PUT /api/restaurants/by-name/${restaurantName}/settings - complete_cap_hours set to ${rawHours}`);
    return NextResponse.json({ message: "Settings updated", completeCapHours: rawHours });
  } catch (err) {
    logger.error(`PUT /api/restaurants/by-name/${restaurantName}/settings - error processing request`, err);
    return errJson("INTERNAL_ERROR", 500);
  }
}
