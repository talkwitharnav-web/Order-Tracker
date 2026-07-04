# Security Attack Log

**Purpose**: Adversarial self-testing of the app's security posture, authorized by the project owner. This is a working log — findings get added as they're discovered, with severity, reproduction steps, and suggested fix. Nothing in here has been fixed yet; this is the "attack" pass. Fixes come in a follow-up session.

**Scope**: `c:\Users\arnav\Downloads\Restaurant\app` running locally at `http://localhost:3000`, Postgres in Docker (`restaurant-postgres-1`), WS at `/ws`.

**Rules of engagement I'm following**:
- Local-only, against my own dev instance. No external targets, no real user data.
- Throttled/careful with anything that could spike CPU/DB load or fill disk — this machine is doing other things.
- Will abort any test immediately if I see runaway resource usage.
- Read-only reconnaissance before any destructive-style test; test data cleaned up after each destructive test.

---

## Priority summary (read this first when picking fixes back up)

| # | Severity | Finding | Needs prior finding fixed first? |
|---|----------|---------|-----------------------------------|
| F1 | **CRITICAL** | Hardcoded session-signing secret → full admin impersonation with zero credentials | No — root cause, fix this first |
| F2 | **CRITICAL** | Same root cause as F1 → impersonate any (even nonexistent) restaurant | Fixed by the same change as F1 |
| F5 | **CRITICAL** | Unescaped `%`/`_` in ILIKE queries → anyone can pull up any customer's order with zero auth, zero forged tokens | No — independent of F1/F2, easiest to exploit of all findings |
| F3 | HIGH | Rate limiter trivially bypassed via spoofed `X-Forwarded-For` | No — independent |
| F4 | MEDIUM | Restaurant-login timing side-channel leaks which restaurant names exist | No — independent |
| F6 | LOW/MEDIUM | No length limit on `order_number`/`restaurant_name`; public registration endpoint especially exposed | No — independent |

**Recommended fix order once usage resets**: F1/F2 together (new random `SESSION_SECRET`, generated and actually set in `.env.local` — this alone closes the two most severe holes) → F5 (ILIKE escaping, quick and isolated) → F3 (stop trusting client-supplied IP header) → F4 (dummy bcrypt compare on not-found) → F6 (length caps).

---

## Findings

### F1 — CRITICAL: Full admin takeover via hardcoded session-signing secret (live, not theoretical)
**Status**: CONFIRMED EXPLOITABLE right now against the running dev instance.

`src/lib/session.ts:9` — `const SECRET = process.env.SESSION_SECRET || "dev-only-insecure-session-secret";`. Checked `.env.local` — **`SESSION_SECRET` is not set**, so the live app is actually signing/verifying every session cookie with this exact hardcoded string, which is visible in the source code (and would be visible in any git history/GitHub repo).

**Exploit**: Anyone who has ever seen this source file (public repo, leaked code, etc.) can forge an admin session token from scratch with no credentials at all:
```js
const { createHmac } = require('crypto');
const SECRET = 'dev-only-insecure-session-secret';
function sign(data) { return createHmac('sha256', SECRET).update(data).digest('base64url'); }
const payload = { type: 'admin', exp: Date.now() + 1000*60*60*24*30 };
const data = Buffer.from(JSON.stringify(payload)).toString('base64url');
const token = data + '.' + sign(data);
```
Setting this as the `admin_session` cookie gets `{"authenticated":true,"type":"admin"}` from `/api/session`, and a live `GET /api/dev/db` with this cookie returned **HTTP 200** — full read access to every restaurant (including plaintext `raw_password`) and every order, plus access to the purge/reseed endpoints, entirely without ever touching the login form.

**Why it matters even for a small internal tool**: this isn't a "needs enterprise hardening" issue — it's a complete authentication bypass. The `requireAdmin()`/`requireRestaurantOrAdmin()` guards added this session are worthless against this, because they trust *any* correctly-signed token, and the signing key is public knowledge in the source.

**Fix direction (not implemented yet, per instructions)**: generate and set a real random `SESSION_SECRET` in `.env.local` before any further use of this app, even locally. Longer-term, the code should probably refuse to start (or at least log a loud warning) when `SESSION_SECRET` is unset, rather than silently falling back to a hardcoded value — "dev convenience" shouldn't extend to authentication signing keys, only to things like the raw_password/admin-credential debt that's already been explicitly accepted.

**Blast radius**: this single finding subsumes and re-opens every auth fix made earlier this session (`requireAdmin`, `requireRestaurantOrAdmin` on all the previously-patched routes) — all of them can be bypassed by anyone who forges a token this way. This is the #1 priority fix once usage resets.

### F2 — CRITICAL: Restaurant impersonation via forged session (same root cause as F1, separate blast radius worth naming)
**Status**: CONFIRMED EXPLOITABLE.

Using the exact same known fallback secret from F1, forged a `{ type: "restaurant", name: "The Golden Spoon" }` token (or any restaurant name of the attacker's choosing — doesn't even need to be a real registered restaurant, since `requireRestaurantOrAdmin` only checks that the *name in the token* matches the name in the request, not that the restaurant actually exists/the token-holder ever authenticated as it).

**Exploit**: set `restaurant_session` cookie to a forged token with any `name` value → `/api/session` confirms `{"authenticated":true,"type":"restaurant","name":"The Golden Spoon"}` → `POST /api/orders` with matching `restaurant_name` succeeds (HTTP 200, order actually created in DB, confirmed and then cleaned up). This means an attacker can create/modify/delete orders for **any** restaurant by name, including ones that don't exist yet, with zero credentials.

**Distinct from F1** only in that F1 is "become admin" and F2 is "become any kitchen you want, including ones you make up" — both stem from the same root cause (hardcoded fallback signing secret) and share the same fix.

### F3 — HIGH: Rate limiter is trivially bypassable via X-Forwarded-For spoofing
**Status**: CONFIRMED EXPLOITABLE.

`src/lib/rate-limit.ts:31-35` (`getClientIp`) reads `X-Forwarded-For` directly from the request and trusts it unconditionally — there's no reverse proxy in this deployment stripping/overwriting that header, so any caller can set it to an arbitrary value.

**Exploit**: sent 15 failed admin-login attempts, each with a different spoofed `X-Forwarded-For: 10.0.0.N` header. All 15 returned 401 (correctly rejected credentials) but **none** triggered the 429 rate-limit response — each spoofed IP got its own fresh 10-attempt bucket. A real attacker can brute-force the admin/restaurant login endpoints at unlimited speed by rotating a header value on every request; the rate limiter only stops naive clients that don't fake headers.

**Fix direction**: don't trust `X-Forwarded-For` unless the app is actually behind a reverse proxy configured to strip/overwrite client-supplied values before setting it (not the case here — this is a bare Node server). Simplest fix for this deployment: use the raw TCP socket's remote address instead (available via the underlying Node request object in `server.js`, though Next.js route handlers don't directly expose the socket — would need to either pass it through a header set by `server.js` itself post-connection, or accept that IP-based limiting is unreliable here and rate-limit by another dimension too, e.g. per-username attempt count stored server-side, which can't be spoofed by the caller.

### F4 — MEDIUM: Restaurant-name enumeration via login timing side-channel
**Status**: CONFIRMED, clean and repeatable signal.

`src/app/api/restaurants/login/route.ts` — looks up the restaurant by name first; if not found, returns 401 immediately. If found, runs `bcrypt.compare(password, restaurant.password)` before returning 401 for a wrong password. bcrypt is deliberately slow (~70-100ms+ depending on cost factor), so "restaurant exists" and "restaurant doesn't exist" produce measurably different response times.

**Measured (curl `time_total`, 3 samples each, localhost so no network jitter)**:
- Existing restaurant name ("asdf") + wrong password: **0.133s, 0.079s, 0.078s**
- Nonexistent restaurant name + wrong password: **0.0105s, 0.0116s, 0.0126s**

That's roughly a 6-10x difference, trivially distinguishable even with network noise in a real deployment. An attacker can script a list of guessed restaurant names and reliably determine which ones exist without ever needing a correct password, then focus brute-force/social-engineering effort only on confirmed-real targets.

**Fix direction**: perform a dummy `bcrypt.compare` against a fixed placeholder hash when the restaurant isn't found, so both code paths take approximately the same amount of time regardless of whether the name exists. (This is the standard mitigation — don't try to "speed up" the found-user path instead, since bcrypt's cost is the whole point of using it.)

(Checked admin login for the same pattern — no timing signal there; it's a plain string comparison against hardcoded credentials with no bcrypt involved, both found/not-found paths run in ~8-11ms uniformly. Not a finding.)

### F5 — CRITICAL: Unescaped ILIKE wildcards let anyone pull up ANY customer's order with no auth
**Status**: CONFIRMED EXPLOITABLE, no auth required at all, no forged tokens needed — this one doesn't even require F1/F2.

`src/app/api/orders/search/route.ts:19-22` and `src/app/api/orders/route.ts` (`GET`) both build:
```sql
SELECT * FROM orders WHERE restaurant_name ILIKE $1 AND order_number ILIKE $2 ORDER BY created_at DESC LIMIT 1
```
The query is parameterized (no SQL injection), but Postgres's `ILIKE` treats `%` and `_` *inside the parameter value itself* as wildcards — parameterization only stops the value from being interpreted as SQL syntax, it does nothing to stop the value's own wildcard characters from being interpreted as pattern-matching wildcards. Since these routes take `restaurant_name`/`order_number` directly from unauthenticated public query params (this is the customer-facing "track your order" feature by design) and pass them straight into `ILIKE` with no escaping of `%`/`_`, any caller can pass `%` for both fields.

**Exploit (live PoC, then cleaned up)**:
1. Created a real order for a made-up restaurant "Wildcard Victim Kitchen" with order number `SECRET-ORDER-999` (simulating a real customer's real order).
2. As a completely separate, anonymous, unauthenticated request with **no knowledge of either the restaurant name or order number**: `GET /api/orders/search?restaurant_name=%25&order_number=%25` (`%25` is URL-encoded `%`).
3. Response: `{"id":26,"order_number":"SECRET-ORDER-999","restaurant_name":"Wildcard Victim Kitchen","status":"Received",...}` — the exact victim order, found and returned in full, HTTP 200.

Also confirmed the same flaw in `src/app/api/orders/restaurant/[restaurantName]/route.ts` (used by the kitchen dashboard to list a restaurant's own orders) — `GET /api/orders/restaurant/%25` returns orders belonging to *other* restaurants, not just the one the path segment nominally names. This route additionally has **no auth check of any kind** (not gated by `requireRestaurantOrAdmin` or anything else this session — it was missed during the earlier auth-gating pass, or intentionally left public for the customer-tracking flow, but it returns full order lists, not a single order, which is a bigger exposure than the single-order search endpoint).

**Why it matters**: this is the single easiest-to-exploit finding in this whole pass — no forged tokens, no known secrets, no login required, works from a plain browser address bar. Any customer using the legitimate order-tracking feature could, intentionally or by accident (e.g. pasting `%` while testing), see a stranger's order details. At current data sensitivity (order name + status + timestamp, no payment/contact info) the direct impact is privacy/information-disclosure rather than financial, but it's a clean, trivial IDOR/enumeration primitive that also works as a "does any restaurant/order exist at all matching this partial guess" oracle for reconnaissance.

**Fix direction**: escape `%`, `_`, and `\` in user-supplied values before interpolating into an `ILIKE` pattern (e.g. `value.replace(/[%_\\]/g, '\\$&')`), or switch to exact case-insensitive equality (`LOWER(restaurant_name) = LOWER($1)`) if fuzzy matching was never actually intended — worth checking with the user which behavior was intended, since case-insensitive exact match seems more likely to be the goal here than partial/fuzzy search. Also add an auth check (customer-facing single-order lookup can probably stay public by design, but the restaurant-wide order-listing endpoint arguably shouldn't be, since it's meant to be "my kitchen's queue," not "anyone's queue.")

### F6 — LOW: No application-level length limit on order_number (and likely other free-text fields)
**Status**: CONFIRMED, low severity, bounded testing only.

`orders.order_number` is a Postgres `TEXT` column (unbounded) and no route validates a maximum length before insert. Sent a 100,000-character `order_number` with a valid (forged, for test purposes) restaurant session — it was accepted (HTTP 200) and stored in full (confirmed via `LENGTH(order_number) = 100000` in the DB), then deleted as cleanup.

Tested a 5MB payload as a follow-up (same field) — this one returned HTTP 500 and nothing was written to the DB, so *something* in the stack rejects sufully large bodies well before 5MB (not confirmed exactly where — could be Next.js's default body-size limit, could be a DB-level error on the oversized value, wasn't investigated further to avoid unnecessary load/thrash). CPU/memory on the Postgres container stayed flat (0.3% CPU spike, no memory growth) during this test — no resource-exhaustion risk observed at these sizes.

**Why it matters**: low-to-medium severity because it requires an authenticated (or forged-token) session already for the order-creation path, and a 100KB string isn't itself dangerous — but there's no server-side cap on `order_number`/`restaurant_name` length, so a malicious or buggy authenticated client (kitchen or admin) could bloat rows, break UI rendering (the admin table renders these raw), or contribute to slow queries at scale.

**Follow-up test — this one is worse**: also checked `POST /api/restaurants/register`, which is fully public/unauthenticated by design (anyone can register a new kitchen). Sent a registration with a **50,000-character restaurant name** and no session/auth at all: **HTTP 201, accepted**, confirmed stored in full (`LENGTH(name) = 50019` including the prefix) via direct DB query, then deleted as cleanup. This means literally anyone on the internet (in a real deployment) can bloat the `restaurants` table with arbitrarily long names with zero authentication and zero rate limiting beyond the login-route limiter (registration isn't covered by `checkRateLimit` at all) — a much easier DoS-adjacent vector than the order-creation one, since it needs no token forgery, no login, nothing.

**Fix direction**: add a reasonable max-length check (e.g. 100-200 chars) on `order_number` and `restaurant_name` at the API layer, returning 400 for anything longer, on both the authenticated order-creation route and — more urgently, since it's the unauthenticated one — the public registration route. Also consider adding registration to the rate-limiter's coverage (it currently only covers the two login routes).

---

## Attack plan (drafted before execution)

1. **Session/auth forgery**: tamper with session cookie payload/signature, try expired tokens, try swapping `type: "restaurant"` to `type: "admin"` client-side, try replaying an old signature against a new payload, try a completely empty/malformed cookie, try extremely long cookie values (DoS-ish), try type confusion (numbers where strings expected).
2. **Auth bypass on gated routes**: retest all routes gated this session (`requireAdmin`/`requireRestaurantOrAdmin`) — but this time with crafted/forged cookies rather than "no cookie at all" (already proven blocked). Also check every route NOT explicitly gated (`orders/restaurant/[restaurantName]`, `orders/search`, `restaurants/route.ts` GET count, `session`, `logout`, `restaurants/register`) for unintended data exposure.
3. **IDOR / enumeration**: `orders/restaurant/[restaurantName]` and `orders/search` take restaurant name as a path/query param with no auth at all (by design, for customer tracking) — but do they leak more than intended (e.g. other restaurants' orders via ILIKE wildcard tricks, or enumeration of all restaurant names)? Test ILIKE wildcard injection (`%`, `_`) since these use `ILIKE` with directly-interpolated user values as parameters (parameterized, so no SQL injection, but ILIKE wildcards inside a parameter value are NOT escaped — `%` and `_` in the input itself act as SQL wildcards).
4. **Rate limit bypass**: test if the in-memory rate limiter can be trivially bypassed via `X-Forwarded-For` header spoofing (since `getClientIp` trusts that header blindly — likely a real finding), or via hitting a different route not covered by the limiter.
5. **Mass account/order enumeration**: try enumerating restaurant IDs on routes that take numeric IDs, try brute-forcing restaurant names via the login endpoint's timing/error differences (does "restaurant not found" vs "wrong password" differ in response time or message, enabling username enumeration?).
6. **Input validation / edge cases**: oversized payloads (large JSON bodies, very long strings) on registration/order creation — check for unbounded field lengths causing DB or memory strain. NoSQL-style / prototype pollution style payloads in JSON bodies. Negative/non-numeric IDs on `[id]` routes.
7. **WebSocket**: reconfirm origin check from a scripted client omitting Origin (already known gap, documented), check if WS clients can send data TO the server that gets processed unsafely (check ws-hub.ts for any incoming-message handling, not just outgoing broadcast).
8. **CSRF re-check**: with routes now gated by session cookies (`sameSite: lax`), confirm a simulated cross-site POST (simple form POST, not fetch) still can't ride the session — `sameSite=lax` blocks cross-site POST but allows top-level navigation GETs, so check if any state-changing action is reachable via GET.
9. **bcrypt/timing**: check restaurant login for timing differences between "user not found" (short-circuits before bcrypt.compare) vs "wrong password" (runs bcrypt) — this is a classic user-enumeration timing side-channel.
10. **Logout/session-fixation**: can an attacker set a victim's cookie via some injection point? Check if any route reflects user input into a `Set-Cookie` or response header unsanitized.
11. **Resource exhaustion caution**: avoid actual large-scale flooding; simulate rate-limit/DoS-adjacent tests with small bounded counts (e.g. 20-30 requests, not thousands), monitor via `docker stats` / Task Manager equivalent between tests.

---

## Attack log / narrative

(chronological notes on what was tried, even for things that didn't yield a finding — useful for the next session to know what's already been ruled out)

- **Session token tampering (structural attacks, not key-forgery)** — ruled out, verification code is solid. Tested: expired `exp` (correctly rejected), tampered signature with valid-looking structure (correctly rejected), empty cookie value, cookie with no `.` separator, malformed base64/JSON payload, oversized (2KB) garbage cookie. All returned `{"authenticated":false}` cleanly, no crashes, no 500s, no timing anomalies observed. `verifySessionToken`'s length-check-before-`timingSafeEqual` and try/catch-wrapped JSON.parse are doing their job. The *only* way in is the hardcoded key itself (F1/F2), not a flaw in how tokens are checked.
- **WebSocket incoming-message handling** — ruled out by code inspection. `src/lib/ws-hub.ts` has no `ws.on("message", ...)` handler at all; the server never processes anything a WS client sends, only broadcasts outbound. No injection surface there.
- **Admin login timing side-channel** — ruled out. Unlike restaurant login, admin login does a plain string comparison against hardcoded credentials (no bcrypt), so "wrong username" and "right username, wrong password" both run in ~8-11ms with no distinguishable signal.
- **SQL injection via path parameters** — ruled out. Tried a classic `'; DROP TABLE orders;--` payload as an order ID path segment; the parameterized query correctly errored out (500) without executing the injected SQL; `orders` table row count confirmed unaffected before and after.
- Did not attempt: actual large-scale DoS/flooding (thousands of requests), password-list brute forcing to completion (rate-limit-bypass mechanism was proven with a small 15-request sample instead — no need to actually crack anything), attacking the Docker daemon or host OS directly, physical/local file-system attacks (out of scope for a web app pentest), attacking the Next.js framework itself (assumed patched, not this app's code).
