import { FC, ReactNode } from "react";
import { ThemeToggle } from "@/components/ui/ThemeToggle";
import { ContrastToggle } from "@/components/ui/ContrastToggle";
import { UiSizeToggle } from "@/components/ui/UiSizeToggle";

/**
 * One unified top-right toolbar for every display-preference control (UI
 * size, high contrast, theme) plus an optional health indicator slot —
 * previously these were separate fixed-position elements (HealthPin,
 * ThemeToggle, etc.) each with their own border/background and manually
 * tuned `right-*` offsets to avoid overlapping one another, which read as
 * a cluttered row of disconnected pills rather than one control group. Now
 * a single bordered/backed container with thin dividers between logical
 * sections — same controls, same independent localStorage keys underneath
 * (see ThemeToggle/ContrastToggle/UiSizeToggle), just visually one thing.
 */
export const SettingsToggles: FC<{ className?: string; health?: ReactNode }> = ({ className, health }) => (
  <div
    className={`fixed top-4 right-4 z-20 flex items-center gap-1 px-1.5 h-9 rounded-[var(--radius-full)] border border-[var(--color-border-strong)] bg-[var(--color-surface-1)] ${className ?? ""}`}
  >
    {health && (
      <>
        {health}
        <span className="w-px h-5 bg-[var(--color-border)]" aria-hidden="true" />
      </>
    )}
    <UiSizeToggle />
    <span className="w-px h-5 bg-[var(--color-border)]" aria-hidden="true" />
    <ContrastToggle />
    <ThemeToggle />
  </div>
);
