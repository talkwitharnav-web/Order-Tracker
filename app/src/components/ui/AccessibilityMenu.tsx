"use client";

import { useEffect, useRef, useState, FC } from "react";
import { Accessibility } from "lucide-react";
import { ThemedTooltip } from "@/components/ui/ThemedTooltip";
import { getA11yPref, setA11yPref, getCvdMode, setCvdMode, type A11yPrefKey, type CvdMode } from "@/lib/accessibility-prefs";
import { getFunnyChef, setFunnyChef } from "@/lib/funny-chef";
import { useDropdownReveal } from "@/lib/useDropdownReveal";

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

const CVD_OPTIONS: { key: CvdMode; label: string }[] = [
  { key: "off", label: "Off" },
  { key: "deuteranopia", label: "Deuteranopia (red-green)" },
  { key: "protanopia", label: "Protanopia (red-green)" },
  { key: "tritanopia", label: "Tritanopia (blue-yellow)" },
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
  const [cvdMode, setCvdModeState] = useState<CvdMode>("off");
  // Not a true accessibility setting (see lib/funny-chef.ts) -- kept as its
  // own boolean state rather than folded into `prefs`/A11yPrefKey, since
  // this menu is simply the one existing place in the toolbar with a
  // toggle-switch list UI, not because Funny Chef belongs under
  // "Accessibility" conceptually.
  const [funnyChef, setFunnyChefState] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const { shouldRender: showMenu, animationClass: menuAnimationClass } = useDropdownReveal(open);

  useEffect(() => {
    setPrefs({
      contrast: getA11yPref("contrast"),
      motion: getA11yPref("motion"),
      focus: getA11yPref("focus"),
    });
    setCvdModeState(getCvdMode());
    setFunnyChefState(getFunnyChef());
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

  const chooseCvdMode = (mode: CvdMode) => {
    setCvdMode(mode);
    setCvdModeState(mode);
  };

  const toggleFunnyChef = () => {
    const next = !funnyChef;
    setFunnyChef(next);
    setFunnyChefState(next);
  };

  return (
    <div ref={containerRef} className="relative">
      <ThemedTooltip label="Accessibility" disabled={open}>
        <button
          onClick={() => setOpen((o) => !o)}
          aria-label="Accessibility options"
          aria-expanded={open}
          aria-haspopup="true"
          className={`w-8 h-8 flex items-center justify-center rounded-[var(--radius-sm)] transition-colors ${
            open
              ? "bg-[var(--color-brand)] text-[var(--color-on-brand)]"
              : "text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-2)] hover:text-[var(--color-text-primary)]"
          }`}
        >
          <Accessibility size={16} />
        </button>
      </ThemedTooltip>

      {showMenu && (
        <div
          role="menu"
          aria-label="Accessibility options"
          className={`${menuAnimationClass} fixed left-2 right-2 top-[calc(1rem+var(--reserved-top-right-h)+0.5rem)] max-h-[calc(100dvh-var(--reserved-top-right-h)-2rem)] overflow-x-hidden overflow-y-auto sm:absolute sm:left-auto sm:right-0 sm:top-full sm:mt-2 sm:w-72 sm:max-w-[calc(100vw-2rem)] sm:max-h-[calc(100dvh-5rem)] rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface-1)] shadow-lg z-40`}
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
                      className={`absolute top-0.5 w-4 h-4 rounded-[var(--radius-full)] shadow transition-transform ${
                        prefs[key]
                          ? "translate-x-[18px] bg-[var(--color-on-brand)]"
                          : "translate-x-0.5 bg-white"
                      }`}
                    />
                  </span>
                </button>
              </li>
            ))}
          </ul>

          <div className="px-4 py-3 border-t border-[var(--color-border)]">
            <h4 className="text-sm font-medium text-[var(--color-text-primary)]">Colorblind-Friendly Palette</h4>
            <p className="text-xs text-[var(--color-text-muted)] mt-0.5 mb-2">
              Pick the option that matches your color vision — each swaps status/brand colors for a palette tuned and
              verified for that type specifically.
            </p>
            <div role="radiogroup" aria-label="Colorblind-friendly palette" className="flex flex-col gap-1">
              {CVD_OPTIONS.map(({ key, label }) => (
                <button
                  key={key}
                  role="radio"
                  aria-checked={cvdMode === key}
                  onClick={() => chooseCvdMode(key)}
                  className={`w-full text-left px-2.5 py-2 rounded-[var(--radius-sm)] text-sm flex items-center gap-2 transition-colors ${
                    cvdMode === key
                      ? "bg-[var(--color-brand)] text-[var(--color-on-brand)]"
                      : "text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-2)] hover:text-[var(--color-text-primary)]"
                  }`}
                >
                  <span
                    className={`shrink-0 w-3.5 h-3.5 rounded-full border-2 flex items-center justify-center ${
                      cvdMode === key ? "border-[var(--color-on-brand)]" : "border-[var(--color-border-strong)]"
                    }`}
                  >
                    {cvdMode === key && <span className="w-1.5 h-1.5 rounded-full bg-[var(--color-on-brand)]" />}
                  </span>
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div className="px-4 py-3 border-t border-[var(--color-border)]">
            <button
              role="menuitemcheckbox"
              aria-checked={funnyChef}
              onClick={toggleFunnyChef}
              className="w-full text-left flex items-start justify-between gap-3 hover:bg-[var(--color-surface-2)] transition-colors rounded-[var(--radius-sm)] -mx-2 px-2 py-1"
            >
              <span>
                <span className="block text-sm font-medium text-[var(--color-text-primary)]">Funny Chef</span>
                <span className="block text-xs text-[var(--color-text-muted)] mt-0.5">
                  The chef mascot tells kitchen jokes instead of his usual lines.
                </span>
              </span>
              <span
                className={`shrink-0 mt-0.5 w-9 h-5 rounded-[var(--radius-full)] transition-colors relative ${
                  funnyChef ? "bg-[var(--color-brand)]" : "bg-[var(--color-surface-2)] border border-[var(--color-border-strong)]"
                }`}
              >
                <span
                  className={`absolute top-0.5 w-4 h-4 rounded-[var(--radius-full)] shadow transition-transform ${
                    funnyChef ? "translate-x-[18px] bg-[var(--color-on-brand)]" : "translate-x-0.5 bg-white"
                  }`}
                />
              </span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
