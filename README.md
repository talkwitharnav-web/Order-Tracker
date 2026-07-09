# Restaurant Order Tracker

A self-hosted Next.js app for three connected workflows:

- **Kitchen**: create orders, move them through Received → Preparing → Complete, undo recent status mistakes, search, delete, and monitor order age.
- **Customer**: scan the kitchen’s reusable QR sign or enter a restaurant/order label, then receive live status updates and confirm pickup.
- **Admin**: inspect restaurants/orders, restore kitchen-deleted orders, reset passwords, rename kitchens, and view service health.

## Highlights

- Readable order labels with forgiving lookup: `Pager 14`, `pager-14`, and `#PAGER14` resolve to the same live order.
- Customer tracking survives refresh, tab suspension, reconnects, and temporary network failures.
- Restaurant-scoped WebSockets; kitchen dashboard polls every 5 seconds.
- Warm light/dark themes, S/M/B interface sizing, high contrast, reduced motion, enhanced focus, and three color-vision palettes.
- Kitchen delete is recoverable; admin delete is permanent.
- Offline QR generation and a printable, restaurant-specific customer sign.
- Signed httpOnly admin/kitchen sessions, input validation, rate limits, security headers, request-size limits, and rolling local backups.

## Quick Start

Requirements: Node.js 20+, npm, and Docker Desktop.

From the repo root or `app/`:

```powershell
# Windows
.\startup
```

```bash
# macOS/Linux
./startup.sh
```

The script checks dependencies, repairs local setup when possible, starts PostgreSQL, and runs the required custom server. Open <http://localhost:3000>.

> Run `node server.js` through the provided scripts. Plain `next dev`/`next start` does not host this app’s WebSocket endpoint.

## Routes

| Experience | Route |
|---|---|
| Admin login | `/` |
| Admin database console | `/admin/db` |
| Customer tracker | `/customer` |
| Kitchen portal | `/restaurant/home` |
| Kitchen dashboard | `/restaurant/restauranthome` |

## Common Commands

| Command | Purpose |
|---|---|
| `startup` / `startup.sh` | Recommended full local startup |
| `npm run start:all` | Start DB and editable dev server |
| `npm run dev` | Start only the custom app server |
| `npm run db:up` | Start only PostgreSQL |
| `npm run db:stop` | Stop PostgreSQL without removing its container |
| `npm run db:down` | Remove the container and close Docker; the volume remains |
| `npm run lint` | Run static checks (known baseline is documented in `SYSTEM_MEMORY.md`) |
| `export` / `export.sh` | Build an offline Docker handoff bundle |
| `unpack` / `unpack.sh` | Load/test that bundle |

The normal workflow stays in editable development mode. Production builds are not routine validation for this project.

## Architecture

- Next.js 16 + React 19 + TypeScript + Tailwind CSS v4
- Custom Node server with `ws`
- PostgreSQL 16 in Docker
- `qrcode` for offline customer-sign encoding
- One process and one database; WebSocket state is in memory and is not horizontally scalable

## Safety

- **Seed** and **Purge** erase existing data. Both require an exact typed phrase in the UI and API.
- The server keeps three rolling SQL snapshots in `backups/`; these are a local safety net, not offsite backup.
- The app is currently a private LAN/dev system. Public deployment still needs real admin secrets, HTTPS, and offsite backups.

## Documentation

- [`USER_HELP.md`](USER_HELP.md): plain-English setup, daily use, features, and troubleshooting
- [`SYSTEM_MEMORY.md`](SYSTEM_MEMORY.md): current technical truth, routes, schema, and invariants
- [`CLAUDE.md`](CLAUDE.md): judgment calls, debugging lessons, and machine-specific guardrails
- [`SECURITY_ATTACK_LOG.md`](SECURITY_ATTACK_LOG.md): condensed security audit record and verification
- [`MOBILE_MIGRATION_PLAN.md`](MOBILE_MIGRATION_PLAN.md): remaining Expo/Android and self-hosting plan
