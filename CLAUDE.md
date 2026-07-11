# CLAUDE.md

Narrative decisions, debugging lessons, and machine-specific guardrails for future coding sessions. Read `SYSTEM_MEMORY.md` first for current architecture/schema/routes; this file explains why settled choices exist.

## Critical — Read First

- **Never blanket-kill Chrome.** Target only test PIDs identified by `--headless`/test `--user-data-dir`. A one-time blanket kill was explicitly authorized on 2026-07-09; that does not create standing permission.
- **Never run Seed or Purge during testing.** Both erase data and require exact typed confirmation in UI/API. The user intentionally purged on 2026-07-09; preserved backups exist but must not be restored unless asked.
- **Do not commit, push, pull, fetch, or otherwise sync from the `.141` machine.** Do not run routine production builds; the user prefers the editable dev server.
- Treat the shared VS Code browser’s cookies/tabs as live user state. Isolate auth tests; never log out the shared session as cleanup.
- `raw_password` plaintext storage is intentional local-dev debt. Do not flag/fix it unless asked.
- Never compare raw `order.status` to literals in display code. The API and legacy customer vocabularies differ; use `normalizeStatus()`/`getStatusVisual()`.
- Never use `git checkout -- <file>` to undo one edit in a dirty file; it can erase unrelated uncommitted work.
- Ask before restarting/stopping the project server when a user session may be active. Docker may be auto-started if stopped, but never force-restart an already-running instance.
- Windows host, PowerShell/Git Bash hybrid. Prefer forward slashes in Node/script paths.
- **When the user says a new admin page must NOT be nested under/reachable from another admin page's own header, that means no cross-link at all in either direction** — not just "give it its own route file." `/admin/audit` was built as its own page but a link to it was still added inside `/admin/db`'s header, which the user explicitly rejected on 2026-07-10 as ignoring their instruction. `/admin/db`, `/admin/staff`, and `/admin/audit` are independent siblings reachable only from the gateway (`/`) sidebar; do not add a button linking one admin page to another without being asked.
- A `db.ts` schema/migration change needs a full `node server.js` restart before it takes effect — `initDb()` is memoized per-process, and Turbopack route HMR does not re-run it. Ask before restarting per the rule above, and don't run manual `docker exec psql` DDL concurrently with a server that's mid-restart-and-migrating; a genuine race between the two produced a confusing transient "column does not exist" error on 2026-07-10 that looked like a broken migration but wasn't.
- **`isAdminRequest()` only means an `admin_session` cookie exists — it does NOT mean this specific request is an admin action.** A browser can validly hold both `admin_session` and `restaurant_session` at once. Branching on raw `isAdmin` (rather than `isAdmin && no pin/employeeId supplied`) silently broke real kitchen-side PIN attribution and, worse, turned a recoverable soft-delete into a permanent hard-delete, any time an admin happened to also be logged in on the same browser — found via two separate user bug reports on 2026-07-10 that looked unrelated ("shows Unattributed" and "my orders vanished with no trace") but shared this one root cause. See `SYSTEM_MEMORY.md`'s Critical Invariants for the exact fix pattern; apply it to any new route that checks `isAdminRequest()`.
- **Every localhost caller shares ONE rate-limit bucket.** `getClientIp()` returns the literal string `"unknown"` when no `X-Forwarded-For` header is present — true for any raw script/curl run on this machine, not just real browsers. During a 2026-07-10 stress test, my own manual diagnostic `curl` calls to `/api/restaurants/register` kept re-triggering the SAME 5/min/IP registration limit the test script itself was paced against, making a perfectly healthy run look "stuck" for several check-ins before this was diagnosed. Lesson: while any script is deliberately exercising a rate-limited endpoint, do NOT also manually curl that same endpoint to "check on it" — use `ps`/log timestamps/a different unaffected endpoint instead.

## The User and Working Style

- Non-expert developer who built this by vibe-coding. Explain in plain English; do the coding and stack-trace interpretation yourself.
- Cares deeply about UI craft, warm bistro identity, accessibility, and the derpy chef. This is not disposable software.
- Thinks visually and describes desired feelings/workflows rather than APIs. Ask only for real product/architecture forks; execute once direction is clear.
- Wants visual/UX claims verified live. If a reported bug cannot be reproduced, say so plainly and ask for the missing real-world condition instead of guessing.
- Be direct about mistakes. The user responds better to honest disclosure than minimization.
- The user has given standing permission (2026-07-10) to use the local-dev admin credentials (`USER_HELP.md`) freely in verification scripts/commands for this project — no need to ask each time, though there's still no reason to print the raw password in conversation output gratuitously.

## UI Verification Recipe

There is no dedicated test suite. Normal validation is `tsc --noEmit`, focused ESLint, and a real JS browser.

1. Use VS Code browser tools when practical. For separate headless Chrome, launch with a unique scratch `--user-data-dir` and remote-debugging port; open tabs through `PUT /json/new?...`.
2. React controlled inputs need the native `HTMLInputElement.prototype.value` setter plus a bubbling `input` event; assigning `.value` alone does not update state.
3. Use real CDP mouse/touch input for hover, mousedown, click-outside, and touch behavior; synthetic `.click()`/`MouseEvent` can silently miss React paths.
4. Do not use curl as proof of client rendering. Pages are client components and dev bundles contain misleading strings; use a JS browser.
5. Fast CSS animations can settle before screenshots. Verify computed values or slow animation playback before declaring failure.
6. Test relevant desktop/mobile widths, Big UI, themes, contrast/CVD, Reduce Motion, keyboard focus, and horizontal overflow.
7. Clean only uniquely prefixed test rows through targeted admin deletion. Never Seed/Purge. Preserve shared cookies.
8. Stop only exact headless-test PIDs and remove their scratch profiles. Never kill Chrome by name without fresh explicit permission.
9. Global CSS/keyframe and dynamic-route changes can remain stale in Turbopack. If behavior contradicts source, stop the exact server, delete only `app/.next`, and restart through `startup`.

## Hard-to-Reproduce Bugs and Lessons

- **Remember Me appeared to forget the kitchen.** Real cause: the old session endpoint returned early for an admin cookie, hiding a simultaneous valid restaurant cookie. Failed reproductions lacked both cookies. Lesson: reproduce the user’s full browser state, including other roles/tabs.
- **Back button forced login.** Login/signup pages did not check an existing session, and scripted navigation did not reproduce raw browser history. Lesson: when a report says Back, test real history navigation.
- **First logout sometimes appears ineffective (unresolved report).** Four dashboard/welcome/history repro attempts cleared on first logout. If reported again, ask about multiple tabs/devices and the exact URL; do not claim a fix without reproduction.
- **Chef speech bubble oversized/off-center on a physical phone.** Several breakpoint/transform fixes passed emulation but failed the real report. The durable fix moved the bubble out of SVG `foreignObject` into normal flow above the SVG and made mascot sizing container-aware. Lesson: after repeated synthetic passes disagree with a real device, simplify the rendering model rather than adding transform math.

## Decisions Not to Re-Litigate Casually

Technical mechanics are in `SYSTEM_MEMORY.md`; these are the settled judgment calls:

- Keep `node server.js`; App Router alone does not host the raw WebSocket endpoint.
- Keep same-process/global WebSocket state unless multi-instance deployment is actually requested.
- No broad UI/headless/JWT dependencies. `qrcode` is the approved narrow offline exception.
- Keep HMAC httpOnly-cookie sessions without a session table until forced remote revocation is requested.
- Cookie persistence is controlled by cookie `maxAge`, not token expiry. Admin/kitchen cookies remain separate and role logout remains scoped.
- Kitchen order delete is recoverable; admin delete is permanent. This asymmetry is deliberate.
- Windows and shell versions of startup/export/unpack are independent implementations. Mirror behavior manually.
- Public exposure remains future work. Comment/scaffolding is not production infrastructure.
- Keep restaurant autocomplete public but constrained; removing it would damage the customer workflow.

## Recurring Bug Patterns

- Responsive twin components: put `hidden/block` on wrappers to avoid specificity ties; use `useId()` for internal SVG/DOM IDs.
- `animation-direction: reverse` does not mirror motion signs. Mirrored parts need explicit opposite keyframes.
- SVG rotation intuition has been wrong repeatedly. Verify real transforms through an animation cycle.
- Fixed top-right controls collide as the toolbar changes. Use `useReservedTopRight` and `.clear-top-right`, never guessed padding. The mobile kitchen menu belongs inside `SettingsToggles`.
- Use `min-h-dvh`, then still measure short viewports; content can exceed even correct viewport units.
- Feature-gating props must cover every render path, including popovers/tooltips.
- Persisted browser preferences must not be read in a hydration-sensitive state initializer. Start neutral/null, sync after mount, and keep the placeholder’s dimensions stable.
- Every user value used with `ILIKE` needs `escapeLikePattern()`, even when parameterized.
- Prefer shared `ui-awareness.ts` measurement hooks to new one-off ResizeObservers; measure intrinsic widths to avoid stack/unstack oscillation.
- **A `useRef` synced via `useEffect(() => { ref.current = state })` is ALWAYS one render behind a rapid-fire sequence of calls into the same hook.** Building `/admin/db`'s windowed-scroll `useWindowedOrders` (2026-07-11), the hook's own cursor-tracking `stateRef` was synced this way, and a fast fling-scroll (confirmed live: 60 scroll events fired with zero delay between them) called `loadMoreBottom` several times before React committed the render that would have caught `stateRef` up — each stale call read the same old cursor and fired a duplicate fetch, blowing the row cap (450 → 900, 334 duplicate ids). Neither `isLoading` STATE nor a `setState` functional updater's `prev` fixes this either — both have the identical one-render-behind problem. The actual fix: when a hook needs to synchronously gate/read its own latest value before its OWN next async call (not just for rendering), write that ref directly, in the same synchronous block, at the exact place the new value is computed — never defer it to an effect or to React's own state-update scheduling. Re-check any future hook that fetches-on-scroll/fetches-on-interval with this pattern in mind.
- **Don't reflexively apply a UI pattern everywhere it superficially matches — check whether the underlying data shape actually needs it first.** Asked to apply admin/db's new infinite-scroll windowing to the kitchen dashboard's Home/Received/Preparing/Complete tabs "as well." Investigated first: those tabs poll one kitchen's own active-work query every 5s (realistically dozens of rows, not admin/db's full cross-restaurant history), and the query had no `LIMIT` at all but wasn't actually unbounded in practice. Building full scroll-fetch/eviction client machinery there would have added real complexity (rAF listeners, ref-guarded race conditions, reconciling a 5s poll against a partial window) to every kitchen tablet — including old/weak hardware — for a problem that doesn't exist yet. Fixed the ACTUAL gap (missing `LIMIT`) with a plain server-side cap instead. Matches the user's own stated philosophy: "server pressure is fine, customer pressure is not."
- **`!x` and `x === null` are NOT the same check when a function's optional parameter has three meaningful states (`string | null | undefined`), and picking the wrong one silently flips a default for every caller that hasn't opted in yet.** Building the Complete-pending-vs-picked-up orange/green color split (2026-07-11), `getStatusVisual(raw, acknowledgedAt?)` was first written as `if (key === "complete" && !acknowledgedAt) return COMPLETE_PENDING_VISUAL` — intended to mean "render orange only when the caller passes a confirmed still-pending order." In reality `!undefined` and `!null` are both `true`, so every call site that DIDN'T pass the second argument at all (the customer tracker, deliberately) also got orange, including an already-genuinely-picked-up order whose card still said "Enjoy Your Meal!" in orange. The user caught this from a screenshot, not from a description — a `bg-[...]` class name in isolation reads as "probably fine" even when the logic backing it is inverted. Fixed by checking `acknowledgedAt === null` specifically (a real DB value asserting "not yet picked up"), leaving `undefined` (not opted in) at the original green default. Lesson: whenever a function's signature grows an optional parameter meant to distinguish "caller opted out" from "caller opted in and the real value is falsy," write out the 3-way truth table before picking a conditional, and grep every existing call site to confirm what each one now actually receives — don't assume a one-line `!x` guard generalizes just because it type-checks.
- **A user's bug report can be two independent, unrelated things pointing at the same screen — verify each one in isolation before proposing a unified root cause.** Same 2026-07-11 session, user reported "if I mark order A3 picked up, then search A2 or a made-up order, it ALSO shows picked up" — read together with the color bug above, this looked like it could be one bug (stale render). It wasn't: (1) the color-default bug explained the visual wrongness on ANY Complete order shown anywhere, independent of which order; (2) the actual "A2 shows Received on the dashboard but Complete+picked-up on the customer page" turned out to be two DIFFERENT restaurants ("asdf" and "ssss") that both happened to have an order literally named "A2" — order names are only unique per-restaurant, confirmed by the DB's own unique index. Neither of these needed a shared explanation; conflating them would have chased a phantom cross-order-corruption bug that didn't exist. When a report bundles multiple observations, reproduce each claim independently against real data (`SELECT` the actual rows) before writing a unified theory — a coincidence in the report's wording is not evidence the underlying causes are related.
- **When a live repro contradicts your source-reading, trust the repro and go find what you misread — don't declare the code "must be fine" and move on.** While chasing the two bugs above, a live headless-browser test (real kitchen login, real customer acknowledge call, watched the dashboard poll for 12 seconds with zero kitchen-side interaction) showed the Complete tile correctly flip from orange to green in ~1 second via the normal 5s poll — meaning the "kitchen dashboard needs a kitchen-side action to turn green" report was NOT reproducible as literally described once the color-default bug was already fixed. Rather than assume the user was simply wrong, the actual conclusion was narrower and more useful: the color-default bug alone (visible on `/admin/db`, which has no auto-poll and only refreshes on a manual action) fully explained what looked like "stuck until I did something." Reproducing the specific mechanism, not just achieving the same end symptom, is what separates "confirmed root cause" from "plausible enough, ship it."

## Load-Bearing Product and Design Decisions

- **Theme:** warm light/dark bistro. A directional/circular View Transition was tried and rejected as weird; keep the calmer staggered cross-fade, instant under Reduce Motion.
- **UI size:** keep native root `font-size 0.35s ease`; its continuous curve and real layout geometry are the contract. Transform/zoom broke origin and reversals, steps lost the curve, and View Transition/frame-cache approaches stalled, consumed 58–96 MB, or broke handoff. Optimize surrounding work instead.
- **Mascot:** keep the pleated-toque, cheerful awkwardness, 2D/3D preference, container-aware sizing, and normal-flow speech bubble. Arm/hand-only animations were removed after repeated SVG-direction bugs. If 3D appears flat, check `.chef3d-*` CSS before component logic.
- **Order motion:** add/delete and filtered-out rows slide right; returning rows play the same keyframe backward. Use the fixed 300ms presence window, not `animationend`; Reduce Motion is instant.
- **Accessibility:** size, theme, high contrast, motion, focus, and each CVD palette are independent axes; do not bundle them into one mode.
- **Status Undo:** server-issued one-time token, 8-second deadline, stale/cross-tab/picked-up rejection, and only the mistaken timestamp is cleared. Normal kitchen flow remains forward-only.
- **Customer handoff:** one reusable restaurant QR/sign, never a per-order QR. On localhost, `/api/customer-origin` substitutes a reachable LAN address.
- **Order identity:** readable display label plus generated canonical lookup key. Preserve human labels while matching harmless punctuation/case variants.
- **Sessions:** valid remembered kitchens resume directly to the dashboard. The redundant Welcome Back screen and `?fresh=1` bypass were removed.
- **Error handling:** route/root/dashboard boundaries catch render failures; async handlers still need explicit try/catch.
- **Security:** settled audits are summarized in `SYSTEM_MEMORY.md` and evidenced in `SECURITY_ATTACK_LOG.md`. Do not reopen fixed/rejected findings without a new reason.
- **Audit log:** must outlive the order/restaurant it describes. `order_status_events.order_id` was originally `ON DELETE CASCADE`, which meant an admin hard-deleting an order silently destroyed its own audit trail — the exact opposite of what an audit trail is for. Fixed 2026-07-10 to `ON DELETE SET NULL` plus denormalized `restaurant_name`/`order_number` written at insert time, so the log stays readable even after the row it describes is gone. Do not reintroduce a cascading FK here. `/admin/audit` is its own top-level page (not nested in `/admin/db`) with a separate `PURGE AUDIT` confirmation phrase, distinct from `/admin/db`'s `PURGE DATABASE` — purging audit history must never be reachable via the same phrase/modal as purging live data.
- **PinPad is PIN-only**, no employee name-picker — removed 2026-07-10 as pure friction on a shared kitchen tablet mid-rush. Do not re-add a name-selection step; if per-employee PIN collisions ever become a real problem, the fix is tightening `pinCollidesWithAnotherEmployee`, not bringing back the picker.
- **"Funny Chef" toggle lives in the toolbar next to the 2D/3D toggle, NOT inside `AccessibilityMenu`.** It was originally added to the Accessibility dropdown (the one existing place with a toggle-switch list UI) purely as a UI-reuse shortcut, but the user correctly rejected that placement on 2026-07-10 — it's a chef-personality preference, not an accessibility setting, and being buried in that dropdown was the wrong mental model even though the toggle mechanics were fine. Lesson: reusing an existing UI pattern for convenience is fine; reusing its LOCATION for something conceptually unrelated is not — ask or place it logically the first time.
- **Muted/dim text (`--color-text-muted`) is reserved for content the user isn't meant to casually read (hashed/raw passwords).** Timestamps ("Created At" on `/admin/db`, "When" on `/admin/audit`) were incorrectly styled at that same dim tier and were hard to read — the user's own framing was "passwords make sense to have that shade, dates and times need better visibility." Bumped both to `--color-text-primary` (matching restaurant/kitchen-name brightness) on 2026-07-10. If a future column looks unusually dim, check whether it's actually meant to be low-emphasis (secrets, muted metadata) or just miscategorized.
- **No "Load More" buttons for scroll-paginated data — auto-load near the scroll edge instead.** The user explicitly called buttons like this "irritating" when specifying `/admin/db`'s infinite scroll (2026-07-10): "if i scroll and i hit the bottommost it should say 'loading more' and load more." `/admin/db`'s Orders table loading pills are floating, `position: absolute` INSIDE the scrollable card (not the full page) — top pill for scrolling up/loading earlier, bottom pill for scrolling down/loading more, each only visible while that specific direction's fetch is actually in flight (`isLoadingTop`/`isLoadingBottom`, not just "more exists"). Wired into the same Reduce Motion CSS rules as every other animation (`.animate-spin` added to both the media-query and `[data-motion="reduced"]` blocks in `globals.css`) — the spinner still renders under Reduce Motion (it's informative state, not decorative), it just doesn't spin.
- **PIN attribution is a one-time sign-in per kitchen dashboard session, not a per-action prompt** — redesigned 2026-07-11 after the user found the original per-action `PinPad` flow "irritating," especially for a manager-only kitchen (root cause traced to `PinPad`'s silent 4-vs-6-digit auto-submit mismatch, which the redesign eliminates for order actions outright since there's no longer a per-action length guess). The new model deliberately keeps the PIN verification machinery (`verifyEmployeeForAction`, `/employees/verify-pin`) alive for exactly 2 remaining callers — the staff sign-in screen itself, and `StaffTab`'s still-independent manager-only unlock — rather than ripping it out, since "verify a PIN once" and "trust an already-verified identity for the rest of a session" are two different concerns that both still need to exist. Do not re-add a per-action PIN prompt to order create/advance/delete without being asked; if per-employee accountability ever needs to be tightened further, the fix is almost certainly session timeout/expiry on `lib/employee-session.ts`'s sessionStorage entry, not reverting to per-action PIN.
- **"Remember Me" and "signed-in employee" are two independent layers that must never merge.** The user was explicit: remembering the KITCHEN's login must never remember WHICH EMPLOYEE was using it. This is why the employee identity lives in `sessionStorage` (cleared on tab/browser close) rather than a cookie with its own `maxAge` — a cookie-based approach would have needed a second, parallel "remember me" decision that the user never asked for and that would have silently attributed a new shift's first action to whoever used the tablet last.

## Data Safety and Recovery

- Seed/Purge require exact UI and API phrases. Do not bypass this guard in tests.
- Rolling `pg_dump` runs every 3 hours and keeps three snapshots. It is a local safety net, not offsite backup.
- Proven restore procedure: restore a dump into a temporary database, verify counts/names, stop the exact app server, rename/swap databases, restart, and let `initDb()` migrate. Never restore blindly over live data.
- On 2026-07-09 a validated backup proved this process after an intentional purge. As of 2026-07-10 the live DB holds real test/stress data again (see `SYSTEM_MEMORY.md`'s Validation Baseline) — this is current working state, not a purge to restore over. Do not restore old snapshot kitchens unless asked.

## Cross-Device and Repository Incidents

### USB copy ahead of Git (2026-07-08)

A corrupted `.next` cache and missing features happened together. The cache was safe to delete, but the USB copy also contained newer uncommitted laptop work. Lesson: after multi-device copying, compare mtimes/content on every copy before blaming corruption; preserve `.git`, `node_modules`, `.env.local`, and backups when copying a newer working tree.

### Stray Git init + GitHub ZIP + Windows locks (2026-07-08/09)

One folder had an empty unrelated `.git`; a GitHub ZIP had current files but no history and CRLF noise; the real GitHub repo held history. After verifying remotes/logs and comparing with trailing-CR ignored, genuinely new files were copied to a fresh clone. Folder renames then failed because VS Code held handles. The workable recovery was initializing/fetching/checking out the real remote **in place**, avoiding OS-level moves.

Lessons:

- A `.git` directory does not prove useful history; a GitHub ZIP never includes history.
- Normalize/ignore CRLF before trusting “every file differs” reports.
- If Windows says a workspace folder is in use, stop retrying moves. Prefer an in-place Git repair after verifying it is safe.
- On this `.141` machine, however, current user instruction is stricter: no Git operations that sync or commit.

## Update Discipline

Keep this file for non-obvious lessons, rejected approaches, unresolved reports, and reasons behind decisions. Put current mechanics in `SYSTEM_MEMORY.md`, security proof in `SECURITY_ATTACK_LOG.md`, and user instructions in `USER_HELP.md`. Update existing bullets instead of growing a chronological diary; skip routine cosmetic changes.
