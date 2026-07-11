/**
 * Shared sessionStorage contract for the one-time employee sign-in (see
 * app/restaurant/staff-login/page.tsx). Deliberately sessionStorage, not a
 * cookie: it must survive refresh/tab-navigation within the browser session
 * but never be remembered across a real logout or browser restart the way
 * "Remember Me" remembers the KITCHEN's own login -- those are two
 * independent concerns (see restauranthome/page.tsx and Dashboard.tsx).
 */

export const EMPLOYEE_SESSION_KEY = "kitchen_employee_session";

export type EmployeeSession = {
  employeeId: number;
  name: string;
  accountType: "manager" | "employee";
  pinLength: 4 | 6;
  restaurantName: string;
};

/**
 * Reads the currently signed-in employee, if any, scoped to `restaurantName`.
 * The stored `restaurantName` is checked (not just presence of the key) so a
 * stale entry from a DIFFERENT kitchen previously signed into this same
 * browser tab can never silently misattribute this kitchen's actions --
 * e.g. kitchen A's employee signs in, the browser later logs into kitchen B
 * without an explicit "Logout Staff" in between. A mismatch is treated
 * exactly like "no one signed in," including clearing the stale entry so it
 * doesn't leak into a later restaurantName check either.
 */
export function getEmployeeSession(restaurantName: string): EmployeeSession | null {
  try {
    const raw = sessionStorage.getItem(EMPLOYEE_SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as EmployeeSession;
    if (
      typeof parsed?.employeeId !== "number" ||
      typeof parsed?.restaurantName !== "string" ||
      parsed.restaurantName.toLowerCase() !== restaurantName.toLowerCase()
    ) {
      sessionStorage.removeItem(EMPLOYEE_SESSION_KEY);
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function clearEmployeeSession(): void {
  try {
    sessionStorage.removeItem(EMPLOYEE_SESSION_KEY);
  } catch {
    // Best-effort; nothing meaningful to recover from a storage failure here.
  }
}
