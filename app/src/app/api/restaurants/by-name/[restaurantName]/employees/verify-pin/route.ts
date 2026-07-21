import { NextResponse } from "next/server";
import bcrypt from "bcrypt";
import { query, initDb } from "@/lib/db";
import { logger } from "@/lib/logger";
import { requireRestaurantOrAdmin } from "@/lib/auth";
import { parseJsonBody } from "@/lib/validate";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";
import { errJson, plainJson } from "@/lib/error-response";

/**
 * Verifies a PIN and returns whose it is, for attribution -- deliberately
 * NOT a session/cookie (see SYSTEM_MEMORY.md "Employee Attribution").
 * Checked fresh on every status-changing action, matching how real POS
 * systems attribute frequent per-order actions on a shared terminal without
 * a slow per-employee login/logout cycle.
 *
 * PIN-only: the caller does NOT pre-select an employee by name/id (PinPad
 * has no name list anymore -- picking your own name from a list on a shared
 * tablet mid-rush was pure friction). It sends just `pin` + `pinLength` (4
 * or 6, from the Manager toggle) and this resolves identity by checking the
 * PIN against every active same-length employee in this kitchen -- safe to
 * be unambiguous only because employee create/edit rejects a PIN that
 * collides with another active employee's same-length PIN (see
 * lib/employee-auth.ts pinCollidesWithAnotherEmployee).
 *
 * Same timing-safe-dummy-hash precedent as /api/restaurants/login (see
 * SECURITY_ATTACK_LOG.md F4): always run at least one bcrypt.compare even
 * when there are zero candidates, so "no employees this length" and "wrong
 * PIN" take approximately the same time and can't be used to enumerate
 * roster size.
 */
const DUMMY_PIN_HASH = "$2b$10$CwTycUXWue0Thq9StjUM0uJ8V8IvJs2jGiFH3rF0KwYNwHUsgnh8G";

type EmployeeRow = {
  id: number;
  name: string;
  account_type: string;
  pin_hash: string;
};

export async function POST(request: Request, { params }: { params: Promise<{ restaurantName: string }> }) {
  const { restaurantName } = await params;

  const auth = await requireRestaurantOrAdmin(restaurantName);
  if (!auth.ok) return auth.response;

  // A 4-6 digit PIN has far less entropy than a password -- this is the
  // realistic attack surface (someone at the shared kitchen tablet guessing
  // a coworker's PIN to frame them, or to bypass attribution), so this is
  // rate-limited tighter and per-restaurant so one kitchen's lockout can't
  // affect another's, and per-IP within that so it can't be used to lock out
  // a legitimate shared terminal by itself.
  if (!checkRateLimit(`employee-pin:${restaurantName}:${getClientIp(request)}`, { windowMs: 60_000, maxAttempts: 15 })) {
    return errJson("RATE_LIMITED_PIN", 429);
  }

  await initDb();

  try {
    const body = await parseJsonBody(request);
    if (body === null) {
      return plainJson("Malformed JSON body", 400);
    }
    const { pin: rawPin, pinLength: rawPinLength } = body as { pin?: unknown; pinLength?: unknown };

    const pin = typeof rawPin === "string" ? rawPin : null;
    const pinLength: 4 | 6 = rawPinLength === 6 ? 6 : 4;

    if (!pin) {
      return plainJson("pin is required", 400);
    }

    // Scoped by restaurant NAME and pinLength -- an authenticated kitchen
    // session must not be able to verify (or timing-probe) another
    // restaurant's employee PINs.
    const result = await query<EmployeeRow>(
      `SELECT re.id, re.name, re.account_type, re.pin_hash
       FROM restaurant_employees re
       JOIN restaurants r ON r.id = re.restaurant_id
       WHERE re.deleted_at IS NULL AND re.pin_length = $1
         AND LOWER(r.name) = LOWER($2) AND r.deleted_at IS NULL`,
      [pinLength, restaurantName],
    );

    let employee: EmployeeRow | null = null;
    for (const candidate of result.rows) {
      const isValid = await bcrypt.compare(pin, candidate.pin_hash);
      if (isValid) employee = candidate;
    }
    if (result.rows.length === 0) {
      await bcrypt.compare(pin, DUMMY_PIN_HASH);
    }

    if (!employee) {
      logger.warn(`POST /api/restaurants/by-name/${restaurantName}/employees/verify-pin - invalid PIN attempt`);
      return errJson("INVALID_PIN", 401);
    }

    return NextResponse.json({
      employee: { id: employee.id, name: employee.name, accountType: employee.account_type },
    });
  } catch (err) {
    logger.error(`POST /api/restaurants/by-name/${restaurantName}/employees/verify-pin - error processing request`, err);
    return errJson("INTERNAL_ERROR", 500);
  }
}
