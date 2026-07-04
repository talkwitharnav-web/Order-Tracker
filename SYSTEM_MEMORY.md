# SYSTEM_MEMORY.md

## 1. Architecture & Stack
- Next.js 16.2.10 (App Router) + React 19.2.4, TypeScript, Tailwind v4
- Custom server (`app/server.js`, plain Node/CJS) wraps Next's request handler + attaches a `ws` WebSocket server on the same HTTP server/port — required because App Router alone can't host a WS upgrade endpoint. `npm run dev`/`start` now run `node server.js`, not `next dev`/`next start` directly (see §7 WebSocket Architecture).
- DB: **PostgreSQL** via `pg` `Pool`, in `app/src/lib/db.ts`. Reads connection string from `DATABASE_URL` env var (see `app/.env.example`). Exports `getPool()`, `query(text, params)` helper (parameterized `$1, $2...`), and `initDb()` (idempotent `CREATE TABLE IF NOT EXISTS`, no more SQLite-style try/catch migrations — Postgres DDL is simpler). Migrated from SQLite 2026-07; SQLite (`sqlite`/`sqlite3`, `orders.db` file) is fully removed.
- Auth: bcrypt (10 salt rounds); no JWT/session tokens — restaurant "login" just returns 200 OK, client persists state itself; admin uses hardcoded creds + a single unified `localStorage.isAdmin` flag (no real auth backend).
- Logging: `app/src/lib/logger.ts`
- 3 user domains:
  - **Customer** (`/customer`): public order tracking, real-time via WebSocket (no polling) — see §7
  - **Kitchen/Restaurant** (`/restaurant`): login/register + `Dashboard.tsx` (KitchenDashboard) to manage own orders; still polls every 5s (WS migration only targeted the customer portal per explicit scope)
  - **Admin** (`/admin`, `/admin/db`): superuser DB access, seeding/purging, two dashboards behind one shared login (see quirks)

## 2. Immutable Quirks & Rules
- **Next.js 15+ dynamic APIs**: all dynamic route handlers use `{ params }: { params: Promise<{ id: string }> }` — MUST `await params` before use. Never destructure params synchronously.
- **POS uppercase rule**: customer-facing tracking inputs (`restaurantName`, `orderNumber`) are force-uppercased and stripped to `[A-Z0-9- ]` via `formatInput()` in `customer/page.tsx`. Any new customer-input field touching order lookup must follow this same normalization.
- **No native `window.confirm`/`alert`** — project standard is the shared `Modal`/`ModalActions` + `ToastProvider`/`useToast` in `src/components/ui/` (see §4 Design System). All pages, including `admin/page.tsx`, use the shared `Modal` as of the 2026-07 redesign.
- **Status vocab inconsistency**: order lifecycle statuses differ by layer — API validation (`orders/[id]/route.ts` PUT) allows `Received|Preparing|Complete`; customer UI type (`customer/page.tsx`) expects `Received|Making|Finished`; restaurant-by-name filter route checks for `Making|Finished`. These are NOT interchangeable at the data/type level — verify which set an endpoint expects before changing status strings. The 2026-07 UI redesign unified how these DISPLAY (see §4's `order-status.ts`) but deliberately did not touch the underlying API contract — that remains a separate, larger decision.
- Two admin entry points exist: `/` (`GatewayCommandCenter`, login, redirects to `/admin/db`) and `/admin` (`AdminPage`, "God Mode" dashboard with a Kitchen/Customer simulation view). Both read/write the same `localStorage.isAdmin` flag, so logging in from either unlocks both. As of the 2026-07 redesign, `/admin` has no login UI of its own — it redirects unauthenticated visitors to `/`, so there is exactly one admin login screen, just two dashboards behind it.
- `restaurants` table stores BOTH bcrypt `password` and plaintext `raw_password` — deliberate, see §3 for reasoning/directive. Not a bug to "fix" silently.
- `/api/seed` (GET) and `/api/dev/seed` (POST) are two independent, non-identical seed routes — don't conflate.
- **Postgres query placeholders**: use `$1, $2...` (not SQLite's `?`). Follow the `query()` helper pattern in `src/lib/db.ts` for any new route — never string-interpolate values into SQL.
- **Autoincrement reset**: Postgres uses `ALTER SEQUENCE <table>_id_seq RESTART WITH 1` (not SQLite's `DELETE FROM sqlite_sequence`) — see `api/seed` and `api/dev/seed`.
- **Transactions**: routes needing multi-statement atomicity (e.g. `restaurants/[id]/route.ts` cascade delete) must check out a dedicated client via `getPool().connect()` and call `client.query("BEGIN"/"COMMIT"/"ROLLBACK")` — never run transaction statements against the shared `pool`/`query()` helper directly, since the pool may hand out a different connection per call.
- A live Postgres instance is NOT provisioned by this codebase — `DATABASE_URL` must point at a real instance (local install, Docker, or hosted) before the app can run. Nothing here bootstraps Postgres itself.
- **Order lookups are case-insensitive** (`ILIKE`, not `=`) on `restaurant_name`/`order_number` in `orders/route.ts`, `orders/search/route.ts`, and `orders/restaurant/[restaurantName]/route.ts`. The Customer page uppercases input (POS rule) but the Kitchen dashboard doesn't normalize `restaurant_name` casing on order creation, so an exact-match `=` comparison could silently report "not found" for a real, existing order. If adding a new order-lookup query, use `ILIKE`, not `=`.
- **Unique constraint on orders**: `idx_orders_unique_restaurant_order` is a case-insensitive unique index on `(LOWER(restaurant_name), LOWER(order_number))` in `initDb()` — prevents duplicate order numbers per restaurant regardless of casing. `POST /api/orders` catches the resulting Postgres error (`code === "23505"`) and returns a 409 with a friendly message instead of a raw 500; this propagates through `Dashboard.tsx`'s `api.createOrder` (which reads the JSON error body) into the shared Toast system.
- **Duplicate-lookup safety net**: `orders/route.ts` GET and `orders/search/route.ts` both add `ORDER BY created_at DESC LIMIT 1` so that if duplicate rows ever exist, lookups deterministically return the newest one instead of an arbitrary row.
- **Restaurant name case-insensitivity**: same root-cause class as the orders fix above, applied to `restaurants.name`. `restaurants/login/route.ts` and `restaurants/register/route.ts` use `ILIKE`, and `idx_restaurants_unique_name_ci` (case-insensitive unique index on `LOWER(name)`) in `initDb()` stops two case-variant registrations (e.g. "Golden Spoon" / "GOLDEN SPOON") racing past the pre-insert existence check. `register/route.ts` also catches the resulting `23505` and returns a 409, same pattern as `POST /api/orders`.

## 3. Architectural Decisions & Technical Debt
- **Decision**: Intentionally storing `raw_password` in plain text in the `restaurants` table alongside the bcrypt `password` hash.
  - **Reasoning**: Strictly for dev/debugging — lets credentials be viewed easily in the Admin Dashboard (`admin/db/page.tsx`).
  - **Directive**: Do NOT "secure," "fix," or remove this during the prototyping phase. It will be removed before production. Production is far away — do not raise this as an issue or silently patch it in unrelated work.

## 4. Design System (2026-07 UI/UX redesign)
Before this redesign the app had **4 incompatible visual themes** (black/red/mono admin, slate/amber warm customer/kitchen, slate/indigo God Mode, plus internal splits within single files), 4 different color mappings for the same 3 order statuses, no shared components despite Modal/Toast being copy-pasted 3x/2x, and almost no responsive/mobile support (only 2 of ~9 pages had any breakpoint). All of that was unified into one system:

- **Tokens** (`src/app/globals.css`): the previously-unused light/dark token block was replaced with a real dark-only token system consumed via Tailwind v4 `@theme`. Categories: surfaces (`--color-surface-0/1/2`, `--color-border`/`-strong`), text (`--color-text-primary/secondary/muted`), brand (`--color-brand`/`-hover`/`-text`, amber — the single accent color used everywhere, replacing the old red/indigo/yellow variants), status (`--color-status-{received,preparing,complete}-{bg,border,text,icon}`), semantic (`--color-danger`/`-hover`, `--color-success`), and a 3-value radius scale (`--radius-sm` buttons/inputs/badges, `--radius-md` cards/modals, `--radius-full` pills). Every page consumes these via `var(--color-*)`/`var(--radius-*)` in Tailwind arbitrary-value classes (e.g. `bg-[var(--color-surface-1)]`) rather than hardcoded Tailwind color names — if you're adding new UI, use a token, don't reintroduce a literal `slate-900`/`gray-800`/etc.
- **Unified order-status mapping** (`src/lib/order-status.ts`): the single source of truth mapping BOTH pre-existing status vocabularies (`Received/Preparing/Complete` and `Received/Making/Finished` — see §2's vocab-inconsistency quirk, still real at the API/type level) to one canonical `StatusKey` (`received|preparing|complete`) with associated label/icon/color. `getStatusVisual(raw)` and `normalizeStatus(raw)` are the entry points. This only changes the **display** layer — it does not change the API contract or attempt to unify the underlying enums, which remains a deliberate, separate, larger decision.
- **Shared components** (`src/components/ui/`): `Button` (variants: primary/secondary/danger/ghost), `Card`, `Input`/`Label`, `Checkbox` (replaces the `form-checkbox` class that depended on an uninstalled `@tailwindcss/forms` plugin — was likely rendering unstyled), `StatusBadge`/`StatusIcon` (read from `order-status.ts`), `StatusStepper` (see below), `Modal`/`ModalActions` (replaces 3 previously copy-pasted confirmation modals; adds `role="dialog"`, `aria-modal`, Esc-to-close, initial focus), `Toast`/`ToastProvider`/`useToast` (replaces 2 previously copy-pasted toast implementations with a context provider), `PageHeader` (title + back-link + responsive action row), `AuthCard` (shared shell for all login/register forms). When adding new UI, use these instead of hand-rolling styles — that drift is exactly what caused the redesign to be necessary in the first place.
- **`StatusStepper`** (`src/components/ui/StatusStepper.tsx`): the Kitchen Dashboard's order status is an explicit 3-step tappable control (Received → Preparing → Complete) instead of a single button whose label silently changes depending on hidden state. Only the *next* step is clickable (no skipping ahead or reverting from the UI). This is the direct answer to "make order status changes feel clear."
- **Responsive strategy**: mobile-first, Tailwind default breakpoints (`md:` 768px, `lg:` 1024px), no custom breakpoints. The Kitchen Dashboard's previously-fixed `w-64` sidebar (unusable on a phone) is now a collapsible top bar + hamburger menu under `md:`, becoming the left sidebar at `md:` and up — this was the single biggest responsiveness gap in the app. Admin header/action rows wrap (`flex-col` → `sm:flex-row`) instead of overflowing. `admin/db`'s tables hide the raw/hashed password columns below `md:`/`lg:` to keep the table usable on a phone (data still available at wider or via horizontal scroll).
- **What did NOT change**: no new dependencies were introduced (no Radix/Headless UI — deliberately, to keep the component surface small and easy for a non-expert dev to read); no routing changes; no changes to the WebSocket/Postgres logic beyond surfacing already-existing client-side connection state in a new "Live/Reconnecting" indicator on the Customer Tracker page; the cross-layer status vocabulary mismatch and the two-admin-dashboard structure are unchanged (documented, not fixed, per §2).
- **Where things live**: `src/lib/order-status.ts` (status mapping), `src/components/ui/*.tsx` (all shared primitives). Every page under `src/app/` was rewritten to consume these rather than hardcoding styles — if a page still has inline hex/Tailwind-literal colors, it was missed and should be brought in line with this system.

## 5. Bug Fix Log (2026-07, full sweep)
Fixed in a dedicated bug-fix pass, prior to and separate from the UI redesign in §4:
- **`admin/page.tsx` syntax error**: `} catch (err) => {` (invalid arrow-function-in-catch) fixed to `} catch (err) {`. This had been silently blocking `tsc --noEmit`/`next build` for the whole project — fixing it surfaced a second, previously-hidden bug (next item).
- **`customer/page.tsx` `statusConfig`/`colorClasses` type mismatch**: `statusConfig`'s `color` field was inferred as plain `string`, so indexing `colorClasses[color]` failed strict `tsc` checks. Only surfaced once the `admin/page.tsx` syntax error above stopped short-circuiting the build. (Superseded by the §4 redesign, which replaced this file's ad hoc status-color logic with `order-status.ts`.)
- **Admin auth split-brain**: `/` set `localStorage.isAdmin`, `/admin` set a *different* `sessionStorage.isAdminAuthenticated` key, but `/admin/db` only ever checked `localStorage.isAdmin`. Logging in via `/admin` could never unlock `/admin/db`. Unified both entry points onto `localStorage.isAdmin`.
- **`orders/[id]/route.ts` PUT crash on malformed body**: `status.toLowerCase()` was called before checking `status` was a string, so a missing/non-string `status` threw inside the try block and returned a generic 500 instead of the intended 400 "Invalid status". Fixed with a `typeof status !== "string"` guard before calling `.toLowerCase()`.
- **`Dashboard.tsx` unencoded restaurant name in URL**: `api.getOrders` built `/api/orders/restaurant/${restName}` without `encodeURIComponent`, breaking for restaurant names with spaces or special characters (e.g. "The Golden Spoon"). Fixed to `encodeURIComponent(restName)`.

## 6. File Tree
```
app/
├── server.js                     # custom server: HTTP + Next handler + ws upgrade on /ws
├── .env.example                  # DATABASE_URL template
└── src/
    ├── app/
    │   ├── admin/
    │   │   ├── page.tsx              # "God Mode" — redirects to `/` if not authed, sim modes, shared Modal for purge
    │   │   └── db/page.tsx           # DB CRUD admin — uses shared Modal/Toast/PageHeader
    │   ├── api/
    │   │   ├── dev/
    │   │   │   ├── db/route.ts       # GET/DELETE full db dump & purge
    │   │   │   └── seed/route.ts     # POST seed (Golden Spoon + 5 orders)
    │   │   ├── orders/
    │   │   │   ├── [id]/route.ts     # PUT status / DELETE order (broadcasts order_updated/order_deleted)
    │   │   │   ├── restaurant/[restaurantName]/route.ts  # GET orders by restaurant
    │   │   │   ├── search/route.ts   # GET single order lookup
    │   │   │   └── route.ts          # POST create (broadcasts order_updated) / GET lookup (dup of search)
    │   │   ├── restaurants/
    │   │   │   ├── [id]/
    │   │   │   │   ├── password/route.ts  # PUT reset password
    │   │   │   │   └── route.ts           # DELETE restaurant + its orders
    │   │   │   ├── login/route.ts    # POST bcrypt login
    │   │   │   └── register/route.ts # POST create restaurant
    │   │   └── seed/route.ts         # GET legacy seed (3 sample orders)
    │   ├── customer/page.tsx         # public order tracker, WebSocket live updates + connection indicator, POS-uppercase inputs
    │   ├── restaurant/
    │   │   ├── Dashboard.tsx         # KitchenDashboard: responsive Nav (top bar+hamburger on mobile, sidebar on md:+), StatusStepper, still polls 5s
    │   │   ├── page.tsx              # login gate (AuthCard) -> KitchenDashboard
    │   │   └── register/page.tsx     # restaurant signup (AuthCard)
    │   ├── layout.tsx
    │   ├── page.tsx                  # landing / admin login entry (AuthCard)
    │   └── globals.css                # design tokens (see §4 Design System)
    ├── components/
    │   └── ui/                       # shared design-system primitives — see §4
    │       ├── Button.tsx
    │       ├── Card.tsx
    │       ├── Input.tsx              # Input + Label
    │       ├── Checkbox.tsx
    │       ├── StatusBadge.tsx        # StatusBadge + StatusIcon
    │       ├── StatusStepper.tsx
    │       ├── Modal.tsx              # Modal + ModalActions
    │       ├── Toast.tsx              # ToastProvider + useToast
    │       ├── PageHeader.tsx
    │       └── AuthCard.tsx
    └── lib/
        ├── db.ts                     # pg Pool singleton, query() helper, initDb migrations
        ├── ws-hub.ts                 # WS client registry + broadcast(), shared via globalThis with server.js
        ├── order-status.ts           # unified status→visual mapping — see §4
        └── logger.ts
```

## 7. WebSocket Architecture
- **Why a custom server**: Next.js 16 App Router has no way to attach a raw `ws` upgrade handler to a route — `server.js` creates a plain `http.Server`, wraps Next's request handler for normal HTTP, and intercepts the `upgrade` event itself. Non-`/ws` upgrade requests (notably Next's own dev-mode HMR websocket) are delegated to `app.getUpgradeHandler()` so dev mode still works.
- **Client registry**: `src/lib/ws-hub.ts` holds a `Set<WebSocket>` stashed on `globalThis` (key `__orderTrackerWsClients`) so both `server.js` (which accepts the raw upgrade and registers connections) and the Next-compiled API routes (which call `broadcast()`) share the same in-memory set — this only works because both run in the **same Node process** (the custom-server pattern). This will NOT work if the app is ever split across multiple processes/instances (e.g. horizontal scaling) — a real pub/sub (Redis, etc.) would be needed then. Not built now; flagging for future-you.
- **Endpoint**: `ws://<host>/ws` (or `wss://` behind TLS).
- **Event shapes** (`OrderEvent` type in `ws-hub.ts`):
  - `{ type: "order_updated", payload: {...order fields...} }` — sent on order create (`POST /api/orders`) and status change (`PUT /api/orders/[id]`)
  - `{ type: "order_deleted", payload: { id: number } }` — sent on `DELETE /api/orders/[id]`
- **Consumer**: `customer/page.tsx` opens a WS connection once an order is being tracked (and not yet `Finished`), reconnects with a 2s fixed backoff on close, and shows a Live/Connecting/Reconnecting indicator (added in the §4 redesign) so a dropped connection is visible instead of silently stale. On any `order_updated`/`order_deleted` event it does NOT trust the broadcast payload's status string directly — it refetches via the existing `/api/orders/search` REST call, because the broadcasted `status` values come from the Kitchen/API vocabulary which doesn't match the customer page's own `OrderStatus` enum — see §2's status-vocab quirk. This is a deliberate simplification, not a bug: it means every event triggers one REST round-trip rather than a fully push-driven UI, but avoids trusting/mistranslating a status string across the vocab mismatch.
- **Kitchen Dashboard** (`restaurant/Dashboard.tsx`) was intentionally left on its 5s poll — WS wiring only targeted the Customer Portal per the scoped request. It would receive the same broadcasts for free if migrated later.

## 8. Route Dictionary

### Pages
- `src/app/page.tsx` — Landing + Admin login portal (`AuthCard`); hardcoded creds (`darkglory`/see source) write `localStorage.isAdmin`; links to Kitchen/Customer.
- `src/app/admin/page.tsx` — "God Mode": redirects to `/` if `localStorage.isAdmin` isn't set (no embedded login of its own); ADMIN/KITCHEN/CUSTOMER sim toggle (amber accent); purge via shared `Modal`. Tables: `restaurants`, `orders` (read via `/api/dev/db`).
- `src/app/admin/db/page.tsx` — Full DB admin CRUD UI; localStorage `isAdmin` gate; uses shared `Modal`/`ModalActions`/`ToastProvider`/`PageHeader`/`StatusBadge`. Tables: `restaurants`, `orders`.
- `src/app/customer/page.tsx` — Order tracker; POS-uppercase input formatting; initial lookup via `/api/orders/search`, then live updates via WebSocket (`/ws`) until status `Finished`, plus a Live/Reconnecting connection indicator — see §7 and §4. Tables: `orders` (read-only).
- `src/app/restaurant/page.tsx` — Kitchen login gate (`AuthCard`) → renders `Dashboard.tsx` KitchenDashboard. Tables: `restaurants` (auth).
- `src/app/restaurant/register/page.tsx` — Restaurant signup form (`AuthCard`) → auto-login → redirect. Tables: `restaurants` (insert).
- `src/app/restaurant/Dashboard.tsx` — KitchenDashboard component (not a route): order list/status mgmt via `StatusStepper`, shared `Modal`/`Toast`, responsive `Nav` (top bar+hamburger on mobile, sidebar on `md:`+). Tables: `orders` (read/update).

### API Routes
- `src/app/api/orders/route.ts`
  - `POST` — create order; requires `restaurant_name`, `order_number`; default status `Received`; broadcasts `order_updated` via ws-hub. Table: `orders` (insert).
  - `GET` — lookup by `restaurant_name`+`order_number` query params (duplicate of `/api/orders/search`). Table: `orders` (select).
- `src/app/api/orders/[id]/route.ts`
  - `PUT` — update `status`; validates against `Received|Preparing|Complete` (case-insensitive); broadcasts `order_updated`. Table: `orders` (update).
  - `DELETE` — delete order by id; broadcasts `order_deleted`. Table: `orders` (delete).
- `src/app/api/orders/restaurant/[restaurantName]/route.ts`
  - `GET` — list orders for restaurant; optional `?status=` filter (`Received|Making|Finished`); default excludes `Finished` older than 5 min. Table: `orders` (select).
- `src/app/api/orders/search/route.ts`
  - `GET` — single order lookup via `restaurant_name`+`order_number` query params. Table: `orders` (select).
- `src/app/api/restaurants/login/route.ts`
  - `POST` — bcrypt-compare `name`+`password`; no token issued, just 200/401. Table: `restaurants` (select).
- `src/app/api/restaurants/register/route.ts`
  - `POST` — create restaurant; 409 if name exists; stores bcrypt hash + `raw_password`. Table: `restaurants` (insert).
- `src/app/api/restaurants/[id]/route.ts`
  - `DELETE` — deletes restaurant + cascades delete of its `orders` (transaction: BEGIN/COMMIT/ROLLBACK). Tables: `restaurants`, `orders` (delete).
- `src/app/api/restaurants/[id]/password/route.ts`
  - `PUT` — reset password; requires `newPassword`; updates hash + raw. Table: `restaurants` (update).
- `src/app/api/seed/route.ts` — **[legacy]**
  - `GET` — clears + seeds `orders` only (3 rows, multi-restaurant, resets autoincrement). Table: `orders`.
- `src/app/api/dev/db/route.ts` — **[dev]**
  - `GET` — dump all `restaurants` + `orders`.
  - `DELETE` — purge both tables, then re-init schema.
- `src/app/api/dev/seed/route.ts` — **[dev]**
  - `POST` — clears both tables, resets autoincrement, creates "The Golden Spoon" (pass `password123`) + 5 orders (`ORD-101..105`). Tables: `restaurants`, `orders`.
