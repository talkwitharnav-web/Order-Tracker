import { NextResponse } from "next/server";
import { query, initDb } from "@/lib/db";
import { logger } from "@/lib/logger";
import { requireRestaurantOrAdmin } from "@/lib/auth";
import { escapeLikePattern } from "@/lib/validate";

export async function GET(request: Request, { params }: { params: Promise<{ restaurantName: string }> }) {
  const { restaurantName } = await params;
  const { searchParams } = new URL(request.url);
  const status = searchParams.get("status");

  logger.info(
    `GET /api/orders/restaurant/${restaurantName}?status=${status || ""} - request received`,
  );

  const auth = await requireRestaurantOrAdmin(restaurantName);
  if (!auth.ok) return auth.response;

  try {
    await initDb();

    logger.info(
      `GET /api/orders/restaurant/${restaurantName} - fetching orders`,
    );

    let sql = `SELECT * FROM orders WHERE restaurant_name ILIKE $1`;
    const queryParams: any[] = [escapeLikePattern(restaurantName)];

    if (status && ["Received", "Making", "Finished"].includes(status)) {
      sql += ` AND status = $2`;
      queryParams.push(status);
    } else {
      const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
      sql += ` AND (status != 'Finished' OR (status = 'Finished' AND updated_at > $2))`;
      queryParams.push(fiveMinutesAgo);
    }

    sql += ` ORDER BY id DESC`;

    const result = await query(sql, queryParams);
    const orders = result.rows;

    console.log("Requested restaurant name:", restaurantName);
    console.log("Returned rows:", orders);

    logger.info(
      `GET /api/orders/restaurant/${restaurantName} - found ${orders.length} orders`,
    );
    return NextResponse.json(orders);
  } catch (err) {
    logger.error(
      `GET /api/orders/restaurant/${restaurantName} - error processing request`,
      err,
    );
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 },
    );
  }
}
