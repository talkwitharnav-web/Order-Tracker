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
   * Plain-English "likely causes / what to check" shown on the /help/errors
   * page's expandable disclosure (not the popup card, which stays short).
   * Written for a kitchen/restaurant staff reader with zero code knowledge
   * -- no function names, no query language, no file references. If the
   * cause needs jargon to explain precisely, put the precise version in
   * `devNotes` instead and keep this one at "what would a human notice."
   */
  causes: string[];
  /**
   * Developer-only debugging notes: function/file names, query mechanics,
   * exact fields to check. NEVER rendered by /help/errors or any UI --
   * grep this file directly when actually debugging a reported code. Kept
   * in the same registry entry as `causes` so the two stay next to each
   * other and don't drift, even though only one of them ships to the page.
   */
  devNotes: string[];
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
      "A typo in the restaurant name or password. The name isn't case-sensitive, but the password is.",
      "The restaurant was deleted or renamed since these credentials were last used.",
      "This same message shows up whether the password is wrong OR the restaurant name doesn't exist at all -- that's on purpose, so no one can use the login screen to guess which restaurant names are registered.",
    ],
    devNotes: [
      "Case-insensitive on name, case-sensitive on password.",
      "Intentionally doesn't distinguish \"wrong password\" from \"no such restaurant\" (see SECURITY_ATTACK_LOG.md F4, timing-safe dummy hash) to avoid leaking which restaurant names are registered.",
    ],
  },
  INVALID_PIN: {
    code: 201,
    title: "Invalid PIN",
    defaultMessage: "Invalid PIN",
    meaning: "That PIN doesn't match any active employee at this restaurant. Double-check the digits and try again.",
    causes: [
      "Wrong digits were entered.",
      "The Manager toggle wasn't switched on for a 6-digit manager PIN -- it submits early at 4 digits and will always fail.",
      "The employee was deactivated since this PIN was set.",
      "This device is signing in on the wrong restaurant's screen.",
    ],
    devNotes: [
      "A real 6-digit manager PIN typed with the Manager toggle off auto-submits at 4 digits and always fails.",
      "verify-pin is scoped strictly to one restaurant's roster -- confirm the PinPad instance's restaurant matches.",
    ],
  },
  INVALID_OR_INACTIVE_EMPLOYEE: {
    code: 202,
    title: "Employee not recognized",
    defaultMessage: "Invalid or inactive employee",
    meaning:
      "This employee isn't currently active on this kitchen's roster — they may have been deactivated, or the session may be for a different kitchen.",
    causes: [
      "This device still remembers an employee from a previous shift who was since deactivated -- have them sign in again.",
      "The employee was removed from the roster partway through their shift.",
      "This device is signed in as an employee from a different restaurant.",
    ],
    devNotes: [
      "Stale employeeId in sessionStorage from a previous shift/kitchen after the employee was deactivated -- see lib/employee-session.ts.",
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
      "The order was deleted by the kitchen or an admin since it was last looked at.",
      "The order name typed doesn't quite match what's on record -- double-check spelling.",
    ],
    devNotes: [
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
      "Another admin or another browser tab already restored this order before this click went through.",
      "This order was permanently deleted rather than moved to the deleted list, so there's nothing left to restore.",
    ],
    devNotes: [
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
      "The restaurant was permanently deleted by an admin after this page loaded its name but before this action ran.",
      "The restaurant name doesn't quite match what's on record -- an extra space at the start or end can cause this even though capitalization doesn't matter.",
    ],
    devNotes: [
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
      "Another admin or tab deactivated this employee since this page's roster was loaded.",
      "This employee record belongs to a different restaurant than the one being managed.",
    ],
    devNotes: [
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
      "Another tab or admin deleted this role between page load and this edit/delete attempt.",
      "This page is still referencing a role that was renamed and recreated, so the old reference no longer points to anything.",
    ],
    devNotes: [
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
      "The role being assigned actually belongs to a different restaurant's role list, not this one.",
      "This is kept as a separate error from the general \"role not found\" case because it happens specifically while assigning a role to an employee, not while managing roles directly.",
    ],
    devNotes: [
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
      "The order genuinely hasn't reached the Complete stage yet.",
      "The order was deleted between the time it was loaded and when pickup was tapped.",
      "Two pickup taps happened at nearly the same moment (one from the customer, one from the kitchen) and the second one arrived after the order was already marked picked up.",
    ],
    devNotes: [
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
      "More than 8 seconds passed between the status change and tapping undo.",
      "The order has already moved further along since this particular change was made, so only the very last step can be undone.",
    ],
    devNotes: [
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
      "A second status change already happened after this one, so there's nothing left for undo to reverse.",
      "The undo window closed by the time the tap actually reached the server, due to a slow connection.",
      "The order was already picked up since this change was made -- undo isn't available once a completed order has been picked up.",
    ],
    devNotes: [
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
      "Staff genuinely typed in an order name/number that's already in use.",
      "Two order names that look different can still count as the same -- for example \"Pager 14\" and \"pager-14\" are treated as duplicates on purpose, which can be surprising if you expected only exact matches to be blocked.",
    ],
    devNotes: [
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
      "Someone genuinely tried to register a restaurant name that's already taken.",
      "A restaurant that was deleted earlier still keeps its name reserved forever -- unlike orders, deleted restaurants can't be restored, so their name can't be reused either.",
    ],
    devNotes: [
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
      "Two staff members at the same restaurant genuinely have (or were given) the same name -- the same name is fine at a different restaurant, just not within one kitchen's roster.",
      "A staff member who was previously removed and is now being re-added still counts as a conflict if their old record wasn't fully cleared out.",
    ],
    devNotes: [
      "Genuine duplicate name within one restaurant's roster -- uniqueness is per-restaurant, not global, so the same name is fine at a different kitchen.",
      "A previously-deactivated employee with the same name still counts as a live uniqueness conflict if they were reactivated, or if the unique index doesn't exclude soft-deleted rows -- check restaurant_employees' actual index definition if this fires unexpectedly.",
    ],
  },
  ROLE_NAME_ALREADY_EXISTS: {
    code: 405,
    title: "Role name already exists",
    defaultMessage: "A role with this name already exists",
    meaning: "Another role at this restaurant already uses this name.",
    causes: ["Someone tried to create a role with a label that's already used at this restaurant."],
    devNotes: ["Genuine duplicate role label within one restaurant -- role names are unique per-restaurant only."],
  },
  PIN_ALREADY_IN_USE: {
    code: 406,
    title: "PIN already in use",
    defaultMessage: "That PIN is already in use by another employee. Choose a different one.",
    meaning:
      "Another active employee at this restaurant is already using this PIN. Choose a different one so the system can tell staff apart by PIN alone.",
    causes: [
      "Another staff member at this restaurant is already using that exact PIN -- since there's no name picker at sign-in, each PIN has to uniquely identify one person.",
      "A 4-digit staff PIN and a 6-digit manager PIN are never considered a conflict with each other, even if the digits look similar.",
    ],
    devNotes: [
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
      "Someone else already changed this order's status before this action went through.",
      "This usually isn't a real problem -- it's the expected result of two staff members trying to advance the same order at the same time; the screen should already be showing the up-to-date status to both.",
    ],
    devNotes: [
      "Optimistic-concurrency UPDATE's WHERE LOWER(status) = $currentStatus matched zero rows -- someone else already changed it first.",
      "Not actually an error condition most of the time -- this is the expected result of two staff members racing to advance the same order; the WS broadcast should already be pushing the real current state to both.",
    ],
  },
  RESTAURANT_NAME_TAKEN_RENAME: {
    code: 409,
    title: "Restaurant name already exists",
    defaultMessage: "A restaurant with this name already exists",
    meaning: "Another restaurant is already using the name you tried to rename to.",
    causes: ["Another restaurant is genuinely already using the name this one is being renamed to."],
    devNotes: ["Genuine name collision on rename -- checked via a LOWER(name) query excluding the row's own id."],
  },
  INVALID_STATUS_TRANSITION: {
    code: 411,
    title: "Status change not allowed",
    defaultMessage: "Cannot change status",
    meaning:
      "Orders can only move forward one step at a time (Received → Preparing → Complete). This change would have skipped a step or gone backward.",
    causes: [
      "This normally only happens when the screen was showing an outdated status (the order had already moved on elsewhere) and a step got skipped as a result.",
      "An admin using God Mode can force any status change and will never see this error, since that restriction doesn't apply to them.",
    ],
    devNotes: [
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
      "After this order was deleted, a new order was created at this restaurant using the same name, so restoring the old one would create a naming conflict that couldn't be caught until this restore was attempted.",
    ],
    devNotes: [
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
      "This is the normal anti-guessing protection working as intended after too many failed login tries.",
      "Everyone sharing the same restaurant WiFi or network counts as one group for this limit, so a busy shared tablet plus other traffic on the same network can trip this together even though no single person did anything wrong.",
    ],
    devNotes: [
      "Real credential-guessing throttle doing its job.",
      "Every caller behind one NAT/router shares one bucket (getClientIp() falls back to a literal \"unknown\" string with no X-Forwarded-For header) -- a shared kitchen tablet plus a dev's own curl/test traffic can trip this together, see CLAUDE.md's rate-limit-bucket lesson.",
    ],
  },
  RATE_LIMITED_REGISTER: {
    code: 501,
    title: "Too many registration attempts",
    defaultMessage: "Too many registration attempts. Try again in a minute.",
    meaning: "Too many registration attempts too quickly from this network. Wait a minute and try again.",
    causes: ["This limit is stricter than login since each attempt creates a permanent new restaurant record -- a normal person registering a restaurant should never run into this."],
    devNotes: ["Tighter than login (5/min) since each attempt permanently creates a row -- a normal user should never hit this."],
  },
  RATE_LIMITED_GENERAL: {
    code: 502,
    title: "Too many requests",
    defaultMessage: "Too many requests. Slow down a moment.",
    meaning: "Too many requests too quickly. Wait a moment and try again.",
    causes: ["This limit is shared across a few public pages like order search -- check which page was in use before assuming it's always the same cause."],
    devNotes: ["Shared limit across several anonymous/public-ish endpoints (order search, suggest) -- check which specific route logged this before assuming it's the same limiter each time."],
  },
  RATE_LIMITED_ORDERS: {
    code: 503,
    title: "Too many orders created",
    defaultMessage: "Too many orders created too quickly. Slow down a moment.",
    meaning: "Too many orders were created too quickly for this restaurant. Wait a moment and try again.",
    causes: ["This limit is tracked per restaurant rather than per device, and it's set well above normal order-entry speed, so a genuinely busy kitchen shouldn't trip it -- if it fires during normal use, something is submitting orders faster than a person could type."],
    devNotes: ["Keyed per-restaurant, not per-IP -- a legitimately busy kitchen behind one connection won't trip this at realistic order-entry speed (30/min = one every 2s); if it fires during normal use, something is auto-submitting faster than a human types."],
  },
  RATE_LIMITED_PIN: {
    code: 504,
    title: "Too many PIN attempts",
    defaultMessage: "Too many PIN attempts. Try again in a minute.",
    meaning: "Too many PIN attempts too quickly. Wait a minute before trying again.",
    causes: ["This limit is stricter than login because a short PIN is much easier to guess than a password -- it exists specifically to protect a shared kitchen tablet from PIN-guessing."],
    devNotes: ["Tighter (15/min) than login since a 4-6 digit PIN has far less entropy than a password -- this is the realistic anti-guessing throttle for a shared kitchen tablet."],
  },
  RATE_LIMITED_STAFF: {
    code: 505,
    title: "Too many requests",
    defaultMessage: "Too many requests. Try again in a minute.",
    meaning: "Too many staff-management requests too quickly. Wait a minute and try again.",
    causes: ["This covers adding new employees or roles -- a normal admin setting up a roster shouldn't come anywhere close to this limit."],
    devNotes: ["Covers employee/role create routes -- a normal admin session doing roster setup shouldn't come close to 20/min."],
  },
  RATE_LIMITED_HEALTH: {
    code: 506,
    title: "Too many requests",
    defaultMessage: "Too many requests",
    meaning: "Too many health-check requests too quickly. This resolves itself within a few seconds.",
    causes: ["This should resolve on its own within seconds -- if it keeps happening, something outside the normal app (an extra open tab, a script) is repeatedly checking system status."],
    devNotes: ["HealthPin's own polling is capped well under this limit -- if a real user hits this, something is polling /api/health outside the normal HealthPin component (a stray extra tab, a script)."],
  },

  // ---- 900-999: Internal ----
  INTERNAL_ERROR: {
    code: 900,
    title: "Something went wrong on our end",
    defaultMessage: "Internal Server Error",
    meaning:
      "An unexpected server error occurred. This isn't something you did — try again in a moment, and if it keeps happening, let an admin know.",
    causes: [
      "Something unexpected broke on the server side rather than anything the person using the app did wrong.",
      "This can come from a brief hiccup connecting to the database, an unusual situation the system wasn't specifically checking for, or a genuine bug in a newer part of the app.",
    ],
    devNotes: [
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
      "A server error interrupted the deletion partway through -- the system is designed so that if this happens, nothing is left half-deleted, and it's safe to just try again.",
    ],
    devNotes: [
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
