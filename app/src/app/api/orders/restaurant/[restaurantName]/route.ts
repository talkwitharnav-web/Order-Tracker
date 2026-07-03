import { NextResponse } from "next/server";
import { getDb, initDb } from "@/lib/db";
import { logger } from "@/lib/logger";

export async function GET(
  request: Request,
  { params }: { params: { restaurantName: string } },
) {
  const restaurantName = params.restaurantName;
  const { searchParams } = new URL(request.url);
  const status = searchParams.get("status");

  logger.info(
    `GET /api/orders/restaurant/${restaurantName}?status=${status || ""} - request received`,
  );

  try {
    await initDb();
    const db = await getDb();

    logger.info(
      `GET /api/orders/restaurant/${restaurantName} - fetching orders`,
    );

    let query = `SELECT * FROM orders WHERE restaurant_name = ?`;
    const queryParams: any[] = [restaurantName];

    if (status && ["Received", "Making", "Finished"].includes(status)) {
      query += ` AND status = ?`;
      queryParams.push(status);
    } else {
      const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
      query += ` AND (status != 'Finished' OR (status = 'Finished' AND updated_at > ?))`;
      queryParams.push(fiveMinutesAgo);
    }

    query += ` ORDER BY id DESC`;

    const orders = await db.all(query, ...queryParams);

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
