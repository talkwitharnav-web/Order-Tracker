import { NextResponse } from "next/server";
import { query, initDb } from "@/lib/db";
import { logger } from "@/lib/logger";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";

function parseOrderId(id: string): number | null {
  if (!/^\d+$/.test(id)) return null;
  const n = Number(id);
  return Number.isSafeInteger(n) ? n : null;
}

/**
 * Customer-facing "Order Picked Up" button on the tracker page. Deliberately
 * NO auth beyond the order id itself, since it only lets a caller stop a
 * display-only Complete-duration counter early -- it can't change the
 * order's real status, reveal anything, or affect any other order. Unlike
 * GET /api/orders/search (which requires knowing BOTH a restaurant name and
 * order number), this route only requires a raw numeric id, which is
 * sequential and guessable -- so it's rate-limited the same as every other
 * anonymous endpoint to stop fast enumeration, even though a successful
 * guess here still can't do anything worse than silence one countdown early.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  logger.info(`POST /api/orders/${id}/acknowledge - request received`);

  if (!checkRateLimit(`orders-acknowledge:${getClientIp(request)}`, { windowMs: 60_000, maxAttempts: 120 })) {
    return NextResponse.json({ error: "Too many requests. Slow down a moment." }, { status: 429 });
  }

  const orderId = parseOrderId(id);
  if (orderId === null) {
    return NextResponse.json({ error: "Invalid order id" }, { status: 400 });
  }

  try {
    await initDb();

    // Only meaningful for an order that has actually reached Complete --
    // acknowledging one still in Received/Preparing would just silently
    // set a value nothing reads yet, and acknowledging an already-
    // acknowledged one is a harmless no-op (first click wins).
    const result = await query(
      `UPDATE orders
       SET acknowledged_at = COALESCE(acknowledged_at, NOW())
       WHERE id = $1 AND deleted_at IS NULL AND complete_at IS NOT NULL
       RETURNING id`,
      [orderId],
    );

    if (result.rowCount === 0) {
      return NextResponse.json(
        { error: "Order not found, not yet complete, or has been deleted" },
        { status: 404 },
      );
    }

    logger.info(`POST /api/orders/${orderId}/acknowledge - acknowledged`);
    return NextResponse.json({ message: "Order acknowledged" });
  } catch (err) {
    logger.error(`POST /api/orders/${id}/acknowledge - error processing request`, err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
