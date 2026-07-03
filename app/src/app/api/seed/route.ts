import { NextResponse } from 'next/server';
import { getDb, initDb } from '@/lib/db';
import { logger } from '@/lib/logger';

export async function GET() {
  logger.info('GET /api/seed - request received');
  try {
    await initDb();
    const db = await getDb();

    logger.info('GET /api/seed - clearing orders table');
    await db.exec('DELETE FROM orders');
    // Reset the auto-increment counter
    await db.exec("DELETE FROM sqlite_sequence WHERE name='orders'");


    logger.info('GET /api/seed - seeding database with sample orders');
    const orders = [
      {
        order_number: '101',
        restaurant_name: 'Burger Joint',
        status: 'Preparing',
      },
      {
        order_number: '202',
        restaurant_name: 'Taco Stand',
        status: 'Received',
      },
      {
        order_number: '303',
        restaurant_name: 'Pizza Place',
        status: 'Complete',
      },
    ];

    const stmt = await db.prepare(
      'INSERT INTO orders (order_number, restaurant_name, status) VALUES (?, ?, ?)'
    );

    for (const order of orders) {
      await stmt.run(order.order_number, order.restaurant_name, order.status);
    }

    await stmt.finalize();

    logger.info('GET /api/seed - database seeded successfully');
    return NextResponse.json({ message: 'Database seeded successfully' });

  } catch (err) {
    logger.error('GET /api/seed - error processing request', err);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
