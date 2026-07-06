#!/usr/bin/env node
// Cross-platform-ish helper for db:up/start:all and db:down to also manage
// the Docker Desktop *application* (not just the containers) -- checks
// whether it's already open first, then only starts/quits it if needed, so
// running these commands never surprises a user who already has Docker
// Desktop open for other reasons (it's left alone in that case either way).
//
// Usage:
//   node scripts/docker-desktop.js ensure-running   (used by db:up/start:all)
//   node scripts/docker-desktop.js quit-if-running   (used by db:down)
//
// Windows-only for now (this repo's dev machine + documented dev environment
// is Windows -- see CLAUDE.md). On any other platform this is a no-op that
// just prints a note and exits 0, so db:up/db:down still work for Postgres
// even if Docker Desktop's app lifecycle isn't managed there.

import { execSync, spawn } from "child_process";
import os from "os";

const mode = process.argv[2];
if (mode !== "ensure-running" && mode !== "quit-if-running") {
  console.error("Usage: node docker-desktop.js <ensure-running|quit-if-running>");
  process.exit(1);
}

if (os.platform() !== "win32") {
  console.log(`[docker-desktop] Not on Windows -- skipping Docker Desktop app ${mode === "ensure-running" ? "launch" : "quit"} (only managing containers).`);
  process.exit(0);
}

const DOCKER_DESKTOP_EXE = "C:\\Program Files\\Docker\\Docker\\Docker Desktop.exe";

function isDockerDesktopRunning() {
  try {
    // Matches both "Docker Desktop.exe" and its "frontend\Docker Desktop.exe"
    // child process -- either indicates the app is open.
    const out = execSync(
      'powershell -NoProfile -Command "(Get-Process -Name \'Docker Desktop\' -ErrorAction SilentlyContinue | Measure-Object).Count"',
      { encoding: "utf8" }
    ).trim();
    return parseInt(out, 10) > 0;
  } catch {
    return false;
  }
}

function isDockerEngineReady() {
  try {
    execSync("docker info", { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

async function ensureRunning() {
  if (isDockerDesktopRunning()) {
    console.log("[docker-desktop] Docker Desktop is already open.");
  } else {
    console.log("[docker-desktop] Docker Desktop is not open -- starting it now...");
    const child = spawn(DOCKER_DESKTOP_EXE, [], { detached: true, stdio: "ignore" });
    child.unref();
  }

  if (isDockerEngineReady()) {
    console.log("[docker-desktop] Docker engine is ready.");
    return;
  }

  console.log("[docker-desktop] Waiting for the Docker engine to become ready (this can take a while on first launch, or if the WSL2 VM is under memory pressure)...");
  // 90s was too tight -- a genuinely slow-but-fine startup (low free RAM, a
  // stale/orphaned WSL VM still cleaning up, first launch after a Windows
  // update) can easily take longer than that, and hitting the old timeout
  // hard-killed this whole script (exit 1), which then aborted db:up's
  // "&& docker compose up" and start:all's "&& npm run dev" -- Docker was
  // often fine 30-60s later, but the dev server never got a chance to start.
  // 4 minutes gives real slow-start cases room to finish; the periodic
  // progress line (instead of silence) makes it clear this is still trying,
  // not hung.
  const maxWaitMs = 240000;
  const pollMs = 2000;
  const progressEveryMs = 20000;
  let waited = 0;
  while (waited < maxWaitMs) {
    await new Promise((r) => setTimeout(r, pollMs));
    waited += pollMs;
    if (isDockerEngineReady()) {
      console.log("[docker-desktop] Docker engine is ready.");
      return;
    }
    if (waited % progressEveryMs === 0) {
      console.log(`[docker-desktop] Still waiting... (${Math.round(waited / 1000)}s elapsed)`);
    }
  }
  console.error(
    "[docker-desktop] Docker engine did not become ready within 4 minutes.\n" +
    "  This usually means the WSL2 VM is stuck (often from an orphaned VM left over from a previous session\n" +
    "  eating memory it needs to boot into). Try:\n" +
    "    1. Open Task Manager and check free memory -- Docker's WSL2 VM needs a few GB free to start.\n" +
    "    2. Run 'wsl --shutdown' in a terminal to cleanly reset WSL, then reopen Docker Desktop.\n" +
    "    3. If it's still stuck, check Docker Desktop's own window for an error message.",
  );
  process.exit(1);
}

function shutdownWsl() {
  // Quitting Docker Desktop's own processes (above) does NOT tear down its
  // WSL2 VM -- that VM (vmmemWSL) can linger holding onto RAM/CPU well
  // after the app itself is gone, which is exactly what caused the slow
  // Docker Desktop startup investigated and fixed live in an earlier
  // session (see CLAUDE.md's Docker Desktop startup hardening entry) --
  // `wsl --shutdown` was the manual fix used there, now wired into db:down
  // itself so it happens automatically instead of needing a future session
  // to rediscover and run it by hand each time.
  //
  // `wsl --shutdown` stops EVERY WSL distro on the machine, not just
  // Docker's -- only called from quitIfRunning() when Docker Desktop was
  // actually the thing just closed (never unconditionally), so a WSL
  // distro used for something unrelated to this project is only affected
  // in the case where Docker Desktop was open anyway.
  console.log("[docker-desktop] Shutting down WSL (clears Docker Desktop's WSL2 VM, frees its memory)...");
  try {
    execSync("wsl --shutdown", { stdio: "ignore" });
    console.log("[docker-desktop] WSL shut down.");
  } catch (err) {
    // Non-fatal -- db:down's actual job (stopping the Postgres container)
    // already succeeded by this point; a WSL-shutdown failure (e.g. WSL
    // itself isn't installed/enabled) shouldn't be reported as if db:down
    // failed overall.
    console.error("[docker-desktop] Could not shut down WSL (non-fatal):", err.message);
  }
}

function quitIfRunning() {
  if (!isDockerDesktopRunning()) {
    console.log("[docker-desktop] Docker Desktop is not open -- nothing to quit.");
    return;
  }
  console.log("[docker-desktop] Closing Docker Desktop...");
  try {
    // Stop-Process by name rather than a single hardcoded PID -- Docker
    // Desktop runs as multiple processes (main + "frontend\Docker
    // Desktop.exe"); -Name matches all of them by image name, scoped to
    // "Docker Desktop" specifically (never a blanket process-name kill of
    // something unrelated).
    execSync('powershell -NoProfile -Command "Stop-Process -Name \'Docker Desktop\' -Force -ErrorAction SilentlyContinue"', { stdio: "ignore" });
    console.log("[docker-desktop] Docker Desktop closed.");
  } catch (err) {
    console.error("[docker-desktop] Failed to close Docker Desktop:", err.message);
    return;
  }
  shutdownWsl();
}

(async () => {
  if (mode === "ensure-running") {
    await ensureRunning();
  } else {
    quitIfRunning();
  }
})();
