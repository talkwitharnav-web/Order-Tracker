"use client";

import { useState, FC, ReactNode } from "react";

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
export const ThemedTooltip: FC<{ label: string; children: ReactNode; className?: string }> = ({
  label,
  children,
  className,
}) => {
  const [hovering, setHovering] = useState(false);

  return (
    <div
      className={`relative inline-flex ${className ?? ""}`}
      onMouseEnter={() => setHovering(true)}
      onMouseLeave={() => setHovering(false)}
      onFocus={() => setHovering(true)}
      onBlur={() => setHovering(false)}
    >
      {children}
      {hovering && (
        <div
          role="tooltip"
          className="absolute left-1/2 -translate-x-1/2 top-full mt-2 z-40 whitespace-nowrap px-2.5 py-1.5 rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface-1)] text-[var(--color-text-primary)] text-xs font-medium shadow-lg pointer-events-none"
        >
          {label}
        </div>
      )}
    </div>
  );
};
