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

## Architecture

- Next.js `16.2.10`, React `19.2.4`, TypeScript, Tailwind CSS v4.
- PostgreSQL 16 through `pg`; Docker container is `restaurant-postgres-1`.
- Custom CommonJS server (`app/server.js`) wraps Next, hosts `/ws`, caps API bodies at 16KB, overwrites spoofable forwarding headers, restricts non-localhost routes, and starts rolling backups.
- One app process and one DB. WebSocket clients and rate limits are in memory; horizontal scaling would require shared infrastructure.

### Experiences

| Area | Route | Behavior |
|---|---|---|
| Admin | `/`, `/admin/db` | Localhost-only gateway and DB console |
| Kitchen | `/restaurant/*` | Authenticated dashboard; polls orders every 5 seconds |
| Customer | `/customer` | Public lookup; live WebSocket updates |

Non-localhost hosts expose only customer/kitchen/API/static prefixes; `/` and `/admin/db` return 404. This is public-routing rehearsal, not full internet deployment.

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

### Lifecycle

- Kitchen moves only one step forward. Admin may override status.
- `received_at`, `preparing_at`, and `complete_at` record stage entry.
- A genuine kitchen transition gets one server-stored Undo token valid for 8 seconds. Undo must match the latest token/current status, fails after another change or customer pickup, and clears only the mistaken stage timestamp.
- Customer pickup sets `acknowledged_at`. Complete duration stops there or at the kitchen’s configured cap.
- Kitchen cards show total age; Received/Preparing views are oldest-first; navigation shows counts.

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

- Registry: `globalThis.__orderTrackerWsClients`, entries shaped `{ ws, restaurantName }`.
- Every `/ws` connection declares `?restaurant=`; broadcasts without `restaurant_name` are dropped.
- Events: `order_updated`, `order_deleted`. Customer clients refetch REST rather than trusting payload status.
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

## API Map

| API | Purpose |
|---|---|
| `/api/session`, `/api/logout` | Dual-role session state/logout |
| `/api/admin/login` | Admin login |
| `/api/restaurants` | Count/register/login/suggest and admin mutation subroutes |
| `/api/orders` | Create and public lookup |
| `/api/orders/search` | Public canonical lookup |
| `/api/orders/restaurant/[name]` | Authenticated kitchen order list |
| `/api/orders/[id]` | Status/Undo/delete |
| `/api/orders/[id]/acknowledge` | Public pickup acknowledgement |
| `/api/orders/[id]/undelete` | Admin restore |
| `/api/restaurants/by-name/[name]/settings` | Kitchen pickup cap |
| `/api/health` | Authenticated health; infrastructure detail admin-only |
| `/api/customer-origin` | Authenticated reachable-origin resolver |
| `/api/dev/db`, `/api/dev/seed` | Admin DB view/Purge and destructive Seed |

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
- Seed requires `{ confirmation: "SEED DATABASE" }` and transactionally creates 5 sample kitchens plus 30 live/5 deleted lifecycle-rich orders (shared password `password123`); Purge requires `{ confirmation: "PURGE DATABASE" }`.
- Restore only after loading a dump into a temporary DB and verifying counts/names, then stop app and swap DB names.
- At this update the user intentionally wants the live database empty. Old snapshots may contain previous kitchens; do not restore without asking.

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
- Full ESLint currently has 27 known findings (24 errors, 3 warnings), mainly strict React effect/ref rules, CommonJS server imports, and logger `any` types. Keep focused changed-file checks clean; do not hide new issues in the baseline.
- Live DB is intentionally empty as of 2026-07-09.

## Update Discipline

Keep this file factual and concise. Replace superseded facts in place. Put debugging stories and rejected-design history in `CLAUDE.md`; detailed security proof in `SECURITY_ATTACK_LOG.md`; user instructions in `USER_HELP.md`.
