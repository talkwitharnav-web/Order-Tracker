import { NextResponse } from 'next/server';
import { getDb, initDb } from '@/lib/db';
import { logger } from '@/lib/logger';

export async function GET(request: Request, { params }: { params: { restaurantName: string } }) {
  const restaurantName = params.restaurantName;
  logger.info(`GET /api/orders/restaurant/${restaurantName} - request received`);

  try {
    await initDb();
    const db = await getDb();
    
    logger.info(`GET /api/orders/restaurant/${restaurantName} - fetching orders`);

    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();

    const orders = await db.all(
      `SELECT * FROM orders 
       WHERE restaurant_name = ? 
       AND (status != 'Complete' OR (status = 'Complete' AND updated_at > ?))
       ORDER BY id DESC`,
      restaurantName,
      fiveMinutesAgo
    );

    logger.info(`GET /api/orders/restaurant/${restaurantName} - found ${orders.length} orders`);
    return NextResponse.json(orders);
  } catch (err) {
    logger.error(`GET /api/orders/restaurant/${restaurantName} - error processing request`, err);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
