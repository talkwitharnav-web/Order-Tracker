"use client";

import { useLayoutEffect, useRef } from "react";

/**
 * Measures a fixed top-right element (SettingsToggles) and publishes its
 * real rendered size as CSS variables on <html> (--reserved-top-right-w/-h),
 * so any in-flow content that also wants the top-right corner (PageHeader's
 * action row, a page's own header buttons) can reserve clearance for it
 * instead of guessing a fixed padding number.
 *
 * This exists because SettingsToggles is `position: fixed` — it floats
 * outside document flow, so nothing naturally pushes flow content out of
 * its way, and its width isn't constant (it grew when the Colorblind
 * toggle was added to AccessibilityMenu, and will grow again if another
 * option or health pin variant is added later). A hardcoded `pr-*`/`mt-*`
 * guess on each consuming page would silently go stale every time the
 * toolbar's contents change; measuring it live means every consumer of
 * the CSS variables stays correct automatically.
 */
export function useReservedTopRight(ref: React.RefObject<HTMLElement | null>) {
  const observerRef = useRef<ResizeObserver | null>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;

    const publish = () => {
      const rect = el.getBoundingClientRect();
      document.documentElement.style.setProperty("--reserved-top-right-w", `${Math.ceil(rect.width)}px`);
      document.documentElement.style.setProperty("--reserved-top-right-h", `${Math.ceil(rect.height)}px`);
    };

    publish();
    observerRef.current = new ResizeObserver(publish);
    observerRef.current.observe(el);
    window.addEventListener("resize", publish);

    return () => {
      observerRef.current?.disconnect();
      window.removeEventListener("resize", publish);
      document.documentElement.style.removeProperty("--reserved-top-right-w");
      document.documentElement.style.removeProperty("--reserved-top-right-h");
    };
  }, [ref]);
}
