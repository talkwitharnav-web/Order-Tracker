"use client";

import { useEffect, useRef, useState } from "react";

// Must match globals.css's .dropdown-reveal-out animation-duration (0.15s) --
// this is what actually keeps the element mounted long enough to play the
// closing animation before React removes it from the DOM.
const EXIT_ANIMATION_MS = 150;

/**
 * Drives the mount/unmount lifecycle for a hover/click popover so it can
 * play a graceful closing animation instead of vanishing the instant the
 * trigger condition (hover/tap) goes false. `open` is the boolean the
 * caller already tracks (e.g. `hovering || tapped`); this hook returns
 * whether the popover should currently be rendered (`shouldRender`, stays
 * true a beat after `open` goes false) and which animation class to apply.
 *
 * Same idiom as Dashboard.tsx's order-card exit animation (`exitingIds` +
 * `setTimeout`, deliberately not `animationend` -- Reduce Motion collapses
 * the animation to near-zero via `!important` rather than removing it, so
 * `animationend` still fires, but relying on it would mean two different
 * code paths depending on whether Reduce Motion is active; a fixed timeout
 * keyed to the animation's own declared duration covers both cases
 * identically). This hook's effect syncing `shouldRender` to the external
 * `open` prop on every change is the same "sync React state to an outside
 * signal" pattern already used by ThemeToggle/UiSizeToggle/AccessibilityMenu
 * (each has an identical eslint react-hooks/set-state-in-effect finding,
 * accepted there as inherent to the pattern rather than fixed).
 *
 * `animationBase` picks which globals.css keyframe pair to report via
 * `animationClass` -- defaults to "dropdown-reveal" (the floating-panel
 * slide+fade used by HealthPin/ThemedTooltip/AccessibilityMenu/Select).
 * Pass "modal-backdrop"/"modal-panel" for Modal.tsx's centered scale+fade,
 * or "inflow-reveal" for in-flow content that should animate its own
 * height (Dashboard.tsx's mobile nav panel) rather than a floating overlay.
 * All variants share the same 150ms exit timing, so one EXIT_ANIMATION_MS
 * covers every consumer regardless of which pair it renders.
 */
export function useDropdownReveal(open: boolean, animationBase: string = "dropdown-reveal") {
  const [shouldRender, setShouldRender] = useState(open);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    if (open) {
      setShouldRender(true);
      return;
    }
    timerRef.current = setTimeout(() => setShouldRender(false), EXIT_ANIMATION_MS);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [open]);

  return {
    shouldRender,
    animationClass: open ? animationBase : `${animationBase}-out`,
  };
}
