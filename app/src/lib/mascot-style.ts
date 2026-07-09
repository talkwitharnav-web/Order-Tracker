"use client";

import { useEffect, useState } from "react";

/**
 * Mascot render style — the derpy chef comes in a 2D SVG (`ChefSprite`) and a
 * CSS-3D (`ChefSprite3D`) flavour; this preference picks which one the shared
 * `ChefMascot` wrapper renders everywhere. Same storage shape as the other
 * per-device prefs (theme/contrast/ui-size): a `data-mascot` attribute on
 * <html> applied pre-hydration by layout.tsx's inline script, mirrored to
 * localStorage. Default is "3d".
 *
 * It's exposed in the Accessibility menu (not just cosmetic): the 2D SVG is
 * the lighter option for low-powered devices, so "prefer 2D" doubles as a
 * performance/comfort choice alongside Reduce Motion.
 */
export type MascotStyle = "2d" | "3d";

const STORAGE_KEY = "mascotStyle";
const ATTR = "data-mascot";
const DEFAULT: MascotStyle = "3d";
const CHANGE_EVENT = "mascotstylechange";

export function getMascotStyle(): MascotStyle {
  if (typeof document === "undefined") return DEFAULT;
  const attr = document.documentElement.getAttribute(ATTR);
  return attr === "2d" || attr === "3d" ? attr : DEFAULT;
}

export function setMascotStyle(style: MascotStyle): void {
  document.documentElement.setAttribute(ATTR, style);
  try {
    localStorage.setItem(STORAGE_KEY, style);
  } catch {
    // persistence is best-effort; ignore storage failures (private mode etc.)
  }
  window.dispatchEvent(new CustomEvent(CHANGE_EVENT));
}

/**
 * Subscribes to the current mascot style. Initial state is the default so the
 * server and first client render agree (no hydration mismatch); a `useEffect`
 * then reads the real persisted value and re-renders. Also listens for the
 * in-page change event (toggle) and cross-tab `storage` events.
 */
export function useMascotStyle(): MascotStyle {
  const [style, setStyle] = useState<MascotStyle>(DEFAULT);
  useEffect(() => {
    setStyle(getMascotStyle());
    const onChange = () => setStyle(getMascotStyle());
    window.addEventListener(CHANGE_EVENT, onChange);
    window.addEventListener("storage", onChange);
    return () => {
      window.removeEventListener(CHANGE_EVENT, onChange);
      window.removeEventListener("storage", onChange);
    };
  }, []);
  return style;
}

/* --- Presence registry ----------------------------------------------------
 * Lets the top-bar 2D/3D toggle appear ONLY on pages that actually render a
 * chef — there's no point offering to switch a sprite that isn't there. A
 * mounted ChefMascot registers; the toolbar subscribes via useHasMascot. A
 * module-level count + window event is used (rather than React context) so it
 * works even though the toolbar and the mascot live in different branches of
 * the tree, with no shared provider.
 */
let mascotCount = 0;
const PRESENCE_EVENT = "mascotpresencechange";

/** A mounted ChefMascot calls this; the returned fn unregisters on unmount. */
export function registerMascot(): () => void {
  mascotCount += 1;
  if (typeof window !== "undefined") window.dispatchEvent(new Event(PRESENCE_EVENT));
  return () => {
    mascotCount = Math.max(0, mascotCount - 1);
    if (typeof window !== "undefined") window.dispatchEvent(new Event(PRESENCE_EVENT));
  };
}

/** Reactively: is at least one ChefMascot currently mounted on the page? */
export function useHasMascot(): boolean {
  const [present, setPresent] = useState(false);
  useEffect(() => {
    const sync = () => setPresent(mascotCount > 0);
    sync(); // catches a mascot that registered before this subscribed
    window.addEventListener(PRESENCE_EVENT, sync);
    return () => window.removeEventListener(PRESENCE_EVENT, sync);
  }, []);
  return present;
}
