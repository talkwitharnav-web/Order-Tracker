# Restaurant Order Tracker

A Next.js application for real-time restaurant order management. A single App Router instance serves three separate experiences — a kitchen dashboard, a public customer order tracker, and an admin database console — all sharing one Postgres-backed API.

## Features

* **Kitchen Portal** (`/restaurant/home`): sign in or register a kitchen account, then manage orders from a live dashboard — create orders (with several naming-convention presets: sequential numbers, letter+number, customer name, table/pager code, or freeform), advance status (Received → Preparing → Complete), delete orders. Polls every 5 seconds for updates.
* **Customer Tracker** (`/customer`): anonymous, no account needed — type a restaurant name (with autocomplete) and order name to see live status, pushed instantly over WebSocket rather than polling.
* **Admin Console** (`/` to log in, then `/admin/db`): view every restaurant and order in the database, seed sample data, purge everything, reset a kitchen's password. Includes a live health indicator (DB latency, connection pool stats, WebSocket listener count, and total database size).
* **Accessibility**: a dedicated menu (top-right on every page) with independently-togglable High Contrast, Reduce Motion, Enhanced Focus Outline, and a Colorblind-Friendly Palette picker (separate palettes tuned for deuteranopia, protanopia, and tritanopia — pick the one that matches your vision, not a one-size-fits-all filter). A separate Small/Medium/Big control scales the whole UI for kitchens that want bigger text/touch targets during a rush.
* **Light/dark theme**, warm "bistro" visual style, toggle available everywhere.
* **Real-time updates**: the customer tracker and kitchen dashboard both learn about order changes via a shared WebSocket hub scoped per-restaurant (a customer tracking one restaurant's order never sees another restaurant's traffic).
* **Session-based auth**: signed httpOnly cookies for both admin and kitchen logins, with independent "Remember Me" persistence per role.
* **Local Postgres**: runs via Docker Compose, no separate database install needed.

## Tech Stack

* Next.js 16 (App Router) + a custom Node server (`app/server.js`) for the WebSocket endpoint
* React 19, TypeScript
* Tailwind CSS v4
* PostgreSQL 16 (via `pg`)
* Lucide React (icons)

## Setup

1. Clone the repository and navigate into the nested Next.js root:
   ```bash
   cd app
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Copy `.env.example` to `.env.local` (already done if you're on a checkout that includes it) — it points at the local Postgres container started below.

### Running everything for local dev

This project needs two things running: the Postgres database (via Docker) and the Next.js dev server. If you're not sure which command to use, just run `startup` (`.\startup` on Windows, `./startup.sh` on Mac/Linux) — it does both for you, and also checks Docker Desktop itself is open and starts it if not.

These commands work from **either** the repo root (`Restaurant/`) or the `app/` folder — the root `package.json` just forwards them into `app/` for convenience, so you don't have to remember to `cd app` first. The `startup`/`export`/`unpack` scripts below have their own copy in both locations (thin wrappers around `scripts/`) for the same reason.

**Windows and Mac/Linux each have their own native implementation of `startup`/`export`/`unpack`** (`.ps1`+`.cmd` vs. `.sh`) — they are independent scripts kept behaviorally in sync by hand, not generated from one shared source. If you change behavior in one, the equivalent change likely belongs in the other too.

* **`startup`** (`.\startup`/`.\startup.cmd` on Windows, `./startup.sh` on Mac/Linux) — verbose dependency check (Node, npm, Docker installed, `.env.local`/`SESSION_SECRET`, npm packages actually resolvable — not just present) with auto-repair; opens Docker Desktop itself if it isn't already running; then does the same as `start:all` below. Recommended over `start:all` directly since it catches broken/missing dependencies before they cause a confusing failure mid-startup.
* **`npm run start:all`** — checks whether Docker Desktop is open (starts it if not), starts the local Postgres container, then starts the Next.js dev server. The app will be at http://localhost:3000.
* **Ctrl+C** — stops the dev server. This does *not* stop the database container — it keeps running in the background.
* **`npm run db:down`** — stops *and removes* the database container (your data stays safe in a Docker volume, so nothing is lost, but the container itself goes away), then closes Docker Desktop itself if it was running. Use this when you're fully done for the day/session and want a clean slate.
* **`npm run db:stop`** — pauses the database container without removing it (slightly faster to resume than `db:up` after `db:down`, but for local dev either is fine). Use this if you just want to free up resources for a bit but plan to come back soon.
* **`npm run db:up`** — checks whether Docker Desktop is open (starts it if not), then starts the database container back up on its own, if you ever need the DB running without also starting Next.js.

If you're unsure which of `db:down` vs `db:stop` to use: it doesn't matter much day-to-day — `db:down` is the "tidier" option and is what these docs assume, `db:stop` is marginally faster to undo. Either is safe; your data isn't deleted by either command.

### Exporting a portable, self-contained build

* **`export`** (`.\export`/`.\export.cmd` on Windows, `./export.sh` on Mac/Linux) — builds a Docker image of the app, bundles it with the Postgres image, a compose file, and one-click launcher scripts into `restaurant-app-export.zip` at the repo root. (Mac/Linux needs the `zip` command available — usually already installed; the script tells you the exact install command for your OS/distro if it's missing.)
* **`unpack`** (`.\unpack`/`.\unpack.cmd` on Windows, `./unpack.sh` on Mac/Linux) — extracts `restaurant-app-export.zip` and loads both images into Docker on this same machine (e.g. for testing an export); add `-Start`/`--start` to also launch it immediately.

The result runs on **any machine with Docker installed** — no Node.js, no copy of this repo, no Docker registry account, and (since both images are bundled in the zip) no internet connection required on that machine either. Unzip and run `run.cmd` (Windows) / `run.sh` (Mac/Linux) inside the bundle; it generates a fresh `SESSION_SECRET`, loads both images, and brings up Postgres + the app together. Full instructions are printed every time `export` runs, and also included as `README.txt` inside the bundle.

This always starts the target machine with an empty database — existing data isn't included in the export.

## Where things are

| Page | Route |
|---|---|
| Customer order tracker | `/customer` |
| Kitchen portal (log in / register) | `/restaurant/home` |
| Kitchen login | `/restaurant/login` |
| Kitchen registration | `/restaurant/signup` |
| Kitchen dashboard (after login) | `/restaurant/restauranthome` |
| Admin login | `/` |
| Admin database console | `/admin/db` |

Full plain-English usage instructions (setup, day-to-day commands, troubleshooting, sharing with another computer) are in [`USER_HELP.md`](USER_HELP.md).
