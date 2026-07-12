# SYSTEM_MEMORY.md

Current technical truth for the Restaurant Order Tracker. Narrative history and debugging lessons live in `CLAUDE.md`; user instructions live in `USER_HELP.md`.

## Critical Invariants

- Run **`node server.js`**, normally through `startup`; plain `next dev`/`next start` breaks `/ws`.
- Kitchen/API statuses are `Received | Preparing | Complete`; an older customer type also knows `Making | Finished`. Never compare raw status strings in display code. Use `normalizeStatus()`/`getStatusVisual()`.
- `orders.order_number` is display text. Generated `order_lookup_key` removes case, spaces, and punctuation. Use `normalizeOrderLookupKey()` outside SQL; do not create another normalization rule.
- Sessions are separate signed cookies: `admin_session` and `restaurant_session`. A browser may validly hold both. Role-specific logout must clear only its own cookie.
- Kitchen order delete is soft (`deleted_at`); admin order/restaurant delete is permanent.
- Seed/Purge are destructive and require exact confirmation phrases in both UI and API. Never invoke them during tests.
- `raw_password` storage is intentional, user-approved local-dev debt. Do not change it unless asked.
- Escape every user value used with `ILIKE` through `escapeLikePattern()`.
- Dynamic route params are promises and must be awaited.
- On this `.141` machine: no commits, Git syncing, routine production builds, or shared-browser cookie cleanup without explicit user direction.
- **A browser can validly hold both `admin_session` and `restaurant_session` at once.** Any server-side "is this admin?" branch must check whether the caller ACTUALLY supplied credentials for that specific action (e.g. no `pin`/`employeeId` sent), not just whether an `admin_session` cookie exists (`isAdminRequest()` alone). Checking cookie existence alone previously let a real kitchen-side PIN-verified action (create/status-change/delete) silently get swept into "admin path" behavior — dropping PIN attribution, or worse, permanently hard-deleting an order that should have been recoverable — any time an admin was also logged in on the same browser. Fixed 2026-07-10 in `orders/route.ts` and `orders/[id]/route.ts` via an `isGenuineAdminOverride = isAdmin && employeeId === undefined && pin === undefined` check; reuse this pattern for any future route that branches on `isAdminRequest()`.
- The user has given standing permission to use the local-dev admin credentials (`USER_HELP.md`) freely in scripts/tests for this project, including inline in shell commands.

## Architecture

- Next.js `16.2.10`, React `19.2.4`, TypeScript, Tailwind CSS v4.
- PostgreSQL 16 through `pg`; Docker container is `restaurant-postgres-1`.
- Custom CommonJS server (`app/server.js`) wraps Next, hosts `/ws`, caps API bodies at 16KB, overwrites spoofable forwarding headers, restricts non-localhost routes, and starts rolling backups.
- One app process and one DB. WebSocket clients and rate limits are in memory; horizontal scaling would require shared infrastructure.

### Experiences

| Area | Route | Behavior |
|---|---|---|
| Admin | `/`, `/admin/db`, `/admin/staff`, `/admin/audit` | Localhost-only gateway, DB console, kitchen staff/roles management, and cross-kitchen audit log |
| Kitchen | `/restaurant/*` | Authenticated dashboard; live WebSocket order updates (`?restaurant=` channel, no polling) |
| Customer | `/customer` | Public lookup; live WebSocket updates |

Non-localhost hosts expose only customer/kitchen/API/static prefixes; `/`, `/admin/db`, `/admin/staff`, and `/admin/audit` return 404. This is public-routing rehearsal, not full internet deployment.

`/admin/db`, `/admin/staff`, and `/admin/audit` are independent SIBLINGS, not nested under one another — each reachable only from the gateway (`/`) sidebar's admin-only links (Access DB / Staff link inside admin/db's own header / Audit Log), never from within another admin page's header. Do not add cross-links between them beyond that; a prior attempt to link Audit Log from inside admin/db's header was explicitly rejected by the user.

## Data Model and Order Rules

### `restaurants`

Important fields: `id`, `name`, bcrypt `password`, intentional `raw_password`, unused legacy `deleted_at`, and `complete_cap_hours` (default 12).

### `orders`

Important fields:

- Identity: `id`, readable `order_number`, generated `order_lookup_key`, `restaurant_name`
- State: `status`, `created_at`, `updated_at`, nullable `deleted_at`
- Timing: `received_at`, `preparing_at`, `complete_at`, `acknowledged_at`
- Undo: nullable `status_transition_token`, `status_transition_at`

Indexes:

- Unique live restaurants by `LOWER(name)`
- Unique live orders by `LOWER(restaurant_name), order_lookup_key`
- Live restaurant-order lookup index and `updated_at` index

`initDb()` creates/migrates idempotently and memoizes its promise. A soft-deleted identifier can be reused by a new live order; undelete returns 409 if that canonical identity is occupied.

**`/admin/db`'s Orders table is real keyset-paginated infinite scroll, not a fixed row cap.** The old design capped the default `/api/dev/db` response at the 500 most-recent rows, which went blind to anything older once a stress test (2026-07-10) pushed a kitchen's only order out of that window. Replaced 2026-07-11 with server-side Postgres keyset pagination (`ORDER BY id/created_at ... WHERE id > $cursor LIMIT 150`, never `OFFSET`, so it stays correct under concurrent inserts/deletes) plus a client-side sliding window (`lib/useWindowedOrders.ts`) capped at 450 loaded rows — scrolling near the bottom fetches forward and evicts from the top, scrolling back near the top fetches backward and evicts from the bottom, same shape as Gmail/Discord/iMessage. Live/deleted orders share ONE query/window, not two: `includeDeleted` toggles whether deleted rows are eligible at all, and the status filter dropdown can include the literal `"Deleted"` value alongside Received/Preparing/Complete (see `buildOrderQuery`'s OR-branch for combining a deleted-only or deleted-plus-some-statuses filter). Search, restaurant filter, status filter, and sort ALL run as real `WHERE`/`ORDER BY` against the full table on every request — never client-side over whatever happens to be loaded — so nothing is ever invisible to search again, at the cost of a real query per page instead of an in-memory filter. `GET /api/dev/db` params: `cursor`, `direction` (`forward`/`backward`), `sortKey` (`id`/`created_at`), `sortDirection`, `includeDeleted`, `orderSearch`, `restaurantNames`, `statusFilter`, `wantCounts` (deleted-count badge, first load only). Restaurants list is still fetched uncapped, once per fresh window (not per page), matching the earlier fix's discovery that the restaurant filter dropdown must source from the full `restaurants` table, never from the paged/windowed order rows.

**`useWindowedOrders`'s own cursor state (`stateRef`) must be written synchronously the instant new data arrives, not left to a `useEffect`.** The first cut synced `stateRef.current = state` inside a `useEffect`, which only commits one render AFTER `loadMoreTop`/`loadMoreBottom` calls `setState` — under a fast fling-scroll (confirmed live: 60 scroll-to-bottom events fired in a tight loop with no delay), several more scroll events fire before that effect catches up, each reading the STALE `bottomCursor` and firing a duplicate page fetch. Confirmed live: row count blew past the 450 cap to 900 with 334 duplicate order ids. Fixed by computing the next `CursorState` inline in `reload`/`loadMoreTop`/`loadMoreBottom` and writing `stateRef.current = nextState` in the same synchronous block as `setState(nextState)` — no longer via a `setState` functional updater's `prev` either (React guarantees `prev` is current for React's own purposes, but this hook's OWN pre-fetch cursor read needs `stateRef` itself to be authoritative one tick earlier than that). Re-verified after the fix: same 60-event hammer produced exactly 7 real requests (each fully serialized) and landed at exactly 450 rows, zero duplicates. Separately, `loadMoreTop`/`loadMoreBottom` guard re-entrancy via a plain `useRef` (`loadingTopRef`/`loadingBottomRef`), NOT the `isLoadingTop`/`isLoadingBottom` state — state updates aren't synchronous either, so a state-based guard has the identical staleness problem. The scroll handler itself is additionally throttled to at most once per `requestAnimationFrame`, since a fling-scroll can dispatch dozens of raw `scroll` events/sec.

**Kitchen's `/api/orders/restaurant/[restaurantName]` deliberately did NOT get the same windowed/scroll treatment.** It fetches one kitchen's own active work only (not-yet-Complete, plus Complete within the last 5 minutes) — realistically dozens of rows, shown as a live glanceable board, not scrolled as an archive, so it's a fundamentally different shape of problem than admin/db's full cross-restaurant history. The one real gap was that this query had NO `LIMIT` at all; fixed 2026-07-11 by adding `ORDER BY id DESC LIMIT 1000` (`MAX_ACTIVE_ORDERS`) as a safety net against a pathological/never-advanced kitchen, without adding scroll-fetch/eviction client machinery that every kitchen tablet (including old/weak hardware) would otherwise have to run for data that never gets large enough to need it. Client-side `sortByPriority`/`isOrderOverdue`/tab filtering are unchanged and still operate correctly on the (now safety-capped) result.

**`Dashboard.tsx`'s `KitchenDashboardContent` now fetches this route only on mount and on live WS events, no 5s `setInterval` poll** (changed 2026-07-12, see WebSockets section). `fetchOrders` itself is unchanged (same `isInitial`/toast-on-failure/toast-on-recovery shape); only the trigger changed, from a timer to a `?restaurant=`-scoped socket's `order_updated`/`order_deleted` messages (same events the customer tracker and admin pages already listen for, since every order-mutation route already calls `broadcast()`).

### `restaurant_employees` and `order_status_events`

Per-kitchen employee roster and append-only status-change audit trail; see "Employee Attribution" under Auth for the full design.

### Lifecycle

- Kitchen moves only one step forward. Admin may override status.
- `received_at`, `preparing_at`, and `complete_at` record stage entry.
- A genuine kitchen transition gets one server-stored Undo token valid for 8 seconds. Undo must match the latest token/current status, fails after another change or customer pickup, and clears only the mistaken stage timestamp.
- Customer pickup sets `acknowledged_at`. Complete duration stops there or at the kitchen’s configured cap.
- Kitchen cards show total age; Received/Preparing views are oldest-first; navigation shows counts.

### Priority Ordering and Overdue Alerts

- `lib/order-priority.ts` `sortByPriority()` is the single automatic ordering applied to Home (mixed statuses) and to the single-status Received/Preparing/Complete tabs alike — NOT a user-chosen sort/filter, always on. Ranking is **Preparing first, then Received, then Complete**, each group oldest-in-its-current-status first. This is deliberately the OPPOSITE of `order-status.ts`'s `ORDERED_STATUS_KEYS` (Received→Preparing→Complete lifecycle order used by `StatusStepper`) — do not reuse that array for priority ranking; a long-Preparing order must always outrank a freshly-Received one regardless of raw age.
- `isOrderOverdue()`/`OVERDUE_THRESHOLD_MINUTES` flag an order once it has spent longer than its current status's threshold: 8 min Received, 20 min Preparing, 10 min Complete (Complete's threshold is about confirming customer pickup/accessibility, not prep speed). Overdue orders get a persistent red-ring/tinted card (`--color-danger`) plus a warning-orange (`--color-warning`, a dedicated token added across every theme/contrast/CVD variant in `globals.css`) one-time toast per order+status crossing the threshold.

## Customer Tracking and Handoff

- Public lookup requires restaurant + order label and is rate-limited.
- Lookup uses exact canonical `order_lookup_key`; `Pager 14`, `pager-14`, and `#PAGER14` match while display remains `Pager 14`.
- Active tracking is stored per-tab in `sessionStorage`, restored after refresh, refetched on visibility/reconnect, retained across temporary failures, and cleared after pickup or a true 404.
- Customer status display always passes through status normalization.
- `CustomerHandoffCard` creates a reusable restaurant-only URL/QR, copy/open controls, and print-isolated sign. It never embeds an order identifier.
- Authenticated `/api/customer-origin` substitutes the reachable LAN origin when staff open the dashboard through localhost. `qrcode` is the only approved narrow UI dependency; do not use an external QR service.

## Auth, Validation, and Limits

### Sessions

- HMAC-SHA256 signed httpOnly cookies; no session table or remote revocation.
- Token validity is 30 days; cookie `maxAge` controls persistence: normal 1 day, Remember Me 30 days.
- `FORCE_SECURE_COOKIES=true` enables Secure cookies only after real HTTPS exists.
- `GET /api/session` checks both roles independently.
- Valid remembered kitchen sessions resume directly into `/restaurant/restauranthome`; missing sessions redirect to `/restaurant/home`. If the kitchen has employees configured and no signed-in employee is present (see `lib/employee-session.ts`), it redirects to `/restaurant/staff-login` instead — a THIRD, deliberately non-cookie layer (`sessionStorage`, not a signed cookie) on top of the two session cookies above, scoped and self-invalidating per `restaurantName` so it can never outlive or leak across a kitchen switch on the same browser.

### Server authorization

- `requireAdmin()` for DB/admin mutation routes
- `requireRestaurantOrAdmin(name)` for restaurant-scoped order operations
- `requireAnyAuthenticated()` for aggregate health/customer-origin

### Employee Attribution

- `restaurant_employees` (id, restaurant_id, name, `account_type` `manager|employee`, nullable `role_id` FK, `pin_length` 4|6, bcrypt `pin_hash`, `deleted_at`) is a per-kitchen roster, separate from the restaurant's own login. `account_type` is the fixed value that controls Staff-tab/admin-staff access; `role_id` is a kitchen-defined display label (see `restaurant_roles`) with no permission effect of its own — permissions-per-role are explicitly future work, not built yet. A 1-manager-0-employee roster is a completely normal, fully-supported state — nothing anywhere requires a mixed manager+employee roster.
- `restaurant_roles` (id, restaurant_id, name) — free-text labels ("Chef", "Cashier", ...) a kitchen (or admin) can create/rename/delete and assign to any employee regardless of `account_type`. Deleting a role in-use sets that employee's `role_id` to NULL (not an error).
- **PIN is a ONE-TIME sign-in per kitchen dashboard session, not a per-action prompt** (redesigned 2026-07-11, replacing the original per-action-PinPad model documented below this point historically). Flow: kitchen login (name+password, unchanged) → `restauranthome/page.tsx` checks whether this kitchen has any employees AND whether a valid signed-in-employee record already exists in `sessionStorage` (see `lib/employee-session.ts`, key `kitchen_employee_session`) → if employees exist and none is signed in, redirect to `/restaurant/staff-login` (a `PinPad` with no `forcedPinLength`, reusing the existing `/employees/verify-pin` route) → on success, write `{employeeId, name, accountType, pinLength, restaurantName}` to sessionStorage and proceed to the dashboard. A kitchen with zero employees configured skips this step entirely and operates fully unattributed, exactly as before. **"Remember Me" on the kitchen login only ever covers the KITCHEN's own `restaurant_session` cookie — it never carries the signed-in employee.** Every fresh dashboard session (tab/browser close, or an explicit "Logout Staff") re-requires staff sign-in even on a remembered kitchen. The stored session includes `restaurantName` specifically so every read (`getEmployeeSession(restaurantName)` in `lib/employee-session.ts`) can detect and discard a stale entry left over from a DIFFERENT kitchen previously signed into the same browser tab, rather than silently misattributing the new kitchen's actions to it.
- **Order actions (create/advance/delete) now send a trusted `employeeId`, not a PIN, once signed in.** `lib/employee-auth.ts` `verifyActiveEmployee(restaurantName, employeeId)` confirms the id is a real, active employee belonging to that restaurant — no PIN re-check, since the PIN was already verified once at sign-in. `resolveOrderActionEmployee(restaurantName, isGenuineAdminOverride, employeeId, pin, pinLength)` is the single decision point all 3 order-mutation routes (`POST /api/orders`, `PUT /api/orders/[id]`, `DELETE /api/orders/[id]`) now call: genuine admin override → no attribution; `employeeId` present with no `pin` → the new trusted-id path via `verifyActiveEmployee`; anything else (a bare `pin`, or `employeeId`+`pin` together) → falls through unchanged to the original `verifyEmployeeForAction` PIN-verify path, which is NOT removed — it's still what the staff sign-in screen and the `StaffTab` manager-unlock call directly against `/employees/verify-pin`. The critical `isGenuineAdminOverride = isAdmin && employeeId === undefined && pin === undefined` disambiguation (see Critical Invariants) is unchanged and still the thing that keeps a coincidental admin+kitchen dual-session from silently swallowing real attribution.
- **`PinPad` itself is unchanged** — still PIN-only (no name/employee picker), still has the length-only "Manager" toggle, still accepts `forcedPinLength` (used by the staff-login screen with no forced length, and by `StaffTab`'s manager-only unlock, still forced to 6). It's now used at exactly 2 places instead of 4: the one-time staff sign-in screen, and `StaffTab`'s unlock. The 3 PER-ACTION `PinPad` instances that used to live at the bottom of `Dashboard.tsx` (advance/create/delete) are gone entirely.
- **`PinPad`'s `<Modal>` uses the `slideFromTop` variant** (added 2026-07-12) — drops in from above instead of the shared centered scale+fade, with an overshoot cubic-bezier on both directions for spring-like inertia (`modal-panel-in-top`/`modal-panel-out-top` keyframes in `globals.css`), per explicit user request. `PinPad` also accepts an optional `title` prop (default `"Enter your PIN"`); the staff-login page passes `title="Staff Login"` since that page's own "Staff Sign-In" `AuthCard` heading sits behind the pad, which opens immediately on load and would otherwise fully obscure it before a first-time user ever saw it. `StaffTab`'s manager-unlock instance leaves `title` unset (its trigger button already makes the context clear).
- **Managers must have a 6-digit PIN; employees may use 4.** `lib/employee-auth.ts` `requiredPinLength(accountType)` is the single source of truth — PIN length is DERIVED from `account_type` server-side on every create/edit, never accepted from the client. Promoting an employee to manager without also supplying a new 6-digit PIN in the same request is rejected (400). One pre-existing account (kitchen "asdf", employee "John Doe") predates this fix and still has a 4-digit manager PIN — left as-is per user direction.
- Every order creation, every forward status transition, every delete, AND every kitchen-side pickup confirmation inserts one row into append-only `order_status_events` (id, nullable `order_id` FK **`ON DELETE SET NULL`**, denormalized `restaurant_name` NOT NULL, **`order_number` nullable** (2026-07-11 — an `EmployeeLogout` event has no order at all), `from_status` nullable, `to_status`, `employee_id` nullable, `employee_name` denormalized, `created_at`). A creation event has `from_status = NULL`. Three lifecycle markers exist in `to_status` that are NOT real order statuses and are special-cased in `/admin/audit`'s render (never routed through `StatusBadge`/`normalizeStatus`, which only know Received/Preparing/Complete): `'Deleted'` (order delete), `'PickedUp'` (kitchen-side "Mark as Picked Up", see below), and `'EmployeeLogout'` (staff sign-out, `order_id`/`order_number` both NULL on this one). **`order_id` is deliberately `SET NULL`, not `CASCADE`** — an admin hard-deleting an order must not destroy its own audit history. The status-change **Undo** path does not currently insert an audit event — a known gap, not yet fixed.
- **Kitchen-side "Mark as Picked Up"** (added 2026-07-11): `POST /api/orders/[id]/acknowledge` gained a second, opt-in path alongside its original unauthenticated customer-only one. Sending `{employeeId}` in the body requires `requireRestaurantOrAdmin` + `verifyActiveEmployee`, writes the `acknowledged_at` update, AND inserts a `'PickedUp'` audit row — the original no-body/unauthenticated customer path is completely unchanged (no auth, no audit row) and cannot be weakened by the new path existing alongside it. `Dashboard.tsx`'s `OrderCard`/`HomeOrderRow` show a "Mark as Picked Up" button whenever `normalizeStatus(order.status) === "complete" && !order.acknowledged_at`.
- **Complete orders render orange until picked up, green after** (added 2026-07-11) — a NEW visual distinction on top of the existing 3-status color system, driven by `acknowledged_at`. `lib/order-status.ts`'s `getStatusVisual(raw, acknowledgedAt?)` returns `COMPLETE_PENDING_VISUAL` (new `--color-status-complete-pending-*` tokens, orange, mirroring each theme/CVD variant's own `--color-status-preparing-*` hue) ONLY when `acknowledgedAt` is explicitly `null` (a real, confirmed "not yet picked up" DB value) — passing `undefined` (any caller that hasn't opted in) keeps the original green `STATUS_VISUALS.complete`. **This distinction (`=== null` vs falsy) is load-bearing, not stylistic** — an earlier version used `!acknowledgedAt`, which made `undefined` behave identically to `null` and silently defaulted every un-migrated caller to orange; caught live when the customer tracker's already-picked-up "Enjoy Your Meal!" card rendered orange instead of green. Threaded through: `StatusBadge`/`StatusIcon` (new optional `acknowledgedAt` prop), `admin/db` (passes `o.acknowledged_at`), `Dashboard.tsx`'s `StatusStepper` (its OWN separate hardcoded color logic, not `getStatusVisual` — the Complete step tile is only ever reached via `isCurrent`, never `isDone`, so it needed its own `isPickedUp` branch). The customer tracker (`app/customer/page.tsx`) deliberately does NOT pass `acknowledgedAt` and stays plain green always — it already distinguishes pickup via text ("Enjoy Your Meal!") and confetti, and the pending/orange framing ("still needs attention") is a kitchen-operations signal, not something a customer looking at their own already-ready order needs to see as a warning color.
- Same timing-safe dummy-hash precedent as restaurant login (`SECURITY_ATTACK_LOG.md` F4) applied to PIN checks. PIN verification is rate-limited per-restaurant+IP (15/min).
- **"Logout Staff"** button in `Dashboard.tsx`'s `Nav` (above the existing full kitchen "Logout", styled non-destructively) signs out only the currently-signed-in employee: POSTs `/api/restaurants/by-name/[name]/employees/logout` (new route, `requireRestaurantOrAdmin` + `verifyActiveEmployee`, inserts the `EmployeeLogout` audit row), then clears `sessionStorage` and redirects to `/restaurant/staff-login` regardless of that POST's outcome (best-effort, same resilience pattern as the existing kitchen logout). Only rendered when `employees.length > 0`. **The full kitchen "Logout" button intentionally does NOT call this route and writes no audit event** — clearing the `restaurant_session` cookie (and, belt-and-suspenders, the employee sessionStorage too) is a silent, unaudited action, by design; only an explicit employee sign-out is auditable.
- Employee roster/role management (dashboard `StaffTab`) lives in its own nav tab, reachable by ANY signed-in employee (manager or line employee) — but the tab's own content still independently demands a fresh manager PIN via its own `forcedPinLength={6}` `PinPad` unlock, unchanged from before. This is deliberate: being signed in for order-attribution purposes is not the same permission as managing the roster.
- Admin-side staff management lives at `/admin/staff` (linked from `/admin/db`'s header) — the bootstrap path for a kitchen's very first manager.
- **`/admin/audit`** reads `order_status_events` — chronological "who did what" across every kitchen, admin-only, its own top-level page. Default view is unfiltered; typing a kitchen name narrows via `GET /api/dev/audit?restaurantName=`, revealing a second employee-name filter. `DELETE /api/dev/audit` ("Purge Audit Log") requires the phrase `PURGE AUDIT`, distinct from `/admin/db`'s `PURGE DATABASE`. Live-updates via the admin WS channel; the render branch special-cases `to_status === "Deleted" | "PickedUp" | "EmployeeLogout"` before falling through to the normal from→to `StatusBadge` pair, and the order-number cell falls back to an em-dash for the null case.
- `PinPad` supports real keyboard input (digits, Backspace, Enter). `submit()` is guarded by a `useRef` (not the `verifying` state) to stay synchronous against React StrictMode's dev-only double-effect-invocation.
- Both PINs and the restaurant's own password are bcrypt-hashed before storage (never stored raw).
- **Pickup-window presets are 1/2/4 hours plus a Custom HH:MM entry** (changed 2026-07-11 from the original 1/6/12/24h set — a literal replacement, not additive, per explicit user correction). `Dashboard.tsx`'s `CompleteCapSettingCard` gained two plain number inputs (H, MM) behind a "Custom" button, converted to decimal hours and validated against the existing route's own `MIN_HOURS=0.1`/`MAX_HOURS=168` client-side before `PUT .../settings` — no backend change, that route already accepted any value in range. **The Custom fields auto-apply on change (500ms debounce), no "Apply" button** (changed 2026-07-11 — the button was "too much work for staff" per explicit user feedback); an out-of-range/still-typing intermediate value is skipped silently (no error toast) rather than rejected, since e.g. clearing "10" to type "100" passes through an invalid empty state that isn't a real mistake yet.
- **Staff tab's "Unlock with manager PIN" checks for a registered manager before opening the PIN pad** (added 2026-07-12) — `StaffTab`'s button click short-circuits with a toast ("You don't have a registered manager, please ask admin to register one") when `employees.filter(e => e.accountType === "manager").length === 0`, instead of opening a `PinPad` that could never succeed (verification only ever accepts an actual manager account).
- **`KitchenClock`** (`components/ui/KitchenClock.tsx`, added 2026-07-12) is a toolbar pin in `SettingsToggles` (new `showClock` prop, kitchen-dashboard-only — sits between `health` and the S/M/B size toggle) showing the kitchen device's own local time in its own OS-detected timezone (`Intl.DateTimeFormat().resolvedOptions().timeZone` — read locally from the browser, no network call). Ticks every second off `Date.now() + driftMs`; once an hour it fetches `/api/health`'s `checkedAt` (already-authenticated, already-used-elsewhere endpoint, no new server surface), applies a round-trip-halved NTP-style correction, and updates `driftMs` if the measured drift exceeds a 2s threshold — keeps the display accurate even on a kitchen tablet with a wrong/drifting device clock. Detail (seconds + full readable timezone name, e.g. "Los Angeles (PDT)") lives in a themed hover/tap dropdown using the same `useDropdownReveal` animation as `HealthPin`'s popover, not the native `title` tooltip (explicitly rejected by the user as looking like a bare browser affordance, not part of the product).

### Credential Strength Meter

- `lib/credential-strength.ts` exports two separate live-scoring functions — `scorePasswordStrength` and `scorePinStrength` — because they model different threats. Passwords are scored on entropy (length, character variety, a small common-password blocklist). PINs have fixed, non-negotiable length (`requiredPinLength`), so scoring instead penalizes the specific patterns a real attacker tries first: sequences (1234), all-same-digit (0000), simple repeats, and plausible years. Both return one of six tiers (`weak` → `s-tier`).
- `components/ui/StrengthMeter.tsx` renders the live result as a segmented bar + icon + label, one distinct icon per tier (never color alone), matching `StatusBadge`'s approach — this app supports deuteranopia/protanopia/tritanopia palettes where red/amber/green alone can collapse.
- Wired into every place a user chooses a new password or PIN: restaurant signup, admin's restaurant password-reset modal, and every PIN input in both the kitchen `StaffTab` and `/admin/staff` (add-employee, edit-employee/reset-PIN). This is advisory only — the meter never blocks submission; the actual minimum requirements (8+ char password, PIN length matching `account_type`) are still enforced server-side.

### Rate limits

- Registration: 5/min/IP
- Suggest: 30/min/IP, minimum 3 characters
- Public order search/acknowledge: 120/min/IP
- Order creation: 30/min/restaurant, including admin
- WebSockets: 50 concurrent connections/IP

### Validation/security

- SQL uses `$1...` parameters; transactions use a dedicated pool client.
- `requireSafeName()` permits display-safe restaurant/order characters; `requireString()` strips controls and bounds lengths; `parseJsonBody()` rejects malformed/deep JSON.
- Security headers: CSP, frame denial, nosniff, referrer policy, permissions policy. No HSTS until real HTTPS.
- Anonymous order responses intentionally include `id` because pickup acknowledgement needs it.
- Full audit evidence: `SECURITY_ATTACK_LOG.md`.

## WebSockets

- Registry: `globalThis.__orderTrackerWsClients`, entries shaped `{ ws, restaurantName }` — restaurant-scoped, unauthenticated (customer/kitchen tracker).
- Every non-admin `/ws` connection declares `?restaurant=`; broadcasts without `restaurant_name` are dropped.
- **Separate admin channel**: `?admin=1` instead of `?restaurant=`, authenticated by verifying the `admin_session` cookie server-side in `server.js`'s upgrade handler (a minimal reimplementation of `lib/session.ts`'s HMAC verify, since this CJS entrypoint can't `require()` that TS module directly — keep both in lockstep by hand). Registers into a separate `globalThis.__orderTrackerAdminWsClients` set (see `lib/ws-hub.ts` `registerAdminClient`/`adminClients`). This is the ONE socket allowed to see every restaurant's order events at once — `/admin/db` AND `/admin/audit` (added 2026-07-10) both use it to live-update without polling, each reconnecting with the same exponential backoff as the customer tracker's socket.
- Events: `order_updated`, `order_deleted`, `restaurant_created` (admin-channel only). Customer clients refetch REST rather than trusting payload status; `/admin/db` refetches `/api/dev/db` on any of the three events (skipped while a destructive-confirm/password/rename modal is open, so a background refetch can't reset in-progress input) — `restaurant_created` was added 2026-07-12 (`lib/ws-hub.ts` `broadcastRestaurantCreated()`, called from `POST /api/restaurants/register`) after a bug report that a newly-registered kitchen didn't appear in `/admin/db`'s list without a manual tab refresh; it carries no payload since a brand-new restaurant isn't part of any currently-loaded window to patch in place, so the fix is just triggering the same `reload()` used for order events (which already re-fetches the bundled `restaurants` list too, via `useWindowedOrders`'s `onFirstLoad`). `/admin/audit` refetches `/api/dev/audit` (with whatever kitchen filter is currently selected) on the two order events — every order create/status-change/delete already calls `broadcast()` in the same request that writes the `order_status_events` row, so no new server-side wiring was needed there, just a second listener. **`Dashboard.tsx`'s kitchen dashboard also now uses this exact `?restaurant=` channel** (added 2026-07-12, replacing its old 5s order poll) — same reconnect-backoff pattern as the customer tracker, refetching `/api/orders/restaurant/[name]` on `order_updated`/`order_deleted` instead of a timer.
- **`Modal.tsx` renders through a React portal to `document.body`**, not in place (added 2026-07-12). Root cause of the bug this fixed: `Dashboard.tsx`'s tab-switch wrapper (`.tab-content-enter`) carries a CSS `transform` (kept applied at rest by its `animation ... both` keyframe), and any `transform` on an ancestor creates a new containing block for `position: fixed` descendants per spec — so a `Modal` opened from inside a tab (e.g. `StaffTab`'s manager-PIN unlock) had its `fixed inset-0` backdrop silently shrunk to that wrapper's own box instead of the true viewport, making clicks on the visually-dark backdrop outside that box do nothing (only Escape, or a click still-inside the shrunk box, closed it). The portal sidesteps this whole class of ancestor-transform/overflow/stacking issues for every current and future `Modal` caller, not just this one wrapper.
- Browser Origin must match Host. Missing Origin is accepted only from private-LAN IPs for future React Native clients.
- Non-`/ws` upgrades delegate to Next’s handler. LAN HMR is still unreliable in dev; manual refresh works and production would not use HMR.

## UI and Design Rules

- Warm bistro tokens in `globals.css`; default light plus warm dark theme. Use CSS variables, not literal Tailwind colors.
- `--color-on-brand` owns text/icon contrast on brand fills. Primary combinations were measured across themes/high-contrast/CVD modes.
- Fonts: Fraunces display, Nunito Sans body, Geist Mono only where needed.
- Accessibility axes remain independent: S/M/B size, High Contrast, Reduce Motion, Enhanced Focus, Deuteranopia/Protanopia/Tritanopia, theme.
- S/M/B uses native root `font-size 0.35s ease`. Admin duration cells share one clock and yield during that transition; Reduce Motion collapses the root transition.
- Admin status, restaurant, search, and Deleted filters keep removed rows for the 300ms delete slide; returning rows play it in reverse. Reduce Motion is instant.
- `SettingsToggles` owns the top-right pill; kitchen’s mobile hamburger is inside it. Use `useReservedTopRight` + `.clear-top-right` for nearby UI.
- Use shared `Button`, `Card`, `Input`, `Select`, `Modal`, `Toast`, status components. No native alert/confirm.
- Shared Modal traps focus, supports Escape, and restores trigger focus.
- Toast stack follows macOS-like behavior; `useToast(message,type)` is stable. `useActionToast` powers expiring Undo.
- Use `min-h-dvh`, not `100vh`; touch actions target about 40–44px.
- `ui-awareness.ts` provides measured text/row fit and dev overflow checks. Prefer it to new one-off ResizeObservers.
- Error boundaries exist at route, root, and dashboard-widget levels.

### Mascot

- `ChefMascot` selects persisted 2D/3D style and registers presence for the toolbar toggle.
- 2D speech bubble is normal flow above the SVG; container-aware sizing prevents overflow.
- 3D chef is CSS (`.chef3d-*` in `globals.css`); missing CSS renders an unstyled div stack.
- Preserve the derpy character, warm identity, and Reduce Motion behavior. Do not re-add arm-only animations without empirical transform checks.
- **Dialogue banks** (expanded 2026-07-10): `ChefSprite.tsx`'s `DEFAULT_LINES` (253 lines, "logged in/session guard" persona) and `ChefSprite3D.tsx`'s `DEFAULT_LINES` (248 lines, "look, I have depth/dimensions" persona) are each sprite's own fallback pool when no `lines` prop is passed — kept as two SEPARATE banks (not merged) so each sprite keeps its distinct voice. All 501 lines are verified unique, no duplicates within or across the two files.
- **`lib/kitchen-jokes.ts`** exports `KITCHEN_JOKES` — a separate, standalone 300-line bank of actual kitchen/cooking jokes, distinct in tone from the in-character banter above. Not wired into any page by default; only surfaces via the "Funny Chef" preference below.
- **"Funny Chef"** (`lib/funny-chef.ts`, added 2026-07-10) is a persisted boolean preference (localStorage + `data-funny-chef` attribute, same shape as `mascot-style.ts`) with its own toolbar icon button (`FunnyChefToggle.tsx`, a laugh/smiley icon) placed directly next to `MascotStyleToggle` in `SettingsToggles` — NOT inside `AccessibilityMenu`'s dropdown; it isn't an accessibility setting, and was moved out of that dropdown after the user flagged the wrong placement. When on, `ChefMascot` overrides EVERY caller's `lines` (including contextual pools like Dashboard's "no orders yet" or the login portal's sign-in lines) with `KITCHEN_JOKES` — this override lives in `ChefMascot` itself, the one place every caller funnels through. **Toggling the preference in either direction counts as a fresh "mount"**: `ChefMascot` subscribes live to the `funnychefchange`/`storage` events and bumps a `mountKey` used as the child sprite's React `key`, forcing a real remount so `ChefSprite`/`ChefSprite3D`'s own mount-only line-picking effect (`useEffect(..., [])`) actually re-rolls a new random line every time — without this, flipping the toggle while a chef was already on-screen wouldn't pick a new line until an unrelated remount (e.g. route change). The very first read on load uses a synchronous `useState(getFunnyChef)` lazy initializer (not the reactive `useFunnyChef()` hook), since the hook's own effect-based catch-up runs one render later than the child sprite's own mount effect, which would otherwise lock in a stale (always-off) line pool on first paint even when the persisted pref was already "on".

## API Map

| API | Purpose |
|---|---|
| `/api/session`, `/api/logout` | Dual-role session state/logout |
| `/api/admin/login` | Admin login |
| `/api/restaurants` | Count/register/login/suggest and admin mutation subroutes |
| `/api/orders` | Create and public lookup |
| `/api/orders/search` | Public canonical lookup |
| `/api/orders/restaurant/[name]` | Authenticated kitchen order list (active work only, `LIMIT 1000` safety cap, no client pagination) |
| `/api/orders/[id]` | Status/Undo/delete; accepts trusted `employeeId` (post-sign-in) or `pin`+`pinLength` (legacy) for attribution |
| `/api/orders/[id]/acknowledge` | Public (unauthenticated) pickup acknowledgement; OR authenticated kitchen-side "Mark as Picked Up" when `{employeeId}` is sent (writes a `PickedUp` audit row) |
| `/api/orders/[id]/undelete` | Admin restore |
| `/api/restaurants/by-name/[name]/settings` | Kitchen pickup cap (hours, decimal — presets 1/2/4h + custom HH:MM in the UI) |
| `/api/restaurants/by-name/[name]/employees` | List/add employees |
| `/api/restaurants/by-name/[name]/employees/[id]` | Deactivate/reset PIN |
| `/api/restaurants/by-name/[name]/employees/verify-pin` | PIN check; used by the one-time staff sign-in screen and `StaffTab`'s manager unlock (no longer by per-action order routes) |
| `/api/restaurants/by-name/[name]/employees/logout` | "Logout Staff" — verifies the signed-out employeeId, writes an `EmployeeLogout` audit row |
| `/api/restaurants/by-name/[name]/roles` | List/add kitchen-defined role labels |
| `/api/restaurants/by-name/[name]/roles/[roleId]` | Rename/delete a role label |
| `/api/health` | Authenticated health; infrastructure detail admin-only; also the source `KitchenClock`'s hourly drift-correction reads |
| `/api/customer-origin` | Authenticated reachable-origin resolver |
| `/api/dev/db`, `/api/dev/seed` | Admin DB view (real keyset-paginated infinite scroll)/Purge and destructive Seed — see "keyset-paginated infinite scroll" below for `GET` params |
| `/api/dev/audit` | Admin audit-log view (optional `restaurantName`/`employeeName` filters) and `DELETE` Purge (`PURGE AUDIT` phrase) |

## Operations

### Startup/tooling

- Recommended: `startup`/`startup.sh` from root or `app/`.
- `startup`, `export`, and `unpack` have independent Windows and shell implementations; mirror behavior manually.
- Startup safely reuses the pinned `restaurant-postgres-1` container from another checkout only if its image is `postgres:16`.
- Windows PowerShell 5.1 cannot use `[RandomNumberGenerator]::Fill()` reliably; scripts use `RNGCryptoServiceProvider` and validate secrets.
- Docker auto-start is allowed when stopped; do not force-restart an already-running Docker Desktop.
- Routine validation uses `tsc --noEmit`, focused lint, and live browser checks. User does not want routine production builds.

### Backups/destructive actions

- Server runs `pg_dump` every 3 hours and keeps 3 files in `backups/`.
- Seed requires `{ confirmation: "SEED DATABASE" }` and transactionally creates 5 sample kitchens plus 30 live/5 deleted lifecycle-rich orders (shared password `password123`); Purge (`/admin/db`, wipes restaurants/orders) requires `{ confirmation: "PURGE DATABASE" }`; Purge Audit Log (`/admin/audit`, wipes only `order_status_events`, leaves restaurants/orders untouched) requires the DIFFERENT phrase `{ confirmation: "PURGE AUDIT" }` — never conflate the two confirmation phrases.
- Restore only after loading a dump into a temporary DB and verifying counts/names, then stop app and swap DB names.
- The live DB was intentionally emptied by the user as of 2026-07-09, but now (2026-07-10) holds real test/stress data again — see "Current Validation Baseline". Old snapshots may contain previous kitchens; do not restore without asking.
- `db.ts`'s `runInitDb()` migration is idempotent and memoized per-process (`initDbPromise`) — it only actually runs once per server start. A schema change here (e.g. adding/backfilling a column, changing an FK's `ON DELETE` behavior) needs a full `node server.js` restart to take effect; Turbopack route HMR does not re-run it.

### Dev cache

Turbopack can retain stale CSS/routes across restarts. If valid dynamic routes suddenly return Next’s generic 404 or keyframes stay stale: stop the exact project server, delete only `app/.next`, and restart through `startup`.

## LAN and Future Mobile/Public Work

- Server binds `0.0.0.0`; startup derives the real LAN IP with a UDP routing-table lookup, not adapter-name guessing.
- `allowedDevOrigins` currently includes `.140` and `.141`; it requires literal hosts, not CIDR.
- Windows private-profile firewall rule for port 3000 already exists.
- Current LAN URL on this machine: `http://192.168.12.141:3000`.
- Physical-phone verification is still required.
- Expo/Android and Cloudflare Tunnel + Caddy are plans only; see `MOBILE_MIGRATION_PLAN.md`.
- Before public exposure: move admin credentials to environment secrets, enable HTTPS/Secure cookies, add offsite backup, and review proxy/IP rate-limit behavior.

## Current Validation Baseline

- `tsc --noEmit`: clean.
- Full ESLint currently has 27 known findings (24 errors, 3 warnings), mainly strict React effect/ref rules, CommonJS server imports, and logger `any` types. Keep focused changed-file checks clean; do not hide new issues in the baseline. `lib/useWindowedOrders.ts`'s own data-fetch-on-mount `useEffect` triggers the same pre-existing `react-hooks/set-state-in-effect` pattern already present elsewhere (e.g. `restaurant/Dashboard.tsx`), confirmed via `git stash` comparison before adding it — not a new class of finding. Same confirmation method used again 2026-07-11 for the employee-sign-in/one-time-PIN work: every new file is lint-clean on its own, and `Dashboard.tsx`'s pre-existing baseline count only ever went down (one genuine new finding was fixed via a lazy `useState` initializer instead of a setState-in-effect), never up.
- Live DB was intentionally empty as of 2026-07-09; as of 2026-07-10 it holds real test data again (deliberate stress-test load, ~60+ throwaway `*Verify*`/`*Stress*`-prefixed kitchens and 1000+ orders) plus the user's own real kitchens (e.g. "asdf"). Do not assume an empty DB going forward without checking `/admin/db`.
- 2026-07-11: `db.ts` gained a schema change (`order_status_events.order_number` relaxed to nullable, for `EmployeeLogout` events) — required and received explicit user approval before restarting `node server.js` (per the standing "ask before restarting" rule), then verified live: the logout route succeeded post-restart (would have hit a NOT NULL constraint violation otherwise) and the resulting audit row read back correctly via `/api/dev/audit`.

## Update Discipline

Keep this file factual and concise. Replace superseded facts in place. Put debugging stories and rejected-design history in `CLAUDE.md`; detailed security proof in `SECURITY_ATTACK_LOG.md`; user instructions in `USER_HELP.md`.
