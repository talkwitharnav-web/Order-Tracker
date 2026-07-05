"use client";

import { useEffect, useRef, useState, FC } from "react";
import { Input, Label } from "@/components/ui/Input";
import { fetchJson } from "@/lib/api-client";

const DEBOUNCE_MS = 200;
const COLLAPSED_COUNT = 5;
const EXPANDED_LIMIT = 50;

/**
 * Restaurant-name input with a live, ranked autocomplete dropdown backed by
 * GET /api/restaurants/suggest. Shows the top 5 matches by default with a
 * "More" button that expands to a scrollable list of up to 50, most
 * relevant first (ranking happens server-side, see the route for the exact
 * formula). Debounced so normal typing speed doesn't fire a request per
 * keystroke, and every request is aborted if superseded by a newer one
 * (fast typers won't see a stale response race ahead of a fresher one).
 */
export const RestaurantAutocomplete: FC<{
  id: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}> = ({ id, value, onChange, placeholder }) => {
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [expanded, setExpanded] = useState(false);
  const [open, setOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const containerRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const requestSeqRef = useRef(0);

  const fetchSuggestions = (q: string, limit: number) => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    const seq = ++requestSeqRef.current;

    fetchJson<{ suggestions: string[] }>(
      `/api/restaurants/suggest?q=${encodeURIComponent(q)}&limit=${limit}`,
      { signal: controller.signal },
      { retries: 0 },
    )
      .then((data) => {
        if (seq !== requestSeqRef.current) return; // superseded by a newer request
        setSuggestions(data.suggestions);
      })
      .catch(() => {
        if (seq !== requestSeqRef.current) return;
        setSuggestions([]);
      });
  };

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const trimmed = value.trim();
    if (!trimmed) {
      setSuggestions([]);
      setExpanded(false);
      return;
    }
    debounceRef.current = setTimeout(() => {
      fetchSuggestions(trimmed, expanded ? EXPANDED_LIMIT : COLLAPSED_COUNT);
    }, DEBOUNCE_MS);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [value, expanded]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const selectSuggestion = (name: string) => {
    onChange(name);
    setOpen(false);
    setExpanded(false);
    setHighlightedIndex(-1);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!open || suggestions.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlightedIndex((i) => Math.min(i + 1, suggestions.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlightedIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter" && highlightedIndex >= 0) {
      e.preventDefault();
      selectSuggestion(suggestions[highlightedIndex]);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  };

  const visibleSuggestions = expanded ? suggestions : suggestions.slice(0, COLLAPSED_COUNT);
  const showMoreButton = !expanded && suggestions.length >= COLLAPSED_COUNT;

  return (
    <div ref={containerRef} className="relative">
      <Label htmlFor={id}>Restaurant</Label>
      <Input
        id={id}
        type="text"
        autoComplete="off"
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
          setHighlightedIndex(-1);
        }}
        onFocus={() => value.trim() && setOpen(true)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        role="combobox"
        aria-expanded={open}
        aria-autocomplete="list"
        aria-controls={`${id}-listbox`}
        required
      />

      {open && visibleSuggestions.length > 0 && (
        <div
          id={`${id}-listbox`}
          role="listbox"
          className="absolute z-30 mt-1 w-full rounded-[var(--radius-sm)] border border-[var(--color-border-strong)] bg-[var(--color-surface-1)] shadow-lg overflow-hidden"
        >
          <ul className={expanded ? "max-h-64 overflow-y-auto" : ""}>
            {visibleSuggestions.map((name, i) => (
              <li key={name} role="option" aria-selected={highlightedIndex === i}>
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => selectSuggestion(name)}
                  onMouseEnter={() => setHighlightedIndex(i)}
                  className={`w-full text-left px-4 py-2.5 text-sm transition-colors ${
                    highlightedIndex === i
                      ? "bg-[var(--color-brand)] text-white"
                      : "text-[var(--color-text-primary)] hover:bg-[var(--color-surface-2)]"
                  }`}
                >
                  {name}
                </button>
              </li>
            ))}
          </ul>
          {showMoreButton && (
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                setExpanded(true);
                fetchSuggestions(value.trim(), EXPANDED_LIMIT);
              }}
              className="w-full text-center px-4 py-2 text-xs font-semibold text-[var(--color-brand-text)] border-t border-[var(--color-border)] hover:bg-[var(--color-surface-2)] transition-colors"
            >
              More
            </button>
          )}
        </div>
      )}
    </div>
  );
};
