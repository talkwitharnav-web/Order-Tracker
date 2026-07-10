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
  "chef-anim-boing",
  "chef-anim-swivel",
  "chef-anim-shiver",
  "chef-anim-pulse",
  "chef-anim-leanback",
  "chef-anim-doze",
  "chef-anim-curious",
  "chef-anim-excited",
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
  "I whisked up a fresh batch of nothing suspicious.",
  "Your data napped soundly. I stood guard.",
  "Zero incidents. Ten out of ten shift.",
  "I counted the orders. Twice. For fun.",
  "The kitchen's quiet, but my hat is loud.",
  "I practiced my stance. It's very stance-y.",
  "Someone's back! Was it always going to be you? Yes.",
  "I organized the spatulas by vibe.",
  "Your session and I are basically roommates now.",
  "I hummed the whole time. No regrets.",
  "The stove's off, my enthusiasm isn't.",
  "I've been standing so still, a fly landed on my hat.",
  "Admin duties: complete. Dignity: also complete.",
  "I refreshed the page just to feel something.",
  "Your cookies are safe. The database ones, not the snack ones.",
  "I invented a new idle pose. Patent pending.",
  "Nothing broke. I'm as surprised as you are.",
  "I've been rehearsing this greeting all day.",
  "Kitchen's clean, hat's crisp, mood's immaculate.",
  "I waved at absolutely no one for an hour.",
  "Session secured with 100% chef-grade vigilance.",
  "I watched a byte fly by. It waved back.",
  "Your login worked. I did a tiny internal cheer.",
  "I'm not saying I missed you, but I did save you a seat.",
  "The apron's on, the mission continues.",
  "I gave the server a pep talk. It's doing great.",
  "Zero spills, zero crashes, maximum smugness.",
  "I've been standing guard like a very small, very round sentinel.",
  "Boss returns! Confetti not included, sadly.",
  "I counted my own toes to pass the time. Ten. Still ten.",
  "The dashboard missed you more than it'll admit.",
  "I flexed. Metaphorically. My arms don't really do that.",
  "Session intact, hat intact, dignity questionable but intact.",
  "I practiced saying 'welcome back' in six different tones.",
  "Nothing happened, and I mean NOTHING. Riveting stuff.",
  "I gave myself a gold star for standing still so well.",
  "The database and I shared a quiet moment of understanding.",
  "I've been guarding this login like it's the last cookie in the jar.",
  "Your admin powers remain fully, deliciously intact.",
  "I stared at the wall. It stared back. We bonded.",
  "Order in the kitchen! Wait, there are no orders. Order in the silence!",
  "I've perfected the art of looking busy while doing nothing.",
  "The session token and I are basically best friends now.",
  "I saluted the server rack. It didn't salute back. Rude.",
  "Still here. Still round. Still slightly confused, but committed.",
  "I gave the empty kitchen a pep talk too. It needed it.",
  "Your trust in me remains statistically well-placed.",
  "I've been doing chef push-ups. They're mostly wobbling.",
  "The login page and I have an understanding: you always win.",
  "I hummed a little kitchen tune while you were away.",
  "Session guarded, hat straightened, confidence unwarranted but high.",
  "I practiced my 'nothing to see here' face. It's this face.",
  "Somewhere, a spatula misses you too.",
  "I've reorganized my thoughts. There were only three.",
  "The dashboard's been patient. I've been less patient.",
  "Welcome back! I definitely didn't nap on the job. Definitely.",
  "I gave the cursor a friendly little stare-down.",
  "Session secured tighter than a lid on a soup pot.",
  "I counted the pixels on my hat. Lost count. Started over.",
  "Your kitchen empire remains gloriously unbothered.",
  "I've been keeping the seat warm with pure enthusiasm.",
  "Nothing to report except my own personal growth.",
  "I did a lap around absolutely nothing. Good exercise though.",
  "The server hummed, I hummed along. Duet complete.",
  "Your login credentials passed the vibe check.",
  "I've been standing here contemplating the nature of aprons.",
  "Welcome back, chef. The kitchen's been suspiciously well-behaved.",
  "I gave the void a thumbs up. It appreciated the gesture.",
  "Session still cooking at a perfect medium temperature.",
  "I've mastered the art of the dramatic pause. Watch this. ...",
  "The dashboard and I had a lovely, uneventful chat.",
  "Your admin session is fresher than this morning's bread.",
  "I practiced blinking. Ten out of ten performance.",
  "Nothing broke, nothing spilled, nothing but vibes.",
  "I gave the empty order queue a gold medal for effort.",
  "Session status: still delightfully unbothered.",
  "I've been keeping very serious watch over very quiet data.",
  "Your return has been logged, celebrated, and mildly applauded.",
  "I stood at attention. Mostly attention. Some daydreaming.",
  "The kitchen missed the clatter of orders. I missed the company.",
  "I gave myself a performance review. Five stars, obviously.",
  "Session secure, hat secure, self-esteem cautiously secure.",
  "I've been practicing my 'confident chef' pose in the mirror.",
  "Welcome back! The silence has been deafening and also fine.",
  "I counted the seconds. There were a lot of them.",
  "Your data's been sitting pretty this whole time.",
  "I gave the loading spinner some moral support.",
  "Session intact, morale intact, spatula count also intact.",
  "I've been rehearsing my best 'nothing happened' shrug.",
  "The kitchen and I share a mutual respect for quiet efficiency.",
  "Your login just made my whole shift worthwhile.",
  "I practiced looking dignified. Results: inconclusive.",
  "Nothing to log except my own excellent posture.",
  "I gave the empty dashboard a comforting nod.",
  "Session guarded with the ferocity of a very small chef.",
  "I've been standing so patiently, even the pixels are impressed.",
  "Welcome back, boss. I saved you the good idle animation.",
  "I counted my blinks. Lost track around forty.",
  "Your admin panel has been sitting in quiet anticipation.",
  "I gave the server a thumbs up for staying online.",
  "Session secure, hat straight, dignity a work in progress.",
  "I've perfected the art of standing perfectly still, mostly.",
  "The kitchen's been quiet, but never boring, apparently.",
  "Your return brightened my entire pixelated day.",
  "I practiced my dramatic entrance for when you'd log back in.",
  "Nothing broke, spilled, or crashed. A personal record.",
  "I gave the cursor a friendly wave it definitely noticed.",
  "Session status: cozier than a fresh batch of rolls.",
  "I've been keeping very diligent watch over very still data.",
  "Welcome back! I rehearsed this greeting eleven times.",
  "I counted the tiles on the floor. There are exactly some.",
  "Your login just made my entire shift feel purposeful.",
  "I gave the empty queue a little pep talk. It listened politely.",
  "Session secured tighter than grandma's secret recipe.",
  "I've been standing guard with the focus of a very tiny hero.",
  "The kitchen missed you. I definitely also missed you.",
  "I practiced my best 'everything is fine' expression.",
  "Nothing to report, except my hat looks great today.",
  "I gave the loading bar a motivational cheer.",
  "Session intact, spirits high, spatula whereabouts unknown.",
  "I've mastered patience. It mostly involves standing still.",
  "Welcome back! I definitely wasn't just staring at nothing.",
  "I counted my own reflections in the monitor. Just one, thankfully.",
  "Your data's been resting easy this entire time.",
  "I gave the server rack a nod of solidarity.",
  "Session guarded with unreasonable amounts of enthusiasm.",
  "I've been practicing my 'totally professional' stance.",
  "The kitchen and I bonded over shared silence.",
  "Your return has officially made my day, week, and shift.",
  "I practiced looking busy. It's a very convincing lean.",
  "Nothing broke, but my patience was thoroughly tested.",
  "I gave the empty order list an encouraging thumbs up.",
  "Session status: warmer than the oven, twice as reliable.",
  "I've been standing here composing my memoirs. Chapter one: waiting.",
  "Welcome back! The dashboard practically did a little dance.",
  "I counted the login attempts. There weren't any. Suspicious silence.",
  "Your admin session survived my intense but gentle watch.",
  "I gave the cursor a polite nod as it moved past.",
  "Session secure, hat proud, existential dread minimal.",
  "I've perfected standing very still while thinking very loudly.",
  "The kitchen's been peaceful, which is nice but also weird.",
  "Your return made every pixel of me light up.",
  "I practiced my grand welcome-back speech. It's just this line.",
  "Nothing to log, except my ongoing quest for the perfect hat tilt.",
  "I gave the server a little round of applause for staying up.",
  "Session status: still perfectly, deliciously intact.",
  "I've been keeping careful watch, mostly by standing here.",
  "Welcome back! I definitely didn't lose track of time. Mostly.",
  "I counted the seconds between blinks. Very scientific.",
  "Your login just restored my entire sense of purpose.",
  "I gave the empty kitchen a nod of quiet solidarity.",
  "Session guarded like the last slice of pie at a party.",
  "I've been practicing my 'nothing suspicious here' smile.",
  "The kitchen missed the noise. So did I, honestly.",
  "Your return has been noted, celebrated, and lightly applauded.",
  "I practiced my most professional stand. Very stand-like.",
  "Nothing broke, but I did nearly doze off standing up.",
  "I gave the loading spinner a thumbs up for its dedication.",
  "Session status: fresher than the daily specials.",
  "I've been standing guard with the seriousness of a tiny knight.",
  "Welcome back, boss! The pixels practically cheered.",
  "I counted the clicks. There weren't many. Quiet day.",
  "Your admin panel patiently awaited your triumphant return.",
  "I gave the server a nod for its excellent uptime.",
  "Session secured with the precision of a well-timed soufflé.",
  "I've mastered the art of looking alert while half-dozing.",
  "The kitchen's silence had a certain charm to it.",
  "Your return just made my entire shift worth it.",
  "I practiced my best 'totally on top of things' face.",
  "Nothing to report, except my hat needed a small adjustment.",
  "I gave the empty dashboard a supportive little nod.",
  "Session status: guarded with chef-grade determination.",
  "I've been keeping watch like it's the most important job ever.",
  "Welcome back! I saved you the comfiest idle pose.",
  "I counted the minutes. There were exactly enough of them.",
  "Your login just made the whole kitchen feel alive again.",
  "I gave the cursor a friendly little chase. It won.",
  "Session guarded tighter than the recipe for grandma's stew.",
  "I've perfected my 'definitely not bored' expression.",
  "The kitchen's been calm, orderly, and mildly suspicious.",
  "Your return has been logged in my personal diary of highlights.",
  "I practiced my grandest bow. It's mostly just a nod.",
  "Nothing broke, spilled, or exploded. Chef's kiss of a shift.",
  "I gave the loading bar a hearty round of encouragement.",
  "Session status: as reliable as a well-seasoned cast iron pan.",
  "I've been standing so still, I might be part of the furniture now.",
  "Welcome back! I definitely wasn't counting the seconds. Okay, I was.",
  "I counted my own footsteps. There were zero. I didn't move.",
  "Your admin panel has been patiently, quietly waiting.",
  "I gave the server rack a friendly little pat. Metaphorically.",
  "Session guarded with the intensity of a very small guardian.",
  "I've mastered patience, mostly by having no other choice.",
  "The kitchen and I have reached peak zen together.",
  "Your return just made this whole shift feel meaningful.",
  "I practiced my most convincing 'nothing happened here' shrug.",
  "Nothing to log, except my growing collection of idle poses.",
  "I gave the empty order queue a hearty pep talk.",
  "Session status: warmer than fresh-out-the-oven bread.",
  "I've been keeping watch with the focus of a very determined chef.",
  "Welcome back, boss! My hat practically tipped itself.",
  "I counted the pixels in my apron. There are a lot.",
  "Your login just made my entire existence feel purposeful.",
  "I gave the cursor a nod of respect as it clicked past.",
  "Session secured with more care than a delicate soufflé.",
  "I've perfected standing guard while looking mildly bemused.",
  "The kitchen's silence has been oddly comforting.",
  "Your return has officially been the highlight of my shift.",
  "I practiced my best 'I totally knew you'd come back' face.",
  "Nothing broke, but I did contemplate the meaning of aprons.",
  "I gave the loading spinner a standing ovation.",
  "Session status: as steady as a well-balanced stockpot.",
  "I've been standing guard, mostly out of loyalty and mild boredom.",
  "Welcome back! I definitely rehearsed this exact greeting.",
  "I counted the moments since you left. All of them, actually.",
  "Your admin session weathered my watch just fine.",
  "I gave the server a supportive nod for its hard work.",
  "Session guarded like it's the last dumpling on the plate.",
  "I've mastered looking busy while doing absolutely nothing.",
  "The kitchen's been quiet, orderly, and a little bit lonely.",
  "Your return just made every idle animation worth it.",
  "I practiced my most dramatic 'you're back!' reaction.",
  "Nothing to report, except my hat's looking extra sharp today.",
  "I gave the empty dashboard a very encouraging thumbs up.",
];

/** How far a pupil can drift from its socket's center, in SVG viewBox units. */
const PUPIL_RANGE = 1.8;

export const ChefSprite: FC<{ className?: string; lines?: string[]; size?: number; minSize?: number }> = ({
  className,
  lines,
  size = 140,
  minSize = 56,
}) => {
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
  const wrapRef = useRef<HTMLDivElement>(null);
  // Actual on-screen size, derived from how much room the container gives
  // us (see the self-aware sizing effect below). Starts at the requested
  // `size` and only ever shrinks to fit -- it never overflows its box.
  const [renderSize, setRenderSize] = useState(size);

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

  // Self-aware sizing: the caller's `size` is the IDEAL (max) size. Measure
  // how wide the sprite's container actually is and shrink to fit when that's
  // narrower than `size`, clamped down to `minSize`. Also publishes the
  // usable bubble width (--chef-bubble-max) so the speech bubble can never
  // spill past the container it lives in. This is what lets one instance
  // adapt to any viewport, replacing the old hacks of mounting two
  // fixed-size sprites per breakpoint and hiding the mascot on mobile.
  useEffect(() => {
    const wrap = wrapRef.current;
    const parent = wrap?.parentElement;
    if (!wrap || !parent) return;
    const measure = () => {
      const avail = parent.clientWidth;
      if (!avail) return; // hidden (display:none) -> nothing to measure
      setRenderSize(Math.max(minSize, Math.min(size, avail)));
      const bubbleMax = Math.max(120, Math.min(avail - 12, 260));
      wrap.style.setProperty("--chef-bubble-max", `${bubbleMax}px`);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(parent);
    return () => ro.disconnect();
  }, [size, minSize]);

  const handleClick = () => {
    if (!isTracking) {
      setIsTracking(true);
    } else {
      setIsTracking(false);
      setPupilOffset({ x: 0, y: 0 });
    }
  };

  return (
    <div ref={wrapRef} className={`chef-sprite-wrap ${className ?? ""}`}>
      {/* Speech bubble is a normal flow sibling ABOVE the sprite (the wrap is
          a centered flex column), so it centers over his head automatically
          with plain CSS and its width is capped to the real container -- no
          in-SVG foreignObject + counter-scale transform math, which is what
          kept rendering it off-center and oversized on narrow screens. */}
      <div className="chef-speech-bubble">{line}</div>
      <svg
        ref={svgRef}
        viewBox="0 0 100 118"
        width={renderSize}
        height={Math.round(renderSize * (118 / 100))}
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
