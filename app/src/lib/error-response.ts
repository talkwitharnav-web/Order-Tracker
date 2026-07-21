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

/**
 * Plain `{ error }` response with NO code -- for the class of error a user
 * can already self-diagnose from the message alone (a required field was
 * empty, a PIN was the wrong length, a confirmation phrase didn't match
 * what was typed). These are still real, still shown as a toast, but
 * looking them up on /help/errors would add a step for something the
 * message already fully explains -- codes exist for errors where the
 * "why" isn't obvious from the text alone (not-found, auth, conflict,
 * rate-limit, internal), not every possible 400. See error-codes.ts's own
 * comment for the full validation-vs-coded split.
 */
export function plainJson(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}
