"use client";

import { useEffect, useLayoutEffect, useRef, useState, FC } from "react";
import { clamp } from "@/lib/ui-awareness";

/**
 * ChefSprite3D — a CSS-3D version of the derpy chef, built entirely from
 * layered HTML elements inside a `perspective` + `transform-style: preserve-3d`
 * stage (see globals.css `.chef3d*`). No WebGL, no libraries — real 3D
 * transforms (rotateX/Y/Z, translateZ) so he has genuine depth, turns, and
 * can pace around. Same character as the 2D SVG (ChefSprite): white toque,
 * skin-tone round head, tracked eyes, blush, apron, black bow tie, stubby
 * legs. The 2D version still exists; a preference toggle picks between them
 * (see lib/mascot-style.ts + ChefMascot.tsx).
 *
 * Props mirror ChefSprite so it's a drop-in via the ChefMascot wrapper.
 * `walk` turns on the confined side-to-side pace (only used on non-disruptive
 * surfaces like the portal hero).
 */

// Whole-body idle moves ONLY. No arm/hand-only animations: the arm-rotation
// geometry kept coming out wrong (waving the wrong way, arm detaching from the
// shoulder), so — exactly like the 2D sprite — arm-only idles are dropped
// entirely. Every idle here moves the whole figure. Don't re-add an arm-only
// idle without confirming the motion live.
const IDLE_ACTIONS = [
  "chef3d-idle-turn", // slow look left/right in 3D
  "chef3d-idle-bob", // gentle vertical bob
  "chef3d-idle-breathe", // subtle scale breathing
  "chef3d-idle-sway", // whole-body sway (rotateZ)
  "chef3d-idle-peek", // lean forward and back, curious
  "chef3d-idle-nod", // pitch nod (rotateX)
  "chef3d-idle-wobble", // playful rock side to side
  "chef3d-idle-hop", // a little jump
  "chef3d-idle-tiptoe", // rise up on the toes
  "chef3d-idle-lookabout", // look around (turn + tilt)
  "chef3d-idle-shimmy", // quick happy shimmy
] as const;

const DEFAULT_LINES = [
  "Now in three dimensions!",
  "Look at me, I've got depth now.",
  "I've been working on my angles.",
  "Fully rendered, chef's honor.",
  "Same hat, more dimensions.",
  "Round in all the right places.",
  "I turn heads. Mostly my own.",
  "Extra crispy, extra 3D.",
  "Watch me pace, boss.",
  "I contain multitudes. And depth.",
];

const MIN_SIZE = 56;
const HEAD_LOOK_MAX = 22; // deg — how far the head turns toward the cursor

function prefersReducedMotion(): boolean {
  if (typeof window === "undefined") return false;
  if (document.documentElement.getAttribute("data-motion") === "reduced") return true;
  return window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
}

export const ChefSprite3D: FC<{
  className?: string;
  lines?: string[];
  size?: number;
  minSize?: number;
  walk?: boolean;
  /** Walk the legs/arms in place (no pacing) — used during the swap transition. */
  gait?: boolean;
  /** Swap phase from ChefMascot. When "out"/"in" the WHOLE figure turns toward
      profile on the inner preserve-3d element (so his depth fins keep him
      solid — rotating the outer wrapper would flatten him to paper). */
  swap?: "out" | "in" | null;
}> = ({
  className,
  lines,
  size = 140,
  minSize = MIN_SIZE,
  walk = false,
  gait = false,
  swap = null,
}) => {
  const stageRef = useRef<HTMLDivElement>(null);
  const walkerRef = useRef<HTMLDivElement>(null);
  const chefRef = useRef<HTMLDivElement>(null);
  const headRef = useRef<HTMLDivElement>(null);

  const [renderSize, setRenderSize] = useState(size);
  // Deterministic defaults for SSR; randomized after mount (below) so the
  // server and first client render agree — otherwise the random idle class /
  // speech line causes a hydration mismatch.
  const [action, setAction] = useState<(typeof IDLE_ACTIONS)[number]>(IDLE_ACTIONS[0]);
  const [line, setLine] = useState<string>((lines && lines.length > 0 ? lines : DEFAULT_LINES)[0]);
  // Head-follow is OFF by default and only turns on when you click him — the
  // 3D echo of the 2D sprite's click-to-track eyes. Until then he does his
  // own idle 3D moves.
  const [isTracking, setIsTracking] = useState(false);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setAction(IDLE_ACTIONS[Math.floor(Math.random() * IDLE_ACTIONS.length)]);
    const pool = lines && lines.length > 0 ? lines : DEFAULT_LINES;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLine(pool[Math.floor(Math.random() * pool.length)]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Container-aware sizing + bubble cap, identical policy to the 2D sprite so
  // the two are interchangeable: `size` is the ideal max, shrink to fit,
  // never overflow. (Mirrors ChefSprite's self-aware sizing effect.)
  useEffect(() => {
    const stage = stageRef.current;
    const parent = stage?.parentElement;
    if (!stage || !parent) return;
    const measure = () => {
      const avail = parent.clientWidth;
      if (!avail) return;
      setRenderSize(clamp(avail, minSize, size));
      const bubbleMax = Math.max(120, Math.min(avail - 12, 260));
      stage.style.setProperty("--chef-bubble-max", `${bubbleMax}px`);
    };
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(measure);
    ro.observe(parent);
    return () => ro.disconnect();
  }, [size, minSize]);

  // Measure the pace distance for walking: how far the chef can travel inside
  // its track (track width minus his own width) before turning around. Kept as
  // a live measurement (published as a CSS var the walk keyframes consume) so
  // he always turns exactly at the edges regardless of container width.
  useLayoutEffect(() => {
    if (!walk) return;
    const walker = walkerRef.current;
    const track = walker?.parentElement;
    const chef = chefRef.current;
    if (!walker || !track || !chef) return;
    const measure = () => {
      const dist = Math.max(0, track.clientWidth - chef.offsetWidth);
      walker.style.setProperty("--chef3d-pace", `${dist}px`);
    };
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(measure);
    ro.observe(track);
    ro.observe(chef);
    return () => ro.disconnect();
  }, [walk, renderSize]);

  // Cursor-follow head — the 3D echo of the 2D sprite's tracked eyes. It only
  // runs while `isTracking` (i.e. after a click); otherwise the head stays put
  // and he runs his own idle animation. rAF-throttled so mousemove can't
  // thrash layout; disabled while walking and under reduced-motion. On stop it
  // recenters the head (the CSS transition eases it back).
  useEffect(() => {
    const head = headRef.current;
    const recenter = () => {
      head?.style.setProperty("--look-y", "0deg");
      head?.style.setProperty("--look-x", "0deg");
    };
    if (!head || !isTracking || walk || swap || prefersReducedMotion()) {
      recenter();
      return;
    }
    let raf = 0;
    let pending: { x: number; y: number } | null = null;
    const apply = () => {
      raf = 0;
      if (!pending) return;
      const el = chefRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height * 0.32; // head sits in the upper third
      const dx = (pending.x - cx) / (rect.width || 1);
      const dy = (pending.y - cy) / (rect.height || 1);
      const yaw = clamp(dx * HEAD_LOOK_MAX * 2, -HEAD_LOOK_MAX, HEAD_LOOK_MAX);
      const pitch = clamp(-dy * HEAD_LOOK_MAX, -HEAD_LOOK_MAX * 0.6, HEAD_LOOK_MAX * 0.6);
      head.style.setProperty("--look-y", `${yaw}deg`);
      head.style.setProperty("--look-x", `${pitch}deg`);
    };
    const onMove = (e: MouseEvent) => {
      pending = { x: e.clientX, y: e.clientY };
      if (!raf) raf = requestAnimationFrame(apply);
    };
    window.addEventListener("mousemove", onMove);
    return () => {
      window.removeEventListener("mousemove", onMove);
      if (raf) cancelAnimationFrame(raf);
      recenter();
    };
  }, [walk, isTracking, swap]);

  const handleClick = () => {
    if (walk || swap) return; // a pacing / mid-swap chef isn't clickable-to-track
    setIsTracking((t) => !t);
  };

  return (
    <div
      ref={stageRef}
      className={`chef3d-stage ${walk ? "chef3d-walk-stage" : ""} ${
        swap ? "chef3d-swap-stage" : ""
      } ${className ?? ""}`}
      style={{ ["--chef3d-s" as string]: `${renderSize}px` }}
    >
      <div className="chef-speech-bubble chef3d-bubble">{line}</div>
      <div ref={walkerRef} className={`chef3d-walker ${walk ? "chef3d-walking" : ""}`}>
        <div
          ref={chefRef}
          className={`chef3d ${
            swap
              ? `chef3d-gait chef3d-swap-${swap}`
              : walk || gait
              ? "chef3d-gait"
              : isTracking
              ? "chef3d-tracking"
              : action
          }`}
          onClick={handleClick}
          aria-label="A cheerful 3D chef mascot"
          role="img"
        >
          <div className="chef3d-shadow" />

          {/* Legs — hip-pivoted (transform-origin at the top). During the walk
              they alternate fore/aft; see .chef3d-gait keyframes. */}
          <div className="chef3d-legs">
            <div className="chef3d-leg chef3d-leg-l">
              <span className="chef3d-shoe" />
            </div>
            <div className="chef3d-leg chef3d-leg-r">
              <span className="chef3d-shoe" />
            </div>
          </div>

          {/* Arms — SHOULDER-pivoted (transform-origin: top center, anchored at
              the top corners of the torso). They never detach from the
              shoulder. Idle: still or a single deliberate wave. Walking: they
              swing fore/aft in OPPOSITION to the legs (contralateral gait —
              left arm forward when the right leg is forward), which is what
              real walking looks like. All of that lives in the CSS keyframes,
              not random per-frame JS, so the motion is always intentional. */}
          <div className="chef3d-arm chef3d-arm-l">
            <span className="chef3d-hand" />
          </div>
          <div className="chef3d-arm chef3d-arm-r">
            <span className="chef3d-hand" />
          </div>

          {/* Torso — a real box: front + back + two side faces around a
              preserve-3d container, so turning reveals a solid side instead of
              a flat edge. The apron + bow tie ride on the FRONT face. */}
          <div className="chef3d-body">
            <div className="chef3d-body-back" />
            <div className="chef3d-body-side chef3d-body-side-l" />
            <div className="chef3d-body-side chef3d-body-side-r" />
            <div className="chef3d-body-front">
              <div className="chef3d-apron" />
              <div className="chef3d-bowtie">
                <span />
                <span />
              </div>
            </div>
          </div>

          {/* Head — the front disc (this element's own painted face) plus a
              few concentric discs stepped BACKWARD (sphere cross-sections) for
              rounded depth that blends smoothly. No flat side planes, so
              nothing sticks out as a "paper strip" when he turns. */}
          <div ref={headRef} className="chef3d-head">
            <div className="chef3d-head-depth chef3d-head-depth-1" />
            <div className="chef3d-head-depth chef3d-head-depth-2" />
            <div className="chef3d-head-depth chef3d-head-depth-3" />
            <div className="chef3d-blush chef3d-blush-l" />
            <div className="chef3d-blush chef3d-blush-r" />
            <div className="chef3d-eye chef3d-eye-l">
              <span className="chef3d-pupil" />
            </div>
            <div className="chef3d-eye chef3d-eye-r">
              <span className="chef3d-pupil" />
            </div>
            <div className="chef3d-smile" />
            <div className="chef3d-hat">
              <div className="chef3d-hat-poof" />
              <div className="chef3d-hat-band" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
