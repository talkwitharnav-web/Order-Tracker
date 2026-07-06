import { NextResponse } from "next/server";
import { getPool, initDb } from "@/lib/db";
import { logger } from "@/lib/logger";
import { requireAdmin } from "@/lib/auth";
import { decryptFromStorage, isEncryptedForStorage } from "@/lib/crypto";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  logger.info(`POST /api/restaurants/${id}/undelete - request received`);

  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  if (!/^\d+$/.test(id)) {
    return NextResponse.json({ error: "Invalid restaurant id" }, { status: 400 });
  }

  await initDb();
  const client = await getPool().connect();

  try {
    const result = await client.query<{ name: string }>(
      "SELECT name FROM restaurants WHERE id = $1 AND deleted_at IS NOT NULL",
      [id],
    );
    const row = result.rows[0];
    if (!row) {
      return NextResponse.json({ error: "Deleted restaurant not found" }, { status: 404 });
    }

    const decryptedName = isEncryptedForStorage(row.name) ? decryptFromStorage(row.name) : row.name;
    // If this restaurant was already restored once before (then deleted
    // again), its stored name already carries a "-restored"/"-restoredN"
    // suffix from the previous undelete -- strip that back off first so the
    // suffix logic below works from the true base name every time, instead
    // of stacking a second suffix onto the first (the bug that produced
    // "X-restored-restored" instead of "X-restored2").
    const originalName = decryptedName.replace(/-restored\d*$/, "");

    await client.query("BEGIN");

    // The original name may already be taken again by a live restaurant
    // registered after this one was deleted -- suffix with "-restored", or
    // "-restored2", "-restored3", etc. if that's ALSO already taken (e.g.
    // this restaurant has been deleted/restored more than once, or several
    // deleted restaurants shared the same original name).
    let candidateName = `${originalName}-restored`;
    let suffixNumber = 2;
    for (;;) {
      const clash = await client.query(
        "SELECT 1 FROM restaurants WHERE LOWER(name) = LOWER($1) AND deleted_at IS NULL",
        [candidateName],
      );
      if (clash.rows.length === 0) break;
      candidateName = `${originalName}-restored${suffixNumber}`;
      suffixNumber += 1;
    }

    const updateResult = await client.query(
      "UPDATE restaurants SET name = $1, deleted_at = NULL WHERE id = $2 AND deleted_at IS NOT NULL",
      [candidateName, id],
    );

    if (updateResult.rowCount === 0) {
      await client.query("ROLLBACK");
      return NextResponse.json({ error: "Deleted restaurant not found" }, { status: 404 });
    }

    // The restaurant DELETE route soft-deletes its orders alongside it
    // (keeping their plaintext restaurant_name exactly as it was at the
    // moment of deletion, per the restaurant-delete design), but undelete
    // never restored them back -- they stayed deleted_at-set forever,
    // orphaned under that name, even after the restaurant itself came back.
    // Restore them here too. Match on `decryptedName` (the name as stored
    // right before this undelete, i.e. exactly what the orders were
    // cascade-deleted under), NOT the suffix-stripped `originalName` --
    // if this restaurant had been renamed (via the Rename feature) at any
    // point before this particular delete, its orders carry THAT name, not
    // the very first name it ever had.
    await client.query(
      "UPDATE orders SET restaurant_name = $1, deleted_at = NULL WHERE LOWER(restaurant_name) = LOWER($2) AND deleted_at IS NOT NULL",
      [candidateName, decryptedName],
    );

    await client.query("COMMIT");

    logger.info(`POST /api/restaurants/${id}/undelete - restored as "${candidateName}"`);
    return NextResponse.json({ message: "Restaurant restored successfully", name: candidateName });
  } catch (err) {
    await client.query("ROLLBACK");
    logger.error(`POST /api/restaurants/${id}/undelete - error processing request`, err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  } finally {
    client.release();
  }
}
