# Restaurant Order Tracker

A Next.js application for real-time restaurant order management. It uses a single App Router instance to serve three distinct environments: a kitchen dashboard, a public customer tracker, and an admin control center.

## Features

* **Shared Backend:** One custom Node server (`app/server.js`) wrapping Next.js, handling `/restaurant`, `/customer`, and `/admin` routes plus a WebSocket endpoint.
* **State Management:** The Customer Portal gets real-time order updates over WebSockets; the Kitchen Dashboard still uses a 5-second background poll.
* **Admin Simulation:** Admin route includes live monitoring and component-level simulation for both kitchen and customer views.
* **Input Masking:** Strict regex enforcing POS-style formatting (e.g., A-92) and preventing invalid spacing.
* **Local DB:** PostgreSQL 16, run locally via Docker Compose.

## Tech Stack

* Next.js (App Router) + custom server for WebSockets
* React
* Tailwind CSS
* PostgreSQL
* Lucide React

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

This project needs two things running: the Postgres database (via Docker) and the Next.js dev server. If you're not sure which command to use, just run `startup` (`.\startup` on Windows, `./startup.sh` on Mac/Linux) — it does both for you.

These commands work from **either** the repo root (`Restaurant/`) or the `app/` folder — the root `package.json` just forwards them into `app/` for convenience, so you don't have to remember to `cd app` first. The `startup`/`export`/`unpack` scripts below have their own copy in both locations (thin wrappers around `scripts/`) for the same reason.

**Windows and Mac/Linux each have their own native implementation of `startup`/`export`/`unpack`** (`.ps1`+`.cmd` vs. `.sh`) — they are independent scripts kept behaviorally in sync by hand, not generated from one shared source. If you change behavior in one, the equivalent change likely belongs in the other too.

* **`startup`** (`.\startup`/`.\startup.cmd` on Windows, `./startup.sh` on Mac/Linux) — verbose dependency check (Node, npm, Docker installed+running, `.env.local`/`SESSION_SECRET`, npm packages actually resolvable — not just present) with auto-repair, then does the same as `start:all` below. Recommended over `start:all` directly since it catches broken/missing dependencies before they cause a confusing failure mid-startup.
* **`npm run start:all`** — starts the local Postgres container, then starts the Next.js dev server, no extra checks. The app will be at http://localhost:3000.
* **Ctrl+C** — stops the dev server. This does *not* stop the database container — it keeps running in the background.
* **`npm run db:down`** — stops *and removes* the database container (your data stays safe in a Docker volume, so nothing is lost, but the container itself goes away). Use this when you're fully done for the day/session and want a clean slate.
* **`npm run db:stop`** — pauses the database container without removing it (slightly faster to resume than `db:up` after `db:down`, but for local dev either is fine). Use this if you just want to free up resources for a bit but plan to come back soon.
* **`npm run db:up`** — starts the database container back up on its own, if you ever need the DB running without also starting Next.js.

If you're unsure which of `db:down` vs `db:stop` to use: it doesn't matter much day-to-day — `db:down` is the "tidier" option and is what these docs assume, `db:stop` is marginally faster to undo. Either is safe; your data isn't deleted by either command.

### Exporting a portable, self-contained build

* **`export`** (`.\export`/`.\export.cmd` on Windows, `./export.sh` on Mac/Linux) — builds a Docker image of the app, bundles it with the Postgres image, a compose file, and one-click launcher scripts into `restaurant-app-export.zip` at the repo root. (Mac/Linux needs the `zip` command available — usually already installed; the script tells you the exact install command for your OS/distro if it's missing.)
* **`unpack`** (`.\unpack`/`.\unpack.cmd` on Windows, `./unpack.sh` on Mac/Linux) — extracts `restaurant-app-export.zip` and loads both images into Docker on this same machine (e.g. for testing an export); add `-Start`/`--start` to also launch it immediately.

The result runs on **any machine with Docker installed** — no Node.js, no copy of this repo, no Docker registry account, and (since both images are bundled in the zip) no internet connection required on that machine either. Unzip and run `run.cmd` (Windows) / `run.sh` (Mac/Linux) inside the bundle; it generates a fresh `SESSION_SECRET`, loads both images, and brings up Postgres + the app together. Full instructions are printed every time `export` runs, and also included as `README.txt` inside the bundle.

This always starts the target machine with an empty database — existing data isn't included in the export.
