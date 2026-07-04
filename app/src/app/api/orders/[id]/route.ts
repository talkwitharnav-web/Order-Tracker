import { NextResponse } from "next/server";
import { getDb, initDb } from "@/lib/db";
import { logger } from "@/lib/logger";

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  logger.info(`PUT /api/orders/${id} - request received`);

  try {
    await initDb();
    const db = await getDb();
    const { status } = await request.json();

    logger.info(`PUT /api/orders/${id} - updating status`, { status });

    const allowedStatuses = ["Received", "Preparing", "Complete"];
    const incomingStatusLower = status.toLowerCase();

    if (!status || !allowedStatuses.map(s => s.toLowerCase()).includes(incomingStatusLower)) {
      logger.warn(`PUT /api/orders/${id} - validation error: Invalid status "${status}"`);
      return NextResponse.json({ error: "Invalid status" }, { status: 400 });
    }

    const result = await db.run(
      "UPDATE orders SET status = ?, updated_at = STRFTIME('%Y-%m-%d %H:%M:%f', 'now') WHERE id = ?",
      status,
      id,
    );

    if (result.changes === 0) {
      logger.warn(`PUT /api/orders/${id} - order not found`);
      return NextResponse.json({ error: "Order not found" }, { status: 404 });
    }

    logger.info(`PUT /api/orders/${id} - status updated successfully`);
    return NextResponse.json({ id, status });
  } catch (err) {
    logger.error(`PUT /api/orders/${id} - error processing request`, err);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 },
    );
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  logger.info(`DELETE /api/orders/${id} - request received`);

  try {
    await initDb();
    const db = await getDb();

    logger.info(`DELETE /api/orders/${id} - deleting order`);

    const result = await db.run("DELETE FROM orders WHERE id = ?", id);

    if (result.changes === 0) {
      logger.warn(`DELETE /api/orders/${id} - order not found`);
      return NextResponse.json({ error: "Order not found" }, { status: 404 });
    }

    logger.info(`DELETE /api/orders/${id} - order deleted successfully`);
    return NextResponse.json({ message: "Order deleted successfully" });
  } catch (err) {
    logger.error(`DELETE /api/orders/${id} - error processing request`, err);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 },
    );
  }
}
