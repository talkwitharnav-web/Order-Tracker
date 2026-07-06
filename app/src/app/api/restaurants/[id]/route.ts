import { NextResponse } from "next/server";
import { getPool, initDb } from "@/lib/db";
import { logger } from "@/lib/logger";
import { requireAdmin } from "@/lib/auth";

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

    // Real, permanent delete -- this route is admin-only (requireAdmin
    // above; kitchens have no way to delete a restaurant, only their own
    // orders via orders/[id], which still soft-deletes). An admin choosing
    // to delete a specific restaurant means it's actually gone, matching
    // the Purge button's semantics rather than the soft-delete/undelete
    // system orders and kitchen-initiated deletes still use.
    logger.info(`DELETE /api/restaurants/${id} - deleting orders for restaurant: ${restaurantName}`);
    await client.query(
      "DELETE FROM orders WHERE restaurant_name ILIKE $1",
      [restaurantName],
    );

    logger.info(`DELETE /api/restaurants/${id} - deleting restaurant`);
    const result = await client.query(
      "DELETE FROM restaurants WHERE id = $1",
      [id],
    );

    await client.query("COMMIT");

    if (result.rowCount === 0) {
      logger.warn(`DELETE /api/restaurants/${id} - restaurant not found during deletion`);
      return NextResponse.json(
        { error: "Restaurant not found" },
        { status: 404 }
      );
    }

    logger.info(`DELETE /api/restaurants/${id} - restaurant and associated orders permanently deleted`);
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
