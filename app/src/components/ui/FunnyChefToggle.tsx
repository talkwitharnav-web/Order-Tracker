"use client";

import { useEffect, useState, FC } from "react";
import { Laugh } from "lucide-react";
import { getFunnyChef, setFunnyChef } from "@/lib/funny-chef";

/**
 * Top-toolbar toggle for "Funny Chef" (see lib/funny-chef.ts) — swaps the
 * mascot's usual in-character banter for the standalone kitchen joke bank
 * (lib/kitchen-jokes.ts). Lives right next to MascotStyleToggle rather than
 * inside AccessibilityMenu: it's a chef-personality preference, not an
 * accessibility setting, so it belongs with the other mascot-specific
 * control, not buried in a dropdown about contrast/motion/focus.
 *
 * Same hydration-safe pattern as MascotStyleToggle/ThemeToggle: state starts
 * null so SSR and the first client render agree, then syncs to the value
 * the pre-hydration script already applied to <html data-funny-chef>.
 */
export const FunnyChefToggle: FC<{ className?: string }> = ({ className }) => {
  const [enabled, setEnabled] = useState<boolean | null>(null);

  useEffect(() => {
    setEnabled(getFunnyChef());
    const sync = () => setEnabled(getFunnyChef());
    window.addEventListener("funnychefchange", sync);
    return () => window.removeEventListener("funnychefchange", sync);
  }, []);

  if (enabled === null) {
    return <button aria-hidden className={`w-8 h-8 ${className ?? ""}`} />;
  }

  const toggle = () => {
    const next = !enabled;
    setEnabled(next);
    setFunnyChef(next);
  };

  return (
    <button
      onClick={toggle}
      aria-label={enabled ? "Turn off Funny Chef" : "Turn on Funny Chef"}
      aria-pressed={enabled}
      className={`w-8 h-8 flex items-center justify-center rounded-[var(--radius-sm)] transition-colors ${
        enabled
          ? "bg-[var(--color-brand)] text-[var(--color-on-brand)]"
          : "text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-2)] hover:text-[var(--color-text-primary)]"
      } ${className ?? ""}`}
    >
      <Laugh size={16} />
    </button>
  );
};
