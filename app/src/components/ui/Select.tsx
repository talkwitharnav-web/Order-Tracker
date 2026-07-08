"use client";

import { useEffect, useRef, useState, ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { useDropdownReveal } from "@/lib/useDropdownReveal";

export type SelectOption<T extends string> = { value: T; label: string; description?: string };

/**
 * Themed single-select dropdown, replacing a native `<select>` wherever the
 * browser's own unstyled popup would clash with the app's theme (dark mode,
 * fonts, radii) and can't be animated at all -- a native select's option
 * list is rendered by the OS/browser chrome, entirely outside CSS's reach.
 * Same button+outside-click-close+animated-panel shape as AccessibilityMenu/
 * StatusFilterDropdown, generalized for the (more common) single-choice
 * case. Uses useDropdownReveal so the panel fades/slides both open AND
 * closed, not just open.
 */
export function Select<T extends string>({
  id,
  value,
  options,
  onChange,
  ariaLabel,
  className,
  renderValue,
  size = "md",
}: {
  id?: string;
  value: T;
  options: SelectOption<T>[];
  onChange: (value: T) => void;
  ariaLabel?: string;
  className?: string;
  renderValue?: (option: SelectOption<T>) => ReactNode;
  /** "sm" for compact contexts like a table cell; "md" (default) matches Input's form-field sizing. */
  size?: "sm" | "md";
}) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const { shouldRender, animationClass } = useDropdownReveal(open);

  useEffect(() => {
    if (!open) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  const selected = options.find((o) => o.value === value) ?? options[0];

  return (
    <div ref={containerRef} className={`relative inline-block ${className ?? ""}`}>
      <button
        id={id}
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={ariaLabel}
        className={`w-full flex items-center justify-between gap-2 bg-[var(--color-surface-0)] text-[var(--color-text-primary)] border border-[var(--color-border-strong)] rounded-[var(--radius-sm)] transition-colors hover:border-[var(--color-brand)] focus:outline-none focus:ring-2 focus:ring-[var(--color-brand)] focus:border-[var(--color-brand)] ${
          size === "sm" ? "px-2 py-1 text-xs" : "px-4 py-2.5 text-sm"
        }`}
      >
        <span className="truncate">{renderValue ? renderValue(selected) : selected.label}</span>
        <ChevronDown size={14} className={`shrink-0 text-[var(--color-text-muted)] transition-transform duration-200 ${open ? "rotate-180" : ""}`} />
      </button>

      {shouldRender && (
        <div
          role="listbox"
          aria-label={ariaLabel}
          className={`${animationClass} absolute left-0 top-full mt-2 w-full ${size === "sm" ? "min-w-[9rem]" : "min-w-[14rem]"} max-w-[calc(100vw-2rem)] rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface-1)] shadow-lg overflow-hidden z-40`}
        >
          <ul className="py-1 max-h-72 overflow-y-auto">
            {options.map((option) => (
              <li key={option.value}>
                <button
                  type="button"
                  role="option"
                  aria-selected={option.value === value}
                  onClick={() => {
                    onChange(option.value);
                    setOpen(false);
                  }}
                  className={`w-full text-left flex flex-col gap-0.5 transition-colors ${size === "sm" ? "px-3 py-1.5 text-xs" : "px-4 py-2.5 text-sm"} ${
                    option.value === value
                      ? "bg-[var(--color-brand)] text-white"
                      : "text-[var(--color-text-primary)] hover:bg-[var(--color-surface-2)]"
                  }`}
                >
                  <span className="font-medium">{option.label}</span>
                  {option.description && (
                    <span className={`text-xs ${option.value === value ? "text-white/80" : "text-[var(--color-text-muted)]"}`}>
                      {option.description}
                    </span>
                  )}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
