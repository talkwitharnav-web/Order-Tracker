import { FC } from "react";
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
}> = ({ status, onAdvance }) => {
  const currentKey = normalizeStatus(status);
  const currentIndex = ORDERED_STATUS_KEYS.indexOf(currentKey);

  return (
    <div className="flex items-center gap-1" role="group" aria-label="Order status">
      {ORDERED_STATUS_KEYS.map((key, index) => {
        const isDone = index < currentIndex;
        const isCurrent = index === currentIndex;
        const isNext = index === currentIndex + 1;
        const next = NEXT_API_STATUS[currentKey];

        return (
          <div key={key} className="flex items-center gap-1 flex-1">
            <button
              type="button"
              disabled={!isNext}
              onClick={() => isNext && next && onAdvance(next)}
              aria-current={isCurrent ? "step" : undefined}
              className={`flex-1 py-2 px-2 text-xs font-semibold rounded-[var(--radius-sm)] transition-colors text-center ${
                isDone
                  ? "bg-[var(--color-status-complete-bg)] text-[var(--color-status-complete-text)] border border-[var(--color-status-complete-border)]"
                  : isCurrent
                    ? "bg-[var(--color-status-preparing-bg)] text-[var(--color-status-preparing-text)] border border-[var(--color-status-preparing-border)]"
                    : isNext
                      ? "bg-[var(--color-surface-2)] text-[var(--color-text-secondary)] border border-[var(--color-border-strong)] hover:bg-[var(--color-brand)] hover:text-white hover:border-[var(--color-brand)] cursor-pointer"
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
