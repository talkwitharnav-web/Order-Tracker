"use client";

import { useEffect, useMemo, useRef, useState, FC } from "react";
import { ChevronDown, Search } from "lucide-react";
import { useDropdownReveal } from "@/lib/useDropdownReveal";

/**
 * Multi-select restaurant filter for admin/db's Orders table -- a button
 * that opens a dropdown with its own search box and a scrollable checklist
 * of every restaurant name currently present in the orders being shown.
 * Selecting one or more restaurants filters the table to only their orders;
 * selecting none means "no filter" (shows all restaurants), matching how an
 * empty search box means "no filter" elsewhere in this app.
 */
export const RestaurantFilterDropdown: FC<{
  restaurantNames: string[];
  selected: string[];
  onChange: (selected: string[]) => void;
}> = ({ restaurantNames, selected, onChange }) => {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
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

  const sortedNames = useMemo(() => [...restaurantNames].sort((a, b) => a.localeCompare(b)), [restaurantNames]);
  const filteredNames = useMemo(
    () => sortedNames.filter((name) => name.toLowerCase().includes(query.trim().toLowerCase())),
    [sortedNames, query],
  );

  const toggleName = (name: string) => {
    onChange(selected.includes(name) ? selected.filter((n) => n !== name) : [...selected, name]);
  };

  const label =
    selected.length === 0
      ? "All Restaurants"
      : selected.length === 1
        ? selected[0]
        : `${selected.length} Restaurants`;

  return (
    <div ref={containerRef} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="true"
        aria-expanded={open}
        className={`flex items-center gap-2 px-3 py-2 text-sm rounded-[var(--radius-sm)] border transition-colors max-w-[180px] ${
          selected.length > 0
            ? "bg-[var(--color-brand)] border-[var(--color-brand)] text-white"
            : "bg-[var(--color-surface-0)] border-[var(--color-border-strong)] text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]"
        }`}
      >
        <span className="truncate">{label}</span>
        <ChevronDown size={14} className="shrink-0" />
      </button>

      {shouldRender && (
        <div
          role="menu"
          aria-label="Filter by restaurant"
          className={`${animationClass} absolute left-0 top-full mt-2 w-64 max-w-[calc(100vw-2rem)] rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface-1)] shadow-lg overflow-hidden z-40`}
        >
          <div className="p-2 border-b border-[var(--color-border)]">
            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--color-text-muted)] pointer-events-none" />
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search kitchens..."
                aria-label="Search kitchens to filter by"
                autoFocus
                className="w-full pl-8 pr-2 py-1.5 text-sm bg-[var(--color-surface-0)] text-[var(--color-text-primary)] border border-[var(--color-border-strong)] rounded-[var(--radius-sm)] focus:outline-none focus:ring-2 focus:ring-[var(--color-brand)]"
              />
            </div>
          </div>

          {selected.length > 0 && (
            <button
              onClick={() => onChange([])}
              className="w-full text-left px-3 py-2 text-xs font-medium text-[var(--color-brand-text)] hover:bg-[var(--color-surface-2)] border-b border-[var(--color-border)] transition-colors"
            >
              Clear filter ({selected.length} selected)
            </button>
          )}

          <ul className="max-h-56 overflow-y-auto py-1">
            {filteredNames.length === 0 ? (
              <li className="px-3 py-3 text-sm text-[var(--color-text-muted)]">No kitchens match.</li>
            ) : (
              filteredNames.map((name) => (
                <li key={name}>
                  <button
                    role="menuitemcheckbox"
                    aria-checked={selected.includes(name)}
                    onClick={() => toggleName(name)}
                    className="w-full text-left px-3 py-2 flex items-center gap-2 text-sm hover:bg-[var(--color-surface-2)] transition-colors"
                  >
                    <span
                      className={`shrink-0 w-4 h-4 rounded-[var(--radius-sm)] border flex items-center justify-center ${
                        selected.includes(name)
                          ? "bg-[var(--color-brand)] border-[var(--color-brand)]"
                          : "border-[var(--color-border-strong)]"
                      }`}
                    >
                      {selected.includes(name) && <span className="w-2 h-2 rounded-full bg-white" />}
                    </span>
                    <span className="truncate text-[var(--color-text-primary)]">{name}</span>
                  </button>
                </li>
              ))
            )}
          </ul>
        </div>
      )}
    </div>
  );
};
