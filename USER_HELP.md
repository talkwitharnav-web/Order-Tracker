# User Help Guide

This is the plain-English guide to this project. If `SYSTEM_MEMORY.md` is the technical reference for AI coding assistants, this file is for **you** (or a friend) — no coding background required.

---

## 1. What This Project Actually Is

This is a **restaurant order tracker** web app with three separate "views," all part of the same app:

**Customer Tracker** — `/customer`
  Used by: diners
  What it does: type in a restaurant name + order number to see live order status

**Kitchen Dashboard** — `/restaurant/home`
  Used by: restaurant staff
  What it does: log in or register, create orders, update their status (Received → Preparing → Complete), delete orders

**Admin Panel** — `/` then `/admin/db`
  Used by: you (the owner)
  What it does: see everything in the database, seed test data, wipe the database, reset passwords

Under the hood it needs **two things running** to work:
1. A **PostgreSQL database** (stores restaurants + orders) — runs in Docker.
2. The **Next.js app itself** (the website/server) — runs with Node.

Both are covered below.

---

## 2. One-Time Setup (Do This Once)

Follow this section the *first* time you (or a friend) get this project on a new computer.

### Step 1 — Install the required software

You need three things installed on the computer. Skip any you already have.

1. **Node.js** (v20 or newer) — download from [nodejs.org](https://nodejs.org). This lets you run the app.
2. **Docker Desktop** — download from [docker.com](https://www.docker.com/products/docker-desktop/). This runs the database for you, so you don't have to install Postgres by hand.
   - After installing, **open Docker Desktop at least once** and leave it running in the background. If Docker Desktop isn't running, the database commands below won't work.
3. **Git** (only needed if you're cloning the project from a repository like GitHub) — download from [git-scm.com](https://git-scm.com).

### Step 2 — Get the project files

If you're copying the folder directly (USB drive, zip file, etc.), just copy the whole `Restaurant` folder onto the new computer.

If it's on GitHub or similar, open a terminal and run:
```bash
git clone <the-repository-url>
cd Restaurant
```

### Step 3 — Install the app's dependencies

Open a terminal **inside the `Restaurant` folder**, then run:
```bash
cd app
npm install
```
This downloads all the code libraries the app needs (React, Next.js, etc.). It can take a minute or two. You'll see a `node_modules` folder appear — that's normal, it's just where those libraries live.

### Step 4 — Set up the database connection file

Inside the `app` folder, there should be a file called `.env.local`. If it's missing (e.g. you cloned a fresh copy and it wasn't included — this file is intentionally left out of Git for security reasons), create it yourself:

1. Copy `app/.env.example`
2. Rename the copy to `.env.local`
3. Its contents should look like this:
   ```
   DATABASE_URL=postgres://restaurant:restaurant@localhost:5432/restaurant
   ```
   You don't need to change anything — these are just local dev credentials that match the database Docker will spin up for you.

**Setup is now done.** You won't need to repeat these steps again on this computer.

---

## 3. Everyday Use — Starting and Stopping the App

Once setup is done, this is all you need to know day-to-day.

### The easy way: `startup`

From either the `Restaurant` folder or the `app` folder:

**Windows:**
```
.\startup
```
(You can also just double-click `startup.cmd` in File Explorer — no terminal needed.)

**Mac/Linux:**
```bash
./startup.sh
```

This does everything `npm run start:all` does (see below), but first checks that everything it needs is actually installed and working — Node, npm, Docker, your dependencies — and fixes anything it finds broken or missing, printing what it's doing every step of the way. If something's wrong (Docker isn't running, a dependency got corrupted, whatever), it tells you exactly what and how to fix it, instead of failing with a cryptic error partway through. This is the recommended way to start the app, especially if it's been a while since you last ran it or you're not sure everything's still set up correctly.

### The direct way: `npm run start:all`

Open a terminal in the `Restaurant` folder (the outer folder, or the `app` folder — both work) and run:
```bash
npm run start:all
```

This single command:
1. Checks whether Docker Desktop is open, and opens it for you if it isn't (waits for it to finish starting up).
2. Starts the database (in Docker) if it isn't already running.
3. Starts the website itself.

Wait for a message like `Ready on http://localhost:3000`, then open that address in your web browser. You're now running the app locally on your own computer.

### To stop working

Press **Ctrl+C** in the terminal where the app is running. This stops the website.

The database will **keep running in the background** — this is intentional, so you can restart the website quickly next time without waiting on the database to boot up again.

### If you're done for the day and want to free up your computer's resources

Run one of these (either is safe, neither deletes your data):

```bash
npm run db:down
```
Fully stops and removes the database container, and closes Docker Desktop itself if it was running. Slightly "tidier." Your data is untouched — it lives in a separate Docker storage area (a "volume") that persists even when the container is removed.

```bash
npm run db:stop
```
Just pauses the database container without removing it. Marginally quicker to resume later. Also perfectly safe.

If in doubt, use `db:down` — that's what these docs assume by default.

### To bring the database back up on its own

```bash
npm run db:up
```
Useful if you just want the database running without also starting the website (rare — most people just use `start:all`).

---

## 4. Command Reference

All of these can be run from either the `Restaurant` folder or the `app` folder.

**`startup`** (`.\startup` on Windows, `./startup.sh` on Mac/Linux) — the recommended command, checks everything is actually working first
  What it does: verifies Node/npm/Docker are installed and Docker is running, checks and repairs your `.env.local` and dependencies if anything's missing/broken, then does the same thing `start:all` does
  When to use it: any time you're starting a work session, especially if it's been a while or something seems off

**`export`** (`.\export` on Windows, `./export.sh` on Mac/Linux) — packages the whole app into a file for another computer
  What it does: builds a portable version of the app + database that runs on any computer with Docker, no coding tools needed there — see Section 5 above
  When to use it: sharing/deploying this app to a different computer

**`unpack`** (`.\unpack` on Windows, `./unpack.sh` on Mac/Linux) — unpacks an export bundle on a machine that already has this repo
  What it does: extracts `restaurant-app-export.zip`, loads both Docker images, generates a fresh `.env`; add `-Start` (Windows) / `--start` (Mac/Linux) to also launch it immediately
  When to use it: testing an export locally, or if you're using this same repo's checkout as the machine you're deploying to

**`npm run start:all`** — starts the database, then the website, no extra checks
  What it does: starts the database, then starts the website

**`npm run dev`**
  What it does: starts *only* the website (assumes the database is already running)
  When to use it: if the database is already up and you just restarted the website

**`npm run db:up`**
  What it does: starts the database container
  When to use it: rarely needed directly — `start:all` already does this

**`npm run db:down`**
  What it does: stops **and removes** the database container (data is safe)
  When to use it: end of a work session, want a clean slate

**`npm run db:stop`**
  What it does: pauses the database container without removing it
  When to use it: end of a work session, want a quicker restart next time

**`npm run build`**
  What it does: compiles the app for production use (not needed for local testing)
  When to use it: only relevant if actually deploying this somewhere

**`npm run lint`**
  What it does: checks the code for style/quality issues
  When to use it: for developers making code changes, not needed for regular use

---

## 5. Sharing the App With Another Computer

There are two ways to get this app running on a different computer. Pick whichever fits the situation:

- **Option A (zip handoff)** — best when the other person doesn't want to install any coding tools, or you're setting it up in person with a USB drive. Downside: it's a snapshot — if you change the code later, you have to re-export and re-send the file every time.
- **Option B (GitHub clone)** — best when the other person is at all comfortable with a terminal, or when more than one person might want to set this up over time (a friend today, someone else next month). They pull the code themselves, so they always get whatever's currently on GitHub — no file to hand off, nothing to re-send after you push changes. This project's repo is already on GitHub, so this option requires no extra setup on your end beyond making sure your latest work is pushed there.

### Option A (easiest for a one-off with no dev tools): the `export` command

This packages the entire app — the website AND its database — into one file that runs on any computer with **just Docker Desktop installed**. The other computer does not need Node.js, does not need this project's source code, and does not even need an internet connection to run it (everything it needs is bundled inside the file).

**On your computer** (the one with this project), from either the `Restaurant` folder or the `app` folder:

**Windows:** `.\export`
**Mac/Linux:** `./export.sh`

This takes a few minutes (it has to build and package everything). When it's done, it prints exactly what to do next, and creates a file called `restaurant-app-export.zip` in the `Restaurant` folder. That file is fairly large (a few hundred MB) — expected, since it contains the whole app and database engine bundled together, that's what makes the other computer not need anything else installed. (On Mac/Linux, this needs the `zip` command installed — it usually already is; if not, the script tells you exactly how to install it for your system.)

**On the other computer:**
1. Copy `restaurant-app-export.zip` over however you'd normally move a file — USB drive, cloud storage upload, network share, email if it's small enough for your email provider.
2. Unzip it anywhere (Desktop, Downloads, doesn't matter).
3. Make sure Docker Desktop is installed and running on that computer.
4. Double-click `run.cmd` (Windows) inside the unzipped folder, or open a terminal there and run `./run.sh` (Mac/Linux).
5. Wait about 10–20 seconds, then open `http://localhost:3000` in a browser.

That's it — no `npm install`, no `.env.local` file to set up, nothing else to configure. The one thing to know: this always starts the other computer with an **empty database** — none of your existing restaurants/orders come along. If you need to bring existing data along too, that's a different, more involved task — ask for help with that specifically if you need it.

You can re-run `.\export` anytime (e.g. after making code changes) — it always rebuilds fresh and overwrites the old zip file.

### Option B: clone the GitHub repo

This gets them the actual editable source code (Option A only gives a running app, not the code behind it), and — unlike Option A — there's no file for you to export/hand off/re-send; they just pull whatever's currently pushed to GitHub. Use this if the other person needs to actually edit/develop the app, is comfortable with a terminal, or if you expect more than one person to set this up over time.

**Prerequisite on your end**: make sure your latest work is actually pushed to GitHub (`git push`) before they clone — they'll get exactly what's there, nothing more. This repo is public, so anyone with the link can clone it without needing a GitHub account or you granting them access — if you ever make the repo private instead, they'd need to be added as a collaborator first.

**On the other computer:**
1. **Install Node.js** — go to [nodejs.org](https://nodejs.org), download the "LTS" version, install it like any normal program.
2. **Install Docker Desktop** — go to [docker.com](https://www.docker.com/products/docker-desktop/), download, install, then **open it once** and leave it running.
3. **Install Git** if they don't have it — go to [git-scm.com](https://git-scm.com), install like any normal program.
4. **Open a terminal** (Windows: search for "PowerShell" in the Start menu; Mac: search for "Terminal").
5. **Clone the repo** — navigate to wherever they want the project (e.g. their Desktop) and run:
   ```bash
   git clone https://github.com/talkwitharnav-web/Order-Tracker.git
   cd Order-Tracker
   ```
6. **Run `startup`** — Windows: `.\startup` (or `.\startup.cmd` if that doesn't work); Mac/Linux: `./startup.sh`
   This checks Node/npm/Docker are all working, creates the `.env.local` file automatically (with a freshly generated `SESSION_SECRET` — each computer should have its own, never share this file between machines), installs dependencies, and starts everything — database and website both.
7. **Open a browser** and go to `http://localhost:3000`.

That's the whole process — steps 1–3 are one-time software installs, step 5 takes a minute, step 6 takes a couple more the first time (installing dependencies) and is instant after that.

**If they ever want to update to your latest changes later**, they just run `git pull` inside the `Order-Tracker` folder, then `startup` again (`.\startup` or `./startup.sh`) — no need to redo any of the install steps.

---

## 6. Where to Find Things

**Track an order as a customer**
  `http://localhost:3000/customer`

**Log in as a restaurant / kitchen**
  `http://localhost:3000/restaurant/home` (choose Log In or Register from there)

**Register a new restaurant account directly**
  `http://localhost:3000/restaurant/signup`

**Access the admin panel**
  `http://localhost:3000/` (then log in, redirects to `/admin/db`)

**Admin login** (hardcoded for local dev — not meant for real production use):
- Username: `darkglory`
- Password: `Re$t@ur@nt@dm!n`

---

## 6a. Accessibility & Display Options

Every page has a small toolbar in the top-right corner with a few independent display controls. They're all optional and remembered per-browser (each one is a separate on/off switch, not a bundled "accessibility mode"):

- **S / M / B** — Small / Medium / Big. Scales the whole interface's text and buttons up or down. Useful on a shared kitchen tablet during a rush, or if the default text is too small/large for you.
- **Accessibility icon (wheelchair symbol)** — opens a dropdown with:
  - **High Contrast** — much stronger text/border contrast, for low vision.
  - **Reduce Motion** — turns off animations and transitions.
  - **Enhanced Focus Outline** — a bold, obvious ring around whatever's focused when navigating by keyboard.
  - **Colorblind-Friendly Palette** — a picker (not a simple on/off) with options for Deuteranopia, Protanopia, and Tritanopia. Pick whichever matches your actual color vision; each swaps the app's status/brand colors for a palette specifically checked to stay distinguishable for that type. Order status is also always shown with an icon and text label, never color alone, so the app stays usable even without picking any of these.
- **Sun/moon icon** — switches between light and dark theme.

None of these require an account or affect other users — they're a personal preference stored in your browser.

---

## 6b. Deleting Things: Kitchen Delete Is Recoverable, Admin Delete Is Permanent

**From the Kitchen Dashboard**, deleting an order doesn't actually erase it — it just hides it from normal view. The record is kept and can be brought back by an admin.

**From Admin → Access DB**, deleting a restaurant or an order is immediate and permanent — it's really gone, same as Purge, just scoped to one row instead of everything.

- **In Admin → Access DB**, click the **"Deleted"** button near the top to reveal a "Deleted Restaurants" section and see kitchen-deleted orders mixed into the main Orders table (shown greyed-out with a "Deleted" tag). Each has a restore (circular arrow) button — this only ever shows things a kitchen deleted, never something an admin deleted, since those are already gone for good.
- **Restoring a restaurant** (only ever a kitchen-side soft-delete from before this behavior existed) brings its orders back too. If its original name has since been taken by someone else, it comes back as `OriginalName-restored` (or `-restored2`, etc. if that's also taken).
- **"Purge Database"** in Admin → Access DB still wipes everything at once, irreversibly, same as before.
- Renaming a kitchen (pencil-icon button next to Reset Password in Access DB) also updates all of that kitchen's existing orders to match. If that kitchen was logged in somewhere at the time, that device will need to log back in with the new name — the old login session won't carry over automatically.

## 6c. Order Timing & Pickup Window

Admin → Access DB's Orders table now shows how long each order spent in Received, Preparing, and Complete. Received/Preparing count up with no limit. Complete counts up until either:
- The customer clicks **"Order Picked Up"** on their tracking page, or
- A configurable time limit passes (see below) — whichever happens first.

Each kitchen can set its own pickup-window limit from its own Dashboard's Home tab ("Order Pickup Window" card — 1/6/12/24 hour presets). Defaults to 12 hours if never changed.

---

## 7. Common Problems

**"Docker Desktop is manually paused" or the database won't start**
Open the Docker Desktop app on your computer and make sure it's running (not paused, not closed). Then try `npm run start:all` again (or `startup`, which will tell you clearly if Docker isn't running instead of just failing).

**"Port 3000 already in use" or "Port 5432 already in use"**
Something else on your computer is already using that port. Usually this means the app or database is already running from a previous session — check if you have another terminal window open with it running.

**The app starts but the customer/kitchen pages show no data**
The database might be empty. Go to the Admin Panel (see Section 6) and use the "Seed Database" button to load some sample test data.

**`.\startup` or `.\export` won't run on Windows / says something about execution policies**
Use the `.cmd` version instead — `.\startup.cmd` or `.\export.cmd` — which works even if Windows is blocking `.ps1` scripts from running. Both do exactly the same thing.

**`./startup.sh` or `./export.sh` won't run on Mac/Linux / says "permission denied"**
Run `chmod +x startup.sh export.sh unpack.sh` once in that folder to mark them as runnable, then try again. This can happen if the files lost their "executable" flag when copied/downloaded some other way than `git clone`.

**After running `.\export` on the OTHER computer, `run.cmd`/`run.sh` fails to generate a secret**
This would mean that computer doesn't have a working way to generate random values (very rare — every supported Windows/Mac/Linux system has one). The script is designed to stop and tell you clearly rather than silently create a weak/predictable secret, so if you see this, something unusual is going on with that computer's setup — it's not something to just retry past.

**I changed a `.env.local` value and nothing happened**
Restart the app (Ctrl+C, then `npm run start:all` again) — environment variable files are only read when the app starts up.

---

## 8. A Note on This Being a Local Dev Setup

Everything above is for running this project **on your own computer for testing/development**. It is not set up for real customers to use over the internet — there's no real security hardening, the admin password is hardcoded in the code, and the database only exists on your machine. If you ever want to make this a real, live product other people can use, that's a separate (and much bigger) conversation about hosting, security, and real user accounts.
