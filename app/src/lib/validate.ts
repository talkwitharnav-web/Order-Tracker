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

/**
 * Returns the trimmed string if `value` is a non-empty string within
 * `maxLength`, otherwise `null`. Callers should treat `null` as a 400.
 */
export function requireString(
  value: unknown,
  maxLength: number = DEFAULT_MAX_LENGTH,
): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (trimmed.length === 0 || trimmed.length > maxLength) return null;
  return trimmed;
}

/** Escapes ILIKE/LIKE wildcard characters (`%`, `_`, `\`) in a value that will be bound as a pattern. */
export function escapeLikePattern(value: string): string {
  return value.replace(/[\\%_]/g, "\\$&");
}
