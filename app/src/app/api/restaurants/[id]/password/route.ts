import { NextResponse } from "next/server";
import { query, initDb } from "@/lib/db";
import { logger } from "@/lib/logger";
import { requireAdmin } from "@/lib/auth";
import bcrypt from "bcrypt";

const SALT_ROUNDS = 10;

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  logger.info(`PUT /api/restaurants/${id}/password - request received`);

  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  if (!/^\d+$/.test(id)) {
    return NextResponse.json({ error: "Invalid restaurant id" }, { status: 400 });
  }

  try {
    await initDb();
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "Malformed JSON body" }, { status: 400 });
    }
    const { newPassword: rawNewPassword } = body as { newPassword?: unknown };
    const newPassword =
      typeof rawNewPassword === "string" && rawNewPassword.length > 0 && rawNewPassword.length <= 200
        ? rawNewPassword
        : null;

    if (!newPassword) {
      return NextResponse.json(
        { error: "New password is required (non-empty string, max 200 chars)" },
        { status: 400 },
      );
    }

    const hashedPassword = await bcrypt.hash(newPassword, SALT_ROUNDS);

    const result = await query(
      "UPDATE restaurants SET password = $1, raw_password = $2 WHERE id = $3",
      [hashedPassword, newPassword, id],
    );

    if (result.rowCount === 0) {
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
