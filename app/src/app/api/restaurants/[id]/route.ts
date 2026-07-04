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

  await initDb();
  const client = await getPool().connect();

  try {
    const restaurantResult = await client.query(
      "SELECT name FROM restaurants WHERE id = $1",
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

    logger.info(`DELETE /api/restaurants/${id} - deleting orders for restaurant: ${restaurantName}`);
    await client.query("DELETE FROM orders WHERE restaurant_name = $1", [restaurantName]);

    logger.info(`DELETE /api/restaurants/${id} - deleting restaurant`);
    const result = await client.query("DELETE FROM restaurants WHERE id = $1", [id]);

    await client.query("COMMIT");

    if (result.rowCount === 0) {
      logger.warn(`DELETE /api/restaurants/${id} - restaurant not found during deletion`);
      return NextResponse.json(
        { error: "Restaurant not found" },
        { status: 404 }
      );
    }

    logger.info(`DELETE /api/restaurants/${id} - restaurant and associated orders deleted successfully`);
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
