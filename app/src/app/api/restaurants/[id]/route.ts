import { NextResponse } from "next/server";
import { getDb, initDb } from "@/lib/db";
import { logger } from "@/lib/logger";

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  logger.info(`DELETE /api/restaurants/${id} - request received`);

  try {
    await initDb();
    const db = await getDb();

    // First, get the restaurant's name
    const restaurant = await db.get("SELECT name FROM restaurants WHERE id = ?", id);

    if (!restaurant) {
      logger.warn(`DELETE /api/restaurants/${id} - restaurant not found`);
      return NextResponse.json(
        { error: "Restaurant not found" },
        { status: 404 }
      );
    }

    const restaurantName = restaurant.name;

    // Begin transaction
    await db.exec("BEGIN TRANSACTION");

    // Delete associated orders
    logger.info(`DELETE /api/restaurants/${id} - deleting orders for restaurant: ${restaurantName}`);
    await db.run("DELETE FROM orders WHERE restaurant_name = ?", restaurantName);

    // Delete the restaurant
    logger.info(`DELETE /api/restaurants/${id} - deleting restaurant`);
    const result = await db.run("DELETE FROM restaurants WHERE id = ?", id);

    // Commit transaction
    await db.exec("COMMIT");

    if (result.changes === 0) {
      // This case should theoretically not be reached if the initial check passes, but it's good practice.
      logger.warn(`DELETE /api/restaurants/${id} - restaurant not found during deletion`);
      return NextResponse.json(
        { error: "Restaurant not found" },
        { status: 404 }
      );
    }

    logger.info(`DELETE /api/restaurants/${id} - restaurant and associated orders deleted successfully`);
    return NextResponse.json({ message: "Restaurant deleted successfully" });
  } catch (err) {
    const db = await getDb();
    await db.exec("ROLLBACK"); // Rollback on error
    logger.error(
      `DELETE /api/restaurants/${id} - error processing request`,
      err
    );
    return NextResponse.json(
      { error: "Failed to delete restaurant and associated orders." },
      { status: 500 }
    );
  }
}
