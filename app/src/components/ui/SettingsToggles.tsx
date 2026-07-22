"use client";

import { CSSProperties, FC, ReactNode, useLayoutEffect, useRef, useState } from "react";
import { ChevronRight, Settings } from "lucide-react";
import { ThemeToggle } from "@/components/ui/ThemeToggle";
import { AccessibilityMenu } from "@/components/ui/AccessibilityMenu";
import { UiSizeToggle } from "@/components/ui/UiSizeToggle";
import { MascotStyleToggle } from "@/components/ui/MascotStyleToggle";
import { FunnyChefToggle } from "@/components/ui/FunnyChefToggle";
import { ThemedTooltip } from "@/components/ui/ThemedTooltip";
import { FullscreenToggle } from "@/components/ui/FullscreenToggle";
import { KitchenClock } from "@/components/ui/KitchenClock";
import { HelpLink } from "@/components/ui/HelpLink";
import { useReservedTopRight } from "@/lib/useReservedTopRight";
import { useHasMascot } from "@/lib/mascot-style";

const UNRAVEL_DURATION_MS = 450;

function reduceMotionIsActive(): boolean {
  if (document.documentElement.getAttribute("data-motion") === "reduced") return true;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

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
  /**
   * Shows the kitchen-device local clock (KitchenClock) between the health
   * pin and the S/M/B interface-size toggle -- opt-in the same way `health`
   * is, since not every SettingsToggles caller is the kitchen dashboard
   * (see Dashboard.tsx's KitchenDashboardContent, the one place that passes
   * this true today).
   */
  showClock?: boolean;
}> = ({ className, health, mobileNavigation, showClock = false }) => {
  const reservedAreaRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const revealTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [expandedWidth, setExpandedWidth] = useState(0);
  const [revealSettled, setRevealSettled] = useState(false);
  useReservedTopRight(reservedAreaRef);
  // The 2D/3D chef toggle only makes sense where a chef is actually rendered.
  const hasMascot = useHasMascot();

  useLayoutEffect(() => {
    const content = contentRef.current;
    if (!content) return;

    const measure = () => {
      setExpandedWidth(
        Math.max(
          Math.ceil(content.scrollWidth),
          Math.ceil(content.getBoundingClientRect().height),
        ),
      );
    };

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(content);
    window.addEventListener("resize", measure);

    return () => {
      observer.disconnect();
      window.removeEventListener("resize", measure);
      if (revealTimerRef.current) clearTimeout(revealTimerRef.current);
    };
  }, []);

  useLayoutEffect(() => {
    window.dispatchEvent(new Event("resize"));
  }, [expanded, expandedWidth]);

  const pillStyle: CSSProperties & {
    "--settings-glaze-body": string;
    "--settings-glaze-backdrop-filter": string;
    "--settings-glaze-left-warmth": string;
    "--settings-glaze-right-warmth": string;
  } = {
    width: expanded && expandedWidth > 0 ? `${expandedWidth}px` : undefined,
    "--settings-glaze-body": "color-mix(in oklab, color-mix(in oklab, var(--color-surface-1) 88%, var(--color-brand) 12%) 29%, transparent)",
    "--settings-glaze-backdrop-filter": "blur(1.5px) saturate(145%)",
    "--settings-glaze-left-warmth": "color-mix(in oklab, var(--color-brand) 16%, transparent)",
    "--settings-glaze-right-warmth": "color-mix(in oklab, var(--color-brand) 22%, transparent)",
    backdropFilter: "var(--settings-glaze-backdrop-filter)",
    WebkitBackdropFilter: "var(--settings-glaze-backdrop-filter)",
  };

  const toggleExpanded = () => {
    if (revealTimerRef.current) clearTimeout(revealTimerRef.current);

    const nextExpanded = !expanded;
    setRevealSettled(false);
    setExpanded(nextExpanded);

    if (nextExpanded) {
      const duration = reduceMotionIsActive() ? 0 : UNRAVEL_DURATION_MS;
      revealTimerRef.current = setTimeout(() => setRevealSettled(true), duration);
    }
  };

  const controlsAreInteractive = expanded && revealSettled;

  return (
    <div
      ref={reservedAreaRef}
      className={`fixed top-4 right-4 z-40 flex items-start gap-2 h-10 ${className ?? ""}`}
    >
      {mobileNavigation && (
        <div className="md:hidden flex items-center justify-center w-10 h-10 rounded-[var(--radius-full)] border border-[var(--color-border-strong)] bg-[var(--color-surface-1)]">
          {mobileNavigation}
        </div>
      )}

      <div
        className={`settings-pill relative h-10 border border-[var(--color-border-strong)] bg-[var(--color-surface-1)] ${
          expanded ? "settings-pill-expanded" : "settings-pill-collapsed"
        }`}
        data-glaze="on"
        style={pillStyle}
        onTransitionEnd={(event) => {
          if (event.propertyName !== "width") return;
          if (expanded) setRevealSettled(true);
          window.dispatchEvent(new Event("resize"));
        }}
      >
        <div
          className={`settings-pill-reveal-window absolute inset-0 ${
            expanded && revealSettled ? "overflow-visible" : "overflow-hidden"
          }`}
        >
          <div
            ref={contentRef}
            id="settings-pill-controls"
            className={`settings-pill-content absolute inset-y-0 right-0 flex items-center gap-1 px-1.5 pr-10 h-full w-max ${
              expanded ? "settings-pill-content-expanded" : "settings-pill-content-collapsed"
            }`}
            aria-hidden={!controlsAreInteractive}
            inert={!controlsAreInteractive ? true : undefined}
          >
            {health && (
              <>
                {health}
                <span className="w-px h-5 bg-[var(--color-border)]" aria-hidden="true" />
              </>
            )}
            {showClock && (
              <>
                <KitchenClock />
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
            <ThemedTooltip label="Help page" align="right">
              <HelpLink />
            </ThemedTooltip>
            <ThemedTooltip label="Toggle theme" align="right">
              <ThemeToggle />
            </ThemedTooltip>
          </div>
        </div>

        <div className="absolute top-1 right-1">
          <button
            type="button"
            onClick={toggleExpanded}
            aria-label={expanded ? "Collapse settings" : "Open settings"}
            aria-expanded={expanded}
            aria-controls="settings-pill-controls"
            className="settings-pill-toggle w-8 h-8 flex items-center justify-center rounded-[var(--radius-sm)] text-[var(--color-text-secondary)] transition-colors"
          >
            <span key={expanded ? "collapse" : "open"} className="settings-pill-toggle-icon inline-flex">
              {expanded ? (
                <ChevronRight className="w-[1.0625rem] h-[1.0625rem]" />
              ) : (
                <Settings className="w-[1.0625rem] h-[1.0625rem]" />
              )}
            </span>
          </button>
        </div>
      </div>
    </div>
  );
};
