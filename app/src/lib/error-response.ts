import { NextResponse } from "next/server";
import { ERROR_CODES, type ErrorCodeKey } from "@/lib/error-codes";

/**
 * Wraps NextResponse.json({ error, code }, { status }) so every API error
 * response carries a numeric code from the shared error-codes.ts registry —
 * the client can then show that code next to the message and link out to
 * /help/errors#<code> (see Toast.tsx's error-code chip). `status` still
 * needs to be passed explicitly (not derived from the code) since a couple
 * of codes are reused across call sites that return different statuses for
 * the same underlying meaning (e.g. ORDER_NOT_FOUND is 404 everywhere it's
 * used today, but the registry itself makes no promise about status, only
 * about the human-readable meaning).
 *
 * `message` overrides the registry's default text for this one response —
 * needed for the handful of errors that interpolate a live value (an order
 * name, a restaurant name, a computed limit) into the sentence. The CODE
 * (and therefore the /help/errors lookup) is still always the shared one;
 * only the inline toast wording differs.
 */
export function errJson(key: ErrorCodeKey, status: number, message?: string) {
  const entry = ERROR_CODES[key];
  return NextResponse.json({ error: message ?? entry.defaultMessage, code: entry.code }, { status });
}
