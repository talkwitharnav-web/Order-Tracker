"use client";

import { useEffect, useState } from "react";

/**
 * "Funny Chef" — an opt-in preference that swaps the mascot's usual banter
 * (session/rendering in-character lines, see ChefSprite/ChefSprite3D's own
 * DEFAULT_LINES) for the standalone kitchen joke bank (lib/kitchen-jokes.ts)
 * instead. Same persisted-boolean shape as the accessibility toggles
 * (contrast/motion/focus in accessibility-prefs.ts) — localStorage-backed,
 * mirrored onto a data-attribute on <html> so it's readable synchronously
 * without a flash, plus a change event so every mounted ChefMascot picks up
 * a live toggle without needing a shared React context.
 */
const STORAGE_KEY = "funnyChef";
const ATTR = "data-funny-chef";
const CHANGE_EVENT = "funnychefchange";

export function getFunnyChef(): boolean {
  if (typeof document === "undefined") return false;
  return document.documentElement.getAttribute(ATTR) === "on";
}

export function setFunnyChef(enabled: boolean): void {
  if (enabled) {
    document.documentElement.setAttribute(ATTR, "on");
  } else {
    document.documentElement.removeAttribute(ATTR);
  }
  try {
    localStorage.setItem(STORAGE_KEY, enabled ? "on" : "off");
  } catch {
    // persistence is best-effort; ignore storage failures (private mode etc.)
  }
  window.dispatchEvent(new CustomEvent(CHANGE_EVENT));
}

/**
 * Subscribes to the current Funny Chef preference. Starts `false` so SSR and
 * the first client render agree (no hydration mismatch), then a `useEffect`
 * reads the real persisted value — same pattern as useMascotStyle. Also
 * listens for the in-page change event (this toggle) and cross-tab `storage`
 * events, so flipping it in one tab updates every mascot everywhere at once.
 */
export function useFunnyChef(): boolean {
  const [enabled, setEnabled] = useState(false);
  useEffect(() => {
    setEnabled(getFunnyChef());
    const onChange = () => setEnabled(getFunnyChef());
    window.addEventListener(CHANGE_EVENT, onChange);
    window.addEventListener("storage", onChange);
    return () => {
      window.removeEventListener(CHANGE_EVENT, onChange);
      window.removeEventListener("storage", onChange);
    };
  }, []);
  return enabled;
}
