import { NextResponse } from "next/server";
import { getPool, initDb } from "@/lib/db";
import { logger } from "@/lib/logger";
import { requireAdmin } from "@/lib/auth";
import { requireSafeName, parseJsonBody } from "@/lib/validate";

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  logger.info(`PUT /api/restaurants/${id}/rename - request received`);

  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  if (!/^\d+$/.test(id)) {
    return NextResponse.json({ error: "Invalid restaurant id" }, { status: 400 });
  }

  await initDb();
  const client = await getPool().connect();

  try {
    const body = await parseJsonBody(request);
    if (body === null) {
      return NextResponse.json({ error: "Malformed JSON body" }, { status: 400 });
    }
    const { newName: rawNewName } = body as { newName?: unknown };
    const newName = requireSafeName(rawNewName);

    if (!newName) {
      return NextResponse.json(
        { error: "New name is required (letters, numbers, spaces, and basic punctuation only, max 200 chars)" },
        { status: 400 },
      );
    }

    const existingResult = await client.query<{ name: string }>(
      "SELECT name FROM restaurants WHERE id = $1 AND deleted_at IS NULL",
      [id],
    );
    const existing = existingResult.rows[0];
    if (!existing) {
      return NextResponse.json({ error: "Restaurant not found" }, { status: 404 });
    }

    const oldName = existing.name;

    // No-op rename (same name, different casing/whitespace only) -- still
    // worth allowing through cleanly rather than erroring on "already taken"
    // against itself.
    if (oldName.toLowerCase() === newName.toLowerCase()) {
      const result = await client.query(
        "UPDATE restaurants SET name = $1 WHERE id = $2 AND deleted_at IS NULL",
        [newName, id],
      );
      if (result.rowCount === 0) {
        return NextResponse.json({ error: "Restaurant not found" }, { status: 404 });
      }
      // Orders keep the old casing until touched again -- purely cosmetic
      // (ILIKE lookups are already case-insensitive), so no cascade needed
      // for a same-name-different-casing rename.
      return NextResponse.json({ message: "Restaurant renamed successfully", name: newName });
    }

    const clash = await client.query(
      "SELECT 1 FROM restaurants WHERE LOWER(name) = LOWER($1) AND id != $2 AND deleted_at IS NULL",
      [newName, id],
    );
    if (clash.rows.length > 0) {
      return NextResponse.json(
        { error: `A restaurant named "${newName}" already exists` },
        { status: 409 },
      );
    }

    await client.query("BEGIN");

    // orders.restaurant_name is a plain string column, not a foreign key
    // (see SYSTEM_MEMORY.md's status-vocab-style note on this being
    // denormalized) -- every order lookup (kitchen dashboard, customer
    // tracker, WS broadcast scoping) matches on this string, so renaming
    // the restaurant WITHOUT cascading here would silently orphan every
    // existing order under the old name. Cascade to both live and
    // soft-deleted orders so a later Undelete on an order still lines up
    // with the restaurant's current name.
    await client.query(
      "UPDATE orders SET restaurant_name = $1 WHERE LOWER(restaurant_name) = LOWER($2)",
      [newName, oldName],
    );

    const result = await client.query(
      "UPDATE restaurants SET name = $1 WHERE id = $2 AND deleted_at IS NULL",
      [newName, id],
    );

    await client.query("COMMIT");

    if (result.rowCount === 0) {
      return NextResponse.json({ error: "Restaurant not found" }, { status: 404 });
    }

    logger.info(`PUT /api/restaurants/${id}/rename - renamed "${oldName}" to "${newName}"`);
    // The kitchen's own session cookie (if logged in) stores the name at
    // login time and is compared against the current DB row on every
    // request (see requireRestaurantOrAdmin in lib/auth.ts) -- renaming
    // invalidates that comparison, so a currently-logged-in kitchen will
    // need to log back in under the new name. This is a real, honest side
    // effect of renaming a login identifier, not a bug to paper over.
    return NextResponse.json({
      message: "Restaurant renamed successfully",
      name: newName,
      note: "Any currently logged-in session for this kitchen will need to log back in under the new name.",
    });
  } catch (err) {
    await client.query("ROLLBACK");
    logger.error(`PUT /api/restaurants/${id}/rename - error processing request`, err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  } finally {
    client.release();
  }
}
