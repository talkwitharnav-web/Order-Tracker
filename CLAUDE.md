# CLAUDE.md

## CRITICAL — READ FIRST

- **NEVER `taskkill /IM chrome.exe` or any blanket/by-name Chrome kill.** Filter to specific headless-test PIDs first (`--user-data-dir`/`--headless` in the command line via `Get-CimInstance Win32_Process`). This has killed the user's real browser before.
- **`/admin/db`'s "Seed Database" button is destructive** (wipes existing data, then reseeds) — not additive. Never click it during testing/verification without confirming with the user first. (Caused a real data-loss incident once — see "Rolling DB backup" note below.)
- **`raw_password` plaintext storage in `restaurants`** is intentional, user-approved technical debt. Don't flag or "fix" it unless the user raises it themselves.
- **The status vocabulary mismatch is real and still unresolved at the type/API level**: `Received/Preparing/Complete` (Kitchen/API) vs `Received/Making/Finished` (old Customer type) are different string sets for the same concept. Display layer (`order-status.ts`'s `normalizeStatus`/`getStatusVisual`) unifies them — **any new code comparing `order.status` via raw `===` against a literal string will silently break**; always go through `normalizeStatus`.
- **Don't `git checkout -- <file>`** to undo "the last edit" if there have been multiple uncommitted changes to that file this session — it reverts to the last *commit*, wiping everything since, not just the most recent change.
- Ask before restarting/stopping the project's own `node.exe` dev server if a user session might be live.
- This machine: Windows, PowerShell/Git Bash hybrid. Prefer forward slashes for any path passed to Node/scripts even though the OS accepts either backslash — Bash-tool quoting of Windows backslash paths is unreliable.
- Docker Desktop: fine to auto-start it yourself if it's simply not running (user has explicitly OK'd this). Don't force-restart an already-running instance or assume a paused one was accidental.

---

**Purpose of this file**: narrative/judgment-call log for whichever Claude picks up this project next. `SYSTEM_MEMORY.md` is the technical "what is true about this repo" reference (architecture, routes, schema). This file is "what happened and why" — the decisions a future Claude might otherwise redo or second-guess. Read `SYSTEM_MEMORY.md` first, then this file, then `git log --oneline -20` to check nothing's drifted.

This file was condensed 2026-07-08 — many now-superseded iteration details (theme v1, session mechanism v1, etc.) were cut in favor of only the *current* state and the *lessons*. Full blow-by-blow history is in git log / `git blame` if ever needed; don't assume it's lost, it's just not narrated here anymore.

---

## Who the user is and how they like to work

- Non-expert developer — assume no deep Next.js/Docker/Postgres background in explanations. Don't assume they can parse a stack trace unassisted.
- Project originated from Gemini Pro output the user called "duct tape"/"AI slop." When something looks inconsistent, it's likely inherited cruft from that origin — check `git blame` before assuming recent work caused a bug.
- Prefers `AskUserQuestion` for real architectural forks, but wants execution without further check-ins once direction is set.
- Wants visual/UX work actually verified live, not just claimed — see the CDP recipe below.
- Gets frustrated (understandably) when a reported bug can't be reproduced — several session-related bugs took multiple rounds to actually pin down (see §"Hard-to-reproduce bugs" below). When a repro fails, say so plainly, don't paper over it.
- Reacts fast and honestly to mistakes going wrong — e.g. hated a mascot placement immediately, and a real data-loss incident (an admin/db "Seed Database" click during testing that wiped the DB, see below) was disclosed immediately rather than downplayed. Match that directness back.

---

## How I verify UI changes (reusable recipe)

No test suite exists (deliberate — see "no new dependencies" below). Verification = `tsc --noEmit` + `eslint`, plus driving the real app via headless Chrome + Chrome DevTools Protocol (the `ws` package is already a dependency; Chrome is at `C:\Program Files\Google\Chrome\Application\chrome.exe`).

1. `chrome.exe --headless=new --disable-gpu --remote-debugging-port=<port> --user-data-dir=<scratch dir> about:blank`
2. Open a tab via `PUT http://localhost:<port>/json/new?<url>` — **must be PUT, not GET**.
3. Connect a `ws` client to the tab's `webSocketDebuggerUrl`, send CDP commands (`Page.navigate`, `Runtime.evaluate`, `Page.captureScreenshot`, `Emulation.setDeviceMetricsOverride`) as JSON-RPC.
4. **Setting an `<input>`'s `.value` via `Runtime.evaluate` does NOT update React's controlled state.** Use the native setter + dispatch a real event:
   ```js
   const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
   nativeSetter.call(el, 'value'); el.dispatchEvent(new Event('input', { bubbles: true }));
   ```
5. Screenshots: `Buffer.from(data, 'base64')`. Use forward slashes in output paths even on Windows.
6. Clean up: stop the headless Chrome test process by specific PID, delete any test restaurants/orders created via the admin API.
7. **Known limitation**: this setup's screenshots are unreliable for catching genuinely fast (~300-500ms) CSS animations/transitions mid-flight — normal-timed screenshot loops often show only the settled end state even when the animation is provably running correctly (confirmed via `getComputedStyle()` polling or CDP's `Animation.setPlaybackRate` slow-motion capture). If a screenshot shows "no visible change" for a fast animation, don't conclude it's broken — verify numerically or slow it down first.
8. **Synthetic DOM events can silently no-op**: a scripted `.click()` doesn't fire `mousedown` (breaks click-outside-to-close listeries), and `dispatchEvent(new MouseEvent(...))` doesn't reliably trigger React's `onMouseEnter`. Use CDP's `Input.dispatchMouseEvent` for anything hover/mousedown-dependent.
9. **Never trust raw `curl` output as proof of what a client-rendered page shows** — every page here is `"use client"`, so curl's response never contains real rendered content, and Next's dev bundle can embed misleading strings (e.g. the shared not-found boundary's source) into unrelated routes' payloads. Only a real JS-executing browser confirms rendering.

---

## Hard-to-reproduce bugs — a recurring pattern, read before giving up

Several real bugs in this project resisted reproduction for a session or more, each time because the repro attempt didn't match the *actual* failure conditions:
- **"Remember Me forgets me" (session-split bug)**: looked unreproducible for two sessions. Real cause: `GET /api/session` checked the admin cookie first and returned immediately if valid — a caller with BOTH an admin session and a valid remembered restaurant session never saw the restaurant session. Every failed repro attempt lacked an admin cookie in the test browser at the same time. **Lesson: match ALL of the user's real browser state (cookies from other roles too), not just the click sequence.**
- **"Back button forces re-login"**: `restaurant/login`/`signup` never checked for an existing session (by original design). Scripted `router.push`/click-based repros never actually exercised raw `history.back()` landing on the page as a fresh load — that's a genuinely different code path from an in-app navigation. **Lesson: when a report specifically mentions the back button, test real browser history navigation (CDP `Page.navigateToHistoryEntry`), not just equivalent-looking pushes.**
- **"Still signed in after logout" (2026-07-08, unresolved)**: user reports logging out from `/restaurant/restauranthome`, then revisiting shows "still signed in?" — logging out a *second* time then actually clears it. Ran four separate repro attempts (dashboard's real Logout button, Welcome-Back's own Logout button, in-app router navigation, real back-button history navigation) — **could not reproduce under any of them**, every attempt cleared the session correctly on the first logout. Left open. If reported again, ask specifically: was more than one tab/device open, what did the URL bar show. Don't mark this fixed without an actual reproduction.

The general lesson: if a repro genuinely fails, say so and ask for more precise conditions (exact navigation method, other open tabs/sessions) rather than continuing to guess blindly.

- **ChefSprite's speech bubble "humongous on mobile" (2026-07-08)**: user reported the bubble rendering wildly oversized on their actual phone. Two fix attempts in this session (a CSS `max-width` counter-scale correction, then a `ResizeObserver`-based "hide if container too narrow" approach) both tested as correct via headless-Chrome CDP mobile-viewport emulation (375px/200px/130px, screenshots, computed-style checks) — **never reproduced the bug in this session's own testing**, and the user was on a real phone (not devtools responsive mode) they couldn't screenshot from. Landed on the user's own simpler fallback instead of continuing to chase the repro: **ChefSprite is now unconditionally hidden below `sm:`** at every call site that doesn't already do its own responsive size-swap (`Dashboard.tsx`'s two empty-order-state cards, the gateway `/` page), with plain-text fallback messages so mobile doesn't lose the empty-state copy. `KitchenPortalLanding`/`SessionWelcomeBack` keep their own pre-existing `sm:hidden`/`hidden sm:block` two-instance swap (a different, working pattern — don't apply the new unconditional hide there too, it would double up). **Lesson: after 2 rounds of the same bug reappearing despite passing synthetic mobile-emulation tests, stop trying to fix the underlying rendering and take the simpler "don't render it there" path the user asks for** — don't keep re-deriving CSS math against a bug that isn't reproducing for you.

---

## Architecture decisions that must not be casually "simplified" back

- **`node server.js`, never `next dev`/`next start`** — custom server needed to attach a raw WebSocket upgrade handler (Next's App Router can't host one). Reverting to plain `next dev` silently breaks WebSockets.
- **WS client registry lives in `globalThis`** (`ws-hub.ts`), shared between `server.js` and API routes since they're one process. Does NOT survive horizontal scaling — don't add Redis for this unless the user actually asks for multi-instance deployment.
- **No new dependencies for UI/animation** (no Radix/Headless UI, no Puppeteer/Playwright, no JWT library) — deliberate, so the user can read/maintain the code themselves. Custom CSS keyframes and the CDP recipe above instead.
- **Sessions are signed httpOnly cookies via `crypto.createHmac`**, no DB-backed session table — no per-session remote revocation is possible by design (only client-side cookie clearing). Revisit only if the user asks for forced remote logout.
- **Cookie persistence is controlled by the cookie's `maxAge` at set-time, not the token's internal `exp`.** The token itself is always valid 30 days as a safety bound. Don't tie cookie lifetime to token `exp` — that breaks the session-only (non-remembered) case.
- **Session cookies are split**: `admin_session` / `restaurant_session` (`session.ts`), so both roles coexist without clobbering each other. `/api/logout` clears only the role passed in `{ type }` — never make it clear both unconditionally, or logging out one role kills an unrelated session for the other role in another tab.
- **Kitchen delete = soft delete (`deleted_at`), Admin delete = real, permanent `DELETE`.** This is intentional and asymmetric (confirmed via `AskUserQuestion`) — admin/db's "Deleted" view only ever shows kitchen-soft-deleted rows, never an admin's own deletes, by design.
- **`.ps1` (Windows) and `.sh` (Mac/Linux) scripts for `startup`/`export`/`unpack` are genuinely independent implementations, NOT generated from one source** — explicit user choice, they'll drift if only one is edited. Check whether a change to one needs mirroring in the other, but don't assume it's automatically your job to keep them synced.
- **Router/public-exposure readiness is comment-only scaffolding today** (`server.js`, `api/admin/login/route.ts`, `rate-limit.ts`) — no real implementation exists yet for going public. Don't assume any of it is live.

---

## Recurring bug classes worth checking for (each has bitten this project more than once)

- **CSS specificity collisions when two instances of a component are mounted for responsive breakpoint-swapping** (`ChefSprite` at two sizes): (1) a component's own internal CSS class can tie in specificity with the Tailwind `hidden`/`block` utility meant to toggle between instances — put the toggle on an external wrapper `<div>`, never on the component's own `className` prop if it has competing display rules. (2) any hardcoded SVG/DOM `id` inside the component becomes a real duplicate-ID bug the moment two instances share a page — use `useId()`.
- **`animation-direction: reverse` does NOT mirror a keyframe's sign.** For a front-to-back-symmetric keyframe it plays identically forward and reversed (no mirroring, both elements move in lockstep). For an asymmetric-timed keyframe it staggers elements into alternating solo animations. Any two-element mirrored animation needs two explicit keyframes with opposite signs, never a shared keyframe + `reverse`.
- **SVG `rotate()` direction is easy to get backwards and re-derive wrong more than once** — always confirm empirically via `getBoundingClientRect()`/`getComputedStyle().transform` polling through a real animation cycle, never by reasoning about clockwise/counter-clockwise in the abstract (this has cost multiple debugging rounds in this project — see "ChefSprite" in the "Current, load-bearing feature/architecture notes" section below for the actual sign convention if arm animation is ever touched again).
- **Fixed top-right UI elements collide as the toolbar grows.** `SettingsToggles`, `Toast`'s stack, `PageHeader`'s actions, and dashboard mobile bars have all independently collided with each other at various points as the settings toolbar gained icons. The durable fix is `useReservedTopRight.ts` (measures the toolbar's real bounding box via `ResizeObserver`, publishes `--reserved-top-right-w/-h` CSS vars) + `.clear-top-right` utility class — use this for any new top-right element, don't hand-tune a margin/padding number.
- **`min-h-screen`/`100vh` overflows on real mobile browsers** (measured against the largest-possible viewport, not what's visible with the address bar showing) — use `min-h-dvh`. But fixing the viewport unit doesn't guarantee no overflow: re-measure after, since content can just be taller than a short viewport regardless of the unit used (a content/spacing problem, not a units problem).
- **A prop meant to gate a feature needs checking on EVERY render path that feature touches** (inline display AND any tooltip/popover), not just the most visible one — bit the project twice (DB-size health-pin gating, `.clear-top-right` header-vs-actions-div).
- **`useState(lazyInitializerThatReadsDocument)` causes hydration mismatches** whenever the persisted value differs from the hardcoded SSR default. Fix: start state as `null`, sync in a `useEffect`, render a same-sized neutral placeholder until then (see `ThemeToggle.tsx`/`UiSizeToggle.tsx`).
- **`ILIKE` needs `escapeLikePattern()` on every user-supplied value** — a raw `%`/`_` acts as a wildcard regardless of parameterization. Re-derive this every time a new `ILIKE` lookup is added; it's an easy one-line inconsistency to introduce even when three other patterns in the same query use it correctly.

---

## Current, load-bearing feature/architecture notes

- **Theme**: "warm bistro," light (cream/parchment/terracotta) + dark (espresso/terracotta), toggle in `ThemeToggle.tsx`, `data-theme` on `<html>`, no-flash inline script in `layout.tsx`. **Theme transition (2026-07-08, revised same day)**: a `document.startViewTransition()`-based directional/circular wipe (9 random variants) was tried first, then explicitly rejected by the user as "weird" in favor of a calmer soft cross-fade — background layer fades first, then cards/nav, then everything else (staggered `transition-delay`, see globals.css's `[data-theme-transitioning]` rules). `ThemeToggle.tsx` just toggles that attribute on `<html>` around the swap; no View Transitions API involved anymore. Collapses to instant under Reduce Motion via the same attribute-scoped rules. Don't reintroduce the wipe/circle-reveal approach without checking with the user first — it was a real, tried-and-reverted design decision, not an oversight.
- **UI size (S/M/B)**: `transition: font-size 0.35s ease` on `<html>` in `globals.css` — smooth zoom since everything is rem-based. Don't try to "improve" this to `transform: scale()` without checking git history for the reverted attempt first — it was tried, hit real problems (blurred text, fixed-element misalignment via new containing-block rules for `position: fixed` descendants), and reverted.
- **ChefSprite**: 25 idle animations remain (arm/hand-only ones were removed entirely 2026-07-08 after a multi-round debugging chase — see "Recurring bug classes" above for the SVG-rotation-direction convention before ever re-adding one). Pleated-toque hat SVG is the accepted baseline design — don't regress to earlier chibi/scalloped attempts. `size` prop drives real SVG width/height; two-instance responsive swapping needs the wrapper/`useId()` care above. **Mobile visibility (2026-07-08)**: the speech bubble rendered oversized on the user's real phone in a way that never reproduced under headless-Chrome mobile emulation (see "Hard-to-reproduce bugs" above) — rather than keep chasing it, `Dashboard.tsx`'s two empty-order-state cards and the gateway `/` page now wrap ChefSprite in `<div className="hidden md:block">` (external wrapper, not ChefSprite's own `className`, due to the `.chef-sprite-wrap` `display:flex` specificity collision documented right below) with a plain-text `md:hidden` fallback message alongside. `KitchenPortalLanding.tsx`/`SessionWelcomeBack.tsx` are unaffected — they already always show a (smaller) sprite on mobile via their own pre-existing `sm:hidden`/`hidden sm:block` two-instance swap, which the user asked to keep as "the kitchen login page" exception.
- **Order card animations**: add = slide in from right, delete = slide out to right (matches notification toast direction), both `translateX`-based in `globals.css`. Deletion is deferred via a 300ms `setTimeout` (not `animationend` — Reduce Motion disables the animation outright via `!important`, which would mean the listener never fires) in both `Dashboard.tsx` (`exitingIds` state) and `admin/db/page.tsx` (`exitingOrderIds` state).
- **Accessibility toolbar**: `SettingsToggles` — S/M/B size, Accessibility dropdown (High Contrast, Reduce Motion, Enhanced Focus, Colorblind palette picker: Off/Deuteranopia/Protanopia/Tritanopia, each independently palette-tuned and simulation-verified), theme toggle. All independent axes, never bundle into one "accessibility mode" switch (researched and explicitly rejected).
- **Soft-delete**: orders only (kitchen-initiated `DELETE` sets `deleted_at`; admin `DELETE` is real). Restaurant soft-delete/encryption system was removed entirely 2026-07-07 (dead code after admin-delete became real — confirmed zero legacy rows existed first).
- **`/restaurant` routes**: `/home` (Log In/Register choice, session-agnostic by design), `/login`, `/signup` (both check session on mount and redirect if one exists — this was a real, twice-investigated bug, see above), `/restauranthome` (the actual dashboard + "still signed in?" Welcome-Back screen — the only place that owns session-restore UI). Fresh login/signup navigates with `?fresh=1` to skip the redundant Welcome-Back confirm.
- **Rate limiting**: per-IP on all anonymous endpoints (search/suggest/acknowledge at 120/min, login/register tighter), per-restaurant on order creation (30/min) — admin is NOT exempt from the creation limiter.
- **Security posture**: all 11 + 6 + 16 findings across three audit rounds are fixed and live-verified — see `SECURITY_ATTACK_LOG.md` and `SYSTEM_MEMORY.md` §9 for specifics if touching auth/validation/rate-limiting code. Don't re-litigate settled findings without a new reason.
- **Rolling DB backup**: `app/scripts/db-backup.js`, `pg_dump` every 3h via `docker exec`, keeps 3 most recent in `backups/` (gitignored). Small safety net, not a real backup system — added directly in response to a real accidental data-loss incident (an admin/db "Seed Database" click during live testing wiped the whole DB, including test accounts an external security-audit instance was actively using).
- **Cross-platform tooling**: `startup`/`export`/`unpack`, each with independent `.ps1`+`.cmd` (Windows) and `.sh` (Mac/Linux) implementations, thin wrappers in both `Restaurant/` and `Restaurant/app/` calling `scripts/`. See "genuinely independent" note above.
- **Mobile-migration (Expo/Android) and self-hosting**: research/groundwork only, not built. See `MOBILE_MIGRATION_PLAN.md` for the authoritative next-steps list — LAN access (server binds `0.0.0.0`, `allowedDevOrigins` in `next.config.ts` hardcoded to the current LAN IP, WS origin check widened for private-LAN no-Origin callers) is done and verified from the PC itself, **NOT yet re-confirmed from an actual phone** since the last fix.

---

## 2026-07-08: File-sync incident (USB copy was ahead of this repo)

`npm run start:all` crashed with a corrupted `.next/dev/cache` (Turbopack panic) right after a multi-device file copy (laptop → USB → this machine). Fixed by deleting `.next` (pure build cache, always safe). But the user then reported the sprite/scroll/security work "was missing" — turned out `E:\Restaurant files` (the USB copy) had file mtimes newer than this repo's last git commit: a prior laptop session's work had never been committed or pushed, only existed as loose files on the USB drive. Confirmed via `find -newer <repo>/.git/HEAD`, then copied the USB copy over this repo (preserving `.git`/`node_modules`/`.env.local`/`backups/`) after confirming via `git diff --stat` that nothing session-local was at risk.

**Lesson**: when a user says a whole feature "is missing" after a multi-device copy, check file mtimes against git log on both copies before assuming a crash/corruption is the whole story — a corrupted build cache and an entire uncommitted work session can both be true at once.

---

## Update discipline for this file

Append a new dated entry only for genuinely new architectural decisions, non-obvious lessons, or unresolved issues a future session needs. Prefer folding a new fact into the relevant existing section above over starting a new narrative entry — this file was condensed once already because unbounded chronological entries become unreadable; don't let it regrow that way. Skip trivial/cosmetic changes entirely. If something here turns out wrong or superseded, correct it in place.
