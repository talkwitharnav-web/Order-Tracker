"use client";

import { useEffect, useState, FC } from "react";
import { computeStatusDurationMs, computeCompleteDurationMs, formatDuration } from "@/lib/order-duration";

type ClockListener = (nowMs: number) => void;

const clockListeners = new Set<ClockListener>();
let clockInterval: ReturnType<typeof setInterval> | null = null;

function isUiSizeTransitionRunning() {
  return document.documentElement.getAnimations().some(
    (animation) =>
      typeof CSSTransition !== "undefined"
      && animation instanceof CSSTransition
      && animation.transitionProperty === "font-size"
      && animation.playState === "running",
  );
}

function subscribeToClock(listener: ClockListener) {
  clockListeners.add(listener);
  if (clockInterval === null) {
    clockInterval = setInterval(() => {
      if (isUiSizeTransitionRunning()) return;
      const nowMs = Date.now();
      clockListeners.forEach((notify) => notify(nowMs));
    }, 1000);
  }

  return () => {
    clockListeners.delete(listener);
    if (clockListeners.size === 0 && clockInterval !== null) {
      clearInterval(clockInterval);
      clockInterval = null;
    }
  };
}

function useSharedNowMs(isLive: boolean) {
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    if (!isLive) return;
    return subscribeToClock(setNowMs);
  }, [isLive]);

  return nowMs;
}

/**
 * One duration cell in admin/db's Orders table -- shows how long an order
 * spent in a single status. `startAt` is null if the order never reached
 * this status yet (renders "—", not "0:00", since those mean different
 * things). `endAt` is null while the order is CURRENTLY in this status --
 * in that case the cell ticks upward from the module's shared 1s clock
 * instead of freezing at whatever it was when the page last fetched data.
 * Once `endAt` is set (the order moved past this status), the cell renders a
 * static value with no interval. No cap -- this is the Received/Preparing
 * path (see StatusDurationCompleteCell for Complete's own capped variant).
 */
export const StatusDurationCell: FC<{ startAt: string | null; endAt: string | null }> = ({ startAt, endAt }) => {
  const isLive = !!startAt && !endAt;
  const nowMs = useSharedNowMs(isLive);

  const durationMs = computeStatusDurationMs(startAt, endAt, nowMs);
  if (durationMs === null) {
    return <span className="text-[var(--color-text-muted)]">—</span>;
  }

  return (
    <span className={isLive ? "text-[var(--color-text-primary)] font-medium" : "text-[var(--color-text-secondary)]"}>
      {formatDuration(durationMs)}
    </span>
  );
};

/**
 * Complete's own duration cell -- capped at the kitchen's complete_cap_hours
 * (or sooner, if the customer already acknowledged pickup). Ticks live only
 * from the same shared clock while genuinely still counting. An order deleted
 * mid-Complete freezes at `endAt`, following the same rule as StatusDurationCell.
 */
export const StatusDurationCompleteCell: FC<{
  completeAt: string | null;
  acknowledgedAt: string | null;
  completeCapHours: number;
  endAt: string | null;
}> = ({ completeAt, acknowledgedAt, completeCapHours, endAt }) => {
  const isLive = !!completeAt && !acknowledgedAt && !endAt;
  const nowMs = useSharedNowMs(isLive);

  const effectiveNow = endAt ? new Date(endAt).getTime() : nowMs;
  const durationMs = computeCompleteDurationMs(completeAt, acknowledgedAt, completeCapHours, effectiveNow);
  if (durationMs === null) {
    return <span className="text-[var(--color-text-muted)]">—</span>;
  }

  return (
    <span className={isLive ? "text-[var(--color-text-primary)] font-medium" : "text-[var(--color-text-secondary)]"}>
      {formatDuration(durationMs)}
    </span>
  );
};
