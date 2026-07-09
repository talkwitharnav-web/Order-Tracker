# Mobile and Public-Hosting Plan

Current plan for Android/Expo work and later public self-hosting. No mobile project or public infrastructure exists yet. Read `SYSTEM_MEMORY.md` for current web architecture.

## Settled Direction

### Mobile

- Android first, targeting the user’s Pixel; iOS may follow.
- Expo + React Native + TypeScript, not native Kotlin/Java.
- Create the mobile app as a sibling of `app/` (for example `mobile/`), not inside the Next.js App Router tree.
- The user is not expected to write/debug the code. Explain installation/device steps plainly and implement the software changes.

### Public website

- Self-host on the user’s hardware, not a cloud VM.
- Planned direction: Cloudflare Registrar/domain + Cloudflare Tunnel + Caddy/HTTPS. Tunnel avoids port-forwarding/CGNAT dependence.
- Public deployment is a separate later phase from getting Android working.

## Completed LAN Groundwork

### Server access

- `app/server.js` binds `0.0.0.0` and still must be used instead of plain `next dev`/`next start` because it owns `/ws`.
- Startup prints localhost plus the reachable LAN URL.
- LAN address detection uses a UDP routing-table lookup to `8.8.8.8`; no packet is sent. Do not replace this with “first non-internal adapter,” which selected VirtualBox/WSL adapters on this machine.
- `isPrivateLanIp()` understands private IPv4 ranges and IPv4-mapped IPv6.
- WebSockets without Origin are accepted only from private-LAN IPs for future React Native clients; browser Origin/Host checks remain enforced.
- Browser WebSocket connections are restaurant-scoped and capped at 50/IP.

### Next.js dev origin

`app/next.config.ts` includes literal dev hosts:

```ts
allowedDevOrigins: ["192.168.12.140", "192.168.12.141"]
```

Next does not accept CIDR here. If DHCP/network changes the host IP, update this list or LAN pages can remain stuck on Loading because client assets/hydration are blocked.

### Windows firewall

A Private-profile inbound TCP rule for port 3000 already exists (`Restaurant App Dev (3000)`).

### Current verification

- Localhost and `.141` routes hydrate on this PC.
- LAN customer/kitchen flows and `/ws` have worked from PC browser tests.
- LAN HMR remains unreliable in dev; manual refresh works.
- **An actual physical-phone scan/browser pass is still required.**

## Next Mobile Steps

1. **Physical phone check first**
   - Connect phone and server to the same Wi-Fi.
   - Open the current startup-reported LAN URL.
   - Scan a kitchen’s printed QR sign.
   - Verify customer prefill, lookup, live updates, app switching, lock/unlock, and reconnect.

2. **Scaffold Expo app**
   - Install current Node/Android Studio/Expo prerequisites.
   - Create `mobile/` with TypeScript.
   - Keep web and mobile clients separate while sharing API contracts/types where useful.

3. **Development HTTP access**
   - Android blocks cleartext HTTP by default. Add a development-only network-security exception for the LAN host, scoped narrowly and removed/replaced once HTTPS exists.

4. **Choose mobile authentication**
   - Short-term option: make cookie handling work for a LAN-only React Native client.
   - Durable option: add explicit mobile tokens/secure storage and server token verification.
   - This remains a real architecture choice; ask before implementing it. Do not silently replace the current web-cookie model.

5. **Build the mobile screens incrementally**
   - Start with public customer tracking and WebSocket reconnect.
   - Then kitchen login/session handling and dashboard workflows.
   - Reuse canonical order lookup/status normalization rules; do not fork business logic.

6. **Test on the physical Pixel throughout**
   - Camera/QR, keyboard, touch targets, background suspension, Wi-Fi loss, rotation, large text, Reduce Motion, and accessibility.

## Public-Hosting Phase (Later)

Before exposing the web app:

1. Move hardcoded admin credentials and other deployment secrets into environment variables.
2. Configure domain, Cloudflare Tunnel, and Caddy/HTTPS.
3. Enable `FORCE_SECURE_COOKIES=true` only after HTTPS is genuinely working.
4. Add offsite encrypted backups and rehearse restore.
5. Reassess proxy-aware client IPs, distributed/global rate limits, CSRF/session revocation, and WebSocket behavior behind the tunnel.
6. Remove `raw_password` and reset affected credentials.
7. Run a new security audit against the actual public topology.

Do not add HSTS before HTTPS is stable; it would lock browsers away from today’s plain-HTTP LAN service.

## Guardrails

- Never blanket-kill Chrome without fresh explicit permission; target test PIDs/profiles.
- Never Seed/Purge for tests. Both are destructive and phrase-guarded.
- Do not commit/sync from the `.141` machine under the current user instruction.
- Keep using the custom server and restaurant-scoped WebSockets.
- Verify through real browser/device behavior, not curl alone.
- If valid dynamic routes/styles contradict source after restart, clear only generated `app/.next` and restart through `startup`.

## Completion Criteria

Mobile groundwork is complete only when a physical Android device can:

- open the LAN app and scan the QR sign
- find an order and receive live updates
- recover after app/background/network interruption
- authenticate and perform kitchen workflows once mobile auth is chosen

Public deployment is complete only when HTTPS, secrets, backups, proxy/rate-limit behavior, and a fresh security review are all verified.
