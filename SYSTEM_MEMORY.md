# SYSTEM_MEMORY.md

> **⚠️ 2026-07 UPDATE BANNER — read before trusting older sections below.**
> A large session landed after most of this doc was written. Several sections (§4 tokens, §6 cookie details, §7 file tree, §9 route dictionary) describe the *previous* state and are partially stale. The authoritative current-state deltas are in **§4.2 (theme/sprite/portal)**, **§6 (session split + auth guards)**, and **§10 (security findings + fixes)**. Where an older line conflicts with those, the newer section wins. Specifically, since the older sections were written:
> - Theme changed from dark-slate+amber to **"warm bistro"** (light + dark variants, toggle). The §4 token list naming amber as "the single accent" is stale — brand is now terracotta; see §4.2.
> - Session cookie split from one shared `session` into **`admin_session` + `restaurant_session`**; §6/§9 lines saying "the `session` cookie" are stale.
> - `/api/seed` (GET) was **deleted**; the file tree/route dictionary still list it.
> - Mutating API routes are now **auth-gated** via `src/lib/auth.ts` (`requireAdmin`/`requireRestaurantOrAdmin`) — the route dictionary's "no auth" descriptions predate this.
> - New files not in the §7 tree: `src/lib/auth.ts`, `src/lib/rate-limit.ts`, `src/components/ui/{ChefSprite,ThemeToggle,BackgroundArt,GatewaySidebar,KitchenPortalLanding}.tsx`, `src/app/api/restaurants/route.ts` (GET count).
> - **Open security findings** (some confirmed exploitable, NOT yet fixed) are catalogued in `SECURITY_ATTACK_LOG.md` at repo root and summarized in §10. The #1 item — hardcoded session secret enabling full auth forgery — is live.

## 1. Architecture & Stack
- Next.js 16.2.10 (App Router) + React 19.2.4, TypeScript, Tailwind v4
- Custom server (`app/server.js`, plain Node/CJS) wraps Next's request handler + attaches a `ws` WebSocket server on the same HTTP server/port — required because App Router alone can't host a WS upgrade endpoint. `npm run dev`/`start` now run `node server.js`, not `next dev`/`next start` directly (see §8 WebSocket Architecture).
- DB: **PostgreSQL** via `pg` `Pool`, in `app/src/lib/db.ts`. Reads connection string from `DATABASE_URL` env var (see `app/.env.example`). Exports `getPool()`, `query(text, params)` helper (parameterized `$1, $2...`), and `initDb()` (idempotent `CREATE TABLE IF NOT EXISTS`, no more SQLite-style try/catch migrations — Postgres DDL is simpler). Migrated from SQLite 2026-07; SQLite (`sqlite`/`sqlite3`, `orders.db` file) is fully removed.
- Auth: bcrypt (10 salt rounds) for password storage/verification. Sessions are a signed httpOnly cookie (`src/lib/session.ts`, HMAC-SHA256, no DB-backed session table) — see §9. Admin credentials are still hardcoded (`darkglory`/see `api/admin/login/route.ts`) but are now checked server-side, not client-side. **Route-level authorization** lives in `src/lib/auth.ts` (`requireAdmin()`, `requireRestaurantOrAdmin(name)`) — added 2026-07 to gate mutating routes; see §6 and §10.
- Logging: `app/src/lib/logger.ts`
- 3 user domains:
  - **Customer** (`/customer`): public order tracking, real-time via WebSocket (no polling) — see §8
  - **Kitchen/Restaurant** (`/restaurant`): login/register + `Dashboard.tsx` (KitchenDashboard) to manage own orders; still polls every 5s (WS migration only targeted the customer portal per explicit scope)
  - **Admin** (`/admin`, `/admin/db`): superuser DB access, seeding/purging, two dashboards behind one shared login (see quirks)

## 2. Immutable Quirks & Rules
- **Next.js 15+ dynamic APIs**: all dynamic route handlers use `{ params }: { params: Promise<{ id: string }> }` — MUST `await params` before use. Never destructure params synchronously.
- **POS uppercase rule**: customer-facing tracking inputs (`restaurantName`, `orderNumber`) are force-uppercased and stripped to `[A-Z0-9- ]` via `formatInput()` in `customer/page.tsx`. Any new customer-input field touching order lookup must follow this same normalization.
- **No native `window.confirm`/`alert`** — project standard is the shared `Modal`/`ModalActions` + `ToastProvider`/`useToast` in `src/components/ui/` (see §4 Design System). All pages, including `admin/page.tsx`, use the shared `Modal` as of the 2026-07 redesign.
- **Status vocab inconsistency**: order lifecycle statuses differ by layer — API validation (`orders/[id]/route.ts` PUT) allows `Received|Preparing|Complete`; customer UI type (`customer/page.tsx`) expects `Received|Making|Finished`; restaurant-by-name filter route checks for `Making|Finished`. These are NOT interchangeable at the data/type level — verify which set an endpoint expects before changing status strings. The 2026-07 UI redesign unified how these DISPLAY (see §4's `order-status.ts`) but deliberately did not touch the underlying API contract — that remains a separate, larger decision.
- Two admin entry points exist: `/` (`GatewayCommandCenter`, login gateway — **no longer force-redirects** to `/admin/db`; when already logged in as admin it shows the animated `ChefSprite` + a sidebar with Log Out/Access DB, see §4.2) and `/admin` (`AdminPage`, "God Mode" dashboard with a Kitchen/Customer simulation view). Both check the same `GET /api/session` cookie-backed session (see §9), so logging in from either unlocks both. `/admin` has no login UI of its own — it redirects unauthenticated visitors to `/`, so there is exactly one admin login screen, just two dashboards behind it.
- `restaurants` table stores BOTH bcrypt `password` and plaintext `raw_password` — deliberate, see §3 for reasoning/directive. Not a bug to "fix" silently.
- `/api/seed` (GET) was **deleted 2026-07** (unused dead code + an unauthenticated destructive vector). Only `/api/dev/seed` (POST, now admin-gated) remains for seeding. Any older doc mentioning `/api/seed` is stale.
- **Postgres query placeholders**: use `$1, $2...` (not SQLite's `?`). Follow the `query()` helper pattern in `src/lib/db.ts` for any new route — never string-interpolate values into SQL.
- **Autoincrement reset**: Postgres uses `ALTER SEQUENCE <table>_id_seq RESTART WITH 1` (not SQLite's `DELETE FROM sqlite_sequence`) — see `api/dev/seed`.
- **ILIKE wildcard exposure (KNOWN VULN, not yet fixed — see §10 F5)**: order-lookup routes pass user input straight into `ILIKE $1` without escaping `%`/`_`. Because `%` inside a *parameter value* is still a wildcard, an anonymous caller can pass `%` to match ANY restaurant/order. This is a real, confirmed vulnerability logged in `SECURITY_ATTACK_LOG.md` — if you touch these queries, escape `%`/`_`/`\` or switch to `LOWER(x) = LOWER($1)`.
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

### 4.1 Notification stack (2026-07, macOS-style)
`src/components/ui/Toast.tsx` was rewritten from a single-toast `ToastState | null` to a **list** of notifications with macOS Notification Center-style grouping:
- **Collapsed** (default, 2+ active): shows a peeking stack (depth-scaled/offset cards, max 3 rendered) with a count badge. Clicking the stack expands it.
- **Expanded**: every notification renders as its own full-width card with an individual "×" and a "Collapse" link.
- **Dismiss semantics** (deliberately asymmetric, matching macOS): clicking "×" while **collapsed** clears the *entire* group (`dismissAll`); clicking "×" on a card while **expanded** removes only that one (`dismissOne`), auto-re-collapsing once only 1 remains.
- **Auto-dismiss** (4s) is paused while expanded (the user is actively looking, don't yank content away) and resumes for any still-active items on re-collapse.
- Entrance/exit use custom `@keyframes` in `globals.css` (`notification-pop-in`/`-out`) — a bouncy overshoot on entry, not a linear slide, per the "make it whimsical" ask. `useToast()`'s public signature (`showToast(message, type)`) is unchanged, so no call site (`Dashboard.tsx`, `admin/db/page.tsx`, etc.) needed to change.
- Other whimsy added at the same time: `Button` gets `active:scale-95` on press; `StatusStepper` plays a small bounce (`animate-step-advance`) on the newly-current step when an order advances.

### 4.2 "Warm bistro" theme + mascot + kitchen portal (2026-07, supersedes §4 palette details)
- **Theme**: two hand-designed variants (light cream/parchment default `:root`; dark warm-espresso under `[data-theme="dark"]`) in `globals.css`. Brand = terracotta (not amber), secondary = olive. Toggle: `src/components/ui/ThemeToggle.tsx` (localStorage `theme`, sets `data-theme` on `<html>`); no-flash inline script in `layout.tsx` `<head>` applies it pre-hydration (`<html suppressHydrationWarning>` prevents the hydration mismatch). Toggle is fixed top-right (`top-4 right-4 z-20`) identically on customer/kitchen/gateway/admin-db.
- **Fonts**: Fraunces (display/headings, `font-display`) + Nunito Sans (body). Geist_Mono kept for admin password column.
- **Background art**: `src/components/ui/BackgroundArt.tsx` — faint food-icon watermarks + "FOOD/YUM/TASTY" banners, mounted once globally in `layout.tsx`.
- **ChefSprite** (`src/components/ui/ChefSprite.tsx`): SVG chef mascot, 35 CSS idle animations (random per mount) + ~30 speech lines (overridable via `lines` prop). Pleated-toque hat. Speech bubble lives INSIDE the `<svg>` via `<foreignObject>` anchored at the mouth so it tracks through animations (incl. upside-down). Click = toggle eye-tracking (pupils follow cursor); body animation keeps running during tracking (do NOT re-freeze it). Shown on `/` gateway when admin session active, and on the kitchen portal landing.
- **Gateway `/`**: no longer force-redirects to `/admin/db`. `GatewaySidebar.tsx` left nav (Kitchen Portal / Customer Tracker / Access DB) + Log Out. Admin-session state shows the sprite.
- **Kitchen portal landing** (`KitchenPortalLanding.tsx`): `/restaurant` shows a branded welcome (Log In / Register choice) before the login form. Registration now **auto-logs-in** (register route sets the session cookie), so first-timers land straight in the dashboard.
- **Home nav button** in kitchen dashboard is center-aligned (others left-aligned), per explicit request.
- **Copy**: order "number" → "order **name**" everywhere user-facing (it's an alphanumeric label). Internal field name stays `order_number`.

## 5. Bug Fix Log (2026-07, full sweep)
Fixed in a dedicated bug-fix pass, prior to and separate from the UI redesign in §4:
- **`admin/page.tsx` syntax error**: `} catch (err) => {` (invalid arrow-function-in-catch) fixed to `} catch (err) {`. This had been silently blocking `tsc --noEmit`/`next build` for the whole project — fixing it surfaced a second, previously-hidden bug (next item).
- **`customer/page.tsx` `statusConfig`/`colorClasses` type mismatch**: `statusConfig`'s `color` field was inferred as plain `string`, so indexing `colorClasses[color]` failed strict `tsc` checks. Only surfaced once the `admin/page.tsx` syntax error above stopped short-circuiting the build. (Superseded by the §4 redesign, which replaced this file's ad hoc status-color logic with `order-status.ts`.)
- **Admin auth split-brain**: `/` set `localStorage.isAdmin`, `/admin` set a *different* `sessionStorage.isAdminAuthenticated` key, but `/admin/db` only ever checked `localStorage.isAdmin`. Logging in via `/admin` could never unlock `/admin/db`. Unified both entry points onto `localStorage.isAdmin`.
- **`orders/[id]/route.ts` PUT crash on malformed body**: `status.toLowerCase()` was called before checking `status` was a string, so a missing/non-string `status` threw inside the try block and returned a generic 500 instead of the intended 400 "Invalid status". Fixed with a `typeof status !== "string"` guard before calling `.toLowerCase()`.
- **`Dashboard.tsx` unencoded restaurant name in URL**: `api.getOrders` built `/api/orders/restaurant/${restName}` without `encodeURIComponent`, breaking for restaurant names with spaces or special characters (e.g. "The Golden Spoon"). Fixed to `encodeURIComponent(restName)`.

## 6. Session & Auth Architecture (2026-07)
Replaced the old "Remember Me" (which just prefilled a form from `localStorage`-cached plaintext password — the user still had to click Sign In, and the password sat in the clear in the browser) with real server-issued sessions:
- **`src/lib/session.ts`**: `createSessionToken({ type: "admin" } | { type: "restaurant", name })` / `verifySessionToken(token)`. Token = `base64url(JSON payload incl. exp).base64url(HMAC-SHA256 signature)`, signed with `process.env.SESSION_SECRET` (falls back to a hardcoded dev-only secret if unset — same precedent as the `raw_password` technical debt in §3; set a real `SESSION_SECRET` before any non-local deployment). No database session table — verification is a pure function, no I/O.
- **Cookie name**: `session` (httpOnly, `sameSite=lax`, `secure` in production, `path=/`). **Persistence is controlled by the cookie's `maxAge`, not the token's `exp`** — the token itself is always valid for 30 days (`SESSION_TOKEN_MAX_AGE`) as a safety bound, but omitting `maxAge` at cookie-set time makes it a true session-only cookie (dies when the browser closes) regardless of token validity. "Remember Me" checked → cookie gets `maxAge: SESSION_COOKIE_MAX_AGE_REMEMBERED` (30 days); unchecked → no `maxAge`, session cookie.
- **Routes**: `POST /api/restaurants/login` and the new `POST /api/admin/login` both accept a `rememberMe: boolean` in the body and set the cookie accordingly. `GET /api/session` reads/verifies the cookie and returns `{ authenticated, type, name? }` — this is what every protected page now calls on mount instead of reading `localStorage`. `POST /api/logout` clears the cookie (`maxAge: 0`), used by Kitchen's existing logout and the new Admin logout buttons (`admin/page.tsx`, `admin/db/page.tsx`).
- **Admin auth moved server-side**: previously `src/app/page.tsx` compared the hardcoded username/password entirely in the browser (`username === "darkglory" && ...`). That check now lives in `POST /api/admin/login` (`src/app/api/admin/login/route.ts`) — necessary because a cookie can only be *set* by the server, so remembering the admin session required moving the credential check there too. The credentials themselves are unchanged (still hardcoded, still dev-only).
- **Seamless restore**: `restaurant/page.tsx`, `src/app/page.tsx`, `admin/page.tsx`, and `admin/db/page.tsx` all call `GET /api/session` on mount; if authenticated, they skip the login form/redirect entirely (no button click required) instead of the old prefill-then-still-click-Sign-In behavior.
- **What did NOT change**: no session table, no JWT library (plain `crypto.createHmac`, no new dependency), no change to bcrypt password hashing/verification itself.
- **2026-07 UPDATE (supersedes the "`session` cookie" details above)**: the single shared `session` cookie was split into **`ADMIN_SESSION_COOKIE_NAME` = "admin_session"** and **`RESTAURANT_SESSION_COOKIE_NAME` = "restaurant_session"** (in `session.ts`) so both roles can coexist without clobbering each other. `GET /api/session` checks both; `POST /api/logout` accepts `{ type }` and clears only that role's cookie (both if omitted). Non-remembered logins now always set a `maxAge` (`SESSION_COOKIE_MAX_AGE_DEFAULT` = 1 day) instead of an unset session-only cookie (fixed the "randomly forgotten" bug). `register/route.ts` also sets the restaurant cookie (auto-login on signup).
- **Route authorization (`src/lib/auth.ts`, 2026-07)**: `requireAdmin()` gates `dev/db` (GET+DELETE), `dev/seed`, `restaurants/[id]` (DELETE), `restaurants/[id]/password` (PUT). `requireRestaurantOrAdmin(name)` gates `orders` POST and `orders/[id]` PUT/DELETE (kitchen may only touch its own restaurant's orders; admin any). Both return `{ok:true} | {ok:false, response}` — call at top of handler, `if (!auth.ok) return auth.response`. **Caveat: these guards are only as strong as the session secret, which is currently the hardcoded fallback → see §10 F1.**
- **Rate limiting (`src/lib/rate-limit.ts`)**: in-memory per-IP, 10/min, on both login routes. **Bypassable via `X-Forwarded-For` spoofing → §10 F3.**

## 10. Security Findings (2026-07) — see SECURITY_ATTACK_LOG.md for full detail
Adversarial self-test (authorized). All confirmed live against the local instance; **none fixed yet** (fixes deferred to a later session). Priority order:
- **F1 CRITICAL** — `session.ts` falls back to hardcoded `"dev-only-insecure-session-secret"` and `SESSION_SECRET` is unset in `.env.local`, so anyone who's seen the source can forge a valid `admin_session` token (proven: got HTTP 200 on `/api/dev/db` with a hand-crafted cookie, no login). Subsumes/defeats ALL the §6 auth guards. **Fix: set a real random `SESSION_SECRET`.**
- **F2 CRITICAL** — same root cause: forge any `restaurant_session` (any name, even nonexistent) → full order CRUD as that kitchen. Fixed by the same `SESSION_SECRET` change.
- **F5 CRITICAL** — unescaped `%`/`_` in `ILIKE` on `orders/search`, `orders` GET, `orders/restaurant/[name]` → anonymous caller passes `%` to read ANY customer's order, no auth. `orders/restaurant/[name]` also has no auth guard at all. **Fix: escape wildcards or use `LOWER(x)=LOWER($1)`.**
- **F3 HIGH** — rate limiter trusts `X-Forwarded-For`; rotate the header → unlimited login brute force.
- **F4 MEDIUM** — restaurant login timing side-channel (bcrypt only runs when name exists → ~80ms vs ~10ms) leaks which names are real. **Fix: dummy bcrypt.compare on not-found.**
- **F6 LOW/MED** — no length cap on `order_number`/`restaurant_name`; public unauthenticated `register` accepts 50k-char names (DB-bloat vector). **Fix: length validation + rate-limit register.**
- **Ruled out (held up)**: SQL injection via params (parameterized), WS message injection (no inbound handler), session token tampering/expiry (verification logic solid — only the KEY is the problem), admin-login timing.

## 7. File Tree
```
app/
├── server.js                     # custom server: HTTP + Next handler + ws upgrade on /ws
├── .env.example                  # DATABASE_URL template
└── src/
    ├── app/
    │   ├── admin/
    │   │   ├── page.tsx              # "God Mode" — GET /api/session gate, sim modes, shared Modal for purge, Logout button
    │   │   └── db/page.tsx           # DB CRUD admin — GET /api/session gate, shared Modal/Toast/PageHeader, Logout button
    │   ├── api/
    │   │   ├── admin/
    │   │   │   └── login/route.ts    # POST admin login (server-side cred check) — sets session cookie, see §6
    │   │   ├── session/route.ts      # GET current session ({ authenticated, type, name? }) — see §6
    │   │   ├── logout/route.ts       # POST clears the session cookie — see §6
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
    │   │   │   ├── login/route.ts    # POST bcrypt login, sets session cookie — see §6
    │   │   │   └── register/route.ts # POST create restaurant
    │   │   └── seed/route.ts         # GET legacy seed (3 sample orders)
    │   ├── customer/page.tsx         # public order tracker, WebSocket live updates + connection indicator, POS-uppercase inputs
    │   ├── restaurant/
    │   │   ├── Dashboard.tsx         # KitchenDashboard: responsive Nav (top bar+hamburger on mobile, sidebar on md:+), StatusStepper, still polls 5s
    │   │   ├── page.tsx              # login gate (AuthCard), GET /api/session on mount for seamless restore -> KitchenDashboard
    │   │   └── register/page.tsx     # restaurant signup (AuthCard)
    │   ├── layout.tsx
    │   ├── page.tsx                  # landing / admin login entry (AuthCard), GET /api/session on mount for seamless restore
    │   └── globals.css                # design tokens + notification/stepper keyframes (see §4 Design System)
    ├── components/
    │   └── ui/                       # shared design-system primitives — see §4
    │       ├── Button.tsx             # active:scale-95 press effect
    │       ├── Card.tsx
    │       ├── Input.tsx              # Input + Label
    │       ├── Checkbox.tsx
    │       ├── StatusBadge.tsx        # StatusBadge + StatusIcon
    │       ├── StatusStepper.tsx      # bounces on step advance (animate-step-advance)
    │       ├── Modal.tsx              # Modal + ModalActions
    │       ├── Toast.tsx              # ToastProvider + useToast — macOS-style notification stack, see §4.1
    │       ├── PageHeader.tsx
    │       └── AuthCard.tsx
    └── lib/
        ├── db.ts                     # pg Pool singleton, query() helper, initDb migrations
        ├── ws-hub.ts                 # WS client registry + broadcast(), shared via globalThis with server.js
        ├── order-status.ts           # unified status→visual mapping — see §4
        ├── session.ts                # signed session cookie sign/verify — see §6
        └── logger.ts
```

## 8. WebSocket Architecture
- **Why a custom server**: Next.js 16 App Router has no way to attach a raw `ws` upgrade handler to a route — `server.js` creates a plain `http.Server`, wraps Next's request handler for normal HTTP, and intercepts the `upgrade` event itself. Non-`/ws` upgrade requests (notably Next's own dev-mode HMR websocket) are delegated to `app.getUpgradeHandler()` so dev mode still works.
- **Client registry**: `src/lib/ws-hub.ts` holds a `Set<WebSocket>` stashed on `globalThis` (key `__orderTrackerWsClients`) so both `server.js` (which accepts the raw upgrade and registers connections) and the Next-compiled API routes (which call `broadcast()`) share the same in-memory set — this only works because both run in the **same Node process** (the custom-server pattern). This will NOT work if the app is ever split across multiple processes/instances (e.g. horizontal scaling) — a real pub/sub (Redis, etc.) would be needed then. Not built now; flagging for future-you.
- **Endpoint**: `ws://<host>/ws` (or `wss://` behind TLS).
- **Event shapes** (`OrderEvent` type in `ws-hub.ts`):
  - `{ type: "order_updated", payload: {...order fields...} }` — sent on order create (`POST /api/orders`) and status change (`PUT /api/orders/[id]`)
  - `{ type: "order_deleted", payload: { id: number } }` — sent on `DELETE /api/orders/[id]`
- **Consumer**: `customer/page.tsx` opens a WS connection once an order is being tracked (and not yet `Finished`), reconnects with a 2s fixed backoff on close, and shows a Live/Connecting/Reconnecting indicator (added in the §4 redesign) so a dropped connection is visible instead of silently stale. On any `order_updated`/`order_deleted` event it does NOT trust the broadcast payload's status string directly — it refetches via the existing `/api/orders/search` REST call, because the broadcasted `status` values come from the Kitchen/API vocabulary which doesn't match the customer page's own `OrderStatus` enum — see §2's status-vocab quirk. This is a deliberate simplification, not a bug: it means every event triggers one REST round-trip rather than a fully push-driven UI, but avoids trusting/mistranslating a status string across the vocab mismatch.
- **Kitchen Dashboard** (`restaurant/Dashboard.tsx`) was intentionally left on its 5s poll — WS wiring only targeted the Customer Portal per the scoped request. It would receive the same broadcasts for free if migrated later.

## 9. Route Dictionary

### Pages
- `src/app/page.tsx` — Landing + Admin login portal (`AuthCard`); checks `GET /api/session` on mount and redirects straight to `/admin/db` if already authenticated (seamless restore); submits to `POST /api/admin/login`; links to Kitchen/Customer.
- `src/app/admin/page.tsx` — "God Mode": checks `GET /api/session` on mount, redirects to `/` if not authenticated as admin; ADMIN/KITCHEN/CUSTOMER sim toggle (amber accent); purge via shared `Modal`; Logout button (`POST /api/logout`). Tables: `restaurants`, `orders` (read via `/api/dev/db`).
- `src/app/admin/db/page.tsx` — Full DB admin CRUD UI; `GET /api/session` gate; uses shared `Modal`/`ModalActions`/`ToastProvider`/`PageHeader`/`StatusBadge`; Logout button in `PageHeader` actions. Tables: `restaurants`, `orders`.
- `src/app/customer/page.tsx` — Order tracker; POS-uppercase input formatting; initial lookup via `/api/orders/search`, then live updates via WebSocket (`/ws`) until status `Finished`, plus a Live/Reconnecting connection indicator — see §8 and §4. Tables: `orders` (read-only).
- `src/app/restaurant/page.tsx` — Kitchen login gate (`AuthCard`); checks `GET /api/session` on mount and skips straight to `Dashboard.tsx` KitchenDashboard if already authenticated (seamless restore, no more localStorage password prefill); submits to `POST /api/restaurants/login` with `rememberMe`. Tables: `restaurants` (auth).
- `src/app/restaurant/register/page.tsx` — Restaurant signup form (`AuthCard`) → auto-login → redirect. Tables: `restaurants` (insert).
- `src/app/restaurant/Dashboard.tsx` — KitchenDashboard component (not a route): order list/status mgmt via `StatusStepper`, shared `Modal`/`Toast`, responsive `Nav` (top bar+hamburger on mobile, sidebar on `md:`+); `onLogout` now calls `POST /api/logout`. Tables: `orders` (read/update).

### API Routes
- `src/app/api/session/route.ts`
  - `GET` — reads/verifies the `session` cookie (see §6); returns `{ authenticated: false }` or `{ authenticated: true, type: "admin" | "restaurant", name? }`. No table access.
- `src/app/api/logout/route.ts`
  - `POST` — clears the `session` cookie (`maxAge: 0`). No table access.
- `src/app/api/admin/login/route.ts`
  - `POST` — server-side check against hardcoded admin creds; accepts `rememberMe`; sets session cookie on success. No table access (admin has no DB row).
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
  - `POST` — bcrypt-compare `name`+`password`; accepts `rememberMe`; sets session cookie on success (see §6), 401 on failure. Table: `restaurants` (select).
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
