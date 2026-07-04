import { NextResponse } from "next/server";
import { getDb, initDb } from "@/lib/db";
import { logger } from "@/lib/logger";
import bcrypt from "bcrypt";

const SALT_ROUNDS = 10;

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  logger.info(`PUT /api/restaurants/${id}/password - request received`);
  try {
    await initDb();
    const { newPassword } = await req.json();

    if (!newPassword) {
      return NextResponse.json(
        { error: "New password is required" },
        { status: 400 },
      );
    }

    const db = await getDb();
    const hashedPassword = await bcrypt.hash(newPassword, SALT_ROUNDS);

    const stmt = await db.prepare(
      "UPDATE restaurants SET password = ?, raw_password = ? WHERE id = ?",
    );
    const result = await stmt.run(hashedPassword, newPassword, id);
    await stmt.finalize();

    if (result.changes === 0) {
        return NextResponse.json(
            { error: "Restaurant not found" },
            { status: 404 },
        );
    }

    logger.info(
      `PUT /api/restaurants/${id}/password - password for restaurant ${id} updated successfully`,
    );
    return NextResponse.json(
      { message: "Password updated successfully" },
      { status: 200 },
    );
  } catch (err) {
    logger.error(
      `PUT /api/restaurants/${id}/password - error processing request`,
      err,
    );
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 },
    );
  }
}
