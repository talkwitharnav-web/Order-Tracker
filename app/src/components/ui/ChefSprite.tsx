"use client";

import { useState, useEffect, useRef, useId, FC } from "react";

// Idle animations, applied to the whole sprite or its parts via CSS classes.
// Each one is a bored/silly little chef-hat sprite action. Picked at random on mount.
// NOTE: every arm/hand-only animation (wave, stir, shrug, yawn, salute,
// facepalm, fistpump, doublearms, armswing, armscross) has been removed
// outright. Their CSS rotation directions kept coming out wrong (arm
// swinging behind the body, arms crossing the wrong way, etc.) across
// repeated attempts to fix the angles/signs -- rather than keep
// re-guessing the geometry, they've been dropped from the pool entirely.
// Don't re-add any of these class names here without actually confirming
// the resulting motion live (screenshot or direct visual check), since
// that's exactly what went wrong before.
const ACTIONS = [
  "chef-anim-bounce",
  "chef-anim-spin-hat",
  "chef-anim-wiggle",
  "chef-anim-tiptoe",
  "chef-anim-nod",
  "chef-anim-sway",
  "chef-anim-jump",
  "chef-anim-lookaround",
  "chef-anim-tapfoot",
  "chef-anim-spin-full",
  "chef-anim-shake",
  "chef-anim-peek",
  "chef-anim-hop-twice",
  "chef-anim-wobble",
  "chef-anim-heartbeat",
  "chef-anim-sidestep",
  "chef-anim-blink",
  "chef-anim-tilt",
  "chef-anim-hatpoke",
  "chef-anim-squish",
  "chef-anim-gasp",
  "chef-anim-drift",
  "chef-anim-bobblehead",
  "chef-anim-shimmy",
  "chef-anim-suspicious",
] as const;

const DEFAULT_LINES = [
  "I remembered to log you in!",
  "Still logged in, chef's honor!",
  "Your session? I guarded it with my life.",
  "Welcome back, boss!",
  "Guess who never left the kitchen.",
  "Your cookie's still warm. Literally.",
  "I've been standing here this whole time.",
  "Session status: perfectly seasoned.",
  "No need to log in twice, boss.",
  "I kept the seat warm for you.",
  "Miss me? I never left.",
  "Cookies, not the eating kind. I mean your session.",
  "Still here, still logged in, still cooking.",
  "Admin privileges: freshly baked.",
  "I watched the database. Nothing happened. You're welcome.",
  "Back so soon? I barely finished prepping.",
  "Logged in and lookin' good.",
  "I'd never let your session expire on my watch.",
  "This kitchen runs on loyalty and cookies.",
  "You again! Excellent, I was getting bored.",
  "Session token: still fresh out the oven.",
  "I'm basically a security guard with a hat.",
  "Nothing to see here, just me, guarding your login.",
  "The database and I are on good terms.",
  "Order up! Wait, wrong screen. Welcome back!",
  "I've been perfecting my idle stance.",
  "Your admin panel awaits, chef's kiss.",
  "Some chefs cook. I cook up secure sessions.",
  "Still logged in. Still fabulous.",
  "You leave, I wait. That's the deal.",
];

/** How far a pupil can drift from its socket's center, in SVG viewBox units. */
const PUPIL_RANGE = 1.8;

export const ChefSprite: FC<{ className?: string; lines?: string[]; size?: number }> = ({ className, lines, size = 140 }) => {
  // SVG element IDs (the hat's gradient, below) must be unique per document
  // -- fine when only one ChefSprite ever mounted on a page at once, but
  // some callers now mount two simultaneously (one hidden via CSS per
  // breakpoint, both still present in the DOM), and a hardcoded id="..."
  // shared by both instances made `url(#...)` resolve unpredictably,
  // breaking the hat's gradient fill on one instance (confirmed live: it
  // rendered as bare stroke outlines with no fill, no gradient at all).
  const gradientId = useId();
  const [action] = useState(() => ACTIONS[Math.floor(Math.random() * ACTIONS.length)]);
  const [line] = useState(() => {
    const pool = lines && lines.length > 0 ? lines : DEFAULT_LINES;
    return pool[Math.floor(Math.random() * pool.length)];
  });
  const [isTracking, setIsTracking] = useState(false);
  const [pupilOffset, setPupilOffset] = useState({ x: 0, y: 0 });
  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    if (!isTracking) return;

    const handleMouseMove = (e: MouseEvent) => {
      const svg = svgRef.current;
      if (!svg) return;
      const rect = svg.getBoundingClientRect();
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height * (45 / 118);
      const dx = e.clientX - centerX;
      const dy = e.clientY - centerY;
      const angle = Math.atan2(dy, dx);
      setPupilOffset({
        x: Math.cos(angle) * PUPIL_RANGE,
        y: Math.sin(angle) * PUPIL_RANGE,
      });
    };

    window.addEventListener("mousemove", handleMouseMove);
    return () => window.removeEventListener("mousemove", handleMouseMove);
  }, [isTracking]);

  const handleClick = () => {
    if (!isTracking) {
      setIsTracking(true);
    } else {
      setIsTracking(false);
      setPupilOffset({ x: 0, y: 0 });
    }
  };

  return (
    <div className={`chef-sprite-wrap ${className ?? ""}`}>
      <svg
        ref={svgRef}
        viewBox="0 0 100 118"
        width={size}
        height={Math.round(size * (118 / 100))}
        shapeRendering="geometricPrecision"
        className={`chef-sprite ${action}`}
        role="img"
        aria-label="A cheerful chef mascot"
        style={{ overflow: "visible", cursor: "pointer" }}
        onClick={handleClick}
      >
        <ellipse cx="50" cy="111" rx="20" ry="4" fill="black" opacity="0.15" />
        {/* Stubby legs/feet — grounded, derpy */}
        <rect x="40" y="92" width="7" height="10" rx="3.5" fill="#f2c9a0" />
        <rect x="53" y="92" width="7" height="10" rx="3.5" fill="#f2c9a0" />
        {/* Shoes — tiny rounded ovals */}
        <ellipse cx="43.5" cy="102" rx="5" ry="3" fill="#6b5c4d" />
        <ellipse cx="56.5" cy="102" rx="5" ry="3" fill="#6b5c4d" />
        <g className="chef-arm-left">
          <rect x="24" y="63" width="8" height="20" rx="4" fill="#f2c9a0" />
          {/* Round hand */}
          <circle cx="28" cy="83" r="3.5" fill="#f2c9a0" />
        </g>
        <g className="chef-arm-right">
          <rect x="68" y="63" width="8" height="20" rx="4" fill="#f2c9a0" />
          {/* Round hand */}
          <circle cx="72" cy="83" r="3.5" fill="#f2c9a0" />
        </g>
        {/* Body */}
        <rect x="34" y="60" width="32" height="34" rx="8" fill="#e8e8e8" />
        <rect x="34" y="60" width="32" height="8" fill="#d6d6d6" />
        {/* Apron — white triangle/trapezoid over the torso */}
        <path d="M42 66 L50 64 L58 66 L56 92 L44 92 Z" fill="white" opacity="0.9" />
        <path d="M42 66 L50 64 L58 66" stroke="#d6d6d6" strokeWidth="0.8" fill="none" />
        {/* Apron string */}
        <path d="M44 72 Q50 75 56 72" stroke="#d6d6d6" strokeWidth="0.8" fill="none" />
        {/* Head */}
        <circle cx="50" cy="46" r="16" fill="#f2c9a0" />
        {/* Black bow tie at neck — drawn after head so it's visible */}
        <path d="M50 62 L42 58 Q40 62 42 66 Z" fill="#1a1512" />
        <path d="M50 62 L58 58 Q60 62 58 66 Z" fill="#1a1512" />
        <circle cx="50" cy="62" r="2" fill="#2b2320" />
        <circle cx="50" cy="62" r="1" fill="#3d3128" />
        {/* Subtle blush */}
        <circle cx="38" cy="49" r="4" fill="#f5a0a0" opacity="0.2" />
        <circle cx="62" cy="49" r="4" fill="#f5a0a0" opacity="0.2" />
        <g className={isTracking ? "" : "chef-eyes"}>
          {/* Slightly larger eye sockets */}
          <circle cx="44" cy="45" r="3.5" fill="white" />
          <circle cx="56" cy="45" r="3.5" fill="white" />
          {/* Pupils */}
          <circle
            cx={44 + pupilOffset.x}
            cy={45 + pupilOffset.y}
            r="2"
            fill="#2b2b2b"
            style={{ transition: isTracking ? "none" : "cx 0.3s ease, cy 0.3s ease" }}
          />
          <circle
            cx={56 + pupilOffset.x}
            cy={45 + pupilOffset.y}
            r="2"
            fill="#2b2b2b"
            style={{ transition: isTracking ? "none" : "cx 0.3s ease, cy 0.3s ease" }}
          />
          {/* Eye highlights — tiny white dots for life */}
          <circle cx={44.8 + pupilOffset.x * 0.3} cy={44.2 + pupilOffset.y * 0.3} r="0.8" fill="white" opacity="0.9" />
          <circle cx={56.8 + pupilOffset.x * 0.3} cy={44.2 + pupilOffset.y * 0.3} r="0.8" fill="white" opacity="0.9" />
        </g>
        <path d="M44 52 Q50 56 56 52" stroke="#8a5a3a" strokeWidth="2.25" fill="none" strokeLinecap="round" />

        {/*
          Speech bubble lives inside the SVG, anchored right above the mouth
          (mouth center is 50,54 in this viewBox), so it inherits the exact
          same transform as the rest of the sprite — the pointer arrow stays
          aimed at the mouth even through animations that rotate/translate
          the whole sprite (spin-full, wobble, jump, etc.), instead of a
          separately-positioned bubble that would drift away during those.
          The foreignObject box itself is sized/positioned in viewBox units
          (SVG scales it like any other shape); a counter-scale on the content
          div undoes that same scaling for the bubble's *content* so its
          fixed-px padding/font-size render at their intended real size
          instead of being stretched/shrunk by the viewBox-to-viewport ratio.
        */}
        <foreignObject x="49" y="10" width="1" height="1" style={{ overflow: "visible" }}>
          <div
            style={{
              position: "absolute",
              bottom: 0,
              left: 0,
              width: "max-content",
              // The SVG's viewBox (100 units wide) is scaled to `size` real
              // pixels — this counter-scale must track that same ratio, or
              // the bubble renders at the wrong real-world size/position
              // whenever `size` differs from the original hardcoded 140
              // default (e.g. KitchenPortalLanding's size={168}), which is
              // exactly what caused the bubble to drift off-screen there.
              //
              // `--chef-bubble-counter-scale` publishes that same factor as a
              // CSS var so .chef-speech-bubble's max-width (globals.css) can
              // divide by it: max-width is measured in this div's PRE-
              // transform coordinate space, then the whole box gets visually
              // multiplied by this scale() on top -- at every mobile call
              // site (size 70/80/110/120, all < 100) that factor is > 1,
              // so an unscaled `max-width: min(220px, 42vw)` rendered far
              // larger on screen than intended (worst at size=70, ~1.43x),
              // which is exactly the "humongous, doesn't fit the window"
              // bubble reported on the Kitchen page's empty-order states.
              ["--chef-bubble-counter-scale" as string]: 100 / size,
              transform: `scale(${100 / size}) translateX(-50%)`,
              transformOrigin: "bottom left",
            }}
          >
            <div className="chef-speech-bubble">{line}</div>
          </div>
        </foreignObject>

        {/* chef's toque: pleated cylindrical poof + rope-braid cuff band, per reference photo */}
        <g className="chef-hat">
          <defs>
            <linearGradient id={`chef-hat-shade-${gradientId}`} x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="#d8d8d8" />
              <stop offset="12%" stopColor="#fbfbfb" />
              <stop offset="50%" stopColor="#ffffff" />
              <stop offset="88%" stopColor="#fbfbfb" />
              <stop offset="100%" stopColor="#d0d0d0" />
            </linearGradient>
          </defs>
          <path
            d="M35 30
               C 33 12, 40 0, 50 0
               C 60 0, 67 12, 65 30
               Z"
            fill={`url(#chef-hat-shade-${gradientId})`}
            stroke="#bfbfbf"
            strokeWidth="1.25"
          />
          <path d="M40 28 C 39 14, 42 4, 45 1" stroke="#c9c9c9" strokeWidth="1.4" fill="none" strokeLinecap="round" />
          <path d="M50 29 C 49 13, 50 2, 50 0" stroke="#c9c9c9" strokeWidth="1.4" fill="none" strokeLinecap="round" />
          <path d="M60 28 C 61 14, 58 4, 55 1" stroke="#c9c9c9" strokeWidth="1.4" fill="none" strokeLinecap="round" />
          <rect x="33" y="28" width="34" height="9" rx="2" fill={`url(#chef-hat-shade-${gradientId})`} stroke="#bfbfbf" strokeWidth="1.25" />
          <path
            d="M34 32 q2 -2 4 0 q2 2 4 0 q2 -2 4 0 q2 2 4 0 q2 -2 4 0 q2 2 4 0 q2 -2 4 0 q2 2 4 0"
            stroke="#cfcfcf"
            strokeWidth="1.5"
            fill="none"
            strokeLinecap="round"
          />
        </g>
      </svg>
    </div>
  );
};
