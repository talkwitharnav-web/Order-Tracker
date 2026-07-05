"use client";

import { useState, FC } from "react";
import { Contrast as ContrastIcon } from "lucide-react";

type ContrastLevel = "normal" | "high";

/**
 * High-contrast mode, independent of light/dark (see globals.css's
 * [data-contrast="high"] tokens) — mirrors ThemeToggle's exact mechanism
 * (data-attribute on <html> + localStorage), applied before hydration by
 * the same inline script in layout.tsx so there's no flash of normal
 * contrast before this toggles.
 */
function getAppliedContrast(): ContrastLevel {
  if (typeof document === "undefined") return "normal";
  return document.documentElement.getAttribute("data-contrast") === "high" ? "high" : "normal";
}

export const ContrastToggle: FC<{ className?: string }> = ({ className }) => {
  const [contrast, setContrast] = useState<ContrastLevel>(getAppliedContrast);

  const toggle = () => {
    const next: ContrastLevel = contrast === "high" ? "normal" : "high";
    setContrast(next);
    if (next === "high") {
      document.documentElement.setAttribute("data-contrast", "high");
    } else {
      document.documentElement.removeAttribute("data-contrast");
    }
    localStorage.setItem("contrast", next);
  };

  return (
    <button
      onClick={toggle}
      aria-label={contrast === "high" ? "Switch to normal contrast" : "Switch to high contrast"}
      aria-pressed={contrast === "high"}
      title={contrast === "high" ? "High contrast: on" : "High contrast: off"}
      className={`w-7 h-7 flex items-center justify-center rounded-[var(--radius-sm)] transition-colors ${
        contrast === "high"
          ? "bg-[var(--color-brand)] text-white"
          : "text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-2)] hover:text-[var(--color-text-primary)]"
      } ${className ?? ""}`}
    >
      <ContrastIcon size={16} />
    </button>
  );
};
