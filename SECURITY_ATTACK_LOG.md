# Security Attack Log

Condensed record of adversarial testing, decisions, and verification. Current architecture is in `SYSTEM_MEMORY.md`. Earlier rounds predate this regenerated log; commits `a0f46d6` and `6a19643` contain their historical changes if history is available.

## Security Posture Summary

Three audit rounds were completed and verified:

- Round 1: 11 auth/input/WebSocket findings
- Round 2: 6 broad route/operational findings
- Round 3: 16 external black-box findings over LAN

Current protections include server-side authorization, restaurant-scoped WebSockets, signed split-role cookies, strict input validation, SQL parameters, rate limits, body/depth limits, security headers, exact destructive-action phrases, canonical order identity, and server-authorized status Undo.

## Round 3 — External LAN Audit (2026-07-08)

A separate Claude Opus instance attacked `http://192.168.12.140:3000` with curl, Python, and a real browser. All findings were assessed rather than blindly accepted.

| # | Finding | Disposition |
|---|---|---|
| 1 | Public restaurant autocomplete could enumerate names with 1-character sweeps | Fixed: minimum 3 characters, 30/min/IP, response filtered through `isSafeName()`. Endpoint remains public because customer autocomplete needs it. |
| 2 | Public order lookup exposes DB `id` | Deliberately retained: pickup acknowledgement requires the ID after a valid restaurant/order lookup. Search is rate-limited and exposes only narrow status data. |
| 3 | Stored HTML/script payloads accepted by server | Fixed: `requireSafeName()` whitelist applied to stored restaurant/order labels and rename. Client formatting remains UX only. |
| 4 | One-character kitchen passwords accepted | Fixed: 8–200 characters server-side and mirrored in signup UI. |
| 5 | Null bytes caused Postgres 500s | Fixed: controls/null stripped or rejected before DB use, including password/reset paths. |
| 6 | Registration throttling too loose for a write that creates permanent rows | Fixed: dedicated 5/min/IP registration limit. |
| 7 | Missing browser security headers | Fixed: CSP, frame denial, nosniff, referrer policy, permissions policy. Dev CSP alone permits `unsafe-eval`; no HSTS until real HTTPS. |
| 8 | Cookie Secure behavior tied to `NODE_ENV` rather than transport | Fixed: explicit `FORCE_SECURE_COOKIES`; default false for plain-HTTP LAN, enable only behind HTTPS. |
| 9 | Health endpoint exposed DB size/pool/WS counts to any kitchen | Fixed: kitchens receive usability status/latency; infrastructure detail is admin-only. |
| 10 | No request byte/depth limit | Fixed: custom server caps API bodies at 16KB, including chunked requests; `parseJsonBody()` rejects malformed or >5-level JSON. |
| 11 | Tabs/CRLF/control characters accepted in names | Fixed by shared control-character handling and safe-name validation. |
| 12 | Client/server validation mismatch | Fixed: server validators are authoritative; client formatting only improves entry UX. |
| 13 | Registration 201 vs 409 reveals whether a name exists | Accepted: inherent to unique registration. The practical bulk-enumeration vector was finding #1. |
| 14 | `X-Powered-By` fingerprinting | Fixed with `poweredByHeader: false`. |
| 15 | Dev source maps visible | No production server existed; `productionBrowserSourceMaps: false` explicitly prevents future production exposure. |
| 16 | No CSRF token | Accepted with current JSON APIs and `SameSite=Lax` cookies; reassess for a materially different public architecture. |

## Earlier Audit Summary

### Round 1 (11 findings)

- Replaced forgeable/default session secret with a real generated `SESSION_SECRET`.
- Added complete server auth guards and timing-safe login behavior.
- Split admin/kitchen cookies and fixed dual-role session reporting.
- Scoped WebSocket clients/broadcasts by restaurant; events without restaurant identity fail closed.
- Overwrote spoofable forwarding headers at the custom server.
- Standardized type/length validation, clean malformed JSON/ID responses, and duplicate 409s.
- Enforced kitchen forward-only status transitions; admin retains override ability.
- Escaped all user-controlled `ILIKE` patterns.

### Round 2 (6 findings)

- Fixed a status filter using the wrong vocabulary.
- Added rate limiting to anonymous lookup routes.
- Prevented one malformed legacy row from failing an entire admin response (later-obsolete encryption path was removed).
- Added stale-entry sweeping to the in-memory rate limiter.
- Stopped exposing raw DB errors to non-admin health callers.
- Reverified authorization and response narrowing across the API surface.

## Later Safety Improvements

These were added after the three formal rounds:

- API requests for Seed/Purge require exact JSON phrases; UI requires typing the same phrase before Confirm enables.
- Order labels use a generated canonical lookup key for punctuation/case-insensitive identity and live uniqueness.
- Kitchen status Undo uses a one-time random server token, 8-second deadline, exact-current-state check, cross-tab protection, and pickup lockout.
- WebSocket cap is 50/IP (raised from 5 after shared-Wi-Fi load testing exposed the old limit). Connections remain read-only and restaurant-scoped.
- Public customer tracking persists per tab and refetches after visibility/reconnect without discarding a valid card on temporary failure.
- Admin/kitchen health information remains authenticated; customer-origin resolution is authenticated.

## Verification Evidence

Fixes were tested against their original exploit, not only reviewed in source. Verified examples:

- 1–2 character suggestions return empty; legitimate 3-character suggestions still work.
- Stored XSS, null bytes, malformed/deep JSON, oversized bodies, unsafe IDs/statuses, and wildcard patterns return clean errors.
- Valid names with spaces/basic punctuation and 8+ character passwords still work.
- Kitchen callers cannot see admin-only health details.
- Wrong WebSocket origins/missing restaurant subscriptions are rejected; scoped listeners receive only their restaurant events.
- Kitchen cannot skip/reverse statuses normally; valid short Undo works once and stale/expired/picked-up attempts return 409.
- Bare/wrong-confirmation Seed/Purge requests return 400 without changing row counts.
- Canonical duplicate labels return 409 while readable display labels survive lookup variants.
- TypeScript remains clean; full ESLint’s current 27 findings are known project debt, not the security acceptance criterion. Focused changed-file lint must not add errors.

## Known Accepted Risks / Pre-Public Checklist

Current LAN/dev acceptance:

- Hardcoded admin credentials
- Intentional `raw_password` column
- In-memory sessions/rate limits/WebSockets; no horizontal scaling
- Plain HTTP and therefore non-Secure cookies
- Public lookup by restaurant + order label and public pickup acknowledgement
- Local-only rolling backups

Before open-internet use:

1. Move admin credentials to environment secrets.
2. Put the app behind real HTTPS, enable Secure cookies, then consider HSTS.
3. Add offsite encrypted backups and tested recovery policy.
4. Reassess CSRF/session revocation, proxy-aware client IPs, distributed/global rate limits, and multi-instance WebSocket delivery.
5. Remove `raw_password` and reset affected credentials.
6. Run a new external security review against the actual public architecture.

## Data State

The audit’s old temporary accounts are no longer intentionally retained. As of 2026-07-09, the user chose to purge the live DB; it is intentionally empty. Do not restore historical snapshots or create audit rows unless asked.

## Update Discipline

Add only materially new security findings, accepted-risk decisions, or verification evidence. Keep exploit proof concise and point implementation details to `SYSTEM_MEMORY.md`/source comments.
