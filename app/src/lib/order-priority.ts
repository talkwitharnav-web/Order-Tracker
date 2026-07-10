import { normalizeStatus, ORDERED_STATUS_KEYS, type StatusKey } from "@/lib/order-status";
import { computeStatusDurationMs } from "@/lib/order-duration";

/**
 * Kitchen-wide automatic priority ordering (not a user-chosen sort/filter):
 * Received orders first, then Preparing, then Complete -- each group
 * oldest-in-its-current-status first, so whatever needs attention soonest is
 * always at the top. Applies identically to Home (all statuses mixed) and
 * to the single-status Received/Preparing/Complete tabs (where the status
 * group is already fixed, so only the within-group oldest-first part acts).
 */
const STATUS_START_FIELD: Record<StatusKey, "received_at" | "preparing_at" | "complete_at"> = {
  received: "received_at",
  preparing: "preparing_at",
  complete: "complete_at",
};

export type PriorityOrder = {
  id: number;
  status: string;
  received_at: string;
  preparing_at: string | null;
  complete_at: string | null;
};

export function sortByPriority<T extends PriorityOrder>(orders: T[]): T[] {
  const statusRank = new Map<StatusKey, number>(ORDERED_STATUS_KEYS.map((key, i) => [key, i]));

  return [...orders].sort((left, right) => {
    const leftStatus = normalizeStatus(left.status);
    const rightStatus = normalizeStatus(right.status);
    const rankDiff = (statusRank.get(leftStatus) ?? 0) - (statusRank.get(rightStatus) ?? 0);
    if (rankDiff !== 0) return rankDiff;

    const leftStart = left[STATUS_START_FIELD[leftStatus]];
    const rightStart = right[STATUS_START_FIELD[rightStatus]];
    const leftTime = leftStart ? new Date(leftStart).getTime() : NaN;
    const rightTime = rightStart ? new Date(rightStart).getTime() : NaN;
    if (!Number.isFinite(leftTime) || !Number.isFinite(rightTime)) return left.id - right.id;
    return leftTime - rightTime || left.id - right.id;
  });
}

/**
 * Minutes an order may spend in each status before it's flagged overdue.
 * Complete's threshold is about customer pickup/accessibility, not kitchen
 * prep speed -- "make sure the customer actually got this" rather than
 * "this took too long to cook."
 */
export const OVERDUE_THRESHOLD_MINUTES: Record<StatusKey, number> = {
  received: 8,
  preparing: 20,
  complete: 10,
};

/** True once an order has spent longer than its status's threshold in that CURRENT status. */
export function isOrderOverdue(order: PriorityOrder, nowMs: number): boolean {
  const status = normalizeStatus(order.status);
  const startAt = order[STATUS_START_FIELD[status]];
  const durationMs = computeStatusDurationMs(startAt, null, nowMs);
  if (durationMs === null) return false;
  return durationMs >= OVERDUE_THRESHOLD_MINUTES[status] * 60_000;
}
