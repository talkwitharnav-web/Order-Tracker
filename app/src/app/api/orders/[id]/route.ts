import { NextResponse } from "next/server";
import { query, initDb } from "@/lib/db";
import { logger } from "@/lib/logger";
import { broadcast } from "@/lib/ws-hub";
import { requireRestaurantOrAdmin } from "@/lib/auth";

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  logger.info(`PUT /api/orders/${id} - request received`);

  try {
    await initDb();
    const { status } = await request.json();

    logger.info(`PUT /api/orders/${id} - updating status`, { status });

    const allowedStatuses = ["Received", "Preparing", "Complete"];

    if (
      typeof status !== "string" ||
      !allowedStatuses.map(s => s.toLowerCase()).includes(status.toLowerCase())
    ) {
      logger.warn(`PUT /api/orders/${id} - validation error: Invalid status "${status}"`);
      return NextResponse.json({ error: "Invalid status" }, { status: 400 });
    }

    const existing = await query<{ restaurant_name: string }>(
      "SELECT restaurant_name FROM orders WHERE id = $1",
      [id],
    );
    if (existing.rows.length === 0) {
      return NextResponse.json({ error: "Order not found" }, { status: 404 });
    }

    const auth = await requireRestaurantOrAdmin(existing.rows[0].restaurant_name);
    if (!auth.ok) return auth.response;

    const result = await query(
      "UPDATE orders SET status = $1, updated_at = NOW() WHERE id = $2",
      [status, id],
    );

    if (result.rowCount === 0) {
      logger.warn(`PUT /api/orders/${id} - order not found`);
      return NextResponse.json({ error: "Order not found" }, { status: 404 });
    }

    logger.info(`PUT /api/orders/${id} - status updated successfully`);

    broadcast({ type: "order_updated", payload: { id, status } });

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

    const existing = await query<{ restaurant_name: string }>(
      "SELECT restaurant_name FROM orders WHERE id = $1",
      [id],
    );
    if (existing.rows.length === 0) {
      return NextResponse.json({ error: "Order not found" }, { status: 404 });
    }

    const auth = await requireRestaurantOrAdmin(existing.rows[0].restaurant_name);
    if (!auth.ok) return auth.response;

    logger.info(`DELETE /api/orders/${id} - deleting order`);

    const result = await query("DELETE FROM orders WHERE id = $1", [id]);

    if (result.rowCount === 0) {
      logger.warn(`DELETE /api/orders/${id} - order not found`);
      return NextResponse.json({ error: "Order not found" }, { status: 404 });
    }

    logger.info(`DELETE /api/orders/${id} - order deleted successfully`);

    broadcast({ type: "order_deleted", payload: { id: Number(id) } });

    return NextResponse.json({ message: "Order deleted successfully" });
  } catch (err) {
    logger.error(`DELETE /api/orders/${id} - error processing request`, err);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 },
    );
  }
}
