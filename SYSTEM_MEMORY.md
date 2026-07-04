# SYSTEM_MEMORY.md

## 1. Architecture & Stack
- Next.js 16.2.10 (App Router) + React 19.2.4, TypeScript, Tailwind v4
- Custom server (`app/server.js`, plain Node/CJS) wraps Next's request handler + attaches a `ws` WebSocket server on the same HTTP server/port — required because App Router alone can't host a WS upgrade endpoint. `npm run dev`/`start` now run `node server.js`, not `next dev`/`next start` directly (see §5 WebSocket Architecture).
- DB: **PostgreSQL** via `pg` `Pool`, in `app/src/lib/db.ts`. Reads connection string from `DATABASE_URL` env var (see `app/.env.example`). Exports `getPool()`, `query(text, params)` helper (parameterized `$1, $2...`), and `initDb()` (idempotent `CREATE TABLE IF NOT EXISTS`, no more SQLite-style try/catch migrations — Postgres DDL is simpler). Migrated from SQLite 2026-07; SQLite (`sqlite`/`sqlite3`, `orders.db` file) is fully removed.
- Auth: bcrypt (10 salt rounds); no JWT/session tokens — restaurant "login" just returns 200 OK, client persists state itself; admin uses hardcoded creds + `sessionStorage`/`localStorage` flag (no real auth backend)
- Logging: `app/src/lib/logger.ts`
- 3 user domains:
  - **Customer** (`/customer`): public order tracking, now real-time via WebSocket (no more 5s poll) — see §5
  - **Kitchen/Restaurant** (`/restaurant`): login/register + `Dashboard.tsx` (KitchenDashboard) to manage own orders; still polls every 5s (unchanged — WS migration only targeted the customer portal per explicit scope)
  - **Admin** (`/admin`, `/admin/db`): superuser DB access, seeding/purging, two separate/duplicate admin UIs exist (see quirks)

## 2. Immutable Quirks & Rules
- **Next.js 15+ dynamic APIs**: all dynamic route handlers use `{ params }: { params: Promise<{ id: string }> }` — MUST `await params` before use. Never destructure params synchronously.
- **POS uppercase rule**: customer-facing tracking inputs (`restaurantName`, `orderNumber`) are force-uppercased and stripped to `[A-Z0-9- ]` via `formatInput()` in `customer/page.tsx`. Any new customer-input field touching order lookup must follow this same normalization.
- **No native `window.confirm`/`alert`** — project standard is the custom `ConfirmationModal` + `Toast` components (see `restaurant/Dashboard.tsx` and `admin/db/page.tsx` for canonical pattern: `ModalState`/`ToastState`, 3s auto-dismiss, green=success/red=error).
  - ⚠️ KNOWN VIOLATION: `admin/page.tsx` ("God Mode" dashboard) still calls raw `window.confirm(...)` for its purge action — inconsistent with the rest of the app; treat `admin/db/page.tsx` as the correct reference implementation, not this file.
  - ⚠️ PRE-EXISTING BUG (found 2026-07 during Postgres/WS migration, not caused by it — left untouched, out of scope for that task): `admin/page.tsx`'s `handlePurge` has invalid syntax — `} catch (err) => {` mixes arrow-function syntax into a normal try/catch, which fails `tsc --noEmit`/`next build`. This file will not compile until fixed. Confirmed via `git log`/`git diff` that this predates the migration.
- **Status vocab inconsistency**: order lifecycle statuses differ by layer — API validation (`orders/[id]/route.ts` PUT) allows `Received|Preparing|Complete`; customer UI type (`customer/page.tsx`) expects `Received|Making|Finished`; restaurant-by-name filter route checks for `Making|Finished`. These are NOT interchangeable — verify which set an endpoint expects before changing status strings.
- Two parallel admin surfaces exist: `/admin` (hardcoded user `darkglory`/pass in source, sessionStorage flag, has a Kitchen/Customer "simulation" mode) and `/admin/db` (localStorage `isAdmin` flag, real modal/toast, direct table CRUD). Not unified — don't assume changes to one propagate to the other.
- `restaurants` table stores BOTH bcrypt `password` and plaintext `raw_password` — deliberate, see §2.5 for reasoning/directive. Not a bug to "fix" silently.
- `/api/seed` (GET) and `/api/dev/seed` (POST) are two independent, non-identical seed routes — don't conflate.
- **Postgres query placeholders**: use `$1, $2...` (not SQLite's `?`). All routes migrated 2026-07 — if adding a new route, follow the `query()` helper pattern in `src/lib/db.ts`, never string-interpolate values into SQL.
- **Autoincrement reset**: Postgres uses `ALTER SEQUENCE <table>_id_seq RESTART WITH 1` (not SQLite's `DELETE FROM sqlite_sequence`) — see `api/seed` and `api/dev/seed`.
- **Transactions**: routes needing multi-statement atomicity (e.g. `restaurants/[id]/route.ts` cascade delete) must check out a dedicated client via `getPool().connect()` and call `client.query("BEGIN"/"COMMIT"/"ROLLBACK")` — never run transaction statements against the shared `pool`/`query()` helper directly, since the pool may hand out a different connection per call.
- A live Postgres instance is NOT provisioned by this codebase — `DATABASE_URL` must point at a real instance (local install, Docker, or hosted) before the app can run. Nothing here bootstraps Postgres itself.

## 2.5 Architectural Decisions & Technical Debt
- **Decision**: Intentionally storing `raw_password` in plain text in the `restaurants` table alongside the bcrypt `password` hash.
  - **Reasoning**: Strictly for dev/debugging — lets credentials be viewed easily in the Admin Dashboard (`admin/db/page.tsx`).
  - **Directive**: Do NOT "secure," "fix," or remove this during the prototyping phase. It will be removed before production. Production is far away — do not raise this as an issue or silently patch it in unrelated work.

## 3. File Tree
```
app/
├── server.js                     # custom server: HTTP + Next handler + ws upgrade on /ws
├── .env.example                  # DATABASE_URL template
└── src/
    ├── app/
    │   ├── admin/
    │   │   ├── page.tsx              # "God Mode" — hardcoded login, sim modes, window.confirm (violates rule 2)
    │   │   └── db/page.tsx           # DB CRUD admin — correct modal/toast reference impl
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
    │   ├── customer/page.tsx         # public order tracker, WebSocket live updates, POS-uppercase inputs
    │   ├── restaurant/
    │   │   ├── Dashboard.tsx         # KitchenDashboard: modal+toast reference, Sidebar, still polls 5s
    │   │   ├── page.tsx              # login gate -> KitchenDashboard
    │   │   └── register/page.tsx     # restaurant signup
    │   ├── layout.tsx
    │   ├── page.tsx                  # landing / admin login entry
    │   └── globals.css
    └── lib/
        ├── db.ts                     # pg Pool singleton, query() helper, initDb migrations
        ├── ws-hub.ts                 # WS client registry + broadcast(), shared via globalThis with server.js
        └── logger.ts
```

## 5. WebSocket Architecture
- **Why a custom server**: Next.js 16 App Router has no way to attach a raw `ws` upgrade handler to a route — `server.js` creates a plain `http.Server`, wraps Next's request handler for normal HTTP, and intercepts the `upgrade` event itself. Non-`/ws` upgrade requests (notably Next's own dev-mode HMR websocket) are delegated to `app.getUpgradeHandler()` so dev mode still works.
- **Client registry**: `src/lib/ws-hub.ts` holds a `Set<WebSocket>` stashed on `globalThis` (key `__orderTrackerWsClients`) so both `server.js` (which accepts the raw upgrade and registers connections) and the Next-compiled API routes (which call `broadcast()`) share the same in-memory set — this only works because both run in the **same Node process** (the custom-server pattern). This will NOT work if the app is ever split across multiple processes/instances (e.g. horizontal scaling) — a real pub/sub (Redis, etc.) would be needed then. Not built now; flagging for future-you.
- **Endpoint**: `ws://<host>/ws` (or `wss://` behind TLS).
- **Event shapes** (`OrderEvent` type in `ws-hub.ts`):
  - `{ type: "order_updated", payload: {...order fields...} }` — sent on order create (`POST /api/orders`) and status change (`PUT /api/orders/[id]`)
  - `{ type: "order_deleted", payload: { id: number } }` — sent on `DELETE /api/orders/[id]`
- **Consumer**: `customer/page.tsx` opens a WS connection once an order is being tracked (and not yet `Finished`), reconnects with a 2s fixed backoff on close. On any `order_updated`/`order_deleted` event it does NOT trust the broadcast payload's status string directly — it refetches via the existing `/api/orders/search` REST call, because the broadcasted `status` values come from the Kitchen/API vocabulary (`Received|Preparing|Complete`) which doesn't match the customer page's own `OrderStatus` enum (`Received|Making|Finished`) — see the pre-existing status-vocab quirk in §2. This is a deliberate simplification, not a bug: it means every event triggers one REST round-trip rather than a fully push-driven UI, but avoids trusting/mistranslating a status string across the vocab mismatch.
- **Kitchen Dashboard** (`restaurant/Dashboard.tsx`) was intentionally left on its 5s poll — WS wiring only targeted the Customer Portal per the scoped request. It would receive the same broadcasts for free if migrated later.

## 4. Route Dictionary

### Pages
- `src/app/page.tsx` — Landing + Admin login portal; links to Kitchen/Customer.
- `src/app/admin/page.tsx` — "God Mode": hardcoded creds (`darkglory`/see source), sessionStorage flag; ADMIN/KITCHEN/CUSTOMER sim toggle; purge via `window.confirm` (non-conforming). Tables: `restaurants`, `orders` (read via `/api/dev/db`).
- `src/app/admin/db/page.tsx` — Full DB admin CRUD UI; localStorage `isAdmin` gate; modal+toast pattern (reference impl). Tables: `restaurants`, `orders`.
- `src/app/customer/page.tsx` — Order tracker; POS-uppercase input formatting; initial lookup via `/api/orders/search`, then live updates via WebSocket (`/ws`) until status `Finished` — see §5. Tables: `orders` (read-only).
- `src/app/restaurant/page.tsx` — Kitchen login gate → renders `Dashboard.tsx` KitchenDashboard. Tables: `restaurants` (auth).
- `src/app/restaurant/register/page.tsx` — Restaurant signup form → auto-login → redirect. Tables: `restaurants` (insert).
- `src/app/restaurant/Dashboard.tsx` — KitchenDashboard component (not a route): order list/status mgmt, ConfirmationModal + Toast, Sidebar nav. Tables: `orders` (read/update).

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
