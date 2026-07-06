"use client";

import { useState, useEffect, FC } from "react";
import { Sun, Moon } from "lucide-react";

type Theme = "light" | "dark";

function getAppliedTheme(): Theme {
  return document.documentElement.getAttribute("data-theme") === "dark" ? "dark" : "light";
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
    setTheme(next);
    document.documentElement.setAttribute("data-theme", next);
    localStorage.setItem("theme", next);
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
