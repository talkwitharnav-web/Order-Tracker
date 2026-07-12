"use client";

import { FC, useEffect, useRef, useState } from "react";
import { fetchJson } from "@/lib/api-client";
import { useDropdownReveal } from "@/lib/useDropdownReveal";

const RESYNC_INTERVAL_MS = 60 * 60 * 1000;
// A resync only matters once device clock drift is large enough to actually
// shift the displayed minute -- ordinary request-latency jitter (a few
// hundred ms either way) is not real drift and would otherwise reset the
// tick to a slightly-off value every single hour for no visible reason.
const DRIFT_CORRECTION_THRESHOLD_MS = 2000;

/**
 * Small clock pin for the kitchen dashboard toolbar (SettingsToggles' new
 * `showClock` slot, between HealthPin and the S/M/B interface-size toggle).
 * Shows the kitchen device's own local time in its own detected timezone
 * (`Intl.DateTimeFormat().resolvedOptions().timeZone` -- whatever the OS/
 * browser is actually set to, not a restaurant-configured setting), ticking
 * once a second from `Date.now() + driftMs`.
 *
 * `driftMs` is what keeps this "as precise as possible" per spec: once an
 * hour, it fetches /api/health (already authenticated, already polled by
 * this same dashboard, so this adds no new server surface) and compares its
 * `checkedAt` server timestamp against this device's own Date.now() at
 * receipt. The difference becomes the new correction applied to every tick
 * afterward -- so a kitchen tablet with a device clock that's slow/fast (a
 * dead CMOS battery, never-synced NTP, manually-set wrong) still displays
 * true time, not just whatever the device itself believes.
 *
 * The seconds/full-timezone-name detail lives in a themed hover/tap
 * dropdown (same useDropdownReveal-driven pattern as HealthPin's own
 * popover), not the native `title` attribute -- a browser tooltip reads as
 * an OS affordance bolted onto the pin, not part of the product.
 */
export const KitchenClock: FC = () => {
  const [now, setNow] = useState<Date | null>(null);
  const [timeZone, setTimeZone] = useState<string | null>(null);
  const [hovering, setHovering] = useState(false);
  const [tapped, setTapped] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const driftMsRef = useRef(0);

  // Hover alone doesn't work on touch devices -- same tap-toggle-plus-
  // outside-click fallback as HealthPin/AccessibilityMenu.
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
    setTimeZone(Intl.DateTimeFormat().resolvedOptions().timeZone);
  }, []);

  useEffect(() => {
    let cancelled = false;

    const resync = async () => {
      const requestStarted = Date.now();
      try {
        const data = await fetchJson<{ checkedAt: string }>("/api/health", {}, { retries: 0 });
        if (cancelled) return;
        // Halves the round-trip time and adds it back, the same correction
        // NTP itself uses -- checkedAt was stamped on the server roughly
        // halfway between when this request left and its response arrived,
        // not at the instant the response reached the client.
        const roundTripMs = Date.now() - requestStarted;
        const serverNowAtReceipt = new Date(data.checkedAt).getTime() + roundTripMs / 2;
        const measuredDrift = serverNowAtReceipt - Date.now();
        if (Math.abs(measuredDrift - driftMsRef.current) > DRIFT_CORRECTION_THRESHOLD_MS) {
          driftMsRef.current = measuredDrift;
        }
      } catch {
        // A failed resync just means the next hourly attempt tries again --
        // the clock keeps ticking off whatever drift correction (possibly
        // zero, on first load) it already had rather than freezing.
      }
    };

    resync();
    const resyncTimer = setInterval(resync, RESYNC_INTERVAL_MS);
    const tickTimer = setInterval(() => setNow(new Date(Date.now() + driftMsRef.current)), 1000);
    return () => {
      cancelled = true;
      clearInterval(resyncTimer);
      clearInterval(tickTimer);
    };
  }, []);

  if (!now || !timeZone) return null;

  const time = new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZone,
  }).format(now);

  const timeWithSeconds = new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
    timeZone,
  }).format(now);

  const zoneAbbr = new Intl.DateTimeFormat("en-US", {
    timeZoneName: "short",
    timeZone,
  })
    .formatToParts(now)
    .find((part) => part.type === "timeZoneName")?.value;

  // "America/Los_Angeles" -> "Los Angeles" -- the region prefix and
  // underscores are IANA identifier syntax, not something a kitchen worker
  // reads as a place name at a glance.
  const readableZoneName = timeZone.split("/").pop()?.replace(/_/g, " ") ?? timeZone;

  return (
    <div
      ref={containerRef}
      className="relative flex items-center"
      onMouseEnter={() => setHovering(true)}
      onMouseLeave={() => setHovering(false)}
    >
      <button
        type="button"
        onClick={() => setTapped((t) => !t)}
        aria-label="Kitchen clock details"
        className="px-2.5 h-8 inline-flex items-center text-xs font-medium text-[var(--color-text-secondary)] whitespace-nowrap cursor-pointer"
      >
        {time}
        {zoneAbbr && <span className="ml-1 text-[var(--color-text-muted)]">{zoneAbbr}</span>}
      </button>

      {showPopover && (
        <div
          className={`${popoverAnimationClass} absolute right-0 top-full mt-2 w-56 max-w-[calc(100vw-2rem)] rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface-1)] shadow-lg p-4 text-xs text-[var(--color-text-secondary)] z-30`}
        >
          <dl className="space-y-1.5">
            <div className="flex justify-between gap-3">
              <dt className="text-[var(--color-text-muted)]">Time</dt>
              <dd className="text-[var(--color-text-primary)] font-medium tabular-nums">{timeWithSeconds}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-[var(--color-text-muted)]">Timezone</dt>
              <dd className="text-[var(--color-text-primary)] font-medium text-right">
                {readableZoneName}
                {zoneAbbr ? ` (${zoneAbbr})` : ""}
              </dd>
            </div>
          </dl>
        </div>
      )}
    </div>
  );
};
