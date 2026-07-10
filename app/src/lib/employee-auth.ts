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
 * Resolves which employee a bare PIN belongs to, without the client ever
 * asserting an employeeId -- the PinPad no longer makes staff pick their own
 * name from a list (pure friction on a shared tablet during a rush); they
 * just type their PIN and the kitchen figures out who that is. This only
 * works unambiguously because employee creation/edit (see employees/route.ts
 * and employees/[employeeId]/route.ts) rejects a PIN that collides with
 * another active employee's PIN of the same length in the same kitchen, so
 * at most one active employee can ever match a given (restaurantName, pin,
 * pinLength) combination.
 *
 * `pinLength` comes from the client's Manager-toggle state (4 vs 6) purely
 * to scope the candidate pool to same-length employees -- it is NOT trusted
 * to also mean "manager"; a 6-digit PIN is only ever issued to a manager
 * account server-side (see requiredPinLength), so scoping by length alone
 * already limits the 6-digit pool to managers without needing a separate
 * accountType filter here.
 *
 * Still bcrypt-compares against every same-length candidate (not just the
 * first) rather than short-circuiting on the first match, keeping per-
 * candidate timing uniform regardless of where in the roster the real match
 * sits -- and runs at least one dummy compare even with zero candidates, so
 * "no employees this length" and "wrong PIN" are not distinguishable by
 * timing either.
 */
async function findEmployeeByPinOnly(
  restaurantName: string,
  pin: string,
  pinLength: 4 | 6,
): Promise<VerifiedEmployee> {
  const result = await query<{ id: number; name: string; pin_hash: string }>(
    `SELECT re.id, re.name, re.pin_hash
     FROM restaurant_employees re
     JOIN restaurants r ON r.id = re.restaurant_id
     WHERE re.deleted_at IS NULL AND re.pin_length = $1
       AND LOWER(r.name) = LOWER($2) AND r.deleted_at IS NULL`,
    [pinLength, restaurantName],
  );

  let match: VerifiedEmployee = null;
  for (const candidate of result.rows) {
    const isValid = await bcrypt.compare(pin, candidate.pin_hash);
    if (isValid) match = { id: candidate.id, name: candidate.name };
  }
  if (result.rows.length === 0) {
    // Nothing to compare against -- still spend the same time a real
    // comparison would take (see the timing note above).
    await bcrypt.compare(pin, DUMMY_PIN_HASH);
  }
  return match;
}

/**
 * Re-verifies a PIN server-side against THIS restaurant and resolves who it
 * belongs to -- never trust a client-asserted employee id/name for
 * attribution without checking the PIN in the same request, or anyone could
 * stamp someone else's name on an action.
 *
 * `employeeId` is accepted but optional now (kept for any caller that still
 * has it) -- the normal path is PIN-only: the client sends `pin` plus
 * `pinLength` (4 or 6, from the Manager toggle) and the server resolves
 * identity via findEmployeeByPinOnly above, rather than the client having
 * pre-selected a name.
 *
 * Behavior depends on whether the kitchen has any employees configured:
 * - No employees yet: pin is optional. Omitting it succeeds with no
 *   attribution (nothing to attribute to). Supplying it anyway still gets
 *   verified normally.
 * - Has employees: pin becomes REQUIRED. Omitting it is rejected with 400,
 *   not silently allowed through -- see "Mandatory once the kitchen has at
 *   least 1 employee" in SYSTEM_MEMORY.md.
 *
 * Admin (God Mode) callers bypass this entirely by never calling this
 * function with pin -- admin overrides are already a distinct, logged path
 * and aren't staff floor actions needing PIN attribution.
 */
export async function verifyEmployeeForAction(
  restaurantName: string,
  employeeId: unknown,
  pin: unknown,
  pinLength?: unknown,
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
        { error: "This kitchen has employees set up -- enter your PIN." },
        { status: 400 },
      ),
    };
  }

  const pinStr = typeof pin === "string" ? pin : null;
  if (!pinStr) {
    return {
      ok: false,
      response: NextResponse.json({ error: "pin is required" }, { status: 400 }),
    };
  }

  // employeeId explicitly provided: verify against that exact employee (kept
  // for backward compatibility with any caller that still selects a name).
  const id = typeof employeeId === "number" && Number.isSafeInteger(employeeId) ? employeeId : null;
  if (employeeId !== undefined) {
    if (id === null) {
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

  // No employeeId: resolve identity from the PIN alone, scoped to the
  // declared length (defaults to 4, the non-manager length, if the caller
  // omits it entirely).
  const resolvedPinLength: 4 | 6 = pinLength === 6 ? 6 : 4;
  const employee = await findEmployeeByPinOnly(restaurantName, pinStr, resolvedPinLength);
  if (!employee) {
    return { ok: false, response: NextResponse.json({ error: "Invalid PIN" }, { status: 401 }) };
  }
  return { ok: true, employee };
}

/**
 * True if `pin` (of `pinLength` digits) already belongs to another active
 * employee in this restaurant -- called from employee create/edit so a
 * PIN-only lookup can never be ambiguous (see findEmployeeByPinOnly above).
 * `excludeEmployeeId` lets an edit that doesn't change the PIN skip
 * comparing an employee's PIN against their own existing hash.
 */
export async function pinCollidesWithAnotherEmployee(
  restaurantName: string,
  pin: string,
  pinLength: 4 | 6,
  excludeEmployeeId?: number,
): Promise<boolean> {
  const result = await query<{ id: number; pin_hash: string }>(
    `SELECT re.id, re.pin_hash
     FROM restaurant_employees re
     JOIN restaurants r ON r.id = re.restaurant_id
     WHERE re.deleted_at IS NULL AND re.pin_length = $1
       AND LOWER(r.name) = LOWER($2) AND r.deleted_at IS NULL`,
    [pinLength, restaurantName],
  );
  for (const candidate of result.rows) {
    if (excludeEmployeeId !== undefined && candidate.id === excludeEmployeeId) continue;
    if (await bcrypt.compare(pin, candidate.pin_hash)) return true;
  }
  return false;
}
