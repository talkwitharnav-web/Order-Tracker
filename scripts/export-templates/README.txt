Restaurant app - exported bundle
=================================

This folder/zip contains everything needed to run the FULL app (the
website AND its database) on any machine that has Docker installed --
you do NOT need this source code repo, Node.js, a Docker Hub account,
or even an internet connection on that machine. Both Docker images
(the app and Postgres) are bundled in here, so nothing gets downloaded
on the target machine.

Contents:
  restaurant-app-image.tar   - the pre-built app, as a Docker image
  postgres-image.tar         - the Postgres database engine, as a Docker image
  docker-compose.export.yml  - tells Docker how to run the app + Postgres together
  run.cmd                    - one-click launcher for Windows
  run.sh                     - one-click launcher for Mac/Linux
  README.txt                 - this file

How to use it
--------------
1. Copy this whole folder (or unzip it, if you received a .zip) onto the
   target machine. Location doesn't matter -- Desktop, Downloads, anywhere.
2. Make sure Docker Desktop is installed and running on that machine.
3. Double-click run.cmd (Windows) or run "./run.sh" in a terminal (Mac/Linux).
4. Wait about 10-20 seconds, then open http://localhost:3000 in a browser.

That's it. The launcher will:
  - generate a fresh random SESSION_SECRET the first time it runs (each
    machine gets its own -- this is what signs login sessions)
  - load both the app image and the Postgres image into Docker (from the
    .tar files sitting right next to it -- no internet needed for this step)
  - start Postgres and the app together, with the app automatically
    waiting for the database to be ready first

Useful commands afterwards (run from this folder):
  docker compose -f docker-compose.export.yml ps         - check status
  docker compose -f docker-compose.export.yml logs -f     - watch logs
  docker compose -f docker-compose.export.yml down        - stop everything
  docker compose -f docker-compose.export.yml down -v     - stop AND delete
                                                             the database data

Notes
-----
- All the restaurant/order data lives inside a Docker-managed volume on
  the machine you run this on -- it is NOT included in this export, and
  running the export on a new machine starts with an empty database.
- Re-running run.cmd / run.sh is safe -- it won't overwrite an existing
  .env (so you won't get a new SESSION_SECRET every time, which would log
  everyone out), and `docker compose up -d` won't recreate containers that
  are already running correctly.
- To fully remove everything this installed: `docker compose -f
  docker-compose.export.yml down -v`, then `docker image rm
  restaurant-app:latest`, then delete this folder.
