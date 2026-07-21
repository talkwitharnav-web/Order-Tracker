import { NextResponse } from "next/server";
import { query, initDb } from "@/lib/db";
import { logger } from "@/lib/logger";
import { requireAdmin } from "@/lib/auth";
import { parseJsonBody } from "@/lib/validate";
import { errJson, plainJson } from "@/lib/error-response";
import bcrypt from "bcrypt";

const SALT_ROUNDS = 10;

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  logger.info(`PUT /api/restaurants/${id}/password - request received`);

  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  if (!/^\d+$/.test(id)) {
    return plainJson("Invalid restaurant id", 400);
  }

  try {
    await initDb();
    const body = await parseJsonBody(req);
    if (body === null) {
      return plainJson("Malformed JSON body", 400);
    }
    const { newPassword: rawNewPassword } = body as { newPassword?: unknown };
    // Null-byte check: this value is inserted raw into raw_password (a
    // Postgres text column, which cannot store \0 at all) -- see the
    // identical note in restaurants/register/route.ts.
    const newPassword =
      typeof rawNewPassword === "string" &&
      rawNewPassword.length > 0 &&
      rawNewPassword.length <= 200 &&
      !rawNewPassword.includes("\0")
        ? rawNewPassword
        : null;

    if (!newPassword) {
      return plainJson("New password is required (non-empty string, max 200 chars)", 400);
    }

    const hashedPassword = await bcrypt.hash(newPassword, SALT_ROUNDS);

    const result = await query(
      "UPDATE restaurants SET password = $1, raw_password = $2 WHERE id = $3",
      [hashedPassword, newPassword, id],
    );

    if (result.rowCount === 0) {
        return errJson("RESTAURANT_NOT_FOUND", 404);
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
    return errJson("INTERNAL_ERROR", 500);
  }
}
