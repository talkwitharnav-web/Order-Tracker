"use client";

import { useEffect, useRef, useState, FC } from "react";
import { Input, Label } from "@/components/ui/Input";
import { fetchJson } from "@/lib/api-client";

const DEBOUNCE_MS = 200;
const MIN_QUERY_LENGTH = 3;
const COLLAPSED_COUNT = 5;
const EXPANDED_LIMIT = 50;
type LookupState = "idle" | "loading" | "ready" | "error";

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
  const [lookupState, setLookupState] = useState<LookupState>("idle");
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
    setLookupState("loading");

    fetchJson<{ suggestions: string[] }>(
      `/api/restaurants/suggest?q=${encodeURIComponent(q)}&limit=${limit}`,
      { signal: controller.signal },
      { retries: 0 },
    )
      .then((data) => {
        if (seq !== requestSeqRef.current) return; // superseded by a newer request
        setSuggestions(data.suggestions);
        setLookupState("ready");
      })
      .catch(() => {
        if (seq !== requestSeqRef.current) return;
        setSuggestions([]);
        setLookupState("error");
      });
  };

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const trimmed = value.trim();
    if (trimmed.length < MIN_QUERY_LENGTH) {
      abortRef.current?.abort();
      requestSeqRef.current += 1;
      setSuggestions([]);
      setExpanded(false);
      setLookupState("idle");
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
  const popupVisible = open && value.trim().length >= MIN_QUERY_LENGTH && lookupState !== "idle";

  return (
    <div ref={containerRef} className="relative">
      <Label htmlFor={id}>Restaurant</Label>
      <Input
        id={id}
        type="text"
        autoComplete="off"
        value={value}
        onChange={(e) => {
          abortRef.current?.abort();
          requestSeqRef.current += 1;
          setSuggestions([]);
          setLookupState("idle");
          onChange(e.target.value);
          setOpen(true);
          setHighlightedIndex(-1);
        }}
        onFocus={() => value.trim() && setOpen(true)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        role="combobox"
        aria-expanded={popupVisible}
        aria-autocomplete="list"
        aria-controls={popupVisible ? `${id}-listbox` : undefined}
        required
      />

      {popupVisible && (
        <div
          id={`${id}-listbox`}
          role="listbox"
          aria-live="polite"
          className="dropdown-reveal absolute z-30 mt-1 w-full rounded-[var(--radius-sm)] border border-[var(--color-border-strong)] bg-[var(--color-surface-1)] shadow-lg overflow-hidden"
        >
          {lookupState === "loading" && (
            <div role="option" aria-selected="false" aria-disabled="true" className="px-4 py-3 text-sm text-[var(--color-text-muted)]">
              Searching…
            </div>
          )}
          {lookupState === "error" && (
            <div role="option" aria-selected="false" aria-disabled="true" className="px-4 py-3 text-sm text-[var(--color-danger)]">
              Suggestions are unavailable right now.
            </div>
          )}
          {lookupState === "ready" && visibleSuggestions.length === 0 && (
            <div role="option" aria-selected="false" aria-disabled="true" className="px-4 py-3 text-sm text-[var(--color-text-muted)]">
              No restaurants found.
            </div>
          )}
          {lookupState === "ready" && visibleSuggestions.length > 0 && (
            <>
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
                          ? "bg-[var(--color-brand)] text-[var(--color-on-brand)]"
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
                  onClick={() => setExpanded(true)}
                  className="w-full text-center px-4 py-2 text-xs font-semibold text-[var(--color-brand-text)] border-t border-[var(--color-border)] hover:bg-[var(--color-surface-2)] transition-colors"
                >
                  More
                </button>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
};
