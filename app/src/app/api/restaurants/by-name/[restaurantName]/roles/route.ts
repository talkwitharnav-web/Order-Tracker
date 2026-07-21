import { NextResponse } from "next/server";
import { query, initDb } from "@/lib/db";
import { logger } from "@/lib/logger";
import { requireRestaurantOrAdmin } from "@/lib/auth";
import { requireString, parseJsonBody } from "@/lib/validate";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";
import { errJson, plainJson } from "@/lib/error-response";

/**
 * Kitchen-defined role labels ("Chef", "Cashier", "Dishwasher", ...) --
 * purely cosmetic/organizational, assignable to any employee regardless of
 * their manager/employee account_type. See SYSTEM_MEMORY.md "Employee
 * Attribution".
 */

type RoleRow = { id: number; name: string; created_at: string };

async function getRestaurantId(restaurantName: string): Promise<number | null> {
  const result = await query<{ id: number }>(
    "SELECT id FROM restaurants WHERE LOWER(name) = LOWER($1) AND deleted_at IS NULL",
    [restaurantName],
  );
  return result.rows[0]?.id ?? null;
}

export async function GET(request: Request, { params }: { params: Promise<{ restaurantName: string }> }) {
  const { restaurantName } = await params;

  const auth = await requireRestaurantOrAdmin(restaurantName);
  if (!auth.ok) return auth.response;

  await initDb();
  const restaurantId = await getRestaurantId(restaurantName);
  if (restaurantId === null) {
    return errJson("RESTAURANT_NOT_FOUND", 404);
  }

  const result = await query<RoleRow>(
    "SELECT id, name, created_at FROM restaurant_roles WHERE restaurant_id = $1 ORDER BY name ASC",
    [restaurantId],
  );
  return NextResponse.json({ roles: result.rows });
}

export async function POST(request: Request, { params }: { params: Promise<{ restaurantName: string }> }) {
  const { restaurantName } = await params;
  logger.info(`POST /api/restaurants/by-name/${restaurantName}/roles - request received`);

  const auth = await requireRestaurantOrAdmin(restaurantName);
  if (!auth.ok) return auth.response;

  if (!checkRateLimit(`role-create:${restaurantName}:${getClientIp(request)}`, { windowMs: 60_000, maxAttempts: 20 })) {
    return errJson("RATE_LIMITED_STAFF", 429);
  }

  await initDb();
  const restaurantId = await getRestaurantId(restaurantName);
  if (restaurantId === null) {
    return errJson("RESTAURANT_NOT_FOUND", 404);
  }

  try {
    const body = await parseJsonBody(request);
    if (body === null) {
      return plainJson("Malformed JSON body", 400);
    }
    const { name: rawName } = body as { name?: unknown };
    const name = requireString(rawName, 50);
    if (!name) {
      return plainJson("Role name is required", 400);
    }

    try {
      const result = await query<RoleRow>(
        "INSERT INTO restaurant_roles (restaurant_id, name) VALUES ($1, $2) RETURNING id, name, created_at",
        [restaurantId, name],
      );
      logger.info(`POST /api/restaurants/by-name/${restaurantName}/roles - role "${name}" created`);
      return NextResponse.json({ role: result.rows[0] }, { status: 201 });
    } catch (insertErr) {
      if (
        insertErr instanceof Error &&
        "code" in insertErr &&
        (insertErr as { code?: string }).code === "23505"
      ) {
        return errJson("ROLE_NAME_ALREADY_EXISTS", 409);
      }
      throw insertErr;
    }
  } catch (err) {
    logger.error(`POST /api/restaurants/by-name/${restaurantName}/roles - error processing request`, err);
    return errJson("INTERNAL_ERROR", 500);
  }
}
