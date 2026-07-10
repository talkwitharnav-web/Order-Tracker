"use client";

import { FC, useEffect, useLayoutEffect, useRef, useState } from "react";
import { ChefSprite } from "./ChefSprite";
import { ChefSprite3D } from "./ChefSprite3D";
import { getMascotStyle, registerMascot, type MascotStyle } from "@/lib/mascot-style";
import { getFunnyChef } from "@/lib/funny-chef";
import { KITCHEN_JOKES } from "@/lib/kitchen-jokes";

/**
 * Renders the derpy chef in whichever style (2D SVG or CSS-3D) the user has
 * chosen, and plays a themed swap ONLY when they actually flip the toggle: the
 * outgoing chef walks/slides off, then the incoming one arrives. Drop-in for
 * `ChefSprite` — same size/lines/className — plus a `walk` flag only the 3D
 * version acts on.
 *
 * IMPORTANT — the swap is driven by the toggle's `mascotstylechange` event, NOT
 * by detecting a value change. On mount (every route change / tab switch /
 * remount) it adopts the persisted style INSTANTLY with no animation, so a
 * saved 2D preference just shows 2D instead of flashing the 3D default and
 * replaying the walk-out swap each time. The sequence therefore happens exactly
 * once — when the preference genuinely changes — and the state sticks.
 *
 * (An earlier version inferred "changed" from the pref value transitioning,
 * but `useMascotStyle` starts at the SSR default "3d" and only syncs to the
 * persisted value after mount — so that async catch-up looked like a real
 * toggle and re-ran the swap on every remount. Listening to the actual change
 * event avoids that ambiguity entirely.)
 */

type Phase = "idle" | "out" | "in";
const OUT_MS = 720; // must match chef-swap-*-out durations in globals.css
const IN_MS = 720; // must match chef-swap-*-in

// Adopt the persisted style before paint on the client (no 3D→2D flash); fall
// back to a plain effect on the server (React warns about useLayoutEffect during
// SSR). The branch is evaluated once per environment, so the hook identity is
// stable across renders.
const useIsomorphicLayoutEffect = typeof window !== "undefined" ? useLayoutEffect : useEffect;

function reducedMotion(): boolean {
  if (typeof window === "undefined") return false;
  if (document.documentElement.getAttribute("data-motion") === "reduced") return true;
  return window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
}

export const ChefMascot: FC<{
  className?: string;
  lines?: string[];
  size?: number;
  minSize?: number;
  walk?: boolean;
}> = ({ walk, lines, ...common }) => {
  // "Funny Chef" (see lib/funny-chef.ts) is an opt-in preference set in the
  // settings pill's Accessibility menu -- when on, EVERY chef on EVERY page
  // tells a kitchen joke instead of its usual line, overriding whatever
  // contextual `lines` the caller passed in (e.g. Dashboard's "no orders
  // yet" pool, the login portal's sign-in lines). This is the one place
  // every ChefMascot caller funnels through, so overriding here means no
  // individual call site needs its own Funny Chef branching logic.
  //
  // Read via a lazy useState initializer (synchronous on the client), NOT
  // useFunnyChef()'s own effect-based hook -- ChefSprite/ChefSprite3D each
  // pick their random `line` ONCE in a mount-only effect with `[]` deps, so
  // if `effectiveLines` were still `undefined` on their FIRST render (which
  // is what useFunnyChef() returns before its own effect has run one render
  // later), that stale value would already be locked in as their line pool
  // forever -- a toggle-then-reload would still show a persisted "on" state
  // but never actually surface a joke. getFunnyChef() reads the same
  // data-funny-chef attribute the pre-hydration script in layout.tsx already
  // set before paint, so it's safe to read synchronously here, same as
  // MascotStyleToggle's own hydration-safe read.
  const [funnyChef] = useState(getFunnyChef);
  const effectiveLines = funnyChef ? KITCHEN_JOKES : lines;

  // Start at the SSR default ("3d") so the first client render matches the
  // server HTML; the mount effect below immediately corrects to the persisted
  // style with NO swap animation.
  const [displayed, setDisplayed] = useState<MascotStyle>("3d");
  const [phase, setPhase] = useState<Phase>("idle");
  const displayedRef = useRef(displayed);
  displayedRef.current = displayed;
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const rootRef = useRef<HTMLDivElement>(null);

  // On every mount, adopt the persisted style INSTANTLY (no swap). This is what
  // makes the choice stick across route changes / tab switches: a saved 2D pref
  // shows 2D right away instead of flashing 3D and replaying the walk-out.
  useIsomorphicLayoutEffect(() => {
    const real = getMascotStyle();
    if (real !== displayedRef.current) setDisplayed(real);
  }, []);

  // Tell the toolbar a chef is on screen, so the 2D/3D toggle only appears
  // where there's actually a sprite to switch. Registration is VISIBILITY-aware:
  // some hosts wrap the mascot in a responsive `hidden md:block`, so a chef can
  // be mounted-but-display:none. `getClientRects()` is empty exactly when the
  // element renders no box (display:none anywhere up the tree), independent of
  // scroll position — and it's re-checked on resize because that can flip at a
  // breakpoint without remounting.
  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    let unregister: (() => void) | null = null;
    const check = () => {
      const visible = el.getClientRects().length > 0;
      if (visible && !unregister) unregister = registerMascot();
      else if (!visible && unregister) {
        unregister();
        unregister = null;
      }
    };
    check();
    window.addEventListener("resize", check);
    return () => {
      window.removeEventListener("resize", check);
      unregister?.();
    };
  }, []);

  // Play the swap ONLY on a genuine preference change — the toggle's
  // `mascotstylechange` event (same tab) or a cross-tab `storage` change —
  // never on mount. That keeps the sequence to exactly once per real change.
  useEffect(() => {
    const clearTimers = () => {
      timers.current.forEach(clearTimeout);
      timers.current = [];
    };
    const onChange = () => {
      const next = getMascotStyle();
      if (next === displayedRef.current) return;
      clearTimers();
      // Reduced motion: swap instantly, no walk-off.
      if (reducedMotion()) {
        setDisplayed(next);
        setPhase("idle");
        return;
      }
      // The current mascot exits ("out"), the new one enters ("in"), then he
      // settles ("idle") and STOPS.
      setPhase("out");
      timers.current.push(
        setTimeout(() => {
          setDisplayed(next);
          setPhase("in");
        }, OUT_MS),
        setTimeout(() => setPhase("idle"), OUT_MS + IN_MS),
      );
    };
    window.addEventListener("mascotstylechange", onChange);
    window.addEventListener("storage", onChange);
    return () => {
      window.removeEventListener("mascotstylechange", onChange);
      window.removeEventListener("storage", onChange);
      clearTimers();
    };
  }, []);

  const swapping = phase !== "idle";
  const swapClass = swapping ? `chef-swap chef-swap-${displayed}-${phase}` : "";

  return (
    <div ref={rootRef} className={swapClass}>
      {displayed === "3d" ? (
        // During a swap the legs walk (gait) with pacing off and the whole
        // figure turns via `swap` on the inner 3D element; otherwise honour
        // the caller's `walk`.
        <ChefSprite3D
          walk={walk && !swapping}
          gait={swapping}
          swap={phase === "idle" ? null : phase}
          lines={effectiveLines}
          {...common}
        />
      ) : (
        <ChefSprite lines={effectiveLines} {...common} />
      )}
    </div>
  );
};
