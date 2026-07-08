"use client";

import { useState, useEffect, FC } from "react";
import { Sun, Moon } from "lucide-react";

type Theme = "light" | "dark";

function getAppliedTheme(): Theme {
  return document.documentElement.getAttribute("data-theme") === "dark" ? "dark" : "light";
}

// How long the [data-theme-transitioning] window stays open -- must be >=
// the longest transition-duration + transition-delay any themed element
// uses under it in globals.css (currently 0.45s + 0.14s = 0.59s), padded
// slightly so the attribute doesn't get pulled off mid-fade.
const TRANSITION_WINDOW_MS = 650;

/**
 * Swaps the theme with a soft, layered color cross-fade (background first,
 * then cards/nav, then everything else -- see globals.css's
 * [data-theme-transitioning] rules) instead of an instant flip. A previous
 * version used the View Transitions API for a directional wipe/circle
 * reveal; that was explicitly rejected in favor of this calmer fade (see
 * CLAUDE.md). Reduce Motion collapses this to an instant swap via the same
 * rules, nothing extra needed here.
 */
function runThemeTransition(applyTheme: () => void) {
  const root = document.documentElement;
  root.setAttribute("data-theme-transitioning", "");
  applyTheme();
  window.setTimeout(() => {
    root.removeAttribute("data-theme-transitioning");
  }, TRANSITION_WINDOW_MS);
}

export const ThemeToggle: FC<{ className?: string }> = ({ className }) => {
  // Starts null (server and first client render always agree on "unknown"),
  // then syncs to the theme the no-flash script already applied to <html>.
  // Reading document.* during the initial render (even lazily) diverges from
  // SSR's "no document" state and trips a hydration mismatch.
  const [theme, setTheme] = useState<Theme | null>(null);

  useEffect(() => {
    setTheme(getAppliedTheme());
  }, []);

  const toggle = () => {
    const next: Theme = theme === "dark" ? "light" : "dark";
    runThemeTransition(() => {
      setTheme(next);
      document.documentElement.setAttribute("data-theme", next);
      localStorage.setItem("theme", next);
    });
  };

  if (theme === null) {
    return <button aria-hidden className={`w-8 h-8 ${className ?? ""}`} />;
  }

  return (
    <button
      onClick={toggle}
      aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
      className={`w-8 h-8 flex items-center justify-center rounded-[var(--radius-sm)] text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-2)] hover:text-[var(--color-text-primary)] transition-colors ${className ?? ""}`}
    >
      {theme === "dark" ? <Sun size={16} /> : <Moon size={16} />}
    </button>
  );
};
