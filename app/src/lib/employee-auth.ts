import { NextResponse } from "next/server";
import bcrypt from "bcrypt";
import { query } from "./db";

// Same timing-safe-dummy-hash precedent as /api/restaurants/login (see
// SECURITY_ATTACK_LOG.md F4) -- always run bcrypt.compare even when the
// employee id is absent/invalid, so verification with vs. without a valid
// employeeId+pin takes approximately the same time.
const DUMMY_PIN_HASH = "$2b$10$CwTycUXWue0Thq9StjUM0uJ8V8IvJs2jGiFH3rF0KwYNwHUsgnh8G";

export type VerifiedEmployee = { id: number; name: string } | null;
export type AccountType = "manager" | "employee";

/**
 * Managers are required to use a 6-digit PIN, not 4 -- a manager PIN also
 * unlocks the Staff tab (add/edit/remove any account, create roles), so it
 * warrants more entropy than a line employee's status-change PIN. This is
 * enforced server-side (see requiredPinLength below) rather than trusted
 * from the client, since a client-side-only rule is trivially bypassed by
 * calling the API directly.
 */
export function requiredPinLength(accountType: AccountType): 4 | 6 {
  return accountType === "manager" ? 6 : 4;
}

/**
 * Returns true if `restaurantName` has at least one active employee. Once
 * true, order-create and status-change routes require a verified PIN rather
 * than treating attribution as optional -- a kitchen that has never set up
 * employees can keep operating unattributed, but the moment a manager adds
 * the first one, every action must be attributed (see SYSTEM_MEMORY.md
 * "Employee Attribution").
 */
export async function restaurantHasEmployees(restaurantName: string): Promise<boolean> {
  const result = await query(
    `SELECT 1 FROM restaurant_employees re
     JOIN restaurants r ON r.id = re.restaurant_id
     WHERE re.deleted_at IS NULL AND LOWER(r.name) = LOWER($1) AND r.deleted_at IS NULL
     LIMIT 1`,
    [restaurantName],
  );
  return result.rows.length > 0;
}

/**
 * Re-verifies employeeId+pin server-side against THIS restaurant -- never
 * trust a client-asserted employee id/name for attribution without checking
 * the PIN in the same request, or anyone could stamp someone else's name on
 * an action.
 *
 * Behavior depends on whether the kitchen has any employees configured:
 * - No employees yet: employeeId/pin are optional. Omitting both succeeds
 *   with no attribution (nothing to attribute to). Supplying them anyway
 *   still gets verified normally.
 * - Has employees: employeeId+pin become REQUIRED. Omitting them is
 *   rejected with 400, not silently allowed through -- see "Mandatory once
 *   the kitchen has at least 1 employee" in SYSTEM_MEMORY.md.
 *
 * Admin (God Mode) callers bypass this entirely by never calling this
 * function with employeeId/pin -- admin overrides are already a distinct,
 * logged path and aren't staff floor actions needing PIN attribution.
 */
export async function verifyEmployeeForAction(
  restaurantName: string,
  employeeId: unknown,
  pin: unknown,
): Promise<{ ok: true; employee: VerifiedEmployee } | { ok: false; response: NextResponse }> {
  const noCredentialsSupplied = employeeId === undefined && pin === undefined;

  if (noCredentialsSupplied) {
    const hasEmployees = await restaurantHasEmployees(restaurantName);
    if (!hasEmployees) {
      return { ok: true, employee: null };
    }
    return {
      ok: false,
      response: NextResponse.json(
        { error: "This kitchen has employees set up -- select who you are and enter your PIN." },
        { status: 400 },
      ),
    };
  }

  const id = typeof employeeId === "number" && Number.isSafeInteger(employeeId) ? employeeId : null;
  const pinStr = typeof pin === "string" ? pin : null;
  if (id === null || !pinStr) {
    return {
      ok: false,
      response: NextResponse.json({ error: "employeeId and pin must be provided together" }, { status: 400 }),
    };
  }

  const result = await query<{ id: number; name: string; pin_hash: string }>(
    `SELECT re.id, re.name, re.pin_hash
     FROM restaurant_employees re
     JOIN restaurants r ON r.id = re.restaurant_id
     WHERE re.id = $1 AND re.deleted_at IS NULL
       AND LOWER(r.name) = LOWER($2) AND r.deleted_at IS NULL`,
    [id, restaurantName],
  );
  const employee = result.rows[0];
  const isPinValid = await bcrypt.compare(pinStr, employee?.pin_hash ?? DUMMY_PIN_HASH);

  if (!employee || !isPinValid) {
    return { ok: false, response: NextResponse.json({ error: "Invalid employee PIN" }, { status: 401 }) };
  }
  return { ok: true, employee: { id: employee.id, name: employee.name } };
}
