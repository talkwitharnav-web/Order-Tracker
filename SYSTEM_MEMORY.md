# SYSTEM_MEMORY.md

## CRITICAL — READ FIRST

- **Status vocabulary mismatch is real, unresolved at the API/type level, and still bites new code**: Kitchen/API stores `Received|Preparing|Complete`; an older Customer type expected `Received|Making|Finished`. Never compare `order.status` via raw `===` against a literal string — always go through `order-status.ts`'s `normalizeStatus()`/`getStatusVisual()`. This exact bug class has recurred at least 3 times (customer page title text, WS-reconnect-effect guard, an admin filter route).
- **`raw_password` plaintext in `restaurants`** alongside the bcrypt hash is intentional, user-approved dev-only debt (§3). Don't flag/fix unless asked.
- **Session cookies are split**: `admin_session` / `restaurant_session` (`session.ts`). `GET /api/session` returns both independently (`{ admin: boolean, restaurant: {name}|null }` plus legacy `type`/`authenticated`/`name` fields) — a caller with both an admin AND restaurant session must see both; an earlier "admin-cookie-wins" bug caused a real, hard-to-reproduce "remember me forgets me" report.
- **Kitchen delete = soft (`deleted_at`), Admin delete = real/permanent.** Restaurant soft-delete/encryption system was removed entirely (dead code once admin-restaurant-delete became real) — only orders still soft-delete, and only for kitchen callers.
- **`node server.js`, never `next dev`/`next start`** — custom server hosts the raw WS upgrade handler App Router can't attach one to.
- **WS client registry is `globalThis`-based** (`ws-hub.ts`) — same-process only, does not survive horizontal scaling.
- **`ILIKE` needs `escapeLikePattern()`** on every user-supplied value reaching it, or `%`/`_` acts as a wildcard regardless of parameterization.
- **Dynamic route params must be awaited**: `{ params }: { params: Promise<{ id: string }> }`, never destructured synchronously (Next 15+ requirement).
- Full narrative/judgment-call history (why decisions were made, mistakes, lessons) lives in `CLAUDE.md` — this file is the "what's actually true right now" technical reference. Condensed 2026-07-08; superseded iteration detail was cut, only current state + still-relevant lessons kept.

---

## 1. Architecture & Stack
- Next.js 16.2.10 (App Router) + React 19.2.4, TypeScript, Tailwind v4.
- Custom server (`app/server.js`, plain Node/CJS): wraps Next's request handler, attaches a `ws` WebSocket server on `/ws`, branches on the `Host` header (see §8b), overwrites `X-Forwarded-For` with the real socket address, rejects `/api/*` bodies over 16KB, runs the rolling DB backup schedule (§12).
- DB: PostgreSQL via `pg` `Pool` (`src/lib/db.ts`). `getPool()` sets connection/statement/query timeouts (10s) + a `pool.on("error", ...)` listener (an idle client's background error is otherwise an unhandled, fatal Node event). `query()` retries only transient failures (`ECONNREFUSED`/`ECONNRESET`/`ETIMEDOUT`/Postgres `57P0x`) with backoff. `initDb()` is idempotent (`CREATE ... IF NOT EXISTS`) and memoized (module-level promise, clears itself on failure).
- Auth: bcrypt (10 rounds) for password storage. Sessions: signed httpOnly cookies via `crypto.createHmac`, no DB session table (`session.ts`). Admin creds hardcoded, checked server-side (`api/admin/login/route.ts`). Route-level authorization: `src/lib/auth.ts` — `requireAdmin()`, `requireRestaurantOrAdmin(name)`, `requireAnyAuthenticated()` (either role — used by `/api/health`).
- 3 domains: **Customer** (`/customer`, public, WS-live, no polling), **Kitchen** (`/restaurant/*`, still polls 5s — WS migration only targeted Customer), **Admin** (`/`, `/admin/db` — `/admin` "God Mode" was removed entirely, dead weight with zero incoming links).

## 2. Immutable Quirks & Rules
- **POS uppercase rule**: order-name inputs uppercase+strip to `[A-Z0-9_- ]` (underscore added 2026-07-08 — server's `requireSafeName` whitelist allows it, client was stripping it, making underscore-containing names unreachable). Restaurant-name inputs keep natural casing (own formatter, `[a-zA-Z0-9_' -]`) — a copy-paste artifact force-uppercased restaurant names until fixed; `ILIKE` already made this cosmetic-only, not a search-correctness issue.
- **No native `window.confirm`/`alert`** — shared `Modal`/`ModalActions` + `ToastProvider`/`useToast` only.
- Postgres placeholders: `$1, $2...`. Never string-interpolate SQL. Transactions: dedicated client via `getPool().connect()` + explicit `BEGIN`/`COMMIT`/`ROLLBACK` — never the shared pool.
- Order/restaurant lookups are case-insensitive (`ILIKE`, not `=`) — case-insensitive **partial** unique indexes (`WHERE deleted_at IS NULL`) prevent both duplicate-name collisions and let a soft-deleted name/order-number be reused immediately by a live row.
- `POST /api/orders`/`register` catch Postgres `23505` (unique violation) → clean 409, not a raw 500.
- `/api/seed` (GET, legacy) — still exists but superseded by `/api/dev/seed` (POST, admin-gated). Don't confuse the two.

## 3. Architectural Decisions & Technical Debt
- **`raw_password` plaintext storage**: intentional, dev/debugging only (viewable in admin/db). Do NOT "fix" or flag this unprompted — removed before any real production use, not now.

## 4. Design System
- **Tokens** (`src/app/globals.css`, Tailwind v4 `@theme`): "warm bistro" — light (cream/parchment, terracotta brand, olive secondary) is default `:root`; dark (espresso/charcoal) under `[data-theme="dark"]`. Status colors (`--color-status-{received,preparing,complete}-{bg,border,text,icon}`), semantic (`--color-danger`/`-hover`, `--color-success`), 3-value radius scale. Always use a token (`var(--color-*)`) — never reintroduce a literal Tailwind color name; hardcoded `text-{color}-{shade}` classes have silently bypassed the theme system and caused bad-contrast bugs after palette changes more than once.
- **`order-status.ts`**: single source of truth mapping both status vocabularies to canonical `StatusKey` (`received|preparing|complete`). `getStatusVisual(raw)`/`normalizeStatus(raw)` — display layer only, does not touch the API contract (§2's mismatch is still real underneath).
- **Shared components** (`src/components/ui/`): `Button`, `Card`, `Input`/`Label`, `Checkbox`, `StatusBadge`/`StatusIcon`, `StatusStepper` (explicit 3-step tappable control, only the next step clickable — no skip/revert from the UI), `Modal`/`ModalActions`, `Toast`/`ToastProvider`/`useToast`, `PageHeader`, `AuthCard`. Use these; don't hand-roll one-off styles.
- **Notification stack** (`Toast.tsx`): macOS-style — collapsed stack's × clears the whole group, an expanded card's × clears just that one (deliberately asymmetric, matches real macOS, don't "fix" to symmetric). Auto-dismiss (4s) pauses while expanded. `useToast()`'s public signature (`showToast(message, type)`) is stable — extend `ToastProvider` internals for new behavior, don't change the signature.
- **Fonts**: Fraunces (display/headings, `font-display`) + Nunito Sans (body) + Geist Mono (admin password column only).
- **Responsive**: mobile-first, Tailwind default breakpoints, `min-h-dvh` (not `min-h-screen`/`100vh` — overflows on real mobile browsers with the address bar showing). Fixing the viewport unit alone doesn't guarantee no overflow — content can still be taller than a short viewport; that needs actual content/spacing trims at the breakpoint, re-measure after any such fix.
- **`useReservedTopRight.ts`** + `.clear-top-right`: measures `SettingsToggles`' real bounding box via `ResizeObserver`, publishes `--reserved-top-right-w/-h` CSS vars. Use this for any new top-right-adjacent element (`PageHeader`, mobile nav bars, `Toast`'s stack all use it) — top-right collisions have recurred repeatedly as the toolbar grew; don't hand-tune a margin/padding number.
- **No new dependencies** for UI (no Radix/Headless UI, no animation library) — custom CSS keyframes, kept deliberately simple for a non-expert maintainer.

## 5. Bug Fix Log (early sweep, pre-redesign)
- Fixed a syntax error (`} catch (err) => {`) in the (now-deleted) `admin/page.tsx` that had silently blocked `tsc`/build for the whole project.
- Admin auth split-brain (two different storage keys not recognizing each other) — unified.
- `orders/[id]/route.ts` PUT crash on non-string `status` — guarded.
- `Dashboard.tsx` missing `encodeURIComponent` on restaurant name in URL — fixed.

## 6. Session & Auth Architecture
- **`session.ts`**: `createSessionToken({type:"admin"}|{type:"restaurant",name})`/`verifySessionToken(token)`. Token = `base64url(payload).base64url(HMAC-SHA256 sig)`, signed with `SESSION_SECRET` (real random value now set in `.env.local`; loudly warns if ever unset again). No DB session table.
- **Cookies**: `ADMIN_SESSION_COOKIE_NAME`="admin_session", `RESTAURANT_SESSION_COOKIE_NAME`="restaurant_session" — split so both roles coexist. Non-remembered logins always set a real `maxAge` (`SESSION_COOKIE_MAX_AGE_DEFAULT`=1 day) — an unset `maxAge` (pure session-lifetime cookie) can be silently dropped by some browsers on ordinary navigation, not just tab close. Remembered = 30 days (`SESSION_COOKIE_MAX_AGE_REMEMBERED`). **Persistence is controlled by the cookie's `maxAge` at set-time, not the token's internal `exp`** (token itself always valid 30 days as a safety bound) — don't tie cookie lifetime to token `exp`, it breaks the non-remembered case.
- **`SESSION_COOKIE_SECURE`**: gated on `FORCE_SECURE_COOKIES` env var (default `false`), NOT `NODE_ENV` (wrong signal — build mode, not transport; this app runs "production" while still being plain HTTP on a LAN). Flip on only once genuinely behind HTTPS.
- **`GET /api/session`**: checks both cookies independently, returns `{ authenticated, type, name?, admin: boolean, restaurant: {name}|null }`.
- **`POST /api/logout`**: accepts `{ type: "admin"|"restaurant" }`, clears only that cookie (both if omitted) — never make it clear both unconditionally, or logging out one role kills an unrelated session for the other role in another tab.
- **`src/lib/auth.ts`**: `requireAdmin()` (dev/db, dev/seed, restaurants/[id] DELETE, restaurants/[id]/password PUT), `requireRestaurantOrAdmin(name)` (orders POST/PUT/DELETE — kitchen only its own restaurant, admin any), `requireAnyAuthenticated()` (either role — `/api/health`, since it exposes no restaurant-scoped data). All are real server-side httpOnly-cookie HMAC verification — no client-side/DevTools-spoofable gate anywhere in this chain.
- **Rate limiting** (`src/lib/rate-limit.ts`): in-memory per-IP `checkRateLimit(key, {windowMs, maxAttempts})`, periodic sweep evicts stale entries (was previously unbounded-growth). Current limits: login/most anonymous endpoints 10-120/min depending on route, registration 5/min (tighter — each success permanently creates a row), suggest 30/min (tightened from 120 after an enumeration finding), order creation 30/min **per-restaurant** (not per-IP — a busy kitchen behind one NAT shouldn't be throttled like an attacker; admin is NOT exempt).
- **`/restaurant` routes**: `/home` (Log In/Register choice, only gate is zero-restaurants-exist check), `/login`, `/signup` (**both now check session on mount and redirect if one exists** — a real, twice-investigated bug: browser back/forward can land directly on these pages without passing through `/home`'s click flow, and a session-blind form had no way to know a valid session existed), `/restauranthome` (the only place that owns `SessionWelcomeBack`/`KitchenDashboard` rendering). Fresh login/signup navigates with `?fresh=1` to skip the redundant "still signed in?" confirm (the param never grants access on its own — gate is still the real session check).

## 7. File Tree (current, authoritative)

```
app/
├── server.js                     # HTTP + Next handler + ws upgrade on /ws; Host-header branching (§8b); X-Forwarded-For overwrite; body-size cap; backup schedule start
├── scripts/
│   ├── docker-desktop.mjs        # ensure-running/quit-if-running, also shuts down WSL on Windows quit
│   ├── db-backup.js              # rolling pg_dump backup, see §12
│   └── startup.{ps1,sh}, docker-export.{ps1,sh}, docker-unpack.{ps1,sh}  # independent per-platform, see §13
└── src/
    ├── app/
    │   ├── admin/db/page.tsx         # DB CRUD admin — search/sort/filter, Deleted toggle, sticky Actions column, shift-click-skip-confirm
    │   ├── api/
    │   │   ├── admin/login/route.ts
    │   │   ├── health/route.ts       # requireAnyAuthenticated; tier/latencyMs open to any caller, sizeBytes/pool/connectedClients admin-only
    │   │   ├── session/route.ts, logout/route.ts
    │   │   ├── dev/db/route.ts, dev/seed/route.ts
    │   │   ├── orders/
    │   │   │   ├── [id]/route.ts               # PUT status (stamps timing column once via COALESCE) / DELETE (soft for kitchen, real for admin)
    │   │   │   ├── [id]/acknowledge/route.ts    # anonymous "Order Picked Up", rate-limited
    │   │   │   ├── [id]/undelete/route.ts
    │   │   │   ├── restaurant/[restaurantName]/route.ts
    │   │   │   ├── search/route.ts, route.ts    # GET/POST, narrowed SELECT columns for anonymous callers
    │   │   ├── restaurants/
    │   │   │   ├── [id]/route.ts                # DELETE — always real, cascades orders, transaction
    │   │   │   ├── [id]/password/route.ts, [id]/rename/route.ts
    │   │   │   ├── by-name/[restaurantName]/settings/route.ts  # kitchen self-service complete_cap_hours
    │   │   │   ├── login/route.ts, register/route.ts, suggest/route.ts  # suggest: rate-limited, min-length, safe-name-filtered
    │   │   │   └── route.ts (GET count)
    │   ├── customer/page.tsx         # public tracker, WS-live, POS-uppercase order input / natural-case restaurant input, acknowledge button
    │   ├── restaurant/
    │   │   ├── Dashboard.tsx         # KitchenDashboard — responsive Nav, StatusStepper, naming-style dropdown, order slide animations
    │   │   ├── home/page.tsx, login/page.tsx, signup/page.tsx, restauranthome/page.tsx
    │   ├── layout.tsx                # pre-hydration inline script applies theme/contrast/ui-size/motion/focus/cvd from localStorage
    │   ├── page.tsx                  # gateway `/` — sprite+sidebar if admin session active, else login form
    │   └── globals.css               # all tokens + keyframes
    ├── components/ui/                # Button, Card, Input, Checkbox, StatusBadge, StatusStepper, Modal, Toast, PageHeader, AuthCard,
    │                                  # HealthPin, SessionWelcomeBack, ThemeToggle, AccessibilityMenu, ThemedTooltip, UiSizeToggle,
    │                                  # SettingsToggles, RestaurantAutocomplete, ChefSprite, BackgroundArt, GatewaySidebar,
    │                                  # KitchenPortalLanding, CopyableValue, StatusDurationCell, RestaurantFilterDropdown, StatusFilterDropdown
    └── lib/
        ├── db.ts, ws-hub.ts, order-status.ts, order-naming.ts, order-duration.ts
        ├── accessibility-prefs.ts, session.ts, auth.ts, rate-limit.ts, api-client.ts, validate.ts, logger.ts
```

## 8. WebSocket Architecture
- Custom server intercepts `upgrade` events; non-`/ws` upgrades (Next's own HMR socket) delegate to `app.getUpgradeHandler()`.
- **Client registry**: `Set<{ws, restaurantName}>` on `globalThis` (NOT a flat `Set<WebSocket>` — that shape was a real eavesdropping vulnerability, see §9 F7). Every `/ws` connection must supply `?restaurant=<name>` (rejected if missing). `broadcast(event)` only delivers to sockets subscribed to the matching `restaurant_name` (case-insensitive) — **an event missing `restaurant_name` is silently dropped, fail-closed by design**. Every `broadcast()` call site must include it.
- Origin check: rejects missing-`Origin` upgrades UNLESS the connecting IP is a private LAN address (`isPrivateLanIp()` — needed for Expo/React Native clients, which don't send `Origin` like a browser; a real internet attacker can never appear to originate from a private IP, so this doesn't reopen the hole).
- Events: `{type:"order_updated", payload:{...order}}` (create + status change), `{type:"order_deleted", payload:{id}}`.
- Customer page refetches via REST on any event rather than trusting the broadcast payload's status string directly (status-vocab mismatch, §2). Kitchen Dashboard is NOT WS-wired — still polls 5s, by original scope choice.
- **Will NOT survive horizontal scaling** — same-process `globalThis` only. Don't add Redis pub/sub unless multi-instance deployment is actually requested.

### 8b. Host-based route restriction (`server.js`, public-exposure rehearsal)
`isRestrictedHost(hostHeader)` — true for anything other than `localhost`/`127.0.0.1`/`[::1]`. If restricted AND the path isn't in `PUBLIC_ALLOWED_PREFIXES` (`/customer`, `/restaurant`, `/api/orders`, `/api/restaurants`, `/api/session`, `/api/logout`, `/api/health`, `/_next`, `/favicon.ico`), returns a plain 404 before Next's `handle()` ever runs. This is a genuine rehearsal for a real subdomain split later, not throwaway logic — verified against the real LAN IP directly (bare `/`, `/admin/db` → 404; `/customer` → 200; static assets load).

## 9. Security Findings — all fixed and live-verified across 3 audit rounds
Full repro/fix detail: `SECURITY_ATTACK_LOG.md` (Round 3 only — earlier rounds' log was deleted once confirmed patched, this section is the only surviving record of F1-F11/the 6-issue sweep).

**Round 1 (F1-F11)**: F1/F2 real `SESSION_SECRET` set (was hardcoded fallback, forgeable tokens). F5 `escapeLikePattern()` everywhere + auth guard added to a route that had none. F3/F8 `X-Forwarded-For` overwritten server-side + register rate-limited. F7 WS broadcast scoping (see §8, the real fix — an Origin-only fix was "a speed bump, not full auth"). F4 timing-safe login (dummy bcrypt compare on not-found path). F6/F9 `requireString()` type+length validation everywhere. F10 forward-only status transitions unless admin. F11 malformed JSON/non-integer ids → clean 400/404.

**Round 2 (mass sweep, 6 issues)**: `?status=` filter checked wrong vocabulary (silently broken — fixed). Anonymous order-lookup routes had zero rate limiting (now 120/min). `dev/db`'s per-row decrypt could 500 the whole endpoint on one bad row (now guarded per-row — moot now, that whole system was later removed, §11). Rate-limit Map had no eviction (now swept). `/api/health` echoed raw DB errors to non-admin callers (now admin-only detail).

**Round 3 (external adversarial audit, 16 findings)**: `requireSafeName()` (`^[A-Za-z0-9 '.,#_-]+$`, whitelist at every storage point — closes a real stored-XSS gap where client-side stripping wasn't a real boundary) + `isSafeName()` (read-side filter for `/suggest`, hides legacy unsafe names) + `parseJsonBody()` (rejects JSON nested past 5 levels) in `validate.ts`. `requireString` strips ASCII control chars including null bytes/CRLF (Postgres literally can't store `\0` — was a real unhandled-500). 16KB body-size cap in `server.js`. `SESSION_COOKIE_SECURE`/`FORCE_SECURE_COOKIES` (see §6). Security headers via `next.config.ts` `headers()` (CSP, X-Frame-Options, X-Content-Type-Options, Referrer-Policy, Permissions-Policy — deliberately no HSTS yet, would break plain-HTTP LAN access prematurely; CSP conditionally allows `unsafe-eval` only outside production for Next's own dev-mode debugging). `/suggest`: `MIN_QUERY_LENGTH=3`, tightened to 30/min, filtered through `isSafeName()` — NOT removed/auth-gated (would break the real anonymous-autocomplete feature). `MIN_PASSWORD_LENGTH=8`. `poweredByHeader:false`, `productionBrowserSourceMaps:false`.

**Assessed and deliberately NOT changed**: `id` field was NOT removed from `/api/orders`'s response despite an audit suggestion — the real "Order Picked Up" acknowledge feature needs it client-side.

**Ruled out, held up across every pass**: SQL injection (parameterized), WS message injection (no inbound handler), session token tampering (verification logic solid, only the *key* was ever the problem), form-based CSRF (JSON-body requirement + `sameSite=lax`).

## 10. Local tooling: `startup`/`export`/`unpack`
Independent `.ps1`+`.cmd` (Windows) and `.sh` (Mac/Linux) implementations per command — NOT generated from one source, explicit user decision, will drift if only one is edited.
- **`startup`**: dependency check (Node/npm/Docker) → repairs `.env.local` (generates `SESSION_SECRET` if missing) → verifies every declared npm package's `package.json` actually resolves (not a folder-timestamp guess — found `node_modules` present but 20/20 packages broken underneath once) → `db:up` → `node server.js`.
- **`export`**: builds `app/Dockerfile` (same `npm run build && node server.js` as local dev, never `next start`), bundles with `postgres:16` image + compose file + `run.cmd`/`run.sh` into `restaurant-app-export.zip`. **Both images ship in the zip** — target machine needs zero internet access. Target-machine-only prerequisite: Docker Desktop.
- **`unpack`**: same-machine convenience for testing an export — `docker load`s both images, generates fresh `.env`, `-Start`/`--start` also runs `docker compose up -d`. Self-cleans on partial failure (e.g. port collision).
- **Windows PS 5.1 trap**: `[RandomNumberGenerator]::Fill()` is .NET 6+-only, fails silently (no exception) on PS 5.1 — produces an all-zero "random" secret. Use `RNGCryptoServiceProvider` instead, always with an empty/all-zero validation guard. This bug existed in more than one script simultaneously before — grep all `.ps1` files for the banned pattern, don't assume one fix closes it everywhere.
- **`docker-desktop.mjs`**: shared Node script (not a per-platform duplicate) for `ensure-running`/`quit-if-running`, used by both `db:up`/`db:down` on any OS. `quitIfRunning()` also runs `wsl --shutdown` on Windows after Docker Desktop's own processes close (closes a real orphaned-`vmmemWSL`-memory scenario) — only when Docker Desktop was actually the thing just closed, never unconditionally.

## 11. Soft-delete system (orders only — restaurant version removed)
- **Orders**: `DELETE /api/orders/[id]` — kitchen caller soft-deletes (`deleted_at`), admin caller hard-deletes (real `DELETE`). All order-visibility queries filter `deleted_at IS NULL`. Partial unique index lets a soft-deleted order-name be reused immediately.
- **`POST /api/orders/[id]/undelete`**: clears `deleted_at`, 409s if a live order now occupies the same name.
- **Restaurant soft-delete/encryption (`crypto.ts`, AES-256-GCM) was removed entirely** — dead code once admin-restaurant-delete became a real, permanent `DELETE` (no new soft-deleted restaurant rows could ever be created after that change). Confirmed zero legacy rows existed before deleting `crypto.ts` and the undelete route. `restaurants.deleted_at` column left in schema, unused, harmless.
- **Kitchen rename** (`PUT /api/restaurants/[id]/rename`): cascades `orders.restaurant_name` in the same transaction (orders are denormalized by name string, not a foreign key — renaming without cascading orphans them, same failure class the old undelete-didn't-restore-orders bug was). A currently-logged-in session for that kitchen breaks (cookie carries pre-rename name, compared against the live row) — surfaced via a `note` field in the response, not a bug to fix.

## 12. Per-status timing, pickup acknowledgment, rolling backup
- **Schema**: `orders.received_at` (NOT NULL DEFAULT NOW()), `preparing_at`/`complete_at`/`acknowledged_at` (nullable). `restaurants.complete_cap_hours` (REAL, default 12). Each `*_at` column is set exactly once via `COALESCE(column, NOW())` on the matching status transition — an admin's backward override changes `status` but never erases an already-recorded timestamp.
- **Display**: Received/Preparing count up with NO ceiling. Complete counts up until either the customer clicks "Order Picked Up" (`acknowledged_at`) or the kitchen's own `complete_cap_hours` fallback (self-service, `GET`/`PUT /api/restaurants/by-name/[name]/settings`, keyed by name since Dashboard only carries the name string). Live-ticking client-side (`StatusDurationCell`/`StatusDurationCompleteCell`, 1s interval) while genuinely open; a deleted order's open segment freezes at `deleted_at` as the effective "now."
- **`POST /api/orders/[id]/acknowledge`**: anonymous (same trust level as the public search — knowing restaurant+order name already grants lookup), rate-limited 120/min, first-click-wins, 404s if not yet Complete or already deleted.
- **Rolling DB backup** (`app/scripts/db-backup.js`): `pg_dump` via `docker exec` every 3h (first snapshot 30s after server start), keeps 3 most recent in `backups/` (gitignored). Small safety net (~9h of history), not a real backup system — added directly after a real data-loss incident (an admin/db "Seed Database" click during testing wiped the whole DB, see CLAUDE.md's critical-info header). Never throws/crashes the server on failure.

## 13. Mobile-migration (Expo/Android) & LAN access — groundwork only
See `MOBILE_MIGRATION_PLAN.md` for the authoritative next-steps list. Done and verified from the PC itself, **not yet re-confirmed from an actual phone**:
- `server.js` binds `0.0.0.0` (was hardcoded `"localhost"`, and the `hostname` arg to `server.listen()` was previously missing entirely).
- LAN IP for the startup log determined via a UDP-connect trick (`dgram.createSocket('udp4').connect(80,'8.8.8.8')`, no packets sent) — **do not** use `os.networkInterfaces()`/adapter-name matching, this machine's VirtualBox host-only adapter is indistinguishable by name from a real one.
- `next.config.ts`: `allowedDevOrigins: ["192.168.12.140", "192.168.12.141"]` — the actual fix for "blank page on LAN IP" (Next's dev server only trusts `localhost` by default; a LAN-IP origin that isn't listed here has its client/HMR requests blocked, so the page renders its SSR shell — the "Loading…" session-check state — and **never hydrates past it**, i.e. stuck on "Loading…" forever). **Requires a literal IP/hostname string, NOT CIDR** (silently accepted, no effect). If the LAN IP changes, this goes stale and the hang recurs — 2026-07-09 the auditing box's IP was `.141` but only `.140` was listed, so `/restaurant/*` hung on the LAN until `.141` was added (both machines are now listed; verified live from `.141`: portal/login/dashboard hydrate, order create + customer lookup + `/ws` "Live" all work). **Known dev-only limitation**: even with the origin allowed, Next's own HMR socket (`/_next/webpack-hmr`) still fails over the LAN (`ERR_INVALID_HTTP_RESPONSE`) because the custom `server.js` upgrade handler owns `/ws` and doesn't proxy Next's HMR upgrade to a non-localhost host — so hot-reload doesn't work when viewing via the LAN IP (manual refresh needed), but the app itself is fully functional. No HMR exists in a production build, so this is dev-only.
- WS Origin check widened for LAN clients (§8).
- Self-hosting research only (Cloudflare Tunnel + Caddy, sidesteps confirmed CGNAT) — no code/infra work done.

## 14. Self-aware layout layer + error boundaries (2026-07-09)
- **`src/lib/ui-awareness.ts`** — shared "self-aware layout" toolkit. Pure helpers: `boxesIntersect`, `horizontalGap`, `isOverflowingX`, `clamp`, `toBox`. Dev-only `reportUiIssue(kind, detail)` (console.warn, silent in prod). Hooks: `useAutoFitText(text?)` → `{ ref, overflowing }` (sets a `title` tooltip when text is clipped); `useSideBySideFit(gap?)` → `{ containerRef, aRef, bRef, fits }` (decides row-vs-stack from INTRINSIC width `a.scrollWidth + b.offsetWidth + gap` vs `container.clientWidth` — measuring intrinsic, not live, widths is what stops stack↔unstack oscillation); `useUiSelfCheck(enabled=dev)` (dev-only scan, gated on real `documentElement.scrollWidth` overflow, skips `[aria-hidden]` subtrees). All SSR-safe, ResizeObserver-feature-detected, try/catch-wrapped. Same measure-your-container pattern as `ChefSprite`/`useReservedTopRight`.
- **Wiring**: `Dashboard.tsx` — Home order rows use `useSideBySideFit` (a long order name stacks by content even on a wide screen; short stays inline), the sidebar kitchen name uses `useAutoFitText`, and `KitchenDashboardContent` calls `useUiSelfCheck()`. `HomeOrderRow` is now its own component (hooks can't run inside a `.map`).
- **Error boundaries**: `src/app/error.tsx` (route-level, Next App Router convention — catches render errors in any route segment, "Try again"/"Go home"), `src/app/global-error.tsx` (root-layout failure, renders its own `<html>/<body>`, inline-styled), `src/components/ui/ErrorBoundary.tsx` (reusable class boundary; wraps the dashboard tab content via `label="dashboard:<tab>"`). Boundaries catch render/lifecycle only — event-handler errors still use the API layer's try/catch. `localStorage` access in the naming-style pref is try/catch-wrapped.

## Update discipline for this file
Fold new facts into the relevant existing section above rather than appending a new numbered entry — this file was condensed once already because unbounded chronological sections become unreadable and mostly redundant with `CLAUDE.md`. Keep this file scoped to "what's true about the repo right now" (schema, routes, mechanisms) — narrative/judgment-calls/lessons belong in `CLAUDE.md` instead.
