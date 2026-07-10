import { NextResponse } from "next/server";
import bcrypt from "bcrypt";
import { query, initDb } from "@/lib/db";
import { logger } from "@/lib/logger";
import { requireRestaurantOrAdmin } from "@/lib/auth";
import { requireString, parseJsonBody } from "@/lib/validate";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";
import { requiredPinLength, pinCollidesWithAnotherEmployee } from "@/lib/employee-auth";

/**
 * Employee roster management for a kitchen's own account (or admin, for
 * any). Distinct from the restaurant's own login -- these are the
 * individual staff who tap a PIN to attribute order status changes (see
 * SYSTEM_MEMORY.md "Employee Attribution"). Never returns pin_hash.
 *
 * `accountType` (manager|employee) is the fixed value that controls
 * Staff-tab/admin access; `roleId` is an optional kitchen-defined display
 * label (see restaurant_roles) with no permission effect of its own.
 */

const SALT_ROUNDS = 10;

type EmployeeRow = {
  id: number;
  name: string;
  account_type: string;
  role_id: number | null;
  role_name: string | null;
  pin_length: number;
  created_at: string;
};

const EMPLOYEE_SELECT = `
  SELECT re.id, re.name, re.account_type, re.role_id, rr.name AS role_name, re.pin_length, re.created_at
  FROM restaurant_employees re
  LEFT JOIN restaurant_roles rr ON rr.id = re.role_id
`;

async function getRestaurantId(restaurantName: string): Promise<number | null> {
  const result = await query<{ id: number }>(
    "SELECT id FROM restaurants WHERE LOWER(name) = LOWER($1) AND deleted_at IS NULL",
    [restaurantName],
  );
  return result.rows[0]?.id ?? null;
}

/** Validates an optional roleId belongs to this restaurant. Returns { ok: true, roleId } or an error response. */
async function resolveRoleId(
  restaurantId: number,
  rawRoleId: unknown,
): Promise<{ ok: true; roleId: number | null } | { ok: false; response: NextResponse }> {
  if (rawRoleId === undefined || rawRoleId === null) return { ok: true, roleId: null };
  const roleId = typeof rawRoleId === "number" && Number.isSafeInteger(rawRoleId) ? rawRoleId : null;
  if (roleId === null) {
    return { ok: false, response: NextResponse.json({ error: "Invalid roleId" }, { status: 400 }) };
  }
  const result = await query("SELECT 1 FROM restaurant_roles WHERE id = $1 AND restaurant_id = $2", [roleId, restaurantId]);
  if (result.rows.length === 0) {
    return { ok: false, response: NextResponse.json({ error: "Role not found for this kitchen" }, { status: 404 }) };
  }
  return { ok: true, roleId };
}

export async function GET(request: Request, { params }: { params: Promise<{ restaurantName: string }> }) {
  const { restaurantName } = await params;

  const auth = await requireRestaurantOrAdmin(restaurantName);
  if (!auth.ok) return auth.response;

  await initDb();
  const restaurantId = await getRestaurantId(restaurantName);
  if (restaurantId === null) {
    return NextResponse.json({ error: "Restaurant not found" }, { status: 404 });
  }

  const result = await query<EmployeeRow>(
    `${EMPLOYEE_SELECT} WHERE re.restaurant_id = $1 AND re.deleted_at IS NULL ORDER BY re.name ASC`,
    [restaurantId],
  );
  return NextResponse.json({ employees: result.rows });
}

export async function POST(request: Request, { params }: { params: Promise<{ restaurantName: string }> }) {
  const { restaurantName } = await params;
  logger.info(`POST /api/restaurants/by-name/${restaurantName}/employees - request received`);

  const auth = await requireRestaurantOrAdmin(restaurantName);
  if (!auth.ok) return auth.response;

  // Creating an employee record is a low-frequency management action (not
  // the frequent PIN-verify path) -- still throttled per restaurant+IP so a
  // compromised kitchen session can't be scripted into mass-creating rows.
  if (!checkRateLimit(`employee-create:${restaurantName}:${getClientIp(request)}`, { windowMs: 60_000, maxAttempts: 20 })) {
    return NextResponse.json({ error: "Too many requests. Try again in a minute." }, { status: 429 });
  }

  await initDb();
  const restaurantId = await getRestaurantId(restaurantName);
  if (restaurantId === null) {
    return NextResponse.json({ error: "Restaurant not found" }, { status: 404 });
  }

  try {
    const body = await parseJsonBody(request);
    if (body === null) {
      return NextResponse.json({ error: "Malformed JSON body" }, { status: 400 });
    }
    const { name: rawName, pin: rawPin, accountType: rawAccountType, roleId: rawRoleId } = body as {
      name?: unknown;
      pin?: unknown;
      accountType?: unknown;
      roleId?: unknown;
    };

    const name = requireString(rawName, 100);
    const accountType = rawAccountType === "manager" ? "manager" as const : "employee" as const;
    // PIN length is DERIVED from accountType, never accepted from the
    // client -- a manager PIN unlocks the Staff tab, so it must always be
    // 6 digits regardless of what the caller requests (see
    // lib/employee-auth.ts requiredPinLength).
    const pinLength = requiredPinLength(accountType);
    const pin = typeof rawPin === "string" && new RegExp(`^\\d{${pinLength}}$`).test(rawPin) ? rawPin : null;

    if (!name) {
      return NextResponse.json({ error: "Employee name is required" }, { status: 400 });
    }
    if (!pin) {
      return NextResponse.json({ error: `PIN must be exactly ${pinLength} digits` }, { status: 400 });
    }

    const roleCheck = await resolveRoleId(restaurantId, rawRoleId);
    if (!roleCheck.ok) return roleCheck.response;

    // PIN-only lookup (see lib/employee-auth.ts findEmployeeByPinOnly) is
    // only unambiguous if no two active employees share a PIN at the same
    // length -- reject here rather than let a real collision silently
    // attribute actions to whichever employee bcrypt happens to check first.
    if (await pinCollidesWithAnotherEmployee(restaurantName, pin, pinLength)) {
      return NextResponse.json(
        { error: "That PIN is already in use by another employee. Choose a different one." },
        { status: 409 },
      );
    }

    const pinHash = await bcrypt.hash(pin, SALT_ROUNDS);

    try {
      const inserted = await query<{ id: number }>(
        `INSERT INTO restaurant_employees (restaurant_id, name, account_type, role_id, pin_length, pin_hash)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING id`,
        [restaurantId, name, accountType, roleCheck.roleId, pinLength, pinHash],
      );
      const result = await query<EmployeeRow>(`${EMPLOYEE_SELECT} WHERE re.id = $1`, [inserted.rows[0].id]);
      logger.info(`POST /api/restaurants/by-name/${restaurantName}/employees - employee "${name}" created`);
      return NextResponse.json({ employee: result.rows[0] }, { status: 201 });
    } catch (insertErr) {
      if (
        insertErr instanceof Error &&
        "code" in insertErr &&
        (insertErr as { code?: string }).code === "23505"
      ) {
        return NextResponse.json({ error: "An employee with this name already exists" }, { status: 409 });
      }
      throw insertErr;
    }
  } catch (err) {
    logger.error(`POST /api/restaurants/by-name/${restaurantName}/employees - error processing request`, err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
