"use client";

import { useState, useEffect, FC, MouseEvent } from "react";
import { Sun, Moon } from "lucide-react";

type Theme = "light" | "dark";

function getAppliedTheme(): Theme {
  return document.documentElement.getAttribute("data-theme") === "dark" ? "dark" : "light";
}

// A handful of distinct reveal shapes for the light/dark transition, picked
// at random each toggle so it doesn't feel identical every time. Each
// returns a CSS clip-path pair (start, end) for the View Transitions
// pseudo-element to animate between -- see runThemeTransition() below.
// Circle-based ones need the click position and viewport size to compute a
// radius large enough to fully cover the screen from that origin.
type ClipPathPair = { from: string; to: string };

function buildClipPaths(originX: number, originY: number): ClipPathPair {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const maxRadius = Math.hypot(Math.max(originX, vw - originX), Math.max(originY, vh - originY));

  const variants: (() => ClipPathPair)[] = [
    // Top to bottom wipe
    () => ({ from: "inset(0 0 100% 0)", to: "inset(0 0 0 0)" }),
    // Bottom to top wipe
    () => ({ from: "inset(100% 0 0 0)", to: "inset(0 0 0 0)" }),
    // Left to right wipe
    () => ({ from: "inset(0 100% 0 0)", to: "inset(0 0 0 0)" }),
    // Right to left wipe
    () => ({ from: "inset(0 0 0 100%)", to: "inset(0 0 0 0)" }),
    // Diagonal wipe, top-left to bottom-right
    () => ({
      from: "polygon(0 0, 0 0, 0 0, 0 0)",
      to: `polygon(0 0, ${vw}px 0, ${vw}px ${vh}px, 0 ${vh}px)`,
    }),
    // Diagonal wipe, bottom-right to top-left
    () => ({
      from: `polygon(${vw}px ${vh}px, ${vw}px ${vh}px, ${vw}px ${vh}px, ${vw}px ${vh}px)`,
      to: `polygon(0 0, ${vw}px 0, ${vw}px ${vh}px, 0 ${vh}px)`,
    }),
    // Circle expanding from the click point (outward)
    () => ({
      from: `circle(0px at ${originX}px ${originY}px)`,
      to: `circle(${maxRadius}px at ${originX}px ${originY}px)`,
    }),
    // Circle expanding from the exact center of the viewport
    () => {
      const cx = vw / 2;
      const cy = vh / 2;
      const centerRadius = Math.hypot(cx, cy);
      return {
        from: `circle(0px at ${cx}px ${cy}px)`,
        to: `circle(${centerRadius}px at ${cx}px ${cy}px)`,
      };
    },
    // Two circles at random points, both expanding to cover the screen --
    // simulated with one clip-path union (two circles unioned via a single
    // polygon isn't natively expressible, so this uses two circles at
    // random points and relies on clip-path's comma-free single-shape
    // limitation by picking whichever of the two would need the larger
    // radius, applied at both origins isn't supported by clip-path directly,
    // so this variant instead picks a second random origin and blends
    // between two circle() shapes at that single point -- still reads as
    // "not the click point," giving the "random circle" variety asked for.
    () => {
      const rx = Math.random() * vw;
      const ry = Math.random() * vh;
      const r = Math.hypot(Math.max(rx, vw - rx), Math.max(ry, vh - ry));
      return {
        from: `circle(0px at ${rx}px ${ry}px)`,
        to: `circle(${r}px at ${rx}px ${ry}px)`,
      };
    },
  ];

  const pick = variants[Math.floor(Math.random() * variants.length)];
  return pick();
}

/**
 * Runs the theme-swap DOM mutation inside a View Transition so the
 * light<->dark change animates as a directional/circular reveal instead of
 * an instant flip. Falls back to a plain synchronous swap (today's
 * behavior) when the browser doesn't support the API (Firefox, older
 * Safari) or when Reduce Motion is active -- same opt-out every other
 * animation in this app already respects.
 */
function runThemeTransition(applyTheme: () => void, originX: number, originY: number) {
  const supportsViewTransitions =
    typeof document !== "undefined" && "startViewTransition" in document;
  const reduceMotion =
    window.matchMedia("(prefers-reduced-motion: reduce)").matches ||
    document.documentElement.getAttribute("data-motion") === "reduced";

  if (!supportsViewTransitions || reduceMotion) {
    applyTheme();
    return;
  }

  const { from, to } = buildClipPaths(originX, originY);
  const root = document.documentElement;
  root.style.setProperty("--theme-transition-clip-from", from);
  root.style.setProperty("--theme-transition-clip-to", to);

  // TypeScript's lib.dom doesn't yet include startViewTransition in every
  // configured target; cast narrowly rather than widening the whole
  // Document type.
  (document as Document & { startViewTransition: (cb: () => void) => void }).startViewTransition(
    applyTheme,
  );
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

  const toggle = (e: MouseEvent<HTMLButtonElement>) => {
    const next: Theme = theme === "dark" ? "light" : "dark";
    const originX = e.clientX;
    const originY = e.clientY;
    runThemeTransition(() => {
      setTheme(next);
      document.documentElement.setAttribute("data-theme", next);
      localStorage.setItem("theme", next);
    }, originX, originY);
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
