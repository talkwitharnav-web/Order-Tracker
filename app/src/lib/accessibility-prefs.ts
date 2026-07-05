/**
 * Shared get/set helpers for the accessibility toggles (contrast, motion,
 * focus) — each is an independent boolean preference, persisted via
 * localStorage and mirrored onto a data-attribute on <html>, applied
 * pre-hydration by the inline script in layout.tsx (same mechanism as
 * ThemeToggle/UiSizeToggle). Centralized here so AccessibilityMenu's three
 * options share one get/set shape instead of three near-duplicate
 * useState+toggle blocks.
 */
export type A11yPrefKey = "contrast" | "motion" | "focus";

const ATTR_NAME: Record<A11yPrefKey, string> = {
  contrast: "data-contrast",
  motion: "data-motion",
  focus: "data-focus",
};

const ON_VALUE: Record<A11yPrefKey, string> = {
  contrast: "high",
  motion: "reduced",
  focus: "enhanced",
};

export function getA11yPref(key: A11yPrefKey): boolean {
  if (typeof document === "undefined") return false;
  return document.documentElement.getAttribute(ATTR_NAME[key]) === ON_VALUE[key];
}

export function setA11yPref(key: A11yPrefKey, enabled: boolean): void {
  if (enabled) {
    document.documentElement.setAttribute(ATTR_NAME[key], ON_VALUE[key]);
  } else {
    document.documentElement.removeAttribute(ATTR_NAME[key]);
  }
  localStorage.setItem(key, enabled ? ON_VALUE[key] : "off");
}
