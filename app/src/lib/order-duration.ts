// Received/Preparing have no cap at all -- they tick upward for as long as
// the order actually sits in that status, however long that is. Only
// Complete is capped, and only by the per-kitchen complete_cap_hours
// setting (or sooner, if the customer clicks "Order Picked Up" -- see
// acknowledged_at) -- see computeCompleteDurationMs below.

export function formatDuration(ms: number): string {
  const clamped = Math.max(ms, 0);
  const totalSeconds = Math.floor(clamped / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  }
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

/** Compact total age for kitchen scanning (for example: <1m, 8m, 2h 14m). */
export function formatOrderAge(ms: number): string {
  if (!Number.isFinite(ms)) return "—";
  const totalMinutes = Math.floor(Math.max(ms, 0) / 60_000);
  if (totalMinutes < 1) return "<1m";
  if (totalMinutes < 60) return `${totalMinutes}m`;

  const totalHours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (totalHours < 24) return minutes > 0 ? `${totalHours}h ${minutes}m` : `${totalHours}h`;

  const days = Math.floor(totalHours / 24);
  const hours = totalHours % 24;
  return hours > 0 ? `${days}d ${hours}h` : `${days}d`;
}

/**
 * Duration spent in one status, given when it started and when it ended
 * (null end means "still in this status" -- caller passes `Date.now()` as
 * `nowMs` for a live-ticking display in that case). Returns null if the
 * status was never entered at all (startAt is null), since there's nothing
 * to measure -- distinct from a real 0:00 duration. No cap here -- this is
 * the Received/Preparing path (and the "completed segment" path for a
 * status the order has already moved past).
 */
export function computeStatusDurationMs(
  startAt: string | null,
  endAt: string | null,
  nowMs: number,
): number | null {
  if (!startAt) return null;
  const start = new Date(startAt).getTime();
  const end = endAt ? new Date(endAt).getTime() : nowMs;
  return end - start;
}

/**
 * Complete's duration is the one status with a real stopping point:
 * - If the customer clicked "Order Picked Up" (acknowledgedAt set), the
 *   counter stops there, however long that took.
 * - Otherwise it ticks live up to the kitchen's own complete_cap_hours
 *   fallback (default 12h) and freezes there, on the assumption nobody's
 *   coming back for an order that old.
 * Returns null if the order never reached Complete at all.
 */
export function computeCompleteDurationMs(
  completeAt: string | null,
  acknowledgedAt: string | null,
  completeCapHours: number,
  nowMs: number,
): number | null {
  if (!completeAt) return null;
  const start = new Date(completeAt).getTime();
  const capMs = completeCapHours * 60 * 60 * 1000;
  if (acknowledgedAt) {
    const end = new Date(acknowledgedAt).getTime();
    return Math.min(end - start, capMs);
  }
  return Math.min(nowMs - start, capMs);
}
