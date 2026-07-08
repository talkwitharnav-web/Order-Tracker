/**
 * Small shared input-validation helpers. Routes previously only checked
 * truthiness (`if (!name) ...`), which let non-string JSON values (numbers,
 * booleans, objects, arrays) flow into DB inserts/lookups (some coerced and
 * stored silently, some threw an unhandled 500 — see SECURITY_ATTACK_LOG.md
 * F9) and let unbounded-length strings through (F6). These helpers give a
 * single place to enforce "is this actually the string I expect, and is it a
 * sane length" before a value reaches a query.
 */

const DEFAULT_MAX_LENGTH = 200;

// Matches any ASCII control character (0x00-0x1F, 0x7F), including the null
// byte -- a null byte reaching a Postgres text-column INSERT/query throws an
// unhandled driver-level error (Postgres text columns cannot store \0 at
// all), which surfaced as an unhandled 500 rather than a clean 400 (see
// SECURITY_ATTACK_LOG.md, "Null Byte Injection" finding). Tabs/backspace/CRLF
// are also stripped here -- none of them are legitimate in any string this
// app accepts (names, passwords, search queries, order numbers), and CRLF
// specifically is a header/log-injection vector if a value is ever echoed
// into a header or a plain-text log line.
const CONTROL_CHARS = /[\x00-\x1F\x7F]/g;

/**
 * Returns the trimmed string if `value` is a non-empty string within
 * `maxLength` once control characters (including null bytes, tabs, CRLF) are
 * stripped, otherwise `null`. Callers should treat `null` as a 400. This is
 * the baseline validator for every string input in this app (passwords,
 * search queries, names) -- it does NOT restrict to a display-safe character
 * set (still allows `<`, `'`, etc.), since some callers (password fields,
 * free-text search) have no reason to forbid those. Use `requireSafeName`
 * instead for values that get stored and later displayed/rendered as a name
 * (restaurant names, order numbers).
 */
export function requireString(
  value: unknown,
  maxLength: number = DEFAULT_MAX_LENGTH,
): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.replace(CONTROL_CHARS, "").trim();
  if (trimmed.length === 0 || trimmed.length > maxLength) return null;
  return trimmed;
}

// Printable ASCII plus a small set of punctuation genuinely useful in a
// restaurant/order name ("O'Brien's", "Order #12", "Table 4-B"). Deliberately
// excludes `< > & " \` since those are the characters that let a stored name
// act as markup/script if it's ever rendered outside of React's automatic
// JSX escaping (an admin export, a future email/receipt template, a log
// viewer, etc.) -- see SECURITY_ATTACK_LOG.md's "Stored XSS via API" finding.
// This is a display-name whitelist, not a general string validator: don't
// use this for passwords or search queries, which have no such rendering
// risk and shouldn't be restricted this tightly.
const SAFE_NAME_PATTERN = /^[A-Za-z0-9 '.,#_-]+$/;

/**
 * Like `requireString`, but additionally rejects any value containing a
 * character outside `SAFE_NAME_PATTERN` (this also naturally excludes
 * control characters, so there's no need to run both). Use for any value
 * that gets stored and could later be rendered/exported outside of React's
 * JSX auto-escaping -- restaurant names, order numbers.
 */
export function requireSafeName(
  value: unknown,
  maxLength: number = DEFAULT_MAX_LENGTH,
): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (trimmed.length === 0 || trimmed.length > maxLength) return null;
  if (!SAFE_NAME_PATTERN.test(trimmed)) return null;
  return trimmed;
}

/**
 * Read-side check for the same character set `requireSafeName` enforces at
 * write time -- use this to filter values that were already stored (e.g. by
 * a row created before this validation existed) rather than to validate new
 * input (use `requireSafeName` for that, since it also handles trimming/
 * length/type-checking and returns a clear reject signal).
 */
export function isSafeName(value: string): boolean {
  return SAFE_NAME_PATTERN.test(value);
}

/** Escapes ILIKE/LIKE wildcard characters (`%`, `_`, `\`) in a value that will be bound as a pattern. */
export function escapeLikePattern(value: string): string {
  return value.replace(/[\\%_]/g, "\\$&");
}

// server.js already caps every /api/* request body at 16KB, which bounds
// how much JSON there can possibly be -- but a small body can still nest
// very deeply (a few hundred bytes of "{"a":" repeated is enough for 50+
// levels), and V8's JSON.parse recursion for a sufficiently deep structure
// is real CPU/stack cost per request regardless of total byte count (see
// SECURITY_ATTACK_LOG.md's "No Request Body Size Limit" finding, which
// specifically called out deeply-nested JSON as accepted without issue).
// This app's actual request bodies are always flat (a handful of top-level
// string/boolean fields, never nested objects/arrays) -- 5 levels is
// already generous headroom over that.
const MAX_JSON_DEPTH = 5;

function jsonDepth(value: unknown, depth = 0): number {
  if (depth > MAX_JSON_DEPTH) return depth;
  if (value === null || typeof value !== "object") return depth;
  const children = Array.isArray(value) ? value : Object.values(value as Record<string, unknown>);
  let max = depth;
  for (const child of children) {
    const childDepth = jsonDepth(child, depth + 1);
    if (childDepth > max) max = childDepth;
    if (max > MAX_JSON_DEPTH) break;
  }
  return max;
}

/**
 * Parses a request body as JSON, rejecting (returns `null`) if it's
 * malformed OR nested deeper than `MAX_JSON_DEPTH`. Use this in place of a
 * bare `await request.json()` in any route handler.
 */
export async function parseJsonBody(request: Request): Promise<unknown | null> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return null;
  }
  if (jsonDepth(body) > MAX_JSON_DEPTH) return null;
  return body;
}
