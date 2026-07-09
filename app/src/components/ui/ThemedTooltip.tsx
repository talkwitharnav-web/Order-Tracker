"use client";

import { useState, FC, ReactNode } from "react";
import { useDropdownReveal } from "@/lib/useDropdownReveal";

/**
 * A small themed tooltip shown on hover, driven entirely by React state
 * (not the native `title` attribute) — matches the app's own card styling
 * (surface/border/radius tokens) instead of the browser's plain OS tooltip
 * box, so it reads as part of the product rather than a generic browser
 * affordance. Used for controls where the native title tooltip would look
 * out of place next to the app's own themed hover cards (e.g. HealthPin's
 * stats popover already does this by hand — this factors that pattern out
 * for reuse by the Accessibility menu button).
 */
export const ThemedTooltip: FC<{
  label: string;
  children: ReactNode;
  className?: string;
  align?: "center" | "right";
  disabled?: boolean;
}> = ({
  label,
  children,
  className,
  align = "center",
  disabled = false,
}) => {
  const [hovering, setHovering] = useState(false);
  const { shouldRender, animationClass } = useDropdownReveal(hovering && !disabled);

  // "center" anchors under the middle of the trigger (fine for controls with
  // room on both sides); "right" anchors flush to the trigger's right edge
  // instead -- for a trigger sitting at the far-right edge of the viewport
  // (e.g. ThemeToggle inside SettingsToggles' fixed top-right toolbar), a
  // centered whitespace-nowrap tooltip can overflow off-screen to the right
  // since it has no viewport-edge clamping of its own.
  const alignmentClasses =
    align === "right" ? "right-0" : "left-1/2 -translate-x-1/2";

  return (
    <div
      className={`relative inline-flex ${className ?? ""}`}
      onMouseEnter={() => setHovering(true)}
      onMouseLeave={() => setHovering(false)}
      onFocus={() => setHovering(true)}
      onBlur={() => setHovering(false)}
    >
      {children}
      {shouldRender && (
        <div
          role="tooltip"
          className={`${animationClass} absolute ${alignmentClasses} top-full mt-2 z-40 max-w-[calc(100vw-2rem)] whitespace-nowrap px-2.5 py-1.5 rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface-1)] text-[var(--color-text-primary)] text-xs font-medium shadow-lg pointer-events-none`}
        >
          {label}
        </div>
      )}
    </div>
  );
};
