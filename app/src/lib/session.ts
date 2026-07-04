import { createHmac, timingSafeEqual } from "crypto";

/**
 * Dev-only fallback secret so the app works out of the box locally without
 * requiring SESSION_SECRET to be set — same precedent as the raw_password
 * technical debt documented in SYSTEM_MEMORY.md. Set a real SESSION_SECRET
 * before any non-local deployment.
 */
const SECRET = process.env.SESSION_SECRET || "dev-only-insecure-session-secret";

export type SessionPayload =
  | { type: "admin"; exp: number }
  | { type: "restaurant"; name: string; exp: number };

function sign(data: string): string {
  return createHmac("sha256", SECRET).update(data).digest("base64url");
}

export function createSessionToken(
  payload: { type: "admin" } | { type: "restaurant"; name: string },
): string {
  const full: SessionPayload = {
    ...payload,
    exp: Date.now() + SESSION_TOKEN_MAX_AGE * 1000,
  } as SessionPayload;
  const data = Buffer.from(JSON.stringify(full)).toString("base64url");
  const signature = sign(data);
  return `${data}.${signature}`;
}

export function verifySessionToken(token: string | undefined | null): SessionPayload | null {
  if (!token) return null;
  const [data, signature] = token.split(".");
  if (!data || !signature) return null;

  const expectedSignature = sign(data);
  const sigBuf = Buffer.from(signature);
  const expectedBuf = Buffer.from(expectedSignature);
  if (sigBuf.length !== expectedBuf.length || !timingSafeEqual(sigBuf, expectedBuf)) {
    return null;
  }

  try {
    const payload: SessionPayload = JSON.parse(Buffer.from(data, "base64url").toString("utf8"));
    if (payload.exp < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}

export const SESSION_COOKIE_NAME = "session";
/**
 * Token validity window — a safety bound independent of the cookie's own
 * lifetime. Always generous; browser persistence (remembered vs. session-only)
 * is controlled purely by the cookie's `maxAge` option at set-time, not by
 * this value (see login routes: omitting `maxAge` makes it a session cookie
 * that disappears when the browser closes, even though the token itself
 * would still verify if resent).
 */
export const SESSION_TOKEN_MAX_AGE = 60 * 60 * 24 * 30; // 30 days
export const SESSION_COOKIE_MAX_AGE_REMEMBERED = 60 * 60 * 24 * 30; // 30 days
