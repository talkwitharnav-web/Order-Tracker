"use client";

import { useEffect, useRef, useState, FC } from "react";
import { ChevronDown } from "lucide-react";
import { useDropdownReveal } from "@/lib/useDropdownReveal";

const BASE_STATUSES = ["Received", "Preparing", "Complete"] as const;

/**
 * Multi-select status filter for admin/db's Orders table -- no search box
 * (unlike RestaurantFilterDropdown), since the option list is short and
 * fixed. Includes a "Deleted" option only when the caller says deleted rows
 * are actually being shown (admin/db's own "Deleted" toggle) -- filtering
 * by a status that isn't even visible would be confusing, not useful.
 */
export const StatusFilterDropdown: FC<{
  selected: string[];
  onChange: (selected: string[]) => void;
  includeDeletedOption: boolean;
}> = ({ selected, onChange, includeDeletedOption }) => {
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

  const options = includeDeletedOption ? [...BASE_STATUSES, "Deleted"] : BASE_STATUSES;

  const toggleStatus = (status: string) => {
    onChange(selected.includes(status) ? selected.filter((s) => s !== status) : [...selected, status]);
  };

  const label = selected.length === 0 ? "All Statuses" : selected.length === 1 ? selected[0] : `${selected.length} Statuses`;

  return (
    <div ref={containerRef} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="true"
        aria-expanded={open}
        className={`flex items-center gap-2 px-3 py-2 text-sm rounded-[var(--radius-sm)] border transition-colors max-w-[160px] ${
          selected.length > 0
            ? "bg-[var(--color-brand)] border-[var(--color-brand)] text-[var(--color-on-brand)]"
            : "bg-[var(--color-surface-0)] border-[var(--color-border-strong)] text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]"
        }`}
      >
        <span className="truncate">{label}</span>
        <ChevronDown size={14} className="shrink-0" />
      </button>

      {shouldRender && (
        <div
          role="menu"
          aria-label="Filter by status"
          className={`${animationClass} absolute left-0 top-full mt-2 w-48 max-w-[calc(100vw-2rem)] rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface-1)] shadow-lg overflow-hidden z-40`}
        >
          {selected.length > 0 && (
            <button
              onClick={() => onChange([])}
              className="w-full text-left px-3 py-2 text-xs font-medium text-[var(--color-brand-text)] hover:bg-[var(--color-surface-2)] border-b border-[var(--color-border)] transition-colors"
            >
              Clear filter
            </button>
          )}
          <ul className="py-1">
            {options.map((status) => (
              <li key={status}>
                <button
                  role="menuitemcheckbox"
                  aria-checked={selected.includes(status)}
                  onClick={() => toggleStatus(status)}
                  className="w-full text-left px-3 py-2 flex items-center gap-2 text-sm hover:bg-[var(--color-surface-2)] transition-colors"
                >
                  <span
                    className={`shrink-0 w-4 h-4 rounded-[var(--radius-sm)] border flex items-center justify-center ${
                      selected.includes(status)
                        ? "bg-[var(--color-brand)] border-[var(--color-brand)]"
                        : "border-[var(--color-border-strong)]"
                    }`}
                  >
                    {selected.includes(status) && <span className="w-2 h-2 rounded-full bg-[var(--color-on-brand)]" />}
                  </span>
                  <span className="text-[var(--color-text-primary)]">{status}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
};
