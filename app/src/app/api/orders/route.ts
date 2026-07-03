import { NextResponse } from 'next/server';
import { getDb, initDb } from '@/lib/db';
import { logger } from '@/lib/logger';

export async function POST(request: Request) {
  logger.info('POST /api/orders - request received');
  try {
    await initDb();
    const db = await getDb();
    const { restaurant_name, order_number } = await request.json();

    if (!restaurant_name || !order_number) {
      logger.warn('POST /api/orders - validation error', { restaurant_name, order_number });
      return NextResponse.json({ error: 'restaurant_name and order_number are required' }, { status: 400 });
    }

    const result = await db.run(
      'INSERT INTO orders (restaurant_name, order_number) VALUES (?, ?)',
      restaurant_name,
      order_number
    );
    
    logger.info('POST /api/orders - order created successfully', { orderId: result.lastID });
    return NextResponse.json({ id: result.lastID, restaurant_name, order_number, status: 'Received' });
  } catch (err) {
    logger.error('POST /api/orders - error processing request', err);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

export async function GET(request: Request) {
  logger.info('GET /api/orders - request received');
  try {
    await initDb();
    const db = await getDb();
    const { searchParams } = new URL(request.url);
    const restaurant_name = searchParams.get('restaurant_name');
    const order_number = searchParams.get('order_number');

    logger.info('GET /api/orders - tracking order', { restaurant_name, order_number });

    if (!restaurant_name || !order_number) {
      logger.warn('GET /api/orders - validation error', { restaurant_name, order_number });
      return NextResponse.json({ error: 'restaurant_name and order_number are required' }, { status: 400 });
    }

    const order = await db.get(
      'SELECT * FROM orders WHERE restaurant_name = ? AND order_number = ?',
      restaurant_name,
      order_number
    );

    if (!order) {
      logger.warn('GET /api/orders - order not found', { restaurant_name, order_number });
      return NextResponse.json({ error: 'Order not found' }, { status: 404 });
    }

    logger.info('GET /api/orders - order found', { order });
    return NextResponse.json(order);
  } catch (err) {
    logger.error('GET /api/orders - error processing request', err);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
