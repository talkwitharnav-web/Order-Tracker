# User Help Guide

Plain-English instructions for running and using the Restaurant Order Tracker. Technical details are in `SYSTEM_MEMORY.md`.

## What the App Does

| Experience | Who uses it | Purpose |
|---|---|---|
| Customer Tracker (`/customer`) | Diners | Scan the kitchen QR sign or enter restaurant + order label to see live status and confirm pickup |
| Kitchen Portal (`/restaurant/home`) | Staff | Log in/register, create/search orders, advance status, undo recent mistakes, and print the customer sign |
| Admin (`/`, then `/admin/db`) | Owner | Inspect data, restore kitchen-deleted orders, rename kitchens, reset passwords, view health, Seed, or Purge |

The app needs PostgreSQL (Docker) and the Node/Next.js server.

## First-Time Setup

Install:

1. Node.js 20+
2. Docker Desktop
3. Git only if cloning from GitHub

Get the project by copying the folder or cloning it. Then run the normal startup command; it creates/repairs `.env.local`, generates `SESSION_SECRET`, installs dependencies when needed, starts PostgreSQL, and starts the app.

```powershell
# Windows, from the repo root or app/
.\startup
```

```bash
# macOS/Linux
./startup.sh
```

Open <http://localhost:3000> when the terminal says the server is ready.

If Windows blocks PowerShell scripts, use `startup.cmd`. If a copied shell script says “permission denied,” run:

```bash
chmod +x startup.sh export.sh unpack.sh
```

## Everyday Commands

| Command | What it does |
|---|---|
| `startup` / `startup.sh` | Recommended complete startup with checks/repairs |
| `npm run start:all` | Start DB and editable dev server with fewer checks |
| `npm run dev` | Start only the app server; DB must already be running |
| `Ctrl+C` | Stop the app server; DB keeps running |
| `npm run db:up` | Start only PostgreSQL |
| `npm run db:stop` | Stop the DB container temporarily |
| `npm run db:down` | Remove the container and close Docker; its data volume remains |
| `npm run lint` | Developer code checks; not needed for normal use |

The project normally stays in editable development mode. Routine production builds are not part of the user’s workflow.

## Pages and Login

- Customer tracker: `http://localhost:3000/customer`
- Kitchen login/register: `http://localhost:3000/restaurant/home`
- Admin login: `http://localhost:3000/`
- Admin console: `http://localhost:3000/admin/db`

Local-dev admin credentials:

- Username: `darkglory`
- Password: `Re$t@ur@nt@dm!n`

Kitchen Remember Me resumes directly into the dashboard while valid. Admin and kitchen logins can coexist in the same browser.

## Kitchen Workflow

1. Choose a naming style: sequential, letter + number, customer name, table/pager, or freeform.
2. Add an order.
3. Move it through **Received → Preparing → Complete**.
4. After a status tap, **Undo** is available for 8 seconds. It only reverses the latest step and cannot move a picked-up order backward.
5. Kitchen delete hides an order but keeps it restorable by admin.

The dashboard shows order age, status counts, and oldest orders first in Received/Preparing. Important mobile controls are about 40px high; the mobile menu sits inside the settings pill.

### Order labels

Labels stay readable exactly as entered. Lookup/search ignore harmless case, spaces, punctuation, and a leading `#`: `Pager 14`, `pager-14`, and `#PAGER14` find the same order. Two active labels that resolve to the same value are not allowed.

### Pickup timer

Admin timing shows time spent in each stage. Received/Preparing have no cap. Complete stops when:

- the customer clicks **Order Picked Up**, or
- the kitchen’s 1/6/12/24-hour fallback is reached.

Changing this setting does not remove orders; it controls the Complete-duration fallback.

## Customer Tracker Sign

The kitchen Home tab has a reusable **Customer Tracker** card:

- offline QR code
- copyable link
- Open tracker
- Print sign

Print it once and leave it at the counter. Customers scan the same restaurant QR, then enter their own order label. The QR never contains a specific order.

When the dashboard is opened through localhost, the printed link automatically uses the computer’s reachable LAN address (for example `.141`) instead of unusable customer-side localhost. Phone and server must be on the same Wi-Fi until public hosting exists.

Customer tracking survives refresh, tab suspension, reconnects, and temporary connection failures. It clears after pickup or when the order truly no longer exists.

## Accessibility and Display

The top-right settings pill stores preferences in that browser:

- **S / M / B** interface size (hidden from the narrow toolbar where space is limited)
- High Contrast
- Reduce Motion
- Enhanced Focus Outline
- Deuteranopia, Protanopia, and Tritanopia palettes
- Light/dark theme
- 2D/3D chef toggle only where a mascot is present
- Fullscreen on supported mobile browsers

Status always includes text/icon meaning, not color alone.

## Delete, Restore, Seed, and Purge

- Kitchen order delete: **recoverable** soft delete.
- Admin order delete: permanent.
- Admin restaurant delete: permanent and also deletes that kitchen’s orders.
- Admin Deleted view: shows kitchen-deleted orders and lets admin restore them. Restore returns 409 if a live order now uses the same canonical label.
- Kitchen rename updates its orders; currently logged-in kitchen devices must log in again with the new name.

### Destructive actions

- **Seed Database** erases everything, then creates samples. Type `SEED DATABASE` to enable Confirm.
- **Purge Database** erases everything and leaves the DB empty. Type `PURGE DATABASE` to enable Confirm.

Never use Seed to “add” sample data. The API also rejects missing/wrong phrases.

The server takes a full SQL snapshot every 3 hours and keeps the latest three in `backups/`. These are local emergency snapshots, not offsite backup. Ask for help before restoring; safe restoration validates a dump in a temporary DB before swapping it live.

At the current update, the live DB is intentionally empty because the user chose to purge it.

## Sharing With Another Computer

### Offline Docker bundle

Run `export`/`export.sh`. It creates `restaurant-app-export.zip` containing the app image, PostgreSQL image, compose file, and launchers. The destination needs Docker Desktop but not Node, source code, a registry account, or internet access.

On the destination, unzip and run `run.cmd` or `./run.sh`. The bundle starts with an empty DB. Use `unpack`/`unpack.sh` in this repo to test a bundle locally; add `-Start`/`--start` to launch it.

### Editable source copy

Clone/copy the repo, install Node + Docker (+ Git when cloning), then run `startup`. A clone receives only what was actually pushed; uncommitted files on another machine are not included.

## Common Problems

**Docker is paused/not running**  
Open Docker Desktop, wait until ready, then run `startup` again.

**Port 3000 or 5432 is in use**  
The app/database is probably already running in another terminal/container. Check before stopping anything.

**App starts but shows no data**  
The DB may simply be empty. That is currently intentional. Only Seed if you truly want to erase anything present and replace it with samples.

**LAN page stays on Loading or shows stale routes/styles**  
Confirm the current LAN IP is listed in `app/next.config.ts`. If source is correct but dev behavior is stale, stop the exact app server, delete only `app/.next`, and restart with `startup`.

**Environment change did nothing**  
Restart the app; `.env.local` is read at startup.

**QR does not open on a phone**  
Confirm app server is running, phone is on the same Wi-Fi, and Windows Firewall allows private-network port 3000. Physical-phone scanning still needs real-device verification.

**Health says unavailable**  
Health requires a valid admin or kitchen session. Reload/login first; then check server and DB if it persists.

## Public Deployment Status

The app has meaningful validation, rate limiting, scoped WebSockets, and security headers, but it is still a LAN/dev setup. Before open-internet use:

- move hardcoded admin credentials into environment secrets
- add real HTTPS and enable Secure cookies
- add offsite backups
- review proxy/IP behavior for rate limits and WebSockets
- physically test common phone browsers

Cloudflare Tunnel + Caddy is the planned direction; no public infrastructure is active yet.
