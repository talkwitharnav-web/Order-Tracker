// Automatic rolling DB backup -- runs inside the same process as server.js
// (started via startBackupSchedule() below), takes a full pg_dump snapshot
// every BACKUP_INTERVAL_MS, and keeps only the KEEP_COUNT most recent
// snapshots, deleting older ones as new ones land. This exists because a
// real, no-warning DELETE FROM (the admin/db "Seed Database" button, in this
// specific case) can otherwise destroy live data with zero way to recover
// it -- this app previously had no backup mechanism at all (see
// CLAUDE.md/SYSTEM_MEMORY.md's export-tooling notes: export explicitly does
// NOT bring along existing data, by design, since it's a distribution tool
// not a backup tool -- this fills that real, separate gap).
//
// Deliberately modeled like a dashcam's rolling buffer (the user's own
// framing): fixed cadence, fixed small count, oldest one drops off as a new
// one is made. This is NOT a full backup history/versioning system -- it's
// a bounded "undo the last few hours" safety net for exactly the kind of
// mistake that prompted building it, not a substitute for deliberate,
// longer-term backups if this app ever holds data worth keeping forever.

// eslint-disable-next-line @typescript-eslint/no-require-imports -- this file is a plain CJS Node module, required directly by server.js (also CJS)
const { execFile } = require("child_process");
// eslint-disable-next-line @typescript-eslint/no-require-imports -- see above
const fs = require("fs");
// eslint-disable-next-line @typescript-eslint/no-require-imports -- see above
const path = require("path");

const BACKUP_INTERVAL_MS = 3 * 60 * 60 * 1000; // 3 hours
const KEEP_COUNT = 3; // rolling window -- oldest backup is at most KEEP_COUNT * BACKUP_INTERVAL_MS old (~9h)
const BACKUP_DIR = path.join(__dirname, "..", "..", "backups");
const CONTAINER_NAME = process.env.POSTGRES_CONTAINER_NAME || "restaurant-postgres-1";
const DB_USER = process.env.POSTGRES_USER || "restaurant";
const DB_NAME = process.env.POSTGRES_DB || "restaurant";

function timestampForFilename() {
  // Filesystem-safe timestamp (no colons) that still sorts correctly as a
  // plain string, so "3 most recent" can be determined by filename sort
  // alone without parsing dates back out.
  return new Date().toISOString().replace(/[:.]/g, "-");
}

function runBackup() {
  return new Promise((resolve, reject) => {
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
    const filename = `restaurant-backup-${timestampForFilename()}.sql`;
    const filepath = path.join(BACKUP_DIR, filename);

    // `docker exec ... pg_dump` (not a host-installed pg_dump, which may not
    // exist/may be a mismatched version) -- pg_dump is guaranteed present
    // inside the postgres:16 image itself, so this works regardless of what
    // the host machine has installed.
    const child = execFile(
      "docker",
      ["exec", CONTAINER_NAME, "pg_dump", "-U", DB_USER, DB_NAME],
      { maxBuffer: 1024 * 1024 * 1024 }, // 1GB -- generous for a hobby-scale DB dump as plain SQL text
      (err, stdout, stderr) => {
        if (err) {
          reject(new Error(`pg_dump failed: ${err.message}${stderr ? ` -- stderr: ${stderr}` : ""}`));
          return;
        }
        fs.writeFile(filepath, stdout, (writeErr) => {
          if (writeErr) reject(writeErr);
          else resolve(filepath);
        });
      },
    );
    child.stdin?.end();
  });
}

function pruneOldBackups() {
  let files;
  try {
    files = fs
      .readdirSync(BACKUP_DIR)
      .filter((f) => f.startsWith("restaurant-backup-") && f.endsWith(".sql"))
      .sort(); // ISO-ish timestamp in the filename sorts chronologically as plain strings
  } catch {
    return; // directory doesn't exist yet -- nothing to prune
  }

  const toDelete = files.slice(0, Math.max(0, files.length - KEEP_COUNT));
  for (const f of toDelete) {
    try {
      fs.unlinkSync(path.join(BACKUP_DIR, f));
    } catch (err) {
      // Non-fatal -- a failed delete of an old backup just means one extra
      // file sticks around, not a reason to stop backing up new data.
      console.error(`[db-backup] Failed to delete old backup ${f}:`, err.message);
    }
  }
}

async function takeSnapshot() {
  try {
    const filepath = await runBackup();
    pruneOldBackups();
    console.log(`[db-backup] Snapshot saved: ${filepath}`);
  } catch (err) {
    // A failed backup attempt (Docker not running, container renamed, etc.)
    // must never crash the server -- this is a background safety net, not
    // a request the app depends on. Logged loudly so it's visible in the
    // server's own console output, not swallowed silently.
    console.error("[db-backup] Snapshot failed (will retry on the next scheduled run):", err.message);
  }
}

/**
 * Starts the recurring backup schedule. Takes one snapshot shortly after
 * startup (so a fresh `npm run dev`/`node server.js` doesn't wait a full
 * 3 hours before the first safety net exists), then one every
 * BACKUP_INTERVAL_MS after that for as long as the process runs.
 */
function startBackupSchedule() {
  const STARTUP_DELAY_MS = 30_000; // let Postgres/the app finish settling first
  setTimeout(takeSnapshot, STARTUP_DELAY_MS);
  setInterval(takeSnapshot, BACKUP_INTERVAL_MS);
}

module.exports = { startBackupSchedule, takeSnapshot, BACKUP_DIR, BACKUP_INTERVAL_MS, KEEP_COUNT };
