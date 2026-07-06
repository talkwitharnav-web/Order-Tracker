# Mobile Migration Plan — Handoff Doc

**Read this first if you're picking up this project in a new chat.** This file exists because the prior conversation got long/expensive; it captures the plan, decisions, and exact current state so a fresh Claude session can continue without re-deriving everything. Also read `CLAUDE.md` and `SYSTEM_MEMORY.md` for the rest of the project's history — this file is scoped only to the mobile-migration effort.

---

## The big picture / decisions made so far

The user wants to eventually:
1. Get this Next.js app onto **Android** (their own Google Pixel 10 XL, via Android Studio + Expo), then possibly iOS later.
2. **Separately**, eventually make the web app a real publicly-reachable website, **self-hosted on their own hardware** (not a cloud VM) — this is explicitly a "later" goal, not in progress right now.

Key decisions already made, don't re-litigate these:
- **Frontend stack for the mobile app: Expo + React Native + TypeScript**, not native Kotlin/Java. Reasoning: the user has "just some Java coding knowledge," Expo lets them reuse TypeScript/React concepts they've been exposed to via this project, and Expo removes most of the Android Studio/Gradle pain on Windows. This was an explicit user choice after being asked.
- **The user said outright: "i cannot code this project at all... you tell me where to go with this."** This means: don't ask the user to write code, don't assume they can debug JS/TS errors themselves, walk them through non-code steps (installing things, clicking things, running provided commands) explicitly, and do the actual coding yourself.
- **Self-hosting research (already done, not yet acted on)**: the user wants Cloudflare Tunnel (not port-forwarding) + Cloudflare Registrar for the domain + Caddy for automatic HTTPS, specifically because they don't know yet if they're behind CGNAT and Tunnel sidesteps that question. This is documented in chat history but **no code/infra work has been done for this yet** — it's a separate, later phase from the Android work.
- **Backend rework reasoning** (already explained to user, don't re-explain from scratch, just execute if asked): cookies don't transfer to mobile clients the same way, tokens will eventually be needed for the mobile app, but **this has NOT been implemented yet** — see "Not started yet" below.

---

## What's been done so far (this session, verified working)

All changes are in `app/server.js` and `app/next.config.ts`, uncommitted (git shows them as modified, not committed — check `git status` and ask the user before committing).

### 1. `app/server.js` — bind to LAN, not just localhost
- Changed `hostname` from hardcoded `"localhost"` to `process.env.HOST || "0.0.0.0"` (binds to all network interfaces).
- Added `getLanAddress()` — uses a UDP-connect trick (`dgram.createSocket('udp4').connect(80, '8.8.8.8')`) to reliably determine the real WiFi-facing LAN IP for a helpful startup log line. **Do not use `os.networkInterfaces()` and just take the first non-internal address** — this was tried first and picked a VirtualBox virtual adapter (misleadingly named "Ethernet 4" on this machine) instead of the real WiFi IP. The UDP-connect approach is the verified-correct one.
- Added `server.listen(port, hostname, callback)` — the `hostname` argument was previously omitted entirely (bug: meant the raw HTTP server was accidentally already binding to all interfaces regardless of the `hostname` variable's value, purely by Node's default behavior when no host is passed).
- Added `isPrivateLanIp(address)` — checks if an IP is in `10.0.0.0/8`, `172.16.0.0/12`, or `192.168.0.0/16` (handles the `::ffff:` IPv4-mapped-IPv6 prefix too). Unit-tested against 15 cases including range boundaries, loopback, and malformed input — all pass.
- **Modified the WebSocket `Origin` check** in the `/ws` upgrade handler: previously rejected any connection with no `Origin` header (correct for blocking non-browser internet attackers, but React Native's WebSocket client doesn't send `Origin` the way a browser does, so this would have blocked the mobile app entirely). Now: a connection with no `Origin` is allowed **only if** the connecting IP is a private LAN address per `isPrivateLanIp()`. A real internet attacker can never appear to originate from a private IP, so this doesn't weaken the original protection — it only unblocks the legitimate "phone on the same home WiFi" case. **Verified via 4 live WebSocket test cases**: matching-Origin-from-browser (accepted, unchanged), wrong/spoofed Origin (rejected, unchanged — security intact), no-Origin-from-loopback (rejected, unchanged), no-Origin-from-real-LAN-IP (now accepted — the new behavior).
- Added an inline `eslint-disable-next-line` comment on the new `require("dgram")` line to keep lint at the project's established 15-finding baseline (server.js already had 3 pre-existing `no-require-imports` findings treated as permanent/accepted noise — see `CLAUDE.md`).

### 2. `app/next.config.ts` — fix a real bug that blocked LAN page rendering entirely
- **This was the actual root cause of "page loads blank when visited via LAN IP."** Next.js's dev server blocks cross-origin requests to dev-only assets/the HMR (Hot Module Reload) WebSocket by default, trusting only `localhost`. When the user visited `http://192.168.12.140:3000` from a browser, the HTML shell loaded and React attempted to hydrate, but the HMR WebSocket connection failed silently, which prevented the actual page component (login form, etc.) from ever mounting — only background decoration SVGs rendered. Confirmed via headless Chrome CDP inspection (network events, console logs) that this was the exact failure, not a firewall/network issue.
- Fix: added `allowedDevOrigins: ["192.168.12.140"]` to `next.config.ts`. **Important**: this Next version (16.2.10) requires a literal hostname/IP or a `*.`-prefixed wildcard domain — it does **NOT** support CIDR ranges (`192.168.0.0/16` syntax was tried first and is silently wrong/ineffective, confirmed by reading Next's own bundled docs at `node_modules/next/dist/docs/.../allowedDevOrigins.md`).
- **If the user's PC's LAN IP changes** (different WiFi network, DHCP lease renewal), this hardcoded IP will go stale and the same blank-page bug will recur. The fix is quick: run `node server.js`, check the "Also reachable on your network at ..." log line, update the IP in `next.config.ts`, restart. Consider whether to automate this (e.g. compute it at config-load time) if it becomes a recurring annoyance — not done yet, kept simple/hardcoded per minimal-change discipline.

### 3. Windows Firewall
- User ran (as Administrator): `New-NetFirewallRule -DisplayName "Restaurant App Dev (3000)" -Direction Inbound -LocalPort 3000 -Protocol TCP -Action Allow -Profile Private` — confirmed successful, rule is active. Scoped to `Private` network profile only (not Public), which is the safer default.

### Verification status
- Confirmed working via headless Chrome (from this same PC, hitting the LAN IP): full page renders correctly, `/api/session` fires and resolves, WebSocket connects.
- **NOT yet confirmed from the actual Pixel device** — the user's last screenshot (before the `allowedDevOrigins` fix) showed a blank page, which is now understood and fixed, but the user has not yet re-tested from the phone itself after this fix. **This is the first thing to verify in the next session if picking this up.**

---

## What's NOT started yet (next steps, in rough order)

1. **Confirm the Pixel can actually load `http://192.168.12.140:3000` in its browser** now that `allowedDevOrigins` is fixed. If the PC's IP has changed since this doc was written, re-derive it (`node server.js`'s startup log) and update `next.config.ts` accordingly first.
2. **Set up the Expo project.** Nothing has been scaffolded yet — no `npx create-expo-app`, no dependencies installed, no project folder created. This is the next real chunk of work. Suggest creating it as a sibling folder to `app/` (e.g. `Restaurant/mobile/`), not nested inside the Next.js `app/` folder, to keep them clearly separate.
3. **Android cleartext HTTP exception.** Android blocks plain `http://` requests from apps by default (API 28+, and the Pixel 10 XL is well above that). The Expo app will need a network security config exception scoped to the dev LAN IP (`192.168.12.140`) to make HTTP (not HTTPS) requests to the dev server work during development. Not yet configured — needs to happen once the Expo project exists.
4. **Decide the API client approach for the mobile app**: since cookies don't transfer to a mobile HTTP client the same way, decide whether to (a) get cookie-based auth working cross-device for now (React Native's `fetch` can handle cookies with some care, this might be enough for a dev-only Android app talking to a LAN server) or (b) build out proper token-based auth now. Given the user's stated priority is "just get it on the Pixel," (a) is probably the pragmatic first step — token auth can be deferred until this needs to work over the real internet, not just LAN. **This wasn't explicitly decided with the user yet — ask before committing to an approach.**
5. **Self-hosting/public-website work** (domain, Cloudflare Tunnel, Caddy, HTTPS) — fully separate, later-phase work per the user's own framing ("first get it onto android" implies this comes after). Don't start this unless asked.

---

## Things to NOT do / guardrails carried over from the rest of this project

- **Never run `taskkill /IM chrome.exe` or any blanket/by-name Chrome kill** — filter to specific headless test PIDs first. See `CLAUDE.md`'s top banner; this has bitten past sessions twice.
- Don't touch `SESSION_SECRET`/admin credentials as "hardening" unless the user asks — these are known, accepted dev-only tech debt per `CLAUDE.md` §3, not bugs to silently fix.
- The user explicitly does not want many bugs introduced — verify changes live (curl, headless Chrome, or asking the user to physically check on their Pixel) rather than assuming code is correct from reading it. This session found and fixed two real bugs in the LAN-access work itself (wrong LAN IP detection, and the `allowedDevOrigins` blank-page bug) that would not have been caught without live testing.
- Keep `npm run lint` at the 15-finding baseline (13 errors, 2 warnings) — check before/after any server.js or config change, since this file's CJS `require()` pattern is an accepted exception, not a green light to introduce new unrelated lint regressions.
- Don't commit anything unless explicitly asked — current changes are uncommitted on purpose.

---

## Quick reference: current dev server state

- Postgres: Docker container `restaurant-postgres-1`, must be running (`docker ps` to check, `npm run db:up` from `app/` to start).
- App: `node server.js` from `app/` (or `npm run dev`), NOT `next dev` directly (breaks WebSockets — see `CLAUDE.md`).
- On startup, the server prints both `http://localhost:3000` and (if bound to `0.0.0.0`) `http://<LAN-IP>:3000` — use the LAN one for testing from the Pixel/other devices.
- Windows Firewall rule `"Restaurant App Dev (3000)"` already exists and is active for the Private network profile.
