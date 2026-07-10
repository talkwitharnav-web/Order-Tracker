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

## The User and Working Style

- Non-expert developer who built this by vibe-coding. Explain in plain English; do the coding and stack-trace interpretation yourself.
- Cares deeply about UI craft, warm bistro identity, accessibility, and the derpy chef. This is not disposable software.
- Thinks visually and describes desired feelings/workflows rather than APIs. Ask only for real product/architecture forks; execute once direction is clear.
- Wants visual/UX claims verified live. If a reported bug cannot be reproduced, say so plainly and ask for the missing real-world condition instead of guessing.
- Be direct about mistakes. The user responds better to honest disclosure than minimization.

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

## Data Safety and Recovery

- Seed/Purge require exact UI and API phrases. Do not bypass this guard in tests.
- Rolling `pg_dump` runs every 3 hours and keeps three snapshots. It is a local safety net, not offsite backup.
- Proven restore procedure: restore a dump into a temporary database, verify counts/names, stop the exact app server, rename/swap databases, restart, and let `initDb()` migrate. Never restore blindly over live data.
- On 2026-07-09 a validated backup proved this process after an intentional purge. The user later intentionally purged again. The current live DB is intentionally empty; do not restore old kitchens unless asked.

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
