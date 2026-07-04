# User Help Guide

This is the plain-English guide to this project. If `SYSTEM_MEMORY.md` is the technical reference for AI coding assistants, this file is for **you** (or a friend) — no coding background required.

---

## 1. What This Project Actually Is

This is a **restaurant order tracker** web app with three separate "views," all part of the same app:

**Customer Tracker** — `/customer`
  Used by: diners
  What it does: type in a restaurant name + order number to see live order status

**Kitchen Dashboard** — `/restaurant`
  Used by: restaurant staff
  What it does: log in, create orders, update their status (Received → Preparing → Complete), delete orders

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

### To start everything

Open a terminal in the `Restaurant` folder (the outer folder, or the `app` folder — both work) and run:
```bash
npm run start:all
```

This single command:
1. Starts the database (in Docker) if it isn't already running.
2. Starts the website itself.

Wait for a message like `Ready on http://localhost:3000`, then open that address in your web browser. You're now running the app locally on your own computer.

> **Make sure Docker Desktop is open first!** If Docker Desktop isn't running, `start:all` will fail at the database step. Just open the Docker Desktop app and try again.

### To stop working

Press **Ctrl+C** in the terminal where the app is running. This stops the website.

The database will **keep running in the background** — this is intentional, so you can restart the website quickly next time without waiting on the database to boot up again.

### If you're done for the day and want to free up your computer's resources

Run one of these (either is safe, neither deletes your data):

```bash
npm run db:down
```
Fully stops and removes the database container. Slightly "tidier." Your data is untouched — it lives in a separate Docker storage area (a "volume") that persists even when the container is removed.

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

**`npm run start:all`** — the main command, use this to start working
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

## 5. Setting It Up on a Friend's Laptop (Step-by-Step)

Here's the exact walkthrough if a friend wants to run this on their own computer:

1. **Install Node.js** — go to [nodejs.org](https://nodejs.org), download the "LTS" version, install it like any normal program.
2. **Install Docker Desktop** — go to [docker.com](https://www.docker.com/products/docker-desktop/), download, install, then **open it once** and leave it running.
3. **Copy the project folder** onto their laptop (via USB drive, cloud storage, `git clone`, however is easiest).
4. **Open a terminal** (on Windows: search for "PowerShell" or "Command Prompt" in the Start menu; on Mac: search for "Terminal").
5. **Navigate into the project folder.** For example, if they put it on their Desktop:
   ```bash
   cd Desktop\Restaurant\app
   ```
   (On Mac/Linux, use forward slashes: `cd Desktop/Restaurant/app`)
6. **Install dependencies:**
   ```bash
   npm install
   ```
7. **Check the `.env.local` file exists** inside the `app` folder (see Step 4 in Section 2 above — copy `.env.example` to `.env.local` if it's missing).
8. **Make sure Docker Desktop is open and running.**
9. **Start everything:**
   ```bash
   npm run start:all
   ```
10. **Open a browser** and go to `http://localhost:3000`.

That's the whole process — steps 1–2 are one-time software installs, the rest takes a few minutes.

---

## 6. Where to Find Things

**Track an order as a customer**
  `http://localhost:3000/customer`

**Log in as a restaurant / kitchen**
  `http://localhost:3000/restaurant`

**Register a new restaurant account**
  `http://localhost:3000/restaurant/register`

**Access the admin panel**
  `http://localhost:3000/` (then log in, redirects to `/admin/db`)

**Admin login** (hardcoded for local dev — not meant for real production use):
- Username: `darkglory`
- Password: `Re$t@ur@nt@dm!n`

---

## 7. Common Problems

**"Docker Desktop is manually paused" or the database won't start**
Open the Docker Desktop app on your computer and make sure it's running (not paused, not closed). Then try `npm run start:all` again.

**"Port 3000 already in use" or "Port 5432 already in use"**
Something else on your computer is already using that port. Usually this means the app or database is already running from a previous session — check if you have another terminal window open with it running.

**The app starts but the customer/kitchen pages show no data**
The database might be empty. Go to the Admin Panel (see Section 6) and use the "Seed Database" button to load some sample test data.

**I changed a `.env.local` value and nothing happened**
Restart the app (Ctrl+C, then `npm run start:all` again) — environment variable files are only read when the app starts up.

---

## 8. A Note on This Being a Local Dev Setup

Everything above is for running this project **on your own computer for testing/development**. It is not set up for real customers to use over the internet — there's no real security hardening, the admin password is hardcoded in the code, and the database only exists on your machine. If you ever want to make this a real, live product other people can use, that's a separate (and much bigger) conversation about hosting, security, and real user accounts.
