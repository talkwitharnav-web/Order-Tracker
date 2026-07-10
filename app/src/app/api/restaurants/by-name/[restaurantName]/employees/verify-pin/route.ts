import { NextResponse } from "next/server";
import bcrypt from "bcrypt";
import { query, initDb } from "@/lib/db";
import { logger } from "@/lib/logger";
import { requireRestaurantOrAdmin } from "@/lib/auth";
import { parseJsonBody } from "@/lib/validate";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";

/**
 * Verifies an employee's PIN and returns their identity for attribution --
 * deliberately NOT a session/cookie (see SYSTEM_MEMORY.md "Employee
 * Attribution"). Checked fresh on every status-changing action, matching how
 * real POS systems attribute frequent per-order actions on a shared
 * terminal without a slow per-employee login/logout cycle.
 *
 * Same timing-safe-dummy-hash precedent as /api/restaurants/login (see
 * SECURITY_ATTACK_LOG.md F4): always run bcrypt.compare even when the
 * employee id doesn't exist/belong to this restaurant, so "no such
 * employee" and "wrong PIN" take approximately the same time and can't be
 * used to enumerate valid employee ids.
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
    return NextResponse.json({ error: "Too many PIN attempts. Try again in a minute." }, { status: 429 });
  }

  await initDb();

  try {
    const body = await parseJsonBody(request);
    if (body === null) {
      return NextResponse.json({ error: "Malformed JSON body" }, { status: 400 });
    }
    const { employeeId: rawEmployeeId, pin: rawPin } = body as { employeeId?: unknown; pin?: unknown };

    const employeeId =
      typeof rawEmployeeId === "number" && Number.isSafeInteger(rawEmployeeId) ? rawEmployeeId : null;
    const pin = typeof rawPin === "string" ? rawPin : null;

    if (employeeId === null || !pin) {
      return NextResponse.json({ error: "employeeId and pin are required" }, { status: 400 });
    }

    // Scoped by restaurant NAME, not just employeeId -- an authenticated
    // kitchen session must not be able to verify (or timing-probe) another
    // restaurant's employee PINs.
    const result = await query<EmployeeRow>(
      `SELECT re.id, re.name, re.account_type, re.pin_hash
       FROM restaurant_employees re
       JOIN restaurants r ON r.id = re.restaurant_id
       WHERE re.id = $1 AND re.deleted_at IS NULL
         AND LOWER(r.name) = LOWER($2) AND r.deleted_at IS NULL`,
      [employeeId, restaurantName],
    );
    const employee = result.rows[0];

    const isPinValid = await bcrypt.compare(pin, employee?.pin_hash ?? DUMMY_PIN_HASH);

    if (!employee || !isPinValid) {
      logger.warn(`POST /api/restaurants/by-name/${restaurantName}/employees/verify-pin - invalid PIN attempt`);
      return NextResponse.json({ error: "Invalid PIN" }, { status: 401 });
    }

    return NextResponse.json({
      employee: { id: employee.id, name: employee.name, accountType: employee.account_type },
    });
  } catch (err) {
    logger.error(`POST /api/restaurants/by-name/${restaurantName}/employees/verify-pin - error processing request`, err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
