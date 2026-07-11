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
| Kitchen | `/restaurant/*` | Authenticated dashboard; polls orders every 5 seconds |
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

**Kitchen's `/api/orders/restaurant/[restaurantName]` deliberately did NOT get the same windowed/scroll treatment.** It fetches one kitchen's own active work only (not-yet-Complete, plus Complete within the last 5 minutes) — realistically dozens of rows, polled every 5s as a live glanceable board, not scrolled as an archive, so it's a fundamentally different shape of problem than admin/db's full cross-restaurant history. The one real gap was that this query had NO `LIMIT` at all; fixed 2026-07-11 by adding `ORDER BY id DESC LIMIT 1000` (`MAX_ACTIVE_ORDERS`) as a safety net against a pathological/never-advanced kitchen, without adding scroll-fetch/eviction client machinery that every kitchen tablet (including old/weak hardware) would otherwise have to run for data that never gets large enough to need it. Client-side `sortByPriority`/`isOrderOverdue`/tab filtering are unchanged and still operate correctly on the (now safety-capped) result.

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
- Valid remembered kitchen sessions resume directly into `/restaurant/restauranthome`; missing sessions redirect to `/restaurant/home`.

### Server authorization

- `requireAdmin()` for DB/admin mutation routes
- `requireRestaurantOrAdmin(name)` for restaurant-scoped order operations
- `requireAnyAuthenticated()` for aggregate health/customer-origin

### Employee Attribution

- `restaurant_employees` (id, restaurant_id, name, `account_type` `manager|employee`, nullable `role_id` FK, `pin_length` 4|6, bcrypt `pin_hash`, `deleted_at`) is a per-kitchen roster, separate from the restaurant's own login. No employee session/cookie exists. `account_type` is the fixed value that controls Staff-tab/admin-staff access; `role_id` is a kitchen-defined display label (see `restaurant_roles`) with no permission effect of its own — permissions-per-role are explicitly future work, not built yet.
- `restaurant_roles` (id, restaurant_id, name) — free-text labels ("Chef", "Cashier", ...) a kitchen (or admin) can create/rename/delete and assign to any employee regardless of `account_type`. Deleting a role in-use sets that employee's `role_id` to NULL (not an error).
- A PIN is verified fresh on every attributable order action via `POST .../employees/verify-pin`, not established as a session — matches real POS terminals attributing frequent per-order actions on a shared device without a per-employee login/logout cycle.
- **`PinPad` is PIN-only: there is no name/employee picker.** Tapping your own name from a list first was removed as pure friction on a shared kitchen tablet mid-rush. The pad shows a numeric keypad plus one "Manager" toggle button that switches the pad between expecting/auto-submitting at 4 vs 6 digits — a display-length hint only, NOT a server-side filter (a forgotten toggle press just means the pad stays 4-digit and won't match a 6-digit manager PIN; it is never rejected as "wrong mode"). The server resolves WHOSE PIN was typed by checking it against every active same-length employee in that kitchen (`lib/employee-auth.ts` `findEmployeeByPinOnly`), not by trusting a client-asserted `employeeId`. This only stays unambiguous because employee create/edit rejects a PIN that collides with another active employee's same-length PIN in the same kitchen (`pinCollidesWithAnotherEmployee`, 409 on collision). `verifyEmployeeForAction`/`verify-pin` still accept an optional `employeeId` for backward compatibility, but no current caller sends one. **`PinPad` accepts an optional `forcedPinLength` prop** (added 2026-07-10) that hides the Manager toggle entirely and locks the pad to that length — for a context that can ONLY ever be unlocked by one specific length, e.g. the kitchen `StaffTab`'s manager-only unlock (always forced to 6). Without this, that screen defaulted to 4-digit mode and a manager's real PIN got auto-submitted/rejected after the 4th digit unless they remembered to tap a toggle that served no purpose there. `Modal` itself also gained `max-h-[calc(100dvh-2rem)] overflow-y-auto` (2026-07-10) since it previously had no height cap at all — a tall `PinPad` (6 dots + toggle + grid) could clip its own title off-screen on a short viewport with no way to scroll to it.
- **Managers must have a 6-digit PIN; employees may use 4.** `lib/employee-auth.ts` `requiredPinLength(accountType)` is the single source of truth — PIN length is DERIVED from `account_type` server-side on every create/edit, never accepted from the client, since a manager PIN also unlocks the Staff tab/admin staff access and warrants more entropy. Promoting an employee to manager without also supplying a new 6-digit PIN in the same request is rejected (400), so an account can never end up as `account_type = 'manager'` with a stale 4-digit PIN. One pre-existing account (kitchen "asdf", employee "John Doe") predates this fix and still has a 4-digit manager PIN — left as-is per user direction; do not "fix" it without being asked.
- `POST /api/orders` and `PUT /api/orders/[id]` both accept optional `pin`+`pinLength` (4|6, from the client's Manager toggle state), independently re-verified/resolved server-side via shared `lib/employee-auth.ts` (never trusts a client-asserted id). Enforcement is conditional: a kitchen with zero employees configured can still operate fully unattributed; the moment it has ≥1 employee, `pin` becomes MANDATORY on both routes (missing it is a 400), not just optional-forever. Admin (God Mode) callers bypass this entirely — admin never supplies pin, and is treated as a distinct already-logged path.
- Every order creation, every forward status transition, AND every delete inserts one row into append-only `order_status_events` (id, nullable `order_id` FK **`ON DELETE SET NULL`**, denormalized `restaurant_name`+`order_number` NOT NULL, `from_status` nullable, `to_status`, `employee_id` nullable, `employee_name` denormalized, `created_at`) in the same DB transaction as the `orders` INSERT/UPDATE/DELETE — this is the actual "who added it, who moved it, who deleted it, how fast" audit trail; `orders`' own timestamp columns only ever hold current/first-entry state, not a full history. A creation event has `from_status = NULL`. A delete event has `to_status = 'Deleted'` (a lifecycle marker, not a real order status — `/admin/audit` renders it as its own danger-toned label, NOT through `StatusBadge`/`normalizeStatus`, which only know Received/Preparing/Complete and would warn+fall back to "Received" if handed it literally). **`order_id` is deliberately `SET NULL`, not `CASCADE`** — an admin hard-deleting an order (or deleting a whole restaurant) must NOT destroy that order's audit history; `restaurant_name`/`order_number` are written directly onto each event row at insert time specifically so the log stays self-contained and readable even after the order/restaurant it describes is gone. Kitchen-side order delete is already soft (`orders.deleted_at`), so a non-null `order_id` on a `Deleted` event means the row still exists (recoverable); `order_id: NULL` means a genuine admin hard-delete. The status-change **Undo** path does not currently insert an audit event — a known gap, not yet fixed.
- **Delete now requires the same PIN attribution as create/status-change** (mandatory once the kitchen has ≥1 employee, optional/unattributed if it has none) — fixed 2026-07-10, previously delete wrote no audit event at all. Client: normal click → confirm modal → (if employees exist) `PinPad` forced to the resolved employee's real length → delete; **Shift-click skips only the "are you sure" confirm modal**, going straight to the PIN pad when employees exist — it never skips attribution itself.
- Same timing-safe dummy-hash precedent as restaurant login (`SECURITY_ATTACK_LOG.md` F4) applied to PIN checks. PIN verification is rate-limited per-restaurant+IP (15/min) — tighter than login, since a PIN has much less entropy than a password.
- Kitchen dashboard: clicking an order's advance button or Add Order opens `PinPad` (numeric keypad, not a text input) if the kitchen has any employees configured. Employee roster/role management (dashboard `StaffTab`) lives in its own nav tab (not Home), gated behind unlocking with a manager's own PIN — the resolved identity's `accountType` is checked client-side (`=== "manager"`) before granting the unlock, since `PinPad`'s Manager toggle only affects expected PIN length, not who the server checks against; every actual mutation is still re-authorized by `requireRestaurantOrAdmin` regardless of this client-side gate.
- Admin-side staff management lives at `/admin/staff` (linked from `/admin/db`'s header) — search a kitchen, view its profile grouped into Managers/Roles/Employees, and add/edit (name, account_type, role, PIN+length)/remove any account. This is the bootstrap path for a kitchen's very first manager, since the kitchen-side Staff tab's manager-PIN-unlock is otherwise a chicken-and-egg lock-out for a kitchen with no employees yet.
- **`/admin/audit`** reads `order_status_events` (see above) — chronological "who did what" across every kitchen, admin-only, its own top-level page reachable ONLY from the gateway (`/`) sidebar's Audit Log link, never from inside `/admin/db`. Default view is unfiltered; typing a kitchen name into the search narrows via `GET /api/dev/audit?restaurantName=`, which then reveals a second employee-name filter scoped to people seen in that kitchen's events (`employeeName` requires `restaurantName` too — a name is only unique per-restaurant). `DELETE /api/dev/audit` ("Purge Audit Log") wipes every event and requires typing the exact phrase `PURGE AUDIT` (client + `{ confirmation: "PURGE AUDIT" }`) — deliberately a DIFFERENT phrase from `/admin/db`'s `PURGE DATABASE`, and this purge only clears audit history, never restaurants/orders themselves. Live-updates via the admin WS channel (see WebSockets section) instead of polling; `HealthPin`'s `showAuditSize` prop (only passed on this page) additionally shows `pg_total_relation_size('order_status_events')` inline in the pill and popover, mirroring `/admin/db`'s own `showDbSize`.
- `PinPad` supports real keyboard input (digits, Backspace, Enter), not just clicks — a `document`-level `keydown` listener, matching `Modal`'s own Escape/Tab handling. `submit()` is guarded by a `useRef` (not the `verifying` state) to stay synchronous against React StrictMode's dev-only double-effect-invocation, which could otherwise let two listener instances both pass a stale `verifying === false` check and fire duplicate `verify-pin` requests for one keypress.
- Both PINs and the restaurant's own password are bcrypt-hashed before storage (never stored raw) — `pin_hash`/`password` columns only, same as every other credential in this app (see `raw_password` being the one documented, user-approved local-dev exception, which does NOT apply to PINs).

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
- Events: `order_updated`, `order_deleted`. Customer clients refetch REST rather than trusting payload status; `/admin/db` refetches `/api/dev/db` on any event (skipped while a destructive-confirm/password/rename modal is open, so a background refetch can't reset in-progress input). `/admin/audit` refetches `/api/dev/audit` (with whatever kitchen filter is currently selected) on the same events — every order create/status-change/delete already calls `broadcast()` in the same request that writes the `order_status_events` row, so no new server-side wiring was needed, just a second listener.
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
| `/api/orders/[id]` | Status/Undo/delete |
| `/api/orders/[id]/acknowledge` | Public pickup acknowledgement |
| `/api/orders/[id]/undelete` | Admin restore |
| `/api/restaurants/by-name/[name]/settings` | Kitchen pickup cap |
| `/api/restaurants/by-name/[name]/employees` | List/add employees |
| `/api/restaurants/by-name/[name]/employees/[id]` | Deactivate/reset PIN |
| `/api/restaurants/by-name/[name]/employees/verify-pin` | PIN-only per-action check; resolves identity from `pin`+`pinLength` (no `employeeId` needed) |
| `/api/restaurants/by-name/[name]/roles` | List/add kitchen-defined role labels |
| `/api/restaurants/by-name/[name]/roles/[roleId]` | Rename/delete a role label |
| `/api/health` | Authenticated health; infrastructure detail admin-only |
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
- Full ESLint currently has 27 known findings (24 errors, 3 warnings), mainly strict React effect/ref rules, CommonJS server imports, and logger `any` types. Keep focused changed-file checks clean; do not hide new issues in the baseline. `lib/useWindowedOrders.ts`'s own data-fetch-on-mount `useEffect` triggers the same pre-existing `react-hooks/set-state-in-effect` pattern already present elsewhere (e.g. `restaurant/Dashboard.tsx`), confirmed via `git stash` comparison before adding it — not a new class of finding.
- Live DB was intentionally empty as of 2026-07-09; as of 2026-07-10 it holds real test data again (deliberate stress-test load, ~60+ throwaway `*Verify*`/`*Stress*`-prefixed kitchens and 1000+ orders) plus the user's own real kitchens (e.g. "asdf"). Do not assume an empty DB going forward without checking `/admin/db`.

## Update Discipline

Keep this file factual and concise. Replace superseded facts in place. Put debugging stories and rejected-design history in `CLAUDE.md`; detailed security proof in `SECURITY_ATTACK_LOG.md`; user instructions in `USER_HELP.md`.
