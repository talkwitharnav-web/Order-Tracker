import { FC, useEffect, useRef, useState } from "react";
import { ORDERED_STATUS_KEYS, normalizeStatus, type ApiOrderStatus, type StatusKey } from "@/lib/order-status";

const STEP_LABEL: Record<StatusKey, string> = {
  received: "Received",
  preparing: "Preparing",
  complete: "Complete",
};

const NEXT_API_STATUS: Record<StatusKey, ApiOrderStatus | null> = {
  received: "Preparing",
  preparing: "Complete",
  complete: null,
};

/**
 * Makes the 3-stage order lifecycle an explicit, tappable progress control
 * instead of a single button whose label silently changes with hidden state.
 * Tapping a step advances the order to that status (only the next step is
 * clickable — you can't skip ahead or go backward from here).
 */
export const StatusStepper: FC<{
  status: string;
  onAdvance: (next: ApiOrderStatus) => void;
  /**
   * Only meaningful for a Complete order -- a Complete step tile renders
   * with the orange "not yet picked up" tokens instead of the usual done-
   * green ones until this is set (see globals.css --color-status-complete-
   * pending-* and lib/order-status.ts's COMPLETE_PENDING_VISUAL, which this
   * mirrors directly rather than importing, since StatusStepper renders all
   * 3 steps' tiles from one shared class-string branch, not per-step
   * getStatusVisual calls).
   */
  acknowledgedAt?: string | null;
}> = ({ status, onAdvance, acknowledgedAt }) => {
  const currentKey = normalizeStatus(status);
  const currentIndex = ORDERED_STATUS_KEYS.indexOf(currentKey);
  const [justAdvanced, setJustAdvanced] = useState(false);
  const prevIndexRef = useRef(currentIndex);

  useEffect(() => {
    if (currentIndex > prevIndexRef.current) {
      setJustAdvanced(true);
      const timer = setTimeout(() => setJustAdvanced(false), 350);
      prevIndexRef.current = currentIndex;
      return () => clearTimeout(timer);
    }
    prevIndexRef.current = currentIndex;
  }, [currentIndex]);

  return (
    <div className="flex items-center gap-0.5 sm:gap-1 min-w-0" role="group" aria-label="Order status">
      {ORDERED_STATUS_KEYS.map((key, index) => {
        const isDone = index < currentIndex;
        const isCurrent = index === currentIndex;
        const isNext = index === currentIndex + 1;
        const next = NEXT_API_STATUS[currentKey];
        // The Complete tile is only ever reached via isCurrent (index 2 can
        // never be < currentIndex, there's no step after it) -- so ITS OWN
        // color must distinguish picked-up (green, --color-status-complete-*)
        // from not-yet-picked-up (orange, --color-status-complete-pending-*)
        // rather than sharing the same "current step" orange every other
        // in-progress status uses.
        const isCompleteTile = key === "complete" && isCurrent;
        const isPickedUp = isCompleteTile && !!acknowledgedAt;

        return (
          <div key={key} className="flex items-center gap-0.5 sm:gap-1 flex-1 min-w-0">
            <button
              type="button"
              disabled={!isNext}
              onClick={() => isNext && next && onAdvance(next)}
              aria-current={isCurrent ? "step" : undefined}
              className={`flex-1 min-h-10 sm:min-h-0 py-2 px-1 sm:px-2 text-[10px] sm:text-xs font-semibold rounded-[var(--radius-sm)] transition-colors text-center whitespace-nowrap ${
                isCurrent && justAdvanced ? "animate-step-advance" : ""
              } ${
                isDone
                  ? "bg-[var(--color-status-complete-bg)] text-[var(--color-status-complete-text)] border border-[var(--color-status-complete-border)]"
                  : isPickedUp
                    ? "bg-[var(--color-status-complete-bg)] text-[var(--color-status-complete-text)] border border-[var(--color-status-complete-border)]"
                    : isCompleteTile
                      ? "bg-[var(--color-status-complete-pending-bg)] text-[var(--color-status-complete-pending-text)] border border-[var(--color-status-complete-pending-border)]"
                      : isCurrent
                        ? "bg-[var(--color-status-preparing-bg)] text-[var(--color-status-preparing-text)] border border-[var(--color-status-preparing-border)]"
                        : isNext
                          ? "bg-[var(--color-surface-2)] text-[var(--color-text-secondary)] border border-[var(--color-border-strong)] hover:bg-[var(--color-brand)] hover:text-[var(--color-on-brand)] hover:border-[var(--color-brand)] cursor-pointer"
                          : "bg-transparent text-[var(--color-text-muted)] border border-[var(--color-border)] cursor-not-allowed opacity-50"
              }`}
            >
              {STEP_LABEL[key]}
            </button>
            {index < ORDERED_STATUS_KEYS.length - 1 && (
              <div
                className={`w-2 h-px ${index < currentIndex ? "bg-[var(--color-status-complete-border)]" : "bg-[var(--color-border-strong)]"}`}
              />
            )}
          </div>
        );
      })}
    </div>
  );
};
