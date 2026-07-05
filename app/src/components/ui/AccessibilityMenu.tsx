"use client";

import { useEffect, useRef, useState, FC } from "react";
import { Accessibility } from "lucide-react";
import { ThemedTooltip } from "@/components/ui/ThemedTooltip";
import { getA11yPref, setA11yPref, type A11yPrefKey } from "@/lib/accessibility-prefs";

const OPTIONS: { key: A11yPrefKey; label: string; description: string }[] = [
  {
    key: "contrast",
    label: "High Contrast",
    description: "Stronger text/border contrast for low vision.",
  },
  {
    key: "motion",
    label: "Reduce Motion",
    description: "Turns off animations and transitions.",
  },
  {
    key: "focus",
    label: "Enhanced Focus Outline",
    description: "A bolder, more visible ring on keyboard focus.",
  },
];

/**
 * Single "Accessibility" button that opens a dropdown of independent
 * options (contrast, motion, focus — see accessibility-prefs.ts), rather
 * than one icon button per option cluttering the toolbar. The button's own
 * hover label is a themed tooltip (ThemedTooltip), not the native browser
 * `title` attribute, so it visually matches the app instead of popping a
 * plain OS tooltip box next to a themed toolbar.
 */
export const AccessibilityMenu: FC = () => {
  const [open, setOpen] = useState(false);
  const [prefs, setPrefs] = useState<Record<A11yPrefKey, boolean>>({
    contrast: false,
    motion: false,
    focus: false,
  });
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setPrefs({
      contrast: getA11yPref("contrast"),
      motion: getA11yPref("motion"),
      focus: getA11yPref("focus"),
    });
  }, []);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const toggle = (key: A11yPrefKey) => {
    const next = !prefs[key];
    setA11yPref(key, next);
    setPrefs((p) => ({ ...p, [key]: next }));
  };

  return (
    <div ref={containerRef} className="relative">
      <ThemedTooltip label="Accessibility">
        <button
          onClick={() => setOpen((o) => !o)}
          aria-label="Accessibility options"
          aria-expanded={open}
          aria-haspopup="true"
          className={`w-7 h-7 flex items-center justify-center rounded-[var(--radius-sm)] transition-colors ${
            open
              ? "bg-[var(--color-brand)] text-white"
              : "text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-2)] hover:text-[var(--color-text-primary)]"
          }`}
        >
          <Accessibility size={16} />
        </button>
      </ThemedTooltip>

      {open && (
        <div
          role="menu"
          aria-label="Accessibility options"
          className="absolute right-0 top-full mt-2 w-72 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface-1)] shadow-lg overflow-hidden z-40"
        >
          <div className="px-4 py-3 border-b border-[var(--color-border)]">
            <h3 className="text-sm font-semibold text-[var(--color-text-primary)]">Accessibility</h3>
          </div>
          <ul className="py-1">
            {OPTIONS.map(({ key, label, description }) => (
              <li key={key}>
                <button
                  role="menuitemcheckbox"
                  aria-checked={prefs[key]}
                  onClick={() => toggle(key)}
                  className="w-full text-left px-4 py-3 flex items-start justify-between gap-3 hover:bg-[var(--color-surface-2)] transition-colors"
                >
                  <span>
                    <span className="block text-sm font-medium text-[var(--color-text-primary)]">{label}</span>
                    <span className="block text-xs text-[var(--color-text-muted)] mt-0.5">{description}</span>
                  </span>
                  <span
                    className={`shrink-0 mt-0.5 w-9 h-5 rounded-[var(--radius-full)] transition-colors relative ${
                      prefs[key] ? "bg-[var(--color-brand)]" : "bg-[var(--color-surface-2)] border border-[var(--color-border-strong)]"
                    }`}
                  >
                    <span
                      className={`absolute top-0.5 w-4 h-4 rounded-[var(--radius-full)] bg-white shadow transition-transform ${
                        prefs[key] ? "translate-x-[18px]" : "translate-x-0.5"
                      }`}
                    />
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
};
