/**
 * Single source of truth mapping every API error this app can return to a
 * short numeric code, a title, and a plain-English "what this means /
 * what to do" explanation -- the same idea as a Gemini/Google error code you
 * can look up on a help page. Both `errJson()` (attaches a code to every API
 * error response) and `/help/errors` (renders the full lookup page) import
 * from this one map, so adding a new error is: add one entry here, use its
 * key at the throw site, done -- nothing else to keep in sync.
 *
 * Codes are grouped by KIND, not by HTTP status -- a kitchen worker doesn't
 * know or care what "404" means, but "this thing doesn't exist" and "you
 * typed something wrong" are meaningfully different categories worth
 * grouping together on the help page:
 *
 *   100-199  Validation   -- the request itself was malformed/incomplete/invalid
 *   200-299  Auth         -- credentials, PIN, or session were wrong/missing
 *   300-399  Not found    -- the thing referenced doesn't exist (or isn't yours)
 *   400-499  Conflict     -- the request was well-formed but collides with
 *                            existing state (duplicate name, already used PIN,
 *                            invalid state transition, expired undo window)
 *   500-599  Rate limit   -- too many requests too fast
 *   900-999  Internal     -- something broke on the server side, not the caller's fault
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
  /** Plain-English explanation shown on /help/errors and in the popup card. */
  meaning: string;
};

export const ERROR_CODES = {
  // ---- 100-199: Validation ----
  MALFORMED_JSON: { code: 100, title: "Malformed request", defaultMessage: "Malformed JSON body", meaning: "The request body wasn't valid JSON. This usually means a network issue or a browser extension interfering with the page — try reloading." },
  INVALID_ORDER_ID: { code: 101, title: "Invalid order reference", defaultMessage: "Invalid order id", meaning: "The order reference in this request wasn't a valid id. This shouldn't happen from normal use of the app — try reloading the page." },
  INVALID_RESTAURANT_ID: { code: 102, title: "Invalid restaurant reference", defaultMessage: "Invalid restaurant id", meaning: "The restaurant reference in this request wasn't a valid id. Try reloading the page." },
  INVALID_EMPLOYEE_ID: { code: 103, title: "Invalid employee reference", defaultMessage: "Invalid employee id", meaning: "The employee reference in this request wasn't a valid id. Try reloading the page." },
  INVALID_ROLE_ID: { code: 104, title: "Invalid role reference", defaultMessage: "Invalid role id", meaning: "The role reference in this request wasn't a valid id. Try reloading the page." },
  MISSING_ORDER_FIELDS: { code: 105, title: "Missing order details", defaultMessage: "restaurant_name and order_number are required (letters, numbers, spaces, and basic punctuation only, max 200 chars)", meaning: "A restaurant name and order name are both required to create an order." },
  INVALID_STATUS: { code: 107, title: "Invalid status", defaultMessage: "Invalid status", meaning: "The status value sent wasn't one of the order statuses this app recognizes (Received, Preparing, Complete)." },
  INVALID_UNDO_TOKEN: { code: 108, title: "Invalid undo request", defaultMessage: "Invalid undo token", meaning: "The undo request was missing its confirmation token. Try the action again." },
  INVALID_STATUS_TRANSITION: { code: 109, title: "Status change not allowed", defaultMessage: "Cannot change status", meaning: "Orders can only move forward one step at a time (Received → Preparing → Complete). This change would have skipped a step or gone backward." },
  MISSING_RESTAURANT_NAME_ORDER_NUMBER: { code: 110, title: "Missing order details", defaultMessage: "restaurant_name and order_number are required", meaning: "A restaurant name and order name are both required for this action." },
  INVALID_PASSWORD_LENGTH: { code: 111, title: "Invalid password length", defaultMessage: "Password must be 8-200 characters", meaning: "Passwords must be between 8 and 200 characters." },
  MISSING_LOGIN_FIELDS: { code: 112, title: "Missing login details", defaultMessage: "Restaurant name and password are required", meaning: "A restaurant name and password are both required to log in." },
  EMPLOYEE_NAME_REQUIRED: { code: 113, title: "Employee name required", defaultMessage: "Employee name is required", meaning: "An employee needs a name before they can be added to the roster." },
  INVALID_PIN_LENGTH: { code: 114, title: "Invalid PIN length", defaultMessage: "PIN must be the required number of digits", meaning: "PINs must be exactly the required number of digits — 4 for an employee, 6 for a manager." },
  ACCOUNT_TYPE_REQUIRES_NEW_PIN: { code: 115, title: "New PIN required for promotion", defaultMessage: "Promoting to manager requires setting a new 6-digit PIN in the same request", meaning: "Promoting an employee to manager requires setting a new 6-digit PIN in the same request, since managers can't share a shorter employee-length PIN." },
  INVALID_ACCOUNT_TYPE: { code: 116, title: "Invalid account type", defaultMessage: "accountType must be 'manager' or 'employee'", meaning: "Account type must be either \"manager\" or \"employee\"." },
  NO_FIELDS_TO_UPDATE: { code: 117, title: "Nothing to update", defaultMessage: "No fields to update", meaning: "This request didn't include any fields to change." },
  EMPLOYEE_NAME_EMPTY: { code: 118, title: "Employee name cannot be empty", defaultMessage: "Employee name cannot be empty", meaning: "An employee's name can't be blank." },
  ROLE_NAME_REQUIRED: { code: 119, title: "Role name required", defaultMessage: "Role name is required", meaning: "A role needs a name (e.g. \"Chef\", \"Cashier\") before it can be created." },
  ROLE_NAME_EMPTY: { code: 120, title: "Role name cannot be empty", defaultMessage: "Role name cannot be empty", meaning: "A role's name can't be blank." },
  PIN_REQUIRED: { code: 121, title: "PIN required", defaultMessage: "pin is required", meaning: "A PIN is required to verify who's signing in." },
  EMPLOYEE_ID_REQUIRED: { code: 122, title: "Employee id required", defaultMessage: "employeeId is required", meaning: "This action needs to know which employee is performing it." },
  INVALID_PICKUP_WINDOW: { code: 123, title: "Invalid pickup window", defaultMessage: "completeCapHours must be a number within the allowed range", meaning: "The custom pickup window must be a number of hours within the allowed range." },
  AUDIT_FILTER_NEEDS_RESTAURANT: { code: 124, title: "Employee filter needs a restaurant", defaultMessage: "employeeName filter requires restaurantName (employee names are only unique per kitchen)", meaning: "Employee names are only unique within one kitchen, so filtering the audit log by employee also requires picking a restaurant." },
  MISSING_SEARCH_FIELDS: { code: 125, title: "Missing search details", defaultMessage: "Restaurant name and order number are required", meaning: "A restaurant name and order name are both required to look up an order." },
  MISSING_NEW_NAME: { code: 126, title: "New name required", defaultMessage: "New name is required (letters, numbers, spaces, and basic punctuation only, max 200 chars)", meaning: "A new name is required (letters, numbers, spaces, and basic punctuation only, max 200 characters)." },
  MISSING_NEW_PASSWORD: { code: 127, title: "New password required", defaultMessage: "New password is required (non-empty string, max 200 chars)", meaning: "A new password is required (non-empty, max 200 characters)." },
  INVALID_ORDER_NAME_REGISTER: { code: 128, title: "Invalid restaurant name", defaultMessage: "Restaurant name is required (letters, numbers, spaces, and basic punctuation only, max 200 chars)", meaning: "Restaurant names can only contain letters, numbers, spaces, and basic punctuation, up to 200 characters." },
  CONFIRMATION_PHRASE_MISSING: { code: 129, title: "Confirmation phrase required", defaultMessage: "Confirmation phrase required", meaning: "Destructive actions (Seed, Purge Database, Purge Audit Log) require typing the exact confirmation phrase shown on screen." },

  // ---- 200-299: Auth ----
  INVALID_CREDENTIALS: { code: 200, title: "Invalid credentials", defaultMessage: "Invalid credentials", meaning: "The restaurant name/username or password entered doesn't match our records." },
  INVALID_PIN: { code: 201, title: "Invalid PIN", defaultMessage: "Invalid PIN", meaning: "That PIN doesn't match any active employee at this restaurant. Double-check the digits and try again." },
  INVALID_OR_INACTIVE_EMPLOYEE: { code: 202, title: "Employee not recognized", defaultMessage: "Invalid or inactive employee", meaning: "This employee isn't currently active on this kitchen's roster — they may have been deactivated, or the session may be for a different kitchen." },

  // ---- 300-399: Not found ----
  ORDER_NOT_FOUND: { code: 300, title: "Order not found", defaultMessage: "Order not found", meaning: "This order doesn't exist, was deleted, or the restaurant/order name combination doesn't match anything on record." },
  DELETED_ORDER_NOT_FOUND: { code: 301, title: "Deleted order not found", defaultMessage: "Deleted order not found", meaning: "This order isn't in the deleted-orders list — it may have already been restored, or never existed." },
  RESTAURANT_NOT_FOUND: { code: 302, title: "Restaurant not found", defaultMessage: "Restaurant not found", meaning: "This restaurant doesn't exist or has been removed." },
  EMPLOYEE_NOT_FOUND: { code: 303, title: "Employee not found", defaultMessage: "Employee not found", meaning: "This employee doesn't exist on this kitchen's roster, or has already been deactivated." },
  ROLE_NOT_FOUND: { code: 304, title: "Role not found", defaultMessage: "Role not found", meaning: "This role label doesn't exist for this kitchen — it may have already been deleted." },
  ROLE_NOT_FOUND_FOR_KITCHEN: { code: 305, title: "Role not found", defaultMessage: "Role not found for this kitchen", meaning: "This role label doesn't belong to this kitchen — it may have been deleted, or belongs to a different restaurant." },
  ACKNOWLEDGE_TARGET_NOT_FOUND: { code: 306, title: "Order not ready to acknowledge", defaultMessage: "Order not found, not yet complete, or has been deleted", meaning: "This order doesn't exist, hasn't reached Complete yet, or has been deleted, so it can't be marked picked up." },

  // ---- 400-499: Conflict ----
  UNDO_NOT_ALLOWED: { code: 400, title: "This change can no longer be undone", defaultMessage: "This status change cannot be undone", meaning: "The 8-second undo window has passed, or the order has moved on since — undo is only available immediately after a status change." },
  UNDO_EXPIRED_OR_STALE: { code: 401, title: "Undo expired or order changed", defaultMessage: "Undo expired or the order changed in another tab", meaning: "The undo window closed, or this order was changed in another tab/device since you made this change — the displayed status has been refreshed to match the real current state." },
  ORDER_NAME_ALREADY_EXISTS: { code: 402, title: "Order name already exists", defaultMessage: "An order with this name already exists for this restaurant", meaning: "Another live order at this restaurant already uses this exact name. Order names must be unique per restaurant while active." },
  RESTAURANT_NAME_ALREADY_EXISTS: { code: 403, title: "Restaurant name already exists", defaultMessage: "Restaurant with this name already exists", meaning: "Another restaurant is already registered under this name. Restaurant names must be unique." },
  EMPLOYEE_NAME_ALREADY_EXISTS: { code: 404, title: "Employee name already exists", defaultMessage: "An employee with this name already exists", meaning: "Another active employee at this restaurant already has this name." },
  ROLE_NAME_ALREADY_EXISTS: { code: 405, title: "Role name already exists", defaultMessage: "A role with this name already exists", meaning: "Another role at this restaurant already uses this name." },
  PIN_ALREADY_IN_USE: { code: 406, title: "PIN already in use", defaultMessage: "That PIN is already in use by another employee. Choose a different one.", meaning: "Another active employee at this restaurant is already using this PIN. Choose a different one so the system can tell staff apart by PIN alone." },
  ORDER_CHANGED_ELSEWHERE: { code: 407, title: "Order changed in another tab", defaultMessage: "Order changed in another tab. Refreshing the latest status.", meaning: "This order was updated somewhere else (another tab, device, or staff member) since this page last loaded. The displayed status has been refreshed to match." },
  CONFIRMATION_PHRASE_MISMATCH: { code: 408, title: "Confirmation phrase didn't match", defaultMessage: "Confirmation phrase did not match", meaning: "Destructive actions (Seed, Purge Database, Purge Audit Log) require typing the exact confirmation phrase shown on screen — what was typed didn't match." },
  RESTAURANT_NAME_TAKEN_RENAME: { code: 409, title: "Restaurant name already exists", defaultMessage: "A restaurant with this name already exists", meaning: "Another restaurant is already using the name you tried to rename to." },
  ORDER_NAME_TAKEN_UNDELETE: { code: 410, title: "Order name already exists", defaultMessage: "Cannot restore -- an order with this name already exists for this restaurant", meaning: "This order can't be restored because a different live order at this restaurant now uses the same name. Rename or remove that order first." },

  // ---- 500-599: Rate limit ----
  RATE_LIMITED_LOGIN: { code: 500, title: "Too many login attempts", defaultMessage: "Too many login attempts. Try again in a minute.", meaning: "Too many login attempts too quickly. Wait a minute and try again." },
  RATE_LIMITED_REGISTER: { code: 501, title: "Too many registration attempts", defaultMessage: "Too many registration attempts. Try again in a minute.", meaning: "Too many registration attempts too quickly from this network. Wait a minute and try again." },
  RATE_LIMITED_GENERAL: { code: 502, title: "Too many requests", defaultMessage: "Too many requests. Slow down a moment.", meaning: "Too many requests too quickly. Wait a moment and try again." },
  RATE_LIMITED_ORDERS: { code: 503, title: "Too many orders created", defaultMessage: "Too many orders created too quickly. Slow down a moment.", meaning: "Too many orders were created too quickly for this restaurant. Wait a moment and try again." },
  RATE_LIMITED_PIN: { code: 504, title: "Too many PIN attempts", defaultMessage: "Too many PIN attempts. Try again in a minute.", meaning: "Too many PIN attempts too quickly. Wait a minute before trying again." },
  RATE_LIMITED_STAFF: { code: 505, title: "Too many requests", defaultMessage: "Too many requests. Try again in a minute.", meaning: "Too many staff-management requests too quickly. Wait a minute and try again." },
  RATE_LIMITED_HEALTH: { code: 506, title: "Too many requests", defaultMessage: "Too many requests", meaning: "Too many health-check requests too quickly. This resolves itself within a few seconds." },

  // ---- 900-999: Internal ----
  INTERNAL_ERROR: { code: 900, title: "Something went wrong on our end", defaultMessage: "Internal Server Error", meaning: "An unexpected server error occurred. This isn't something you did — try again in a moment, and if it keeps happening, let an admin know." },
  RESTAURANT_DELETE_FAILED: { code: 901, title: "Couldn't delete restaurant", defaultMessage: "Failed to delete restaurant and associated orders.", meaning: "The restaurant and its orders couldn't be fully deleted due to a server error. Nothing was left partially deleted — try again." },
} as const satisfies Record<string, ErrorCodeEntry>;

export type ErrorCodeKey = keyof typeof ERROR_CODES;

const BY_NUMBER: Map<number, ErrorCodeEntry> = new Map(
  Object.values(ERROR_CODES).map((entry) => [entry.code, entry]),
);

export function lookupErrorCode(code: number): ErrorCodeEntry | null {
  return BY_NUMBER.get(code) ?? null;
}

/** For /help/errors -- every entry, grouped by hundred-range, ascending. */
export function listErrorCodesByCategory(): { category: string; entries: ErrorCodeEntry[] }[] {
  const ranges: { category: string; min: number; max: number }[] = [
    { category: "Validation", min: 100, max: 199 },
    { category: "Authentication", min: 200, max: 299 },
    { category: "Not Found", min: 300, max: 399 },
    { category: "Conflict", min: 400, max: 499 },
    { category: "Rate Limit", min: 500, max: 599 },
    { category: "Internal", min: 900, max: 999 },
  ];
  const all = Object.values(ERROR_CODES).sort((a, b) => a.code - b.code);
  return ranges
    .map((range) => ({
      category: range.category,
      entries: all.filter((e) => e.code >= range.min && e.code <= range.max),
    }))
    .filter((group) => group.entries.length > 0);
}
