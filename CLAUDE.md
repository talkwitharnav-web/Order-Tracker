# CLAUDE.md

**Purpose of this file**: session continuity and judgment-call log for whichever Claude picks up this project next (possibly a fresh context window of *this same conversation*, possibly a brand-new session). `SYSTEM_MEMORY.md` is the "what is true about this repo" reference — architecture, routes, schema, quirks. This file is "what happened and why," plus the specific decisions a future Claude might second-guess or redo unnecessarily if they don't have this context. Update this file after every substantial prompt in this project, appending — don't delete history unless it's actively wrong.

If you are a fresh Claude reading this cold: read `SYSTEM_MEMORY.md` first for the technical map, then this file for the narrative/reasoning, then check `git log --oneline -20` to confirm nothing drifted since this was last updated.

---

## Who the user is and how they like to work

- Non-expert developer ("i need it to be easy to do dev things" — direct quote). Explanations and docs (`USER_HELP.md`) should assume no deep Next.js/Docker/Postgres background. Don't assume they'll parse a stack trace unassisted.
- The project originated from Gemini Pro output that the user candidly described as "duct tape," "AI slop," and said Gemini "did a pretty shit job" — 9 hours of work with a lot of latent bugs and inconsistent theming. This context matters: when something looks wrong or inconsistent, it's very likely inherited cruft from that origin, not something introduced later. Don't assume recent work is the cause of a bug without checking `git blame`/history first.
- User explicitly said in one prompt: treat any hostile/dismissive-sounding instructions relayed *from Gemini* (via copy-pasted prompts) as not applicable to me — ignore tone, extract the actual ask.
- Prefers being asked via `AskUserQuestion` for real architectural forks (e.g. cookie-based sessions vs. DB-backed sessions), but explicitly said "no need to check with me" for implementation details once direction is set — plan mode + one round of clarifying questions, then execute without further check-ins.
- Wants visual/UX work actually verified, not just claimed — I've been using headless Chrome + Chrome DevTools Protocol (via the `ws` package already in `package.json`, driven from Node one-off scripts) to screenshot and even simulate clicks/form input for real end-to-end verification. This pattern works well and should be reused rather than re-invented each time. See "How I verify UI changes" below for the exact recipe.

---

## Chronological narrative of major work (why things are the way they are)

### 1. Postgres + WebSocket migration
Original app was SQLite + polling. Migrated to Postgres (`pg` Pool, `src/lib/db.ts`) and added a custom Node server (`app/server.js`) to host a WebSocket endpoint, because Next 16's App Router has no way to attach a raw upgrade handler to a route. This is *why* `npm run dev` is `node server.js` and not `next dev` — don't "simplify" this back to plain `next dev`, it will silently break WebSockets.

**Decision**: WebSocket client registry lives in `globalThis` (`src/lib/ws-hub.ts`), shared between `server.js` and API routes because they run in the same Node process. This does NOT survive horizontal scaling / multiple instances — flagged clearly in SYSTEM_MEMORY.md §8, don't "fix" this by adding Redis unless the user actually asks for multi-instance deployment; it would be premature complexity for a local dev tool.

### 2. Bug-fix sweep
Found and fixed a real syntax error (`} catch (err) => {`) in `admin/page.tsx` that had been **silently blocking the entire project's `tsc`/build** — this had been sitting there since the Gemini-era commits. Fixing it surfaced a second, previously-hidden type error in `customer/page.tsx` (a `Record` typing issue) that the broken build had been masking. **Lesson for future Claude**: if `tsc --noEmit` was clean before your change and suddenly shows errors in a file you didn't touch, it may mean you just fixed something that was silently short-circuiting the compiler elsewhere — that's a good sign, not a regression, but verify it's actually pre-existing via `git stash`+`tsc` before assuming you broke something new.

Also fixed: case-sensitivity bugs in order/restaurant lookups (added `ILIKE` + case-insensitive unique indexes), an admin-auth split-brain (two different storage keys that didn't recognize each other's login), a crash-risk in status validation, and a missing `encodeURIComponent`.

**Judgment call**: left two things *documented but not fixed*, on purpose:
- The cross-layer order-status vocabulary mismatch (`Received/Preparing/Complete` vs `Received/Making/Finished` used in different files for the same concept). This is unified at the *display* layer (`src/lib/order-status.ts`) but the underlying API/type contract is untouched. Don't silently "clean this up" by picking one vocabulary and renaming — it's a bigger, more consequential decision (affects API contracts) than a bug fix, and the user hasn't asked for it.
- `raw_password` plaintext storage in the `restaurants` table is **intentional, standing technical debt** the user explicitly directed me not to fix — see SYSTEM_MEMORY.md §3. If you're a future Claude and your instinct is to flag/fix this as a security issue: don't, unless the user raises it themselves. This has already been discussed and decided.

### 3. Full UI/UX redesign
User's ask: "ui/ux is shit... looks like ai slop and has inconsistent theming." I ran a dedicated audit first (spawned an Explore agent) which found **4 incompatible color themes**, **4 different color mappings for the same 3 order statuses**, dead/unused design tokens, copy-pasted Modal/Toast (2-3x each with drifting styles), and almost no mobile support.

**Decision**: one unified dark theme (slate neutrals + single amber accent), not a "distinct look per section." I considered keeping Admin visually distinct (red/black "terminal" look, since it's a different audience) and explicitly rejected it — that's exactly the kind of per-section theme fragmentation that made the app feel like disconnected AI-generated pieces in the first place. Admin gets the same components, just denser layouts (tables, tighter spacing).

**Decision**: built a real `src/components/ui/` component library (Button, Card, Input, Modal, Toast, StatusBadge, StatusStepper, PageHeader, AuthCard) specifically so future edits — mine or the user's — have building blocks instead of re-deriving styles per page, which is *how the drift happened originally*. If you're adding new UI, use these; don't hand-roll another one-off card/button style. That's the single most important thing to preserve from this redesign.

**Decision**: `StatusStepper` replaced a single button whose label silently changed based on hidden state, with an explicit 3-step tappable progress control — this was the direct answer to the user's "make status changes feel clear" ask. Don't revert this to a single button for "simplicity"; the whole point was making state changes legible.

**Decision**: no new dependencies added for the redesign (no Radix/Headless UI, no animation library) — deliberately, since the user needs to be able to read/maintain this code themselves. Custom CSS keyframes in `globals.css` instead. Keep this constraint in mind for future additions too, unless the user asks for something that genuinely requires a library.

Kitchen Dashboard's sidebar (previously a fixed 256px block, unusable on mobile) became a responsive top-bar+hamburger under `md:`, sidebar at `md:`+ — this was flagged as the single biggest responsiveness gap in the original audit.

### 4. Docker Compose for local Postgres
Added `docker-compose.yml` at repo root + `npm run db:up/down/stop/start:all` scripts, runnable from either repo root or `app/` (root `package.json` forwards via `npm --prefix app`). **Note**: mid-session, Docker Desktop was found "manually paused" — I do not ever auto-unpause or restart Docker Desktop myself; I ask the user to do it. This happened once already in this session; if it happens again, ask again, don't assume it's fine to just wait it out or try to control Docker Desktop's process directly.

### 5. Real sessions + admin logout + macOS-style notifications
User's complaints: "Remember Me" didn't actually skip login (just prefilled a form with a **plaintext password read back from localStorage** — worse than doing nothing), no admin logout button existed, and notifications were "bland."

**Decision** (confirmed with user via AskUserQuestion before building): signed httpOnly cookie sessions using Node's built-in `crypto.createHmac`, NOT a JWT library and NOT a database-backed session table. Rationale: no new dependency, no schema migration, "hobby-scale app doesn't need session revocation infrastructure." If the user later asks for the ability to forcibly log out a specific session remotely (not just "clear my own cookie"), that requires revisiting this decision toward a DB-backed table — the current design can't do per-session revocation, only client-side cookie clearing.

**Important subtlety a future Claude might get wrong**: cookie *persistence* (remembered vs. session-only) is controlled by the cookie's own `maxAge` at set-time, NOT by the token's internal `exp` field. The token itself is always valid for 30 days as a safety bound regardless of Remember Me — omitting `maxAge` when setting the cookie is what makes the browser drop it on close. If you ever "simplify" this by tying cookie lifetime to token `exp`, you'll break the session-only (non-remembered) case, since the token would still verify even after the browser was supposed to have forgotten it.

**Decision**: Admin credential checking moved from client-side (`username === "darkglory" && ...` in the browser) to a real server route (`POST /api/admin/login`) — this was *necessary*, not optional, because only the server can set a cookie. This is a net security improvement as a side effect (creds were previously visible in client JS/devtools) but was done for the session feature, not as an explicit security fix — don't conflate it with "someone asked for a security review."

**Decision**: macOS-style notification behavior — collapsed stack's "×" clears the whole group, expanded individual card's "×" clears just that one. This exact asymmetry was explicitly specified by the user (not my invention) — if it ever seems "wrong" or inconsistent to a future Claude, it's intentional, matching real macOS Notification Center behavior. Don't "fix" it to be symmetric.

`useToast()`'s public signature (`showToast(message, type)`) was deliberately kept unchanged during the stacking rewrite so no existing call site needed touching — if you need a new toast variant/behavior, prefer extending the internal `ToastProvider` logic over changing this signature, to avoid a cascading edit across every page that calls it.

---

## How I verify UI changes (reusable recipe)

This project has no test suite. Verification has been: `tsc --noEmit` + `eslint` (catches regressions/type errors) plus **actually driving the running app** via Chrome DevTools Protocol, since there's no Puppeteer/Playwright installed (deliberately not added — see "no new dependencies" above) and headless Chrome + the CDP is already possible with zero new installs (`ws` is already a dependency; Chrome itself is present on this machine at `C:\Program Files\Google\Chrome\Application\chrome.exe`).

Recipe used repeatedly this session:
1. Start Chrome headless with remote debugging: `chrome.exe --headless=new --disable-gpu --remote-debugging-port=9222 --user-data-dir=<scratch dir> about:blank`
2. Open a new tab via `PUT http://localhost:9222/json/new?<url>` (must be PUT, not GET, or Chrome returns a text error instead of JSON — bit me once this session).
3. Connect a `ws` client to the tab's `webSocketDebuggerUrl`, send CDP commands (`Page.navigate`, `Runtime.evaluate`, `Page.captureScreenshot`, `Emulation.setDeviceMetricsOverride` for mobile viewport testing) as JSON-RPC, correlate responses by `id`.
4. **Important gotcha**: setting a `<input>`'s `.value` directly via `Runtime.evaluate` does NOT update React's controlled-component state — React won't see the change and native `required` validation blocks submission with "Please fill out this field." You must use the native value setter + dispatch a real `input` event:
   ```js
   const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
   nativeSetter.call(el, 'value'); el.dispatchEvent(new Event('input', { bubbles: true }));
   ```
5. Screenshots come back base64 in `Page.captureScreenshot`'s response — write with `Buffer.from(data, 'base64')`. **Use forward slashes in the output path even on Windows** — backslash-escaped Windows paths passed through Bash's quoting to Node got mis-resolved once this session (`C:\Users\...` silently became `C:\tmp\...`), forward slashes avoided the whole problem.
6. Always clean up: kill the headless Chrome process (`taskkill //F //IM chrome.exe`), and clean up any test data written to Postgres during verification (I created and deleted several throwaway restaurants/orders this session — always delete them after, don't leave test rows in the dev DB).

This recipe is worth reusing rather than reaching for a testing library, given the "minimal dependencies, easy to maintain" constraint on this project.

---

## Repo cruft cleanup (resolved 2026-07)

A "clean up this repo" request led to removing the following, after verifying each was genuinely unreferenced in `src/` (grep for imports/usages, not just filename search — `.next/` build-cache hits for `orders.db` were old compiled chunks, not live source references, and don't count):
- `app/Untitled-1.ts` — unreferenced stray duplicate of `src/lib/logger.ts`.
- `app/orders.db` — leftover SQLite file, obsolete since the Postgres migration; `db.ts` no longer references it.
- `app/README.md` — unedited `create-next-app` boilerplate, fully superseded by the real root `README.md`/`USER_HELP.md`.
- `app/public/*.svg` (file/globe/next/vercel/window) — default Next.js starter icons, confirmed unused anywhere in `src/`.
- Two stray screenshot PNGs (`app/UsersarnavAppDataLocalTempscreenshotsdashboard-*.png`) that had been accidentally `git add`-ed and committed during my own headless-Chrome verification work in the UI redesign session — caused by the Windows-path escaping bug described below (a malformed path collapsed into a literal filename instead of writing to the intended temp directory).

**Process note for future cleanup requests**: the sandbox's auto-mode classifier blocked my first attempt at this (`git rm` on files not explicitly named by the user) as "irreversible local destruction" without more explicit authorization — correctly, since "clean up this repo" alone doesn't name specific files. I used `AskUserQuestion` to get explicit scope, the user clarified "verify actual usage per file, delete confirmed-unused," and I did that (grep-verified each candidate) before deleting. If you hit a similar block on a vague cleanup request, don't try to route around it — ask for either a specific file list or explicit "verify then delete" authorization, same as this exchange.

If you ever see similarly mangled filenames (a literal Windows path smashed into one filename) appear in the repo again, it's the same path-escaping root cause — always double check screenshot output paths use forward slashes and land in the actual scratchpad, not somewhere inside the repo.

**Remaining known issues, not cruft, deliberately left alone**: a handful of `@typescript-eslint/no-explicit-any` in `src/lib/logger.ts`, and several `react-hooks/set-state-in-effect` warnings from the "check session/auth on mount" pattern used throughout login-gated pages. These predate my work or are structurally inherent to the "check auth cookie via fetch on mount" pattern — not regressions, not asked to be fixed.

---

## 6. Concurrency/scaling verification (2026-07)

User asked to confirm Postgres and WebSockets "actually work" and whether multiple simultaneous DB read/writes are possible if scaled. Rather than answer from memory/architecture docs alone, I ran live tests:
- Fired 10 truly concurrent `INSERT`s through the app's `pg.Pool` (default `max: 10`) — all 10 landed successfully in ~40ms, confirming the pool actually parallelizes rather than serializing requests.
- Connected two separate raw `ws` clients to `/ws`, triggered a real order creation through the live API, confirmed **both** clients received the `order_updated` broadcast — confirms the pub/sub fan-out genuinely reaches multiple simultaneous viewers (e.g. a kitchen dashboard + a customer tracker open at once), not just a single hardcoded client.
- Answer given: Postgres concurrency and WS fan-out both already work correctly *within a single running instance* — this required no code changes, just verification. The one real caveat (already documented in SYSTEM_MEMORY.md §8 and above): the WS client registry is in-process memory (`globalThis`), so it would NOT fan out across multiple *separate server instances/processes* (e.g. horizontal scaling behind a load balancer) — that would need Redis or Postgres `LISTEN/NOTIFY` pub/sub, not built and not needed unless the user actually asks to run multiple instances.
- **Lesson for future Claude**: when asked "does X actually work," prefer a live verification (spawn a script, hit the running server, check DB rows) over restating what the architecture docs say should be true. Docs can be stale or aspirational; a live test in this session is ground truth. The `pg`/`ws` packages are already installed, Postgres is already running via Docker — there's essentially no cost to just testing directly.

---

## IMPORTANT: uncommitted state as of this note

As of this entry, the working tree has **staged-but-not-committed** changes from the repo-cleanup task: 9 file deletions (`app/README.md`, `app/Untitled-1.ts`, `app/orders.db`, `app/public/*.svg` ×5, 2 stray screenshot PNGs) plus this `CLAUDE.md` file itself sitting untracked. Run `git status` at the start of the next session before doing anything else — if these are still uncommitted, that's expected (I never commit unless explicitly asked to); don't assume something went wrong or try to re-do the cleanup. Just ask the user if they want it committed, or leave it for them.

---

## 7. Chef mascot sprite + "warm bistro" theme overhaul, session bug fixes, registration gate (2026-07)

### Chef mascot sprite
Added `src/components/ui/ChefSprite.tsx`: a small SVG chef mascot shown on the root gateway page (`/`) when an admin session is already active, replacing what used to be a forced redirect to `/admin/db` on every visit (that redirect was the original bug reported this session — it hijacked back-navigation and any visit to `/`, making it look like the whole app redirected to admin). Now `/` always renders; if already logged in as admin, it shows the sprite + "Log Out"/"Access DB" instead of the login form.

The sprite has 20 CSS-keyframe idle animations (bounce, spin-hat, wave, wiggle, stir, etc., see `globals.css`) picked randomly per mount, plus a random capitalized speech-bubble line. **Design iteration history worth knowing**: the hat went through 3 versions — a scalloped/messy attempt, an overly-chibi big-head version the user disliked, and the current one which reverts to the original body proportions the user liked, with a redrawn pleated-cylinder toque (linear-gradient shading + vertical pleat lines + a ridged cuff band) modeled on a reference photo the user provided. If asked to touch the sprite again, look at the current SVG paths as the accepted baseline — don't regress toward the chibi version.

**Purity fix**: initial implementation used `useMemo(() => Math.random(...), [])` and a mount `useEffect` calling `setState` for a fade-in — both are React-purity-rule violations (`react-hooks/purity`, `react-hooks/set-state-in-effect` under the newer eslint-plugin-react-hooks rules this repo uses). Fixed by switching to `useState(() => Math.random(...))` lazy initializers (the correct idiom for "compute an impure value once at mount") and moving the fade-in entrance to a pure CSS `@keyframes` animation on mount instead of a JS-toggled class. If you see similar patterns elsewhere (impure `useMemo`, synchronous `setState` in an effect body with no external subscription), prefer this same fix shape rather than suppressing the lint rule.

### "Warm bistro" theme (replaces old slate+amber "cyberpunk/jail" look)
User explicitly rejected the previous dark slate-gray + amber theme. New direction, confirmed via `AskUserQuestion`: **two hand-designed variants** (not one palette with inverted lightness) — light = cream/parchment surfaces, deep charcoal-brown text, terracotta brand accent, olive secondary; dark = warm espresso/charcoal surfaces (not cool slate), warm cream text, brighter terracotta for contrast. Both defined in `globals.css`: light is the default `:root`, dark lives under `[data-theme="dark"]`. Toggle mechanism: `src/components/ui/ThemeToggle.tsx`, persisted via `localStorage("theme")`, applied by setting `data-theme` on `<html>`. An inline script in `layout.tsx`'s `<head>` (`themeInitScript`) applies the persisted theme before hydration to avoid a flash of the wrong theme — **don't remove this script**, it's not decorative.

**Decision**: toggle was added to the kitchen dashboard (`restaurant/Dashboard.tsx`, both mobile top bar and desktop sidebar) and the customer tracker page (`customer/page.tsx`, fixed top-right) per explicit user request — NOT to the admin pages, since the user didn't ask for it there and admin already has a lot of chrome.

**Font**: replaced Geist Sans with a **Fraunces (headings/display) + Nunito Sans (body)** pairing via `next/font/google`, confirmed with the user over a "Fraunces-only" alternative. `Geist_Mono` was kept (still used for the password-hash monospace column in `admin/db/page.tsx`). Applied `font-display` (Fraunces) to `PageHeader`'s `h1` and `AuthCard`'s `h1` — that covers essentially every page title/login-card title app-wide without touching every page individually.

**Bug found and fixed while retheming**: several places had hardcoded Tailwind palette classes (`text-red-300`, `text-red-400`) instead of `var(--color-danger)` — these were invisible-or-wrong-contrast landmines waiting to trigger under the new light theme (light card + light-toned red text). Fixed in `AuthCard.tsx`, `customer/page.tsx`, `admin/page.tsx`, `restaurant/Dashboard.tsx`. **Lesson**: when re-theming, grep for hardcoded `text-{color}-{shade}` / `bg-{color}-{shade}` Tailwind utility classes specifically — they silently bypass the CSS-variable theme system and won't show up as errors, only as bad-contrast bugs after the palette actually changes.

### Gateway layout: sidebar nav replaces four fixed corner buttons
User's complaint was **button positioning chaos**: Kitchen Portal/Customer Tracker/Log Out/Access DB were each `fixed` to a different screen corner on `/`. Replaced with `src/components/ui/GatewaySidebar.tsx` — a persistent left sidebar (desktop) with a wordmark, Kitchen Portal/Customer Tracker nav links, and a bottom-anchored slot for contextual actions (Log Out/Access DB when an admin session is active), plus a collapsed top-bar variant (`GatewayMobileNav`) under `md:`. This pattern was chosen over a top app-bar specifically because the user asked for a sidebar (echoing the kitchen dashboard's existing sidebar pattern) rather than my originally-recommended top-bar — if extending nav further, follow the sidebar precedent, not app-bar.

Admin/db's own `PageHeader` actions (Seed/Purge/Logout) were left as-is — that page's actions were already grouped in one header slot, not scattered; the "chaos" complaint was specifically about the gateway page's four independent fixed-position elements, not admin/db.

### Two session cookie bugs fixed
1. **Admin session "randomly forgotten"**: non-remembered logins set a cookie with no `maxAge` at all (pure session-lifetime cookie), which some browsers can silently drop on ordinary tab/navigation behavior, not just on explicit close. Fixed by always setting a `maxAge` — `SESSION_COOKIE_MAX_AGE_DEFAULT` (1 day) when Remember Me is off, `SESSION_COOKIE_MAX_AGE_REMEMBERED` (30 days) when on. Applies to both admin and restaurant logins.
2. **Restaurant "Remember Me" flakiness**: admin and restaurant/kitchen logins shared one cookie name (`"session"`), so logging into either role clobbered the other's cookie (and its maxAge). Fixed by splitting into `ADMIN_SESSION_COOKIE_NAME` (`admin_session`) and `RESTAURANT_SESSION_COOKIE_NAME` (`restaurant_session`) in `src/lib/session.ts`. `/api/session` now checks both independently; `/api/logout` accepts an optional `{ type: "admin" | "restaurant" }` in the POST body and clears only that role's cookie (falls back to clearing both if omitted) — **this matters**: don't make logout clear both cookies unconditionally, or logging out of one role in one tab would silently kill an unrelated session for the other role in another tab.

### New feature: registration gate when zero restaurants exist
Added `GET /api/restaurants` (new route, returns `{ count }` via `SELECT COUNT(*)`). `src/app/restaurant/page.tsx` now checks this count alongside its existing session check on mount; if zero restaurants exist anywhere, it renders `RegisterPage` inline (via a new optional `onRegistered` callback prop on `register/page.tsx`, since `router.push("/restaurant")` from the register page wouldn't remount/re-check anything when already on `/restaurant`). Once one or more restaurants exist, the normal Kitchen Login screen shows as before. `getRestaurantCount()` defaults to `1` on fetch failure — a deliberate fail-safe so a broken count check never wrongly locks users into the registration screen.

---

## 8. Theme overhaul v2, kitchen portal, security audit + attack (2026-07)

Big session. Highlights (full detail in `SYSTEM_MEMORY.md` §4.2, §6, §10):
- **Warm-bistro theme** (light+dark, terracotta/olive, Fraunces+Nunito Sans) replaced the amber/slate look. Theme toggle fixed top-right on all pages. No-flash script + `suppressHydrationWarning` in `layout.tsx`. `BackgroundArt.tsx` food watermarks mounted globally.
- **ChefSprite** matured: 35 animations, ~30 lines, in-SVG `foreignObject` speech bubble that tracks the mouth, click-to-track-eyes (body animation must keep running during tracking — a prior bug froze it, don't reintroduce). Hat is a pleated toque per a user reference photo — current SVG paths are the accepted baseline, don't regress to the chibi version.
- **Kitchen portal landing** (`/restaurant`) before login; **registration auto-logs-in** (register route sets the session cookie). Order "number" → "name" in all user-facing copy.
- **Session cookies split** into `admin_session`/`restaurant_session` (see §6). **Route auth guards** added in `src/lib/auth.ts`. **Rate limiter** in `src/lib/rate-limit.ts`.

**SECURITY — read this**: an authorized adversarial attack pass found **6 real, confirmed-exploitable vulnerabilities**, logged in `SECURITY_ATTACK_LOG.md` (repo root) and summarized in SYSTEM_MEMORY §10. **None are fixed yet** — the user deferred fixes to a future session and will pick them up then. The #1 issue (F1): `SESSION_SECRET` is unset so the app signs sessions with the hardcoded fallback secret from the source, letting anyone forge an admin token — this defeats every auth guard added this session. Fix order: F1/F2 (set real `SESSION_SECRET`) → F5 (escape ILIKE `%`/`_`) → F3 → F4 → F6. Do NOT assume the auth guards actually protect anything until F1 is fixed. The user explicitly said they don't care about breaking things / no important data in the DB during this phase — functionality-not-breaking is the priority, not data safety.

**User working-style note reinforced this session**: wants me to just execute once direction is set (don't over-confirm steps), is fine with me attacking/breaking the local app, cares about hardware limits (keep under ~50% CPU / 4GB RAM during load tests, monitor `docker stats`), and watches usage closely — be concise, don't burn turns on over-explanation.

---

## Environment specifics worth remembering

- Windows machine, PowerShell/Git Bash hybrid tool access. Bash tool quoting of Windows paths with backslashes is unreliable — prefer forward slashes for any path passed to Node/scripts, even though the OS itself accepts either.
- Docker Desktop must be manually running for `docker compose`/`npm run db:up` to work — it does not auto-start, and has been found paused mid-session before. Always check `docker inspect` status before assuming the DB is reachable; ask the user to start Docker Desktop if it's down, don't try to control it programmatically.
- Postgres container: `restaurant-postgres-1`, credentials `restaurant`/`restaurant`, db name `restaurant`, exposed on `5432`. `.env.local` in `app/` (gitignored) holds `DATABASE_URL` pointing at it.
- Dev server: `node server.js` (via `npm run dev` from either repo root or `app/`), serves on `:3000`, WS on `/ws`.

---

## Update discipline for this file

Append a new dated/titled entry after each substantial prompt — new features, non-trivial bug fixes, or any decision a future session might otherwise redo or second-guess without this context. Skip trivial/cosmetic asks. Prefer over-explaining *why* over documenting *what* (the diff/git history already shows what changed). If a past entry here turns out to be wrong or superseded, correct it in place rather than leaving stale reasoning for the next reader to trip over.
