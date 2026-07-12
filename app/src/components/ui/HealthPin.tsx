"use client";

import { useEffect, useRef, useState } from "react";
import { fetchJson } from "@/lib/api-client";
import { useDropdownReveal } from "@/lib/useDropdownReveal";
import type { HealthTier } from "@/app/api/health/route";

type HealthResponse = {
  tier: HealthTier;
  db: {
    connected: boolean;
    latencyMs: number | null;
    sizeBytes: number | null;
    auditSizeBytes: number | null;
    // Admin-only detail -- null for a kitchen-account caller (see
    // SECURITY_ATTACK_LOG.md's "Health Endpoint Leaks Infrastructure
    // Details" finding). tier/latencyMs (the signal a kitchen actually
    // needs) are unaffected.
    pool: { total: number; idle: number; waiting: number } | null;
  };
  ws: { connectedClients: number | null };
};

// K/M/G/T, not KB/MB/GB/TB -- matches the single-letter size chip the user
// asked for. Binary (1024-based) units, since that's what Postgres's own
// pg_database_size() and every disk-usage tool actually measures in.
function formatBytes(bytes: number): string {
  const units = ["B", "K", "M", "G", "T"];
  let value = bytes;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex++;
  }
  const precision = unitIndex === 0 ? 0 : value < 10 ? 1 : 0;
  return `${value.toFixed(precision)}${units[unitIndex]}`;
}

const TIER_CONFIG: Record<HealthTier, { label: string; dot: string; text: string }> = {
  healthy: { label: "Healthy", dot: "bg-[var(--color-success)]", text: "text-[var(--color-success)]" },
  ok: { label: "OK", dot: "bg-[var(--color-status-preparing-icon)]", text: "text-[var(--color-status-preparing-text)]" },
  bad: { label: "Bad", dot: "bg-[var(--color-danger)]", text: "text-[var(--color-danger)]" },
  terrible: { label: "Terrible", dot: "bg-[var(--color-danger)] animate-pulse", text: "text-[var(--color-danger)]" },
};

// The client's own round-trip to /api/health includes the caller's network
// hop (their wifi, their ISP) on top of the server's own DB-latency number —
// this is what lets the pin reflect "the kitchen's internet is bad" even
// when the server and DB are both perfectly healthy, per the requested
// "not just server performance" ask.
//
// These were originally 150/800, which turned out to be too tight: ordinary
// browser/OS jitter (a GC pause, Docker Desktop overhead, the tab having
// been backgrounded) routinely pushes even a healthy same-LAN round-trip
// past 150ms, which made the pill flicker between healthy/ok on a
// perfectly fine connection -- most visible while NOT hovering, since
// hovering forces an immediate fresh poll that tends to land on a warm,
// fast sample. Loosened to thresholds that only trip on latency a real
// user would actually notice.
const CLIENT_LATENCY_OK_MS = 400;
const CLIENT_LATENCY_BAD_MS = 1500;

const POLL_INTERVAL_MS = 10000;
// While the popover is actually open (hovered on desktop, tapped on
// touch), the user is looking right at these numbers -- poll much faster
// so they read as close to live. Reverts to the standard cadence the
// instant it closes, rather than staying fast in the background.
const POLL_INTERVAL_ACTIVE_MS = 1500;

function worseTier(a: HealthTier, b: HealthTier): HealthTier {
  const order: HealthTier[] = ["healthy", "ok", "bad", "terrible"];
  return order.indexOf(a) >= order.indexOf(b) ? a : b;
}

function clientTierFromLatency(ms: number): HealthTier {
  if (ms > CLIENT_LATENCY_BAD_MS) return "bad";
  if (ms > CLIENT_LATENCY_OK_MS) return "ok";
  return "healthy";
}

/**
 * Polls GET /api/health and shows a small status pin summarizing DB
 * latency/pool saturation, live WS listener count, and the caller's own
 * round-trip time to the server (so a kitchen with bad wifi sees a degraded
 * pin even if the server itself is fine). Polling pauses when the tab is
 * backgrounded. The endpoint is server-side auth-gated (see /api/health) —
 * this component only renders what an authenticated response returns, it
 * has no say over whether the data is available.
 *
 * `showDbSize` additionally renders the DB's total on-disk size (K/M/G/T,
 * human-readable) inline in the pill itself — opt-in, and only passed from
 * admin/db, since disk usage isn't something a kitchen needs to see on
 * every page, but is directly relevant on the page that manages the DB.
 *
 * `showAuditSize` is the same idea but for just the order_status_events
 * table (pg_total_relation_size, so it includes that table's own indexes,
 * not the whole database) -- opt-in, only passed from admin/audit, since
 * that page's own Purge Audit Log button is what this size is actually
 * relevant to, the same way showDbSize pairs with admin/db's Purge Database.
 */
export function HealthPin({
  showDbSize = false,
  showAuditSize = false,
}: { showDbSize?: boolean; showAuditSize?: boolean } = {}) {
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [clientLatencyMs, setClientLatencyMs] = useState<number | null>(null);
  const [failed, setFailed] = useState(false);
  const [hovering, setHovering] = useState(false);
  const [tapped, setTapped] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Hover alone (onMouseEnter/onMouseLeave) doesn't reliably work on touch
  // devices — there's no mouse, so the detail popover would be unreachable
  // on a phone/tablet. A tap toggles a separate `tapped` state (independent
  // of hover, which still works for desktop mouse users), closed by tapping
  // anywhere outside — same outside-click pattern as AccessibilityMenu.
  useEffect(() => {
    if (!tapped) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setTapped(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [tapped]);

  const isActive = hovering || tapped;
  const { shouldRender: showPopover, animationClass: popoverAnimationClass } = useDropdownReveal(isActive);

  useEffect(() => {
    let cancelled = false;

    const poll = async () => {
      if (document.visibilityState !== "visible") return;
      const started = performance.now();
      try {
        const data = await fetchJson<HealthResponse>("/api/health", {}, { retries: 0 });
        const elapsed = performance.now() - started;
        if (!cancelled) {
          setHealth(data);
          setClientLatencyMs(Math.round(elapsed));
          setFailed(false);
        }
      } catch {
        if (!cancelled) setFailed(true);
      }
    };

    // Fetch immediately whenever the active state flips on, so opening the
    // popover shows a fresh reading rather than waiting for the next tick
    // of whichever interval was already running. Debounced (not fired
    // synchronously) so rapidly flicking the cursor on/off the pin -- which
    // re-runs this effect on every single hover toggle -- can't spam an
    // immediate request per toggle; only a toggle that actually settles for
    // a moment triggers one. A real hover/tap that stays active long enough
    // to read the popover always still gets its fresh reading within 250ms.
    const immediate = setTimeout(poll, 250);
    const interval = setInterval(poll, isActive ? POLL_INTERVAL_ACTIVE_MS : POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearTimeout(immediate);
      clearInterval(interval);
    };
  }, [isActive]);

  const tier: HealthTier = failed
    ? "terrible"
    : health && clientLatencyMs !== null
      ? worseTier(health.tier, clientTierFromLatency(clientLatencyMs))
      : (health?.tier ?? "ok");
  const config = TIER_CONFIG[tier];

  return (
    <div
      ref={containerRef}
      className="relative flex items-center gap-1.5 px-2.5 h-8 rounded-[var(--radius-sm)] text-xs font-medium cursor-pointer"
      onMouseEnter={() => setHovering(true)}
      onMouseLeave={() => setHovering(false)}
      onClick={() => setTapped((t) => !t)}
      role="button"
      tabIndex={0}
      aria-label="Server health details"
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          setTapped((t) => !t);
        }
      }}
    >
      <span className={`w-2 h-2 rounded-full shrink-0 animate-health-pulse ${config.dot}`} />
      <span className={`${config.text} whitespace-nowrap`}>{config.label}</span>
      {showDbSize && health?.db.sizeBytes != null && (
        <span className="text-[var(--color-text-muted)] whitespace-nowrap">· {formatBytes(health.db.sizeBytes)}</span>
      )}
      {showAuditSize && health?.db.auditSizeBytes != null && (
        <span className="text-[var(--color-text-muted)] whitespace-nowrap">· {formatBytes(health.db.auditSizeBytes)}</span>
      )}

      {showPopover && (
        <div className={`${popoverAnimationClass} absolute right-0 top-full mt-2 w-64 max-w-[calc(100vw-2rem)] rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface-1)] shadow-lg p-4 text-xs text-[var(--color-text-secondary)] z-30`}>
          {failed ? (
            <p className="text-[var(--color-danger)]">Health check request failed — server may be unreachable.</p>
          ) : health ? (
            <dl className="space-y-1.5">
              <div className="flex justify-between gap-3">
                <dt className="text-[var(--color-text-muted)]">Your connection</dt>
                <dd className="text-[var(--color-text-primary)] font-medium">
                  {clientLatencyMs !== null ? `${clientLatencyMs}ms` : "—"}
                </dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-[var(--color-text-muted)]">Database</dt>
                <dd className="text-[var(--color-text-primary)] font-medium">
                  {health.db.connected ? `${health.db.latencyMs}ms` : "disconnected"}
                </dd>
              </div>
              {showDbSize && health.db.sizeBytes != null && (
                <div className="flex justify-between gap-3">
                  <dt className="text-[var(--color-text-muted)]">DB size</dt>
                  <dd className="text-[var(--color-text-primary)] font-medium">{formatBytes(health.db.sizeBytes)}</dd>
                </div>
              )}
              {showAuditSize && health.db.auditSizeBytes != null && (
                <div className="flex justify-between gap-3">
                  <dt className="text-[var(--color-text-muted)]">Audit log size</dt>
                  <dd className="text-[var(--color-text-primary)] font-medium">{formatBytes(health.db.auditSizeBytes)}</dd>
                </div>
              )}
              {health.db.pool && (
                <div className="flex justify-between gap-3">
                  <dt className="text-[var(--color-text-muted)]">DB pool</dt>
                  <dd className="text-[var(--color-text-primary)] font-medium">
                    {health.db.pool.idle}/{health.db.pool.total} idle
                    {health.db.pool.waiting > 0 ? `, ${health.db.pool.waiting} waiting` : ""}
                  </dd>
                </div>
              )}
              {health.ws.connectedClients != null && (
                <div className="flex justify-between gap-3">
                  <dt className="text-[var(--color-text-muted)]">Live listeners</dt>
                  <dd className="text-[var(--color-text-primary)] font-medium">{health.ws.connectedClients}</dd>
                </div>
              )}
            </dl>
          ) : (
            <p>Checking server health…</p>
          )}
        </div>
      )}
    </div>
  );
}
