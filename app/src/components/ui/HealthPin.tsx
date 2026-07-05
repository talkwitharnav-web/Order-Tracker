"use client";

import { useEffect, useState } from "react";
import { fetchJson } from "@/lib/api-client";
import type { HealthTier } from "@/app/api/health/route";

type HealthResponse = {
  tier: HealthTier;
  db: { connected: boolean; latencyMs: number | null; pool: { total: number; idle: number; waiting: number } };
  ws: { connectedClients: number };
};

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
const CLIENT_LATENCY_OK_MS = 150;
const CLIENT_LATENCY_BAD_MS = 800;

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
 */
export function HealthPin() {
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [clientLatencyMs, setClientLatencyMs] = useState<number | null>(null);
  const [failed, setFailed] = useState(false);
  const [hovering, setHovering] = useState(false);

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

    poll();
    const interval = setInterval(poll, 10000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  const tier: HealthTier = failed
    ? "terrible"
    : health && clientLatencyMs !== null
      ? worseTier(health.tier, clientTierFromLatency(clientLatencyMs))
      : (health?.tier ?? "ok");
  const config = TIER_CONFIG[tier];

  return (
    <div className="fixed top-4 right-44 z-20" onMouseEnter={() => setHovering(true)} onMouseLeave={() => setHovering(false)}>
      <div className="flex items-center gap-2 px-3 py-1.5 rounded-[var(--radius-full)] bg-[var(--color-surface-1)] border border-[var(--color-border)] text-xs font-medium cursor-default">
        <span className={`w-2 h-2 rounded-full ${config.dot}`} />
        <span className={config.text}>{config.label}</span>
      </div>

      {hovering && (
        <div className="absolute right-0 mt-2 w-64 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface-1)] shadow-lg p-4 text-xs text-[var(--color-text-secondary)]">
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
              <div className="flex justify-between gap-3">
                <dt className="text-[var(--color-text-muted)]">DB pool</dt>
                <dd className="text-[var(--color-text-primary)] font-medium">
                  {health.db.pool.idle}/{health.db.pool.total} idle
                  {health.db.pool.waiting > 0 ? `, ${health.db.pool.waiting} waiting` : ""}
                </dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-[var(--color-text-muted)]">Live listeners</dt>
                <dd className="text-[var(--color-text-primary)] font-medium">{health.ws.connectedClients}</dd>
              </div>
            </dl>
          ) : (
            <p>Checking server health…</p>
          )}
        </div>
      )}
    </div>
  );
}
