/**
 * Single source of truth mapping every API error this app can return to a
 * short numeric code, a title, and a plain-English "what this means / what
 * to do" explanation -- the same idea as a Gemini/Google error code you can
 * look up on a help page. Both `errJson()` (attaches a code to every coded
 * API error response) and `/help/errors` (renders the full lookup page)
 * import from this one map, so adding a new error is: add one entry here,
 * use its key at the throw site, done -- nothing else to keep in sync.
 *
 * Codes are grouped by KIND, not by HTTP status -- a kitchen worker doesn't
 * know or care what "404" means, but "this thing doesn't exist" and "this
 * conflicts with something" are meaningfully different categories worth
 * grouping together on the help page. See CATEGORIES below for the actual
 * ranges/metadata.
 *
 * There is deliberately NO "validation" range. A plain field-validation
 * error (missing name, wrong PIN length, malformed confirmation phrase) is
 * fully self-explanatory from its message alone -- the user already knows
 * exactly what to fix. Forcing a code lookup onto "you left a field blank"
 * adds friction for zero benefit, so those use plainJson() (see
 * lib/error-response.ts) instead of errJson() and never appear here. Codes
 * exist specifically for errors a user CAN'T self-diagnose from the message
 * alone: something doesn't exist, a permission/identity check failed, a
 * real conflict with existing state, a rate limit, or a genuine server-side
 * failure.
 *
 * Within a range, codes are assigned in the order their route was written,
 * NOT sorted by file -- once assigned, a code's number must never be
 * reused for a different meaning (a kitchen worker or bookmark could be
 * referencing the old meaning), so always append a new number rather than
 * renumbering existing ones, even if that leaves the file's own ordering
 * slightly non-alphabetical.
 */

export type ErrorCodeEntry = {
  code: number;
  /** Short label for the /help/errors index and the popup card's heading. */
  title: string;
  /**
   * The exact toast-facing wording this error used before codes existed --
   * `errJson()` sends this by default so existing UI copy doesn't silently
   * change. A handful of call sites override it with a live-interpolated
   * value (an order name, a computed limit); the CODE stays the same either
   * way, so /help/errors is still the right lookup regardless of which exact
   * sentence was shown.
   */
  defaultMessage: string;
  /** Plain-English explanation shown in the popup card and the help page's summary line. */
  meaning: string;
  /**
   * Dev-facing deep-dive: likely causes and what to actually check, shown
   * only on the /help/errors page (not the popup card, which stays short).
   * Written for whoever's debugging a report of this code -- often the same
   * person who'll read it as a user, per this app's small-team reality.
   */
  causes: string[];
};

type Category = {
  slug: string;
  label: string;
  /** One-line description shown under the category heading on /help/errors. */
  blurb: string;
  min: number;
  max: number;
};

export const CATEGORIES: Category[] = [
  {
    slug: "auth",
    label: "Authentication",
    blurb: "Credentials, a PIN, or an active-session check didn't pass.",
    min: 200,
    max: 299,
  },
  {
    slug: "not-found",
    label: "Not Found",
    blurb: "The thing being referenced doesn't exist, or doesn't belong to you.",
    min: 300,
    max: 399,
  },
  {
    slug: "conflict",
    label: "Conflict",
    blurb: "The request was valid, but collides with something that already exists.",
    min: 400,
    max: 499,
  },
  {
    slug: "rate-limit",
    label: "Rate Limit",
    blurb: "Too many requests arrived too quickly, on purpose or by accident.",
    min: 500,
    max: 599,
  },
  {
    slug: "internal",
    label: "Internal",
    blurb: "Something broke on the server side. Not something you did.",
    min: 900,
    max: 999,
  },
];

export const ERROR_CODES = {
  // ---- 200-299: Auth ----
  INVALID_CREDENTIALS: {
    code: 200,
    title: "Invalid credentials",
    defaultMessage: "Invalid credentials",
    meaning: "The restaurant name/username or password entered doesn't match our records.",
    causes: [
      "Typo in the restaurant name or password (case-insensitive on name, case-sensitive on password).",
      "The restaurant was deleted or renamed since the credentials were last used.",
      "This is also the exact response for a restaurant that never existed at all -- login intentionally doesn't distinguish \"wrong password\" from \"no such restaurant\" (see SECURITY_ATTACK_LOG.md F4, timing-safe dummy hash) to avoid leaking which restaurant names are registered.",
    ],
  },
  INVALID_PIN: {
    code: 201,
    title: "Invalid PIN",
    defaultMessage: "Invalid PIN",
    meaning: "That PIN doesn't match any active employee at this restaurant. Double-check the digits and try again.",
    causes: [
      "Wrong digits, or the Manager toggle wasn't set (a real 6-digit manager PIN typed with the toggle off auto-submits at 4 digits and always fails).",
      "The employee was deactivated (soft-deleted) since the PIN was set.",
      "PIN entered for the wrong restaurant's PinPad instance -- verify-pin is scoped strictly to one restaurant's roster.",
    ],
  },
  INVALID_OR_INACTIVE_EMPLOYEE: {
    code: 202,
    title: "Employee not recognized",
    defaultMessage: "Invalid or inactive employee",
    meaning:
      "This employee isn't currently active on this kitchen's roster — they may have been deactivated, or the session may be for a different kitchen.",
    causes: [
      "Stale `employeeId` in sessionStorage from a previous shift/kitchen after the employee was deactivated -- see lib/employee-session.ts.",
      "A trusted-employeeId order action (post-sign-in) firing after the employee was removed mid-session.",
      "employeeId belongs to a real employee, but at a DIFFERENT restaurant than the one in the request -- verifyActiveEmployee scopes by restaurant_id, not just employee id.",
    ],
  },

  // ---- 300-399: Not found ----
  ORDER_NOT_FOUND: {
    code: 300,
    title: "Order not found",
    defaultMessage: "Order not found",
    meaning:
      "This order doesn't exist, was deleted, or the restaurant/order name combination doesn't match anything on record.",
    causes: [
      "Order was soft-deleted (kitchen delete) or hard-deleted (admin delete) since the caller last saw it.",
      "order_lookup_key mismatch -- confirm normalizeOrderLookupKey() was applied to both sides of the comparison, not just one.",
      "Case/whitespace difference in restaurant_name if the lookup bypassed the shared ILIKE + escapeLikePattern() helper.",
    ],
  },
  DELETED_ORDER_NOT_FOUND: {
    code: 301,
    title: "Deleted order not found",
    defaultMessage: "Deleted order not found",
    meaning: "This order isn't in the deleted-orders list — it may have already been restored, or never existed.",
    causes: [
      "Order was already undeleted by another admin/tab between page load and this click.",
      "Order was hard-deleted (permanent) rather than soft-deleted, so it's not recoverable via undelete at all.",
    ],
  },
  RESTAURANT_NOT_FOUND: {
    code: 302,
    title: "Restaurant not found",
    defaultMessage: "Restaurant not found",
    meaning: "This restaurant doesn't exist or has been removed.",
    causes: [
      "Restaurant was deleted (admin-only, permanent) between the caller loading its name and taking this action.",
      "Name mismatch -- restaurant lookups are case-insensitive via LOWER(name), but a stray leading/trailing space would still fail to match.",
    ],
  },
  EMPLOYEE_NOT_FOUND: {
    code: 303,
    title: "Employee not found",
    defaultMessage: "Employee not found",
    meaning: "This employee doesn't exist on this kitchen's roster, or has already been deactivated.",
    causes: [
      "Employee was deactivated (soft-deleted) by another admin/tab since this page loaded its roster.",
      "employeeId belongs to a different restaurant -- every employee route scopes by BOTH id and restaurant name via a join, never id alone.",
    ],
  },
  ROLE_NOT_FOUND: {
    code: 304,
    title: "Role not found",
    defaultMessage: "Role not found",
    meaning: "This role label doesn't exist for this kitchen — it may have already been deleted.",
    causes: [
      "Role was deleted by another tab/admin between page load and this edit/delete.",
      "Stale roleId cached client-side after a role rename+recreate cycle.",
    ],
  },
  ROLE_NOT_FOUND_FOR_KITCHEN: {
    code: 305,
    title: "Role not found",
    defaultMessage: "Role not found for this kitchen",
    meaning:
      "This role label doesn't belong to this kitchen — it may have been deleted, or belongs to a different restaurant.",
    causes: [
      "roleId sent from the client belongs to a DIFFERENT restaurant's role list -- resolveRoleId() checks restaurant_id, this is not just a missing-row 404.",
      "Distinct from code 304 (ROLE_NOT_FOUND) specifically because this path is reached while assigning a role to an employee, not managing the role itself -- kept separate so a future analytics pass can tell \"role admin\" failures from \"role assignment\" failures apart.",
    ],
  },
  ACKNOWLEDGE_TARGET_NOT_FOUND: {
    code: 306,
    title: "Order not ready to acknowledge",
    defaultMessage: "Order not found, not yet complete, or has been deleted",
    meaning:
      "This order doesn't exist, hasn't reached Complete yet, or has been deleted, so it can't be marked picked up.",
    causes: [
      "Order genuinely hasn't reached Complete status yet -- acknowledge requires complete_at IS NOT NULL.",
      "Order was deleted between the customer/kitchen loading it and tapping pickup.",
      "Double-submit race: a near-simultaneous customer-side and kitchen-side acknowledge can have the second request's WHERE clause miss if the first already advanced state -- check order_status_events for a prior 'PickedUp' row before assuming this is a real bug.",
    ],
  },

  // ---- 400-499: Conflict ----
  UNDO_NOT_ALLOWED: {
    code: 400,
    title: "This change can no longer be undone",
    defaultMessage: "This status change cannot be undone",
    meaning:
      "The 8-second undo window has passed, or the order has moved on since — undo is only available immediately after a status change.",
    causes: [
      "More than UNDO_WINDOW_SECONDS (8s) elapsed between the status change and the undo click.",
      "The order advanced to a further status after the change this undo is trying to reverse -- PREVIOUS_STATUS mapping only allows undoing the immediately-prior single step.",
    ],
  },
  UNDO_EXPIRED_OR_STALE: {
    code: 401,
    title: "Undo expired or order changed",
    defaultMessage: "Undo expired or the order changed in another tab",
    meaning:
      "The undo window closed, or this order was changed in another tab/device since you made this change — the displayed status has been refreshed to match the real current state.",
    causes: [
      "status_transition_token no longer matches (a second status change already consumed/cleared it).",
      "status_transition_at is older than the 8s window at the moment the UPDATE ran (network latency between click and request landing).",
      "Order was picked up (acknowledged_at set) between the change and the undo attempt -- undo is blocked once a Complete order has been acknowledged.",
    ],
  },
  ORDER_NAME_ALREADY_EXISTS: {
    code: 402,
    title: "Order name already exists",
    defaultMessage: "An order with this name already exists for this restaurant",
    meaning:
      "Another live order at this restaurant already uses this exact name. Order names must be unique per restaurant while active.",
    causes: [
      "A genuinely duplicate order_number typed by staff.",
      "order_lookup_key collision from punctuation/case normalization -- \"Pager 14\" and \"pager-14\" collide by design (see normalizeOrderLookupKey()), which can surprise someone expecting only exact-string duplicates to be rejected.",
    ],
  },
  RESTAURANT_NAME_ALREADY_EXISTS: {
    code: 403,
    title: "Restaurant name already exists",
    defaultMessage: "Restaurant with this name already exists",
    meaning: "Another restaurant is already registered under this name. Restaurant names must be unique.",
    causes: [
      "Real duplicate registration attempt.",
      "A soft-deleted restaurant does NOT free up its name for reuse -- restaurants have no undelete path, unlike orders, so check `deleted_at` on the existing row if this seems wrong.",
    ],
  },
  EMPLOYEE_NAME_ALREADY_EXISTS: {
    code: 404,
    title: "Employee name already exists",
    defaultMessage: "An employee with this name already exists",
    meaning: "Another active employee at this restaurant already has this name.",
    causes: [
      "Genuine duplicate name within one restaurant's roster -- uniqueness is per-restaurant, not global, so the same name is fine at a different kitchen.",
      "A previously-deactivated employee with the same name still counts as a live uniqueness conflict if they were reactivated, or if the unique index doesn't exclude soft-deleted rows -- check restaurant_employees' actual index definition if this fires unexpectedly.",
    ],
  },
  ROLE_NAME_ALREADY_EXISTS: {
    code: 405,
    title: "Role name already exists",
    defaultMessage: "A role with this name already exists",
    meaning: "Another role at this restaurant already uses this name.",
    causes: ["Genuine duplicate role label within one restaurant -- role names are unique per-restaurant only."],
  },
  PIN_ALREADY_IN_USE: {
    code: 406,
    title: "PIN already in use",
    defaultMessage: "That PIN is already in use by another employee. Choose a different one.",
    meaning:
      "Another active employee at this restaurant is already using this PIN. Choose a different one so the system can tell staff apart by PIN alone.",
    causes: [
      "Real collision -- PinPad has no name picker (removed deliberately, see CLAUDE.md), so every active employee at a given PIN length must have a unique PIN or sign-in becomes ambiguous.",
      "Collision is scoped by PIN LENGTH, not account type -- a 4-digit employee PIN and a 6-digit manager PIN can never collide with each other even if their digits overlap as a prefix.",
    ],
  },
  ORDER_CHANGED_ELSEWHERE: {
    code: 407,
    title: "Order changed in another tab",
    defaultMessage: "Order changed in another tab. Refreshing the latest status.",
    meaning:
      "This order was updated somewhere else (another tab, device, or staff member) since this page last loaded. The displayed status has been refreshed to match.",
    causes: [
      "Optimistic-concurrency UPDATE's WHERE LOWER(status) = $currentStatus matched zero rows -- someone else already changed it first.",
      "Not actually an error condition most of the time -- this is the expected result of two staff members racing to advance the same order; the WS broadcast should already be pushing the real current state to both.",
    ],
  },
  RESTAURANT_NAME_TAKEN_RENAME: {
    code: 409,
    title: "Restaurant name already exists",
    defaultMessage: "A restaurant with this name already exists",
    meaning: "Another restaurant is already using the name you tried to rename to.",
    causes: ["Genuine name collision on rename -- checked via a LOWER(name) query excluding the row's own id."],
  },
  INVALID_STATUS_TRANSITION: {
    code: 411,
    title: "Status change not allowed",
    defaultMessage: "Cannot change status",
    meaning:
      "Orders can only move forward one step at a time (Received → Preparing → Complete). This change would have skipped a step or gone backward.",
    causes: [
      "Client-side StatusStepper only ever offers the single next step, so this normally only fires from a stale UI (order advanced elsewhere since the buttons were rendered) or a direct API call.",
      "Non-admin callers are restricted to forward-by-one via isForwardTransition(); an admin (God Mode) can force ANY transition and never hits this check at all.",
    ],
  },
  ORDER_NAME_TAKEN_UNDELETE: {
    code: 410,
    title: "Order name already exists",
    defaultMessage: "Cannot restore -- an order with this name already exists for this restaurant",
    meaning:
      "This order can't be restored because a different live order at this restaurant now uses the same name. Rename or remove that order first.",
    causes: [
      "The (restaurant, order_lookup_key) pair was reused by a NEW order after the original was deleted -- the partial unique index only guards live rows, so this collision is only detectable at undelete time, not at delete time.",
    ],
  },

  // ---- 500-599: Rate limit ----
  RATE_LIMITED_LOGIN: {
    code: 500,
    title: "Too many login attempts",
    defaultMessage: "Too many login attempts. Try again in a minute.",
    meaning: "Too many login attempts too quickly. Wait a minute and try again.",
    causes: [
      "Real credential-guessing throttle doing its job.",
      "Every caller behind one NAT/router shares one bucket (getClientIp() falls back to a literal \"unknown\" string with no X-Forwarded-For header) -- a shared kitchen tablet plus a dev's own curl/test traffic can trip this together, see CLAUDE.md's rate-limit-bucket lesson.",
    ],
  },
  RATE_LIMITED_REGISTER: {
    code: 501,
    title: "Too many registration attempts",
    defaultMessage: "Too many registration attempts. Try again in a minute.",
    meaning: "Too many registration attempts too quickly from this network. Wait a minute and try again.",
    causes: ["Tighter than login (5/min) since each attempt permanently creates a row -- a normal user should never hit this."],
  },
  RATE_LIMITED_GENERAL: {
    code: 502,
    title: "Too many requests",
    defaultMessage: "Too many requests. Slow down a moment.",
    meaning: "Too many requests too quickly. Wait a moment and try again.",
    causes: ["Shared limit across several anonymous/public-ish endpoints (order search, suggest) -- check which specific route logged this before assuming it's the same limiter each time."],
  },
  RATE_LIMITED_ORDERS: {
    code: 503,
    title: "Too many orders created",
    defaultMessage: "Too many orders created too quickly. Slow down a moment.",
    meaning: "Too many orders were created too quickly for this restaurant. Wait a moment and try again.",
    causes: ["Keyed per-restaurant, not per-IP -- a legitimately busy kitchen behind one connection won't trip this at realistic order-entry speed (30/min = one every 2s); if it fires during normal use, something is auto-submitting faster than a human types."],
  },
  RATE_LIMITED_PIN: {
    code: 504,
    title: "Too many PIN attempts",
    defaultMessage: "Too many PIN attempts. Try again in a minute.",
    meaning: "Too many PIN attempts too quickly. Wait a minute before trying again.",
    causes: ["Tighter (15/min) than login since a 4-6 digit PIN has far less entropy than a password -- this is the realistic anti-guessing throttle for a shared kitchen tablet."],
  },
  RATE_LIMITED_STAFF: {
    code: 505,
    title: "Too many requests",
    defaultMessage: "Too many requests. Try again in a minute.",
    meaning: "Too many staff-management requests too quickly. Wait a minute and try again.",
    causes: ["Covers employee/role create routes -- a normal admin session doing roster setup shouldn't come close to 20/min."],
  },
  RATE_LIMITED_HEALTH: {
    code: 506,
    title: "Too many requests",
    defaultMessage: "Too many requests",
    meaning: "Too many health-check requests too quickly. This resolves itself within a few seconds.",
    causes: ["HealthPin's own polling is capped well under this limit -- if a real user hits this, something is polling /api/health outside the normal HealthPin component (a stray extra tab, a script)."],
  },

  // ---- 900-999: Internal ----
  INTERNAL_ERROR: {
    code: 900,
    title: "Something went wrong on our end",
    defaultMessage: "Internal Server Error",
    meaning:
      "An unexpected server error occurred. This isn't something you did — try again in a moment, and if it keeps happening, let an admin know.",
    causes: [
      "Check the server log for the specific route's own logger.error(...) call immediately before this response -- every route that returns this logs the real underlying error first.",
      "Common root causes: a DB connection blip, an unhandled constraint violation not already caught by a specific 409 branch, or a bug in a new code path.",
    ],
  },
  RESTAURANT_DELETE_FAILED: {
    code: 901,
    title: "Couldn't delete restaurant",
    defaultMessage: "Failed to delete restaurant and associated orders.",
    meaning:
      "The restaurant and its orders couldn't be fully deleted due to a server error. Nothing was left partially deleted — try again.",
    causes: [
      "The delete runs inside a transaction (orders DELETE + restaurants DELETE, then COMMIT) specifically so a mid-operation failure rolls back cleanly rather than leaving orphaned orders -- if this fires, check the transaction's own ROLLBACK path logged the real DB error.",
    ],
  },
} as const satisfies Record<string, ErrorCodeEntry>;

export type ErrorCodeKey = keyof typeof ERROR_CODES;

const BY_NUMBER: Map<number, ErrorCodeEntry> = new Map(
  Object.values(ERROR_CODES).map((entry) => [entry.code, entry]),
);

export function lookupErrorCode(code: number): ErrorCodeEntry | null {
  return BY_NUMBER.get(code) ?? null;
}

export function categoryForCode(code: number): Category | null {
  return CATEGORIES.find((c) => code >= c.min && code <= c.max) ?? null;
}

/** For /help/errors -- every entry, grouped by category, ascending within each. */
export function listErrorCodesByCategory(): { category: Category; entries: ErrorCodeEntry[] }[] {
  const all = Object.values(ERROR_CODES).sort((a, b) => a.code - b.code);
  return CATEGORIES.map((category) => ({
    category,
    entries: all.filter((e) => e.code >= category.min && e.code <= category.max),
  })).filter((group) => group.entries.length > 0);
}
