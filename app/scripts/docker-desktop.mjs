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

  console.log("[docker-desktop] Waiting for the Docker engine to become ready (this can take up to a minute on first launch)...");
  const maxWaitMs = 90000;
  const pollMs = 2000;
  let waited = 0;
  while (waited < maxWaitMs) {
    await new Promise((r) => setTimeout(r, pollMs));
    waited += pollMs;
    if (isDockerEngineReady()) {
      console.log("[docker-desktop] Docker engine is ready.");
      return;
    }
  }
  console.error("[docker-desktop] Docker engine did not become ready within 90s. Check Docker Desktop manually.");
  process.exit(1);
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
  }
}

(async () => {
  if (mode === "ensure-running") {
    await ensureRunning();
  } else {
    quitIfRunning();
  }
})();
