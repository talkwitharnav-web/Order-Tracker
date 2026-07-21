import { NextResponse } from "next/server";
import bcrypt from "bcrypt";
import { query, initDb } from "@/lib/db";
import { logger } from "@/lib/logger";
import { requireRestaurantOrAdmin } from "@/lib/auth";
import { requireString, parseJsonBody } from "@/lib/validate";
import { requiredPinLength, pinCollidesWithAnotherEmployee } from "@/lib/employee-auth";
import { errJson, plainJson } from "@/lib/error-response";

const SALT_ROUNDS = 10;

function parseEmployeeId(id: string): number | null {
  if (!/^\d+$/.test(id)) return null;
  const n = Number(id);
  return Number.isSafeInteger(n) ? n : null;
}

async function getRestaurantId(restaurantName: string): Promise<number | null> {
  const result = await query<{ id: number }>(
    "SELECT id FROM restaurants WHERE LOWER(name) = LOWER($1) AND deleted_at IS NULL",
    [restaurantName],
  );
  return result.rows[0]?.id ?? null;
}

/** Deactivate (soft-delete) an employee -- same recoverable pattern as kitchen order delete. */
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ restaurantName: string; employeeId: string }> },
) {
  const { restaurantName, employeeId: rawId } = await params;
  const employeeId = parseEmployeeId(rawId);
  if (employeeId === null) {
    return plainJson("Invalid employee id", 400);
  }

  const auth = await requireRestaurantOrAdmin(restaurantName);
  if (!auth.ok) return auth.response;

  await initDb();

  // Scoped by restaurant NAME via a join, not just employeeId -- otherwise
  // an authenticated kitchen could deactivate another restaurant's employee
  // by guessing/incrementing a numeric id.
  const result = await query(
    `UPDATE restaurant_employees SET deleted_at = NOW()
     WHERE id = $1 AND deleted_at IS NULL
       AND restaurant_id = (SELECT id FROM restaurants WHERE LOWER(name) = LOWER($2) AND deleted_at IS NULL)`,
    [employeeId, restaurantName],
  );

  if (result.rowCount === 0) {
    return errJson("EMPLOYEE_NOT_FOUND", 404);
  }

  logger.info(`DELETE /api/restaurants/by-name/${restaurantName}/employees/${employeeId} - deactivated`);
  return NextResponse.json({ message: "Employee deactivated" });
}

/**
 * Edits an existing employee. All fields optional -- only what's supplied
 * is updated. Body: { name?, accountType?, roleId?|null, pin?, pinLength? }.
 * pin/pinLength must be supplied together (changing the PIN also fixes its
 * length; supplying pinLength alone without a new pin would desync the
 * stored length from the actual hashed PIN's real length).
 */
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ restaurantName: string; employeeId: string }> },
) {
  const { restaurantName, employeeId: rawId } = await params;
  const employeeId = parseEmployeeId(rawId);
  if (employeeId === null) {
    return plainJson("Invalid employee id", 400);
  }

  const auth = await requireRestaurantOrAdmin(restaurantName);
  if (!auth.ok) return auth.response;

  await initDb();
  const restaurantId = await getRestaurantId(restaurantName);
  if (restaurantId === null) {
    return errJson("RESTAURANT_NOT_FOUND", 404);
  }

  try {
    const body = await parseJsonBody(request);
    if (body === null) {
      return plainJson("Malformed JSON body", 400);
    }
    const { name: rawName, accountType: rawAccountType, roleId: rawRoleId, pin: rawPin } = body as {
      name?: unknown;
      accountType?: unknown;
      roleId?: unknown;
      pin?: unknown;
    };

    // Needed to enforce "managers must have a 6-digit PIN" against the
    // EFFECTIVE post-patch state, not just whatever this one request
    // happens to touch -- e.g. promoting employee->manager without also
    // resetting the PIN must be rejected if their existing PIN is only 4
    // digits, and resetting just the PIN (no accountType in this request)
    // must still use the row's current account_type to pick the required
    // length.
    const current = await query<{ account_type: "manager" | "employee"; pin_length: number }>(
      `SELECT account_type, pin_length FROM restaurant_employees re
       WHERE re.id = $1 AND re.deleted_at IS NULL
         AND re.restaurant_id = (SELECT id FROM restaurants WHERE LOWER(name) = LOWER($2) AND deleted_at IS NULL)`,
      [employeeId, restaurantName],
    );
    if (current.rows.length === 0) {
      return errJson("EMPLOYEE_NOT_FOUND", 404);
    }

    // Whitelisted column -> parameterized value. Every branch below either
    // pushes a validated value or returns a 400 -- there is no path where
    // raw user input reaches SQL text.
    const setClauses: string[] = [];
    const values: unknown[] = [];

    if (rawName !== undefined) {
      const name = requireString(rawName, 100);
      if (!name) return plainJson("Employee name cannot be empty", 400);
      values.push(name);
      setClauses.push(`name = $${values.length}`);
    }

    const effectiveAccountType: "manager" | "employee" =
      rawAccountType === "manager" ? "manager" : rawAccountType === "employee" ? "employee" : current.rows[0].account_type;

    if (rawAccountType !== undefined) {
      if (rawAccountType !== "manager" && rawAccountType !== "employee") {
        return plainJson("accountType must be 'manager' or 'employee'", 400);
      }
      values.push(rawAccountType);
      setClauses.push(`account_type = $${values.length}`);
    }

    if (rawRoleId !== undefined) {
      if (rawRoleId === null) {
        setClauses.push(`role_id = NULL`);
      } else {
        const roleId = typeof rawRoleId === "number" && Number.isSafeInteger(rawRoleId) ? rawRoleId : null;
        if (roleId === null) return plainJson("Invalid roleId", 400);
        const roleCheck = await query("SELECT 1 FROM restaurant_roles WHERE id = $1 AND restaurant_id = $2", [roleId, restaurantId]);
        if (roleCheck.rows.length === 0) {
          return errJson("ROLE_NOT_FOUND_FOR_KITCHEN", 404);
        }
        values.push(roleId);
        setClauses.push(`role_id = $${values.length}`);
      }
    }

    // PIN length is DERIVED from the effective account type, never accepted
    // from the client (see lib/employee-auth.ts requiredPinLength) -- same
    // reasoning as the create route.
    const effectivePinLength = requiredPinLength(effectiveAccountType);

    if (rawPin !== undefined) {
      const pin = typeof rawPin === "string" && new RegExp(`^\\d{${effectivePinLength}}$`).test(rawPin) ? rawPin : null;
      if (!pin) return plainJson(`PIN must be exactly ${effectivePinLength} digits`, 400);
      // Same collision guard as employee creation -- PIN-only lookup stays
      // unambiguous only if no two active employees share a same-length PIN.
      if (await pinCollidesWithAnotherEmployee(restaurantName, pin, effectivePinLength, employeeId)) {
        return errJson("PIN_ALREADY_IN_USE", 409);
      }
      const pinHash = await bcrypt.hash(pin, SALT_ROUNDS);
      values.push(pinHash);
      setClauses.push(`pin_hash = $${values.length}`);
      values.push(effectivePinLength);
      setClauses.push(`pin_length = $${values.length}`);
    } else if (rawAccountType === "manager" && current.rows[0].pin_length !== effectivePinLength) {
      // Promoting to manager without also supplying a new PIN: reject
      // rather than silently leaving a manager account with a stale
      // 4-digit PIN, which is exactly the gap that let a 4-digit PIN
      // unlock the Staff tab.
      return plainJson("Promoting to manager requires setting a new 6-digit PIN in the same request", 400);
    }

    if (setClauses.length === 0) {
      return plainJson("No fields to update", 400);
    }

    values.push(employeeId, restaurantName);
    const result = await query(
      `UPDATE restaurant_employees SET ${setClauses.join(", ")}
       WHERE id = $${values.length - 1} AND deleted_at IS NULL
         AND restaurant_id = (SELECT id FROM restaurants WHERE LOWER(name) = LOWER($${values.length}) AND deleted_at IS NULL)`,
      values,
    );

    if (result.rowCount === 0) {
      return errJson("EMPLOYEE_NOT_FOUND", 404);
    }

    logger.info(`PUT /api/restaurants/by-name/${restaurantName}/employees/${employeeId} - updated`, {
      fields: setClauses.length,
    });
    return NextResponse.json({ message: "Employee updated" });
  } catch (err) {
    if (
      err instanceof Error &&
      "code" in err &&
      (err as { code?: string }).code === "23505"
    ) {
      return errJson("EMPLOYEE_NAME_ALREADY_EXISTS", 409);
    }
    logger.error(`PUT /api/restaurants/by-name/${restaurantName}/employees/${employeeId} - error processing request`, err);
    return errJson("INTERNAL_ERROR", 500);
  }
}
