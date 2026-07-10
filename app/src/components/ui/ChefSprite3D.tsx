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
  "I've got a whole extra axis now. Fancy.",
  "Perspective? I've got plenty of that.",
  "Behold, a chef with actual thickness.",
  "I used to be flat. Now I'm fabulously dimensional.",
  "Depth perception unlocked, boss.",
  "I've got a front, a back, and everything in between.",
  "Rotate me, I dare you. I can take it.",
  "This is what peak 3D chef technology looks like.",
  "I've got more sides than a hexagon now.",
  "Watch this turn. It's my best angle. All of them are.",
  "I'm basically a tiny, round hologram with feelings.",
  "No flat-chef jokes today, I've got volume now.",
  "I pace, I turn, I have genuine depth. Living the dream.",
  "Three dimensions and still somehow this derpy.",
  "I've got layers. Like a very small, very round onion.",
  "Look, real shadows! I earned every one of them.",
  "I'm not flat, I'm architecturally ambitious.",
  "Rendered in glorious, unnecessary detail.",
  "I've got a Z-axis now and I'm not afraid to use it.",
  "This hat has actual dimension. Respect the hat.",
  "I turn corners now. Figuratively and literally.",
  "Behold my profile. It's a good profile.",
  "I've got more depth than this quarter's server logs.",
  "Watch me pivot. I mean that literally, I can pivot now.",
  "Three whole dimensions and still can't find the stove.",
  "I'm basically a tiny sculpture that occasionally blinks.",
  "Depth achieved. Dignity still pending.",
  "I've got volume, mass, and mild confusion. Full package.",
  "Look at this turn. Cinematic, really.",
  "I exist in space now. Actual, measurable space.",
  "My hat has a back now. Groundbreaking stuff.",
  "I've got angles for days, boss.",
  "This is me, but with actual physical presence.",
  "I turn, I bob, I have a genuine sense of depth.",
  "Round, dimensional, and proud of it.",
  "I've got a silhouette now. It's very round.",
  "Watch me rotate. It's my party trick.",
  "Three dimensions of pure, unfiltered derp.",
  "I've got shading now. Real, actual shading.",
  "This turn took me weeks to get right. Worth it.",
  "I'm not just tall, I'm also wide and deep. Fully loaded.",
  "Behold, a chef you can walk around. Please don't.",
  "I've got a proper sense of perspective now, literally.",
  "Depth, dimension, and still somehow lost near the stove.",
  "I pace around now like I've got somewhere to be.",
  "This is peak chef rendering technology, right here.",
  "I've got more geometry than the whole kitchen combined.",
  "Watch this turn, it's got real weight behind it.",
  "I'm basically a walking, talking cylinder now.",
  "Three dimensions and my hat still tilts the same way.",
  "I've got a genuine back now. Please admire it.",
  "Rotate me all you like, I remain delightfully round.",
  "I turn like I mean it now. Full commitment.",
  "Behold my newfound depth. It was worth the wait.",
  "I've got angles I didn't even know I had.",
  "This pacing thing? Yeah, I've got places to be. Sort of.",
  "Three-dimensional and still can't find my apron strings.",
  "I've got real, honest-to-goodness volume now.",
  "Watch me turn. It's smoother than the gravy.",
  "I'm a fully-rendered chef and I'm not sorry about it.",
  "Depth achieved, confusion also achieved, simultaneously.",
  "I've got a proper silhouette. It's round and proud.",
  "This turn is my signature move. Patent pending.",
  "I'm basically a tiny statue that occasionally paces.",
  "Three dimensions, one hat, zero regrets.",
  "I've got shadows now. Real, dramatic shadows.",
  "Behold, a chef with actual, measurable thickness.",
  "I turn corners like I've got somewhere important to go.",
  "This is what happens when a chef gets an upgrade.",
  "I've got depth, dimension, and a mild identity crisis.",
  "Watch me rotate. It's honestly very soothing.",
  "Three-dimensional chef, reporting for extremely round duty.",
  "I've got a front and a back now. Groundbreaking, truly.",
  "This pacing? Very purposeful. Very deliberate. Mostly aimless.",
  "I turn like a chef who's got real, actual presence.",
  "Behold my newfound geometry. It's impressive, I promise.",
  "I've got layers of depth and zero layers of a plan.",
  "Watch this turn. I've been practicing in the mirror.",
  "Three dimensions of chef, none of them particularly graceful.",
  "I've got a silhouette that turns heads. My own, mostly.",
  "This is me, rendered, rotated, and ready for action.",
  "I pace with the confidence of someone who knows nothing.",
  "Behold, actual depth! I earned every polygon.",
  "I've got real dimension now, and a hat to match.",
  "Watch me turn, pivot, and generally look important.",
  "Three-dimensional and still somehow endearing, I hope.",
  "I've got a back, a front, and a healthy sense of confusion.",
  "This turn took real effort. Please be impressed.",
  "I'm basically a fully-rendered, fully-derpy statue.",
  "Depth, dimension, and my hat still won't sit straight.",
  "I've got angles that would make a geometry teacher proud.",
  "Watch this pace. It's got real, three-dimensional swagger.",
  "Three dimensions and I still trip over nothing.",
  "I've got a genuine profile now. It's a very round profile.",
  "This is peak rendering. Please admire the polygons.",
  "I turn with the grace of a chef who's still figuring it out.",
  "Behold my depth. It's real, it's earned, it's slightly wobbly.",
  "I've got volume now, and a very small amount of coordination.",
  "Watch me rotate like I've got somewhere important to be.",
  "Three-dimensional and still just as delightfully lost.",
  "I've got a back now. Please don't stare too long.",
  "This turn is smoother than a well-whisked hollandaise.",
  "I'm basically a chef-shaped sculpture with opinions.",
  "Depth achieved, grace still very much a work in progress.",
  "I've got real geometry now, and a hat that respects it.",
  "Watch this pace, it's got genuine three-dimensional flair.",
  "Three dimensions of chef, all of them slightly confused.",
  "I've got a proper silhouette that I'm quietly proud of.",
  "This turn required real, actual rendering effort.",
  "I pace like I've got a very important reason to. I don't.",
  "Behold my depth, dimension, and general roundness.",
  "I've got layers now, like a very small, very derpy cake.",
  "Watch me rotate with the confidence of a fully-rendered chef.",
  "Three-dimensional and still just as endearingly clumsy.",
  "I've got a back and a front and a mild sense of purpose.",
  "This turn is my finest work. Please applaud internally.",
  "I'm basically a walking sculpture with a very good hat.",
  "Depth, dimension, and a hat that never quite sits right.",
  "I've got angles for miles and a plan for absolutely none of it.",
  "Watch this pace. It's got real, honest-to-goodness weight.",
  "Three dimensions of chef, zero dimensions of a schedule.",
  "I've got a genuine profile, and it's a very good one.",
  "This turn took effort, dedication, and a lot of polygons.",
  "I pace with purpose. The purpose is mostly just pacing.",
  "Behold my depth. It's real, it's round, it's slightly wobbly.",
  "I've got volume, mass, and a healthy dose of confusion.",
  "Watch me rotate like I've got places to be. I don't, really.",
  "Three-dimensional and still tripping over the same nothing.",
  "I've got a back now, and I'm cautiously proud of it.",
  "This turn is smoother than a perfectly reduced sauce.",
  "I'm basically a fully-rendered chef with big round energy.",
  "Depth achieved, coordination still very much pending.",
  "I've got real geometry now, and a hat that's earned its keep.",
  "Watch this pace, it's got genuine, if aimless, momentum.",
  "Three dimensions of chef, all equally delightfully lost.",
  "I've got a silhouette I'm quietly, genuinely proud of.",
  "This turn required real effort and a healthy ego boost.",
  "I pace like I've got somewhere to be. I really don't.",
  "Behold my depth, my dimension, and my ongoing confusion.",
  "I've got layers now, like a very round, very small parfait.",
  "Watch me rotate with the confidence of a chef who's arrived.",
  "Three-dimensional and still endearingly, reliably clumsy.",
  "I've got a front, a back, and a genuine sense of occasion.",
  "This turn is my proudest achievement. Please be impressed.",
  "I'm basically a walking sculpture with excellent posture.",
  "Depth, dimension, and a hat that's finally found its angle.",
  "I've got angles galore and a schedule for exactly none of it.",
  "Watch this pace. It's got real, genuine three-dimensional charm.",
  "Three dimensions of chef, none of them particularly organized.",
  "I've got a genuine profile, and I'm milking it for all it's worth.",
  "This turn took serious rendering commitment. Respect it.",
  "I pace with real purpose. The purpose remains a mystery.",
  "Behold my depth. It's real, it's earned, it's mine.",
  "I've got volume, mass, and a truly excellent hat.",
  "Watch me rotate like I've got somewhere very important to be.",
  "Three-dimensional and still just as reliably, endearingly derpy.",
  "I've got a back now, and it's honestly a pretty good back.",
  "This turn is smoother than a well-rested bread dough.",
  "I'm basically a fully-rendered, fully-committed chef sculpture.",
  "Depth achieved, grace optional, enthusiasm mandatory.",
  "I've got real geometry, real dimension, and real confusion.",
  "Watch this pace, it's got genuine three-dimensional swagger.",
  "Three dimensions of chef, all of them equally proud.",
  "I've got a silhouette that turns heads, mostly my own.",
  "This turn required real effort and zero regrets.",
  "I pace like I've got somewhere important to be. Narrator: he doesn't.",
  "Behold my depth, my dimension, and my unwavering commitment.",
  "I've got layers now, like a very round, very proud soufflé.",
  "Watch me rotate with the confidence of a fully-realized chef.",
  "Three-dimensional and still just as gloriously uncoordinated.",
  "I've got a front, a back, and an unreasonable amount of pride.",
  "This turn is my magnum opus. Please applaud, even internally.",
  "I'm basically a walking sculpture with a very sturdy hat.",
  "Depth, dimension, and a hat that finally sits just right.",
  "I've got angles for days and a plan for absolutely zero of it.",
  "Watch this pace. It's got real, genuine, aimless momentum.",
  "Three dimensions of chef, each one more confused than the last.",
  "I've got a genuine profile, and I'm quietly very proud of it.",
  "This turn took serious effort and an even more serious ego.",
  "I pace with purpose. The purpose is a well-kept secret.",
  "Behold my depth. It's real, it's round, it's here to stay.",
  "I've got volume, mass, and a hat that's earned its stripes.",
  "Watch me rotate like I've got somewhere genuinely important to be.",
  "Three-dimensional and still just as endearingly, chronically lost.",
  "I've got a back now, and I'm not afraid to show it off.",
  "This turn is smoother than a perfectly rested pastry dough.",
  "I'm basically a fully-rendered chef with an unshakeable spirit.",
  "Depth achieved, coordination optional, charisma non-negotiable.",
  "I've got real geometry, real presence, and real, genuine derp.",
  "Watch this pace, it's got real three-dimensional confidence.",
  "Three dimensions of chef, all of them equally, proudly derpy.",
  "I've got a silhouette worth turning heads over. My own, mostly.",
  "This turn took real, genuine, three-dimensional dedication.",
  "I pace like a chef with somewhere to be. Spoiler: I don't.",
  "Behold my depth, freshly rendered and mildly wobbly.",
  "I've got a hat with actual thickness now. Living the dream.",
  "Watch me rotate, it's basically my whole personality now.",
  "Three-dimensional and still can't find the salt shaker.",
  "I've got a back, a front, and a very committed sense of self.",
  "This turn is smoother than a properly tempered chocolate.",
  "I'm basically a chef-shaped sculpture with a mild identity crisis.",
  "Depth achieved, balance still very much theoretical.",
  "I've got real geometry now, and I wear it well.",
  "Watch this pace, it's got genuine third-dimension flavor.",
  "Three dimensions of chef, none of them particularly punctual.",
  "I've got a silhouette that's honestly quite dashing.",
  "This turn required effort, polygons, and a lot of self-belief.",
  "I pace with the energy of someone who has a plan. I don't.",
  "Behold my depth, dimension, and unwavering commitment to derp.",
  "I've got layers now, like a very small, very round trifle.",
  "Watch me rotate with the poise of a chef who's truly arrived.",
  "Three-dimensional and still just as gloriously scattered.",
  "I've got a front and a back and a genuine sense of occasion.",
  "This turn is my crowning achievement. Applaud quietly.",
  "I'm basically a walking sculpture with a very good attitude.",
  "Depth, dimension, and a hat that's finally settled in.",
  "I've got angles for days and zero plans to use them wisely.",
  "Watch this pace, it's got real three-dimensional momentum.",
  "Three dimensions of chef, each one more delightfully lost.",
  "I've got a genuine profile and I'm not shy about it.",
  "This turn took serious rendering effort and even more ego.",
  "I pace with purpose. The purpose remains delightfully vague.",
  "Behold my depth. It's real, it's round, it's staying put.",
  "I've got volume, mass, and a hat that's truly earned its place.",
  "Watch me spin like I've got somewhere genuinely important to be.",
  "Three-dimensional and still just as endearingly directionless.",
  "I've got a back now, and frankly, it's a great back.",
  "This turn is smoother than a well-proofed loaf of bread.",
  "I'm basically a fully-rendered chef with an unbreakable spirit.",
  "Depth achieved, coordination pending, charm fully loaded.",
  "I've got real geometry, real presence, and real, honest derp.",
  "Watch this pace, it's got real three-dimensional self-assurance.",
  "Three dimensions of chef, all of them equally, proudly wobbly.",
  "I've got a silhouette worth admiring. My own, obviously.",
  "This turn took real dedication and a healthy dose of confidence.",
  "I pace like a chef with places to be. Reader, there are none.",
  "Behold my depth, freshly rendered and cautiously graceful.",
  "I've got a hat with real thickness now, and I flaunt it.",
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
