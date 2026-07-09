"use client";

import { useEffect, useState, FC } from "react";
import { Box, Square } from "lucide-react";
import { getMascotStyle, setMascotStyle, type MascotStyle } from "@/lib/mascot-style";

/**
 * Top-toolbar toggle for the chef mascot's render style (2D SVG ⟷ CSS-3D).
 * Same hydration-safe pattern as ThemeToggle: state starts null so SSR and
 * the first client render agree, then syncs to the value the pre-hydration
 * script already applied to <html data-mascot>. Flipping the pref is all this
 * does — ChefMascot watches for the change and plays the walk-out / slide-in
 * swap animation itself.
 */
export const MascotStyleToggle: FC<{ className?: string }> = ({ className }) => {
  const [style, setStyle] = useState<MascotStyle | null>(null);

  useEffect(() => {
    setStyle(getMascotStyle());
    const sync = () => setStyle(getMascotStyle());
    window.addEventListener("mascotstylechange", sync);
    return () => window.removeEventListener("mascotstylechange", sync);
  }, []);

  if (style === null) {
    return <button aria-hidden className={`w-8 h-8 ${className ?? ""}`} />;
  }

  const toggle = () => {
    const next: MascotStyle = style === "3d" ? "2d" : "3d";
    setStyle(next);
    setMascotStyle(next);
  };

  return (
    <button
      onClick={toggle}
      aria-label={style === "3d" ? "Switch to 2D chef" : "Switch to 3D chef"}
      className={`w-8 h-8 flex items-center justify-center rounded-[var(--radius-sm)] text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-2)] hover:text-[var(--color-text-primary)] transition-colors ${className ?? ""}`}
    >
      {/* Show the TARGET state, not the current one, so the icon reads as
          "press me to get this": in 3D show the flat 2D square, in 2D show the
          3D box. Matches the aria-label's "Switch to …" wording. */}
      {style === "3d" ? <Square size={16} /> : <Box size={16} />}
    </button>
  );
};
