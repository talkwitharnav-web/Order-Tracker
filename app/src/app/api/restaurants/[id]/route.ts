import { NextResponse } from "next/server";
import { getPool, initDb } from "@/lib/db";
import { logger } from "@/lib/logger";
import { requireAdmin } from "@/lib/auth";
import { encryptForStorage } from "@/lib/crypto";

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  logger.info(`DELETE /api/restaurants/${id} - request received`);

  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  if (!/^\d+$/.test(id)) {
    return NextResponse.json({ error: "Invalid restaurant id" }, { status: 400 });
  }

  await initDb();
  const client = await getPool().connect();

  try {
    const restaurantResult = await client.query(
      "SELECT name FROM restaurants WHERE id = $1 AND deleted_at IS NULL",
      [id],
    );
    const restaurant = restaurantResult.rows[0];

    if (!restaurant) {
      logger.warn(`DELETE /api/restaurants/${id} - restaurant not found`);
      return NextResponse.json(
        { error: "Restaurant not found" },
        { status: 404 }
      );
    }

    const restaurantName = restaurant.name;

    await client.query("BEGIN");

    // Soft-delete only -- nothing here is a real DELETE. Orders keep their
    // plaintext restaurant_name (they're already hidden from every normal
    // view via deleted_at) and are just marked deleted, same as the
    // single-order DELETE route. The restaurant's own name is encrypted
    // in-place (see lib/crypto.ts) specifically so the UNIQUE index on
    // LOWER(name) no longer sees this row's name as "taken" -- a new
    // restaurant can register under the exact same name immediately. Only
    // the admin Purge action ever issues a real DELETE.
    logger.info(`DELETE /api/restaurants/${id} - soft-deleting orders for restaurant: ${restaurantName}`);
    await client.query(
      "UPDATE orders SET deleted_at = NOW() WHERE restaurant_name = $1 AND deleted_at IS NULL",
      [restaurantName],
    );

    logger.info(`DELETE /api/restaurants/${id} - soft-deleting restaurant`);
    const encryptedName = encryptForStorage(restaurantName);
    const result = await client.query(
      "UPDATE restaurants SET name = $1, deleted_at = NOW() WHERE id = $2 AND deleted_at IS NULL",
      [encryptedName, id],
    );

    await client.query("COMMIT");

    if (result.rowCount === 0) {
      logger.warn(`DELETE /api/restaurants/${id} - restaurant not found during deletion`);
      return NextResponse.json(
        { error: "Restaurant not found" },
        { status: 404 }
      );
    }

    logger.info(`DELETE /api/restaurants/${id} - restaurant and associated orders soft-deleted successfully`);
    return NextResponse.json({ message: "Restaurant deleted successfully" });
  } catch (err) {
    await client.query("ROLLBACK");
    logger.error(
      `DELETE /api/restaurants/${id} - error processing request`,
      err
    );
    return NextResponse.json(
      { error: "Failed to delete restaurant and associated orders." },
      { status: 500 }
    );
  } finally {
    client.release();
  }
}
