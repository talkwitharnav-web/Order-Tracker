"use client";

import { FC, ReactNode, useRef } from "react";
import { ThemeToggle } from "@/components/ui/ThemeToggle";
import { AccessibilityMenu } from "@/components/ui/AccessibilityMenu";
import { UiSizeToggle } from "@/components/ui/UiSizeToggle";
import { MascotStyleToggle } from "@/components/ui/MascotStyleToggle";
import { FunnyChefToggle } from "@/components/ui/FunnyChefToggle";
import { ThemedTooltip } from "@/components/ui/ThemedTooltip";
import { FullscreenToggle } from "@/components/ui/FullscreenToggle";
import { useReservedTopRight } from "@/lib/useReservedTopRight";
import { useHasMascot } from "@/lib/mascot-style";

/**
 * One unified top-right toolbar for every display-preference control (UI
 * size, accessibility, theme) plus an optional health indicator slot —
 * previously these were separate fixed-position elements (HealthPin,
 * ThemeToggle, etc.) each with their own border/background and manually
 * tuned `right-*` offsets to avoid overlapping one another, which read as
 * a cluttered row of disconnected pills rather than one control group. Now
 * a single bordered/backed container with thin dividers between logical
 * sections. High contrast used to be its own standalone icon button here —
 * it's now one option inside AccessibilityMenu's dropdown, alongside Reduce
 * Motion and Enhanced Focus Outline (see accessibility-prefs.ts), so this
 * toolbar doesn't grow a new icon every time another accessibility option
 * is added.
 */
export const SettingsToggles: FC<{
  className?: string;
  health?: ReactNode;
  mobileNavigation?: ReactNode;
}> = ({ className, health, mobileNavigation }) => {
  const ref = useRef<HTMLDivElement>(null);
  useReservedTopRight(ref);
  // The 2D/3D chef toggle only makes sense where a chef is actually rendered.
  const hasMascot = useHasMascot();

  return (
  <div
    ref={ref}
    className={`fixed top-4 right-4 z-40 flex items-center gap-1 px-1.5 h-10 rounded-[var(--radius-full)] border border-[var(--color-border-strong)] bg-[var(--color-surface-1)] ${className ?? ""}`}
  >
    {mobileNavigation && (
      <>
        <span className="md:hidden inline-flex">{mobileNavigation}</span>
        <span className="md:hidden w-px h-5 bg-[var(--color-border)]" aria-hidden="true" />
      </>
    )}
    {health && (
      <>
        {health}
        <span className="w-px h-5 bg-[var(--color-border)]" aria-hidden="true" />
      </>
    )}
    <ThemedTooltip label="Interface size">
      <span className="hidden sm:inline-flex">
        <UiSizeToggle />
      </span>
    </ThemedTooltip>
    <span className="hidden sm:block w-px h-5 bg-[var(--color-border)]" aria-hidden="true" />
    <AccessibilityMenu />
    {hasMascot && (
      <>
        <ThemedTooltip label="2D / 3D chef">
          <MascotStyleToggle />
        </ThemedTooltip>
        <ThemedTooltip label="Funny Chef">
          <FunnyChefToggle />
        </ThemedTooltip>
      </>
    )}
    <ThemedTooltip label="Fullscreen" align="right" className="sm:hidden">
      <FullscreenToggle />
    </ThemedTooltip>
    <ThemedTooltip label="Toggle theme" align="right">
      <ThemeToggle />
    </ThemedTooltip>
  </div>
  );
};
