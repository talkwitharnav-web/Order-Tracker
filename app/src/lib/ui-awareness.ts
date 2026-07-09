"use client";

/**
 * ui-awareness — a small "self-aware layout" toolkit.
 *
 * The app already had one bespoke instance of this idea (ChefSprite measures
 * its own container and shrinks to fit; useReservedTopRight measures a fixed
 * toolbar and publishes its size). This module generalises the pattern into
 * a few reusable primitives so any component can notice when it's about to
 * break its own layout — text getting clipped, two elements about to collide,
 * something spilling past the viewport — and react, instead of relying purely
 * on fixed breakpoints that can't see the actual content.
 *
 * Design rules that keep this robust rather than flaky:
 *  - Everything is SSR-safe and feature-detected (ResizeObserver may be
 *    absent in old/edge environments; the hooks degrade to a one-shot
 *    measurement or a no-op instead of throwing).
 *  - Every measurement is wrapped in try/catch — a layout helper must never
 *    be the thing that crashes a view.
 *  - Decisions are made from INTRINSIC widths (scrollWidth / offsetWidth)
 *    compared against the container, not from live positions that change the
 *    moment we react — that's what prevents stack<->unstack oscillation
 *    (layout thrashing).
 *  - Diagnostics log only in development (reportUiIssue), never in prod.
 */

import { useEffect, useLayoutEffect, useRef, useState } from "react";

const isBrowser = typeof window !== "undefined";
const isDev = process.env.NODE_ENV === "development";
const hasResizeObserver = isBrowser && typeof ResizeObserver !== "undefined";
// useLayoutEffect throws a warning during SSR; pick the safe one per env. The
// choice is stable for the lifetime of the bundle, so this doesn't violate the
// rules-of-hooks "same hooks every render" contract.
const useIsoLayoutEffect = isBrowser ? useLayoutEffect : useEffect;

// --- Pure geometry helpers (no React, safe to unit test) ---------------------

export interface Box {
  left: number;
  right: number;
  top: number;
  bottom: number;
  width: number;
  height: number;
}

export function toBox(el: Element | null | undefined): Box | null {
  if (!el) return null;
  try {
    const r = el.getBoundingClientRect();
    return { left: r.left, right: r.right, top: r.top, bottom: r.bottom, width: r.width, height: r.height };
  } catch {
    return null;
  }
}

/** True when two boxes overlap on both axes (axis-aligned intersection test). */
export function boxesIntersect(a: Box | null, b: Box | null): boolean {
  if (!a || !b) return false;
  return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
}

/** Horizontal gap between two boxes. Positive = clear space, negative = overlap. */
export function horizontalGap(a: Box | null, b: Box | null): number {
  if (!a || !b) return Number.POSITIVE_INFINITY;
  const [leftBox, rightBox] = a.left <= b.left ? [a, b] : [b, a];
  return rightBox.left - leftBox.right;
}

/** True when an element's content is wider than its box (i.e. it's being clipped). */
export function isOverflowingX(el: HTMLElement | null): boolean {
  if (!el) return false;
  try {
    return el.scrollWidth - el.clientWidth > 1;
  } catch {
    return false;
  }
}

export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/** Dev-only structured warning so self-inflicted layout problems surface while building. */
export function reportUiIssue(kind: string, detail?: Record<string, unknown>): void {
  if (isDev && isBrowser) {
    console.warn(`[ui-awareness] ${kind}`, detail ?? "");
  }
}

// --- Hooks -------------------------------------------------------------------

/**
 * Attach the returned `ref` to any single-line text element. When the text is
 * clipped by its container it (a) exposes the full string via a `title`
 * tooltip so nothing becomes unreadable, (b) flips `overflowing` true so the
 * caller can add its own affordance, and (c) logs it in dev. Re-checks on
 * container resize.
 */
export function useAutoFitText<T extends HTMLElement = HTMLElement>(text?: string) {
  const ref = useRef<T>(null);
  const [overflowing, setOverflowing] = useState(false);

  useIsoLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;

    const check = () => {
      const over = isOverflowingX(el);
      setOverflowing(over);
      if (over) {
        const full = text ?? el.textContent ?? "";
        if (full && el.getAttribute("title") !== full) el.setAttribute("title", full);
        reportUiIssue("text clipped", { text: (text ?? el.textContent ?? "").slice(0, 48) });
      } else if (!text && el.getAttribute("title")) {
        // Only clear titles we would have set ourselves; leave caller-provided
        // static titles (passed as `text`) alone.
        el.removeAttribute("title");
      }
    };

    check();
    if (!hasResizeObserver) return;
    const ro = new ResizeObserver(check);
    ro.observe(el);
    return () => ro.disconnect();
  }, [text]);

  return { ref, overflowing };
}

/**
 * Content-aware row/stack decision. Put `containerRef` on the flex row,
 * `aRef` on the primary child and `bRef` on the secondary child. Returns
 * `fits` — true when both children fit side by side, false when they'd
 * collide and the caller should stack them vertically instead.
 *
 * Why this beats a plain CSS breakpoint: it reacts to the actual CONTENT, so
 * a long order name stacks even on a wide screen, and a short one stays inline
 * even on a narrowish one. The measurement uses `aRef.scrollWidth` (the
 * element's intrinsic single-line width, unaffected by whether we're currently
 * stacked) so the decision can't oscillate.
 */
export function useSideBySideFit<
  C extends HTMLElement = HTMLElement,
  A extends HTMLElement = HTMLElement,
  B extends HTMLElement = HTMLElement,
>(gap = 12) {
  const containerRef = useRef<C>(null);
  const aRef = useRef<A>(null);
  const bRef = useRef<B>(null);
  const [fits, setFits] = useState(true);

  useIsoLayoutEffect(() => {
    const c = containerRef.current;
    const a = aRef.current;
    const b = bRef.current;
    if (!c || !a || !b) return;

    const check = () => {
      try {
        // Compare against the container's CONTENT width (clientWidth minus its
        // own horizontal padding), not clientWidth itself — the children live
        // inside the padding, so counting it would over-estimate the room and
        // leave a row inline+truncated when it should have stacked.
        const cs = getComputedStyle(c);
        const padX = (parseFloat(cs.paddingLeft) || 0) + (parseFloat(cs.paddingRight) || 0);
        const need = a.scrollWidth + b.offsetWidth + gap;
        const have = c.clientWidth - padX;
        if (have <= 0) return;
        const next = need <= have;
        setFits((prev) => {
          if (prev === next) return prev;
          // Log only on an actual flip (not every ResizeObserver frame, which
          // would spam the console during enter/exit animations).
          if (!next) reportUiIssue("row would collide → stacking", { need, have });
          return next;
        });
      } catch {
        // Measurement failed for some reason — fail open (assume it fits) so
        // we never trap the layout in a permanent stacked state.
        setFits(true);
      }
    };

    check();
    if (!hasResizeObserver) return;
    const ro = new ResizeObserver(check);
    ro.observe(c);
    ro.observe(a);
    ro.observe(b);
    return () => ro.disconnect();
  }, [gap]);

  return { containerRef, aRef, bRef, fits };
}

/**
 * Dev-only self-check: after mount and on resize, scan for any element whose
 * right edge spills past the viewport (the #1 cause of an unwanted horizontal
 * scrollbar) and log the offenders. Off in production and behind a debounce so
 * it never costs anything real. This is the "the UI checks itself" net — a
 * regression that reintroduces overflow shows up in the console immediately.
 */
export function useUiSelfCheck(enabled: boolean = isDev): void {
  useEffect(() => {
    if (!enabled || !isBrowser) return;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const scan = () => {
      try {
        const root = document.documentElement;
        const vw = root.clientWidth;
        // Only a GENUINE page-level horizontal overflow (an actual stray
        // scrollbar) is worth flagging. Decorative elements that intentionally
        // bleed past the edge but are clipped by an overflow:hidden/fixed
        // parent (e.g. BackgroundArt's food watermarks) don't scroll the page,
        // so this gate skips them and avoids false alarms.
        if (root.scrollWidth - vw <= 2) return;
        const offenders: string[] = [];
        document.body.querySelectorAll<HTMLElement>("*").forEach((el) => {
          // Skip decorative/aria-hidden layers — real content is never hidden
          // from the accessibility tree, so anything in one can't be a real
          // layout problem worth reporting.
          if (el.closest('[aria-hidden="true"]')) return;
          const r = el.getBoundingClientRect();
          if (r.width > 0 && r.right - vw > 2) {
            const cls = typeof el.className === "string" && el.className ? "." + el.className.split(/\s+/)[0] : "";
            offenders.push(`${el.tagName.toLowerCase()}${cls} (+${Math.round(r.right - vw)}px)`);
          }
        });
        if (offenders.length) {
          reportUiIssue("horizontal overflow detected", {
            pageOverflow: root.scrollWidth - vw,
            count: offenders.length,
            sample: offenders.slice(0, 8),
          });
        }
      } catch {
        /* never let a self-check crash anything */
      }
    };

    const debounced = () => {
      clearTimeout(timer);
      timer = setTimeout(scan, 250);
    };

    debounced();
    window.addEventListener("resize", debounced);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("resize", debounced);
    };
  }, [enabled]);
}
