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

    const originalName = isEncryptedForStorage(row.name) ? decryptFromStorage(row.name) : row.name;

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

    await client.query("COMMIT");

    if (updateResult.rowCount === 0) {
      return NextResponse.json({ error: "Deleted restaurant not found" }, { status: 404 });
    }

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
