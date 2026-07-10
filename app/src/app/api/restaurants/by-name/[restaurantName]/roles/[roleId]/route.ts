import { NextResponse } from "next/server";
import { query, initDb } from "@/lib/db";
import { logger } from "@/lib/logger";
import { requireRestaurantOrAdmin } from "@/lib/auth";
import { requireString, parseJsonBody } from "@/lib/validate";

function parseRoleId(id: string): number | null {
  if (!/^\d+$/.test(id)) return null;
  const n = Number(id);
  return Number.isSafeInteger(n) ? n : null;
}

/** Rename a role. Body: { name: string }. */
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ restaurantName: string; roleId: string }> },
) {
  const { restaurantName, roleId: rawId } = await params;
  const roleId = parseRoleId(rawId);
  if (roleId === null) {
    return NextResponse.json({ error: "Invalid role id" }, { status: 400 });
  }

  const auth = await requireRestaurantOrAdmin(restaurantName);
  if (!auth.ok) return auth.response;

  await initDb();

  try {
    const body = await parseJsonBody(request);
    if (body === null) {
      return NextResponse.json({ error: "Malformed JSON body" }, { status: 400 });
    }
    const { name: rawName } = body as { name?: unknown };
    const name = requireString(rawName, 50);
    if (!name) {
      return NextResponse.json({ error: "Role name cannot be empty" }, { status: 400 });
    }

    const result = await query(
      `UPDATE restaurant_roles SET name = $1
       WHERE id = $2
         AND restaurant_id = (SELECT id FROM restaurants WHERE LOWER(name) = LOWER($3) AND deleted_at IS NULL)`,
      [name, roleId, restaurantName],
    );

    if (result.rowCount === 0) {
      return NextResponse.json({ error: "Role not found" }, { status: 404 });
    }

    logger.info(`PUT /api/restaurants/by-name/${restaurantName}/roles/${roleId} - renamed to "${name}"`);
    return NextResponse.json({ message: "Role renamed" });
  } catch (err) {
    if (
      err instanceof Error &&
      "code" in err &&
      (err as { code?: string }).code === "23505"
    ) {
      return NextResponse.json({ error: "A role with this name already exists" }, { status: 409 });
    }
    logger.error(`PUT /api/restaurants/by-name/${restaurantName}/roles/${roleId} - error processing request`, err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

/**
 * Deletes a role outright (not soft-deleted -- roles are just labels, not
 * accountable entities like employees, so there's no audit-trail reason to
 * keep a deleted one around). Any employee referencing it falls back to no
 * role label (role_id ON DELETE SET NULL), not an error.
 */
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ restaurantName: string; roleId: string }> },
) {
  const { restaurantName, roleId: rawId } = await params;
  const roleId = parseRoleId(rawId);
  if (roleId === null) {
    return NextResponse.json({ error: "Invalid role id" }, { status: 400 });
  }

  const auth = await requireRestaurantOrAdmin(restaurantName);
  if (!auth.ok) return auth.response;

  await initDb();

  const result = await query(
    `DELETE FROM restaurant_roles
     WHERE id = $1
       AND restaurant_id = (SELECT id FROM restaurants WHERE LOWER(name) = LOWER($2) AND deleted_at IS NULL)`,
    [roleId, restaurantName],
  );

  if (result.rowCount === 0) {
    return NextResponse.json({ error: "Role not found" }, { status: 404 });
  }

  logger.info(`DELETE /api/restaurants/by-name/${restaurantName}/roles/${roleId} - deleted`);
  return NextResponse.json({ message: "Role deleted" });
}
