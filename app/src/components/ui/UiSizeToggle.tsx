"use client";

import { useState, FC } from "react";

type UiSize = "small" | "medium" | "big";

const SIZES: { value: UiSize; label: string }[] = [
  { value: "small", label: "S" },
  { value: "medium", label: "M" },
  { value: "big", label: "B" },
];

/**
 * Small/Medium/Big text-and-spacing scale, independent of theme/contrast.
 * Persisted the same way as ThemeToggle/AccessibilityMenu's prefs (localStorage +
 * data-attribute on <html>, applied pre-hydration by layout.tsx's inline
 * script) so a kitchen's shared tablet keeps its preferred size across
 * restarts rather than resetting every reload — the actual use case is
 * rush-hour readability on a device that's rarely, if ever, turned off.
 */
function getAppliedSize(): UiSize {
  if (typeof document === "undefined") return "medium";
  const attr = document.documentElement.getAttribute("data-ui-size");
  return attr === "small" || attr === "big" ? attr : "medium";
}

export const UiSizeToggle: FC<{ className?: string }> = ({ className }) => {
  const [size, setSize] = useState<UiSize>(getAppliedSize);

  const applySize = (next: UiSize) => {
    setSize(next);
    if (next === "medium") {
      document.documentElement.removeAttribute("data-ui-size");
    } else {
      document.documentElement.setAttribute("data-ui-size", next);
    }
    localStorage.setItem("uiSize", next);
  };

  return (
    <div role="group" aria-label="Interface size" className={`flex items-center ${className ?? ""}`}>
      {SIZES.map(({ value, label }) => (
        <button
          key={value}
          onClick={() => applySize(value)}
          aria-pressed={size === value}
          aria-label={`${value.charAt(0).toUpperCase() + value.slice(1)} interface size`}
          className={`w-8 h-8 rounded-[var(--radius-sm)] text-xs font-semibold transition-colors ${
            size === value
              ? "bg-[var(--color-brand)] text-white"
              : "text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-2)] hover:text-[var(--color-text-primary)]"
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  );
};
