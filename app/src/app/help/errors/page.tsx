"use client";

import { useMemo, useState } from "react";
import { Search, ChevronRight } from "lucide-react";
import { CATEGORIES, listErrorCodesByCategory, type ErrorCodeEntry } from "@/lib/error-codes";
import { SettingsToggles } from "@/components/ui/SettingsToggles";
import { ChefMascot } from "@/components/ui/ChefMascot";
import { Input } from "@/components/ui/Input";

const MASCOT_LINES = [
  "Every code in the book, right here.",
  "Something broke? Let's look it up.",
  "I keep a very tidy kitchen. Mostly.",
  "#404 isn't on the menu either.",
];

/**
 * Error-code reference -- opened from the help (?) icon in SettingsToggles,
 * and linked to directly (with a #<code> anchor) from ErrorCodeCard's "View
 * full error reference" link. Sourced straight from lib/error-codes.ts, the
 * same registry errJson() reads server-side -- a new error code is
 * automatically listed here the moment it's added to that one file.
 *
 * Client component (unlike the original server-rendered version) because
 * the sidebar category nav + live search filter both need interactive
 * state; there's no data-fetching reason to keep it server-only, and the
 * registry import is small and static either way.
 *
 * Not added to server.js's PUBLIC_ALLOWED_PREFIXES -- this is staff
 * reference material (linked from the authenticated kitchen/admin toolbar),
 * gated the same as /admin/db rather than exposed on a public LAN host.
 */
export default function ErrorCodesHelpPage() {
  const [query, setQuery] = useState("");
  const [activeCategory, setActiveCategory] = useState<string | null>(null);

  const groups = useMemo(() => listErrorCodesByCategory(), []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return groups
      .map((group) => ({
        category: group.category,
        entries: group.entries.filter((entry) => {
          if (activeCategory && group.category.slug !== activeCategory) return false;
          if (!q) return true;
          return (
            String(entry.code).includes(q) ||
            entry.title.toLowerCase().includes(q) ||
            entry.meaning.toLowerCase().includes(q)
          );
        }),
      }))
      .filter((group) => group.entries.length > 0);
  }, [groups, query, activeCategory]);

  const totalShown = filtered.reduce((sum, g) => sum + g.entries.length, 0);
  const totalAll = groups.reduce((sum, g) => sum + g.entries.length, 0);

  return (
    <div className="min-h-dvh">
      <SettingsToggles />

      {/* Hero -- mirrors a typical vendor help-center's "How can we help
          you?" search-first landing, scaled to this app's warm bistro
          identity (chef mascot, brand-tinted radial background) instead of
          a generic corporate one. */}
      <div className="relative overflow-hidden border-b border-[var(--color-border)] px-4 py-10 sm:py-14">
        <div
          className="absolute inset-0 -z-10"
          style={{
            background:
              "radial-gradient(ellipse 900px 500px at 50% -10%, color-mix(in srgb, var(--color-brand) 14%, transparent) 0%, transparent 70%)",
          }}
          aria-hidden="true"
        />
        <div className="max-w-2xl mx-auto text-center">
          <div className="flex justify-center mb-3">
            <ChefMascot size={84} lines={MASCOT_LINES} />
          </div>
          <h1 className="font-display text-3xl sm:text-4xl font-semibold text-[var(--color-text-primary)] mb-2">
            Error Code Reference
          </h1>
          <p className="text-sm sm:text-base text-[var(--color-text-secondary)] mb-6">
            Some errors in this app carry a short code, like{" "}
            <span className="font-mono font-semibold text-[var(--color-text-primary)]">#300</span>. Search or browse
            below to find out what one means and what to check.
          </p>
          <div className="relative max-w-md mx-auto">
            <Search
              className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--color-text-muted)]"
              aria-hidden="true"
            />
            <Input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by code or keyword..."
              aria-label="Search error codes"
              className="pl-10"
            />
          </div>
        </div>
      </div>

      <main className="max-w-5xl mx-auto px-4 py-8 sm:py-10 grid grid-cols-1 md:grid-cols-[220px_1fr] gap-8">
        {/* Sidebar category nav -- sticky so it stays reachable while
            scrolling a long result list, same idea as a typical help
            center's left rail (see the Google Help reference the user
            attached), just scoped to this app's 5 categories instead of a
            dozen unrelated products. */}
        <nav aria-label="Error categories" className="md:sticky md:top-8 md:self-start">
          <ul className="flex md:flex-col gap-1 overflow-x-auto md:overflow-visible pb-2 md:pb-0">
            <li>
              <button
                type="button"
                onClick={() => setActiveCategory(null)}
                aria-pressed={activeCategory === null}
                className={`w-full text-left whitespace-nowrap px-3 py-2 rounded-[var(--radius-sm)] text-sm font-medium transition-colors ${
                  activeCategory === null
                    ? "bg-[var(--color-brand)] text-[var(--color-on-brand)]"
                    : "text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-2)] hover:text-[var(--color-text-primary)]"
                }`}
              >
                All categories
              </button>
            </li>
            {CATEGORIES.map((category) => (
              <li key={category.slug}>
                <button
                  type="button"
                  onClick={() => setActiveCategory(category.slug)}
                  aria-pressed={activeCategory === category.slug}
                  className={`w-full text-left whitespace-nowrap px-3 py-2 rounded-[var(--radius-sm)] text-sm font-medium transition-colors ${
                    activeCategory === category.slug
                      ? "bg-[var(--color-brand)] text-[var(--color-on-brand)]"
                      : "text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-2)] hover:text-[var(--color-text-primary)]"
                  }`}
                >
                  {category.label}
                </button>
              </li>
            ))}
          </ul>
        </nav>

        <div className="min-w-0">
          {query.trim() && (
            <p className="text-sm text-[var(--color-text-muted)] mb-4">
              {totalShown === 0
                ? `No matches for "${query.trim()}".`
                : `Showing ${totalShown} of ${totalAll} error${totalAll === 1 ? "" : "s"}.`}
            </p>
          )}

          {filtered.length === 0 && (
            <div className="text-center py-16">
              <p className="text-[var(--color-text-secondary)]">
                Nothing matches that search. Try a code number or a word from the error message.
              </p>
            </div>
          )}

          <div className="space-y-10">
            {filtered.map((group) => (
              <section key={group.category.slug}>
                <h2 className="font-display text-xl font-semibold text-[var(--color-text-primary)]">
                  {group.category.label}
                </h2>
                <p className="text-sm text-[var(--color-text-muted)] mb-4">{group.category.blurb}</p>
                <div className="space-y-3">
                  {group.entries.map((entry) => (
                    <ErrorEntryCard key={entry.code} entry={entry} />
                  ))}
                </div>
              </section>
            ))}
          </div>
        </div>
      </main>
    </div>
  );
}

/**
 * One error's card -- summary always visible, the dev-facing "likely
 * causes" checklist collapsed behind a disclosure (most visitors just want
 * the meaning; the deeper checklist is for whoever's actually debugging a
 * report of this code, per the "usable by a dev too" requirement).
 */
function ErrorEntryCard({ entry }: { entry: ErrorCodeEntry }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div id={String(entry.code)} className="scroll-mt-24 bg-[var(--color-surface-1)] border border-[var(--color-border)] rounded-[var(--radius-md)] card-elevated overflow-hidden">
      <div className="flex items-start gap-3 p-4">
        <span className="shrink-0 font-mono font-bold text-sm px-2 py-1 rounded-[var(--radius-sm)] bg-[var(--color-surface-2)] text-[var(--color-text-primary)]">
          #{entry.code}
        </span>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-[var(--color-text-primary)]">{entry.title}</p>
          <p className="text-sm text-[var(--color-text-secondary)] mt-1">{entry.meaning}</p>
        </div>
      </div>
      {entry.causes.length > 0 && (
        <>
          <button
            type="button"
            onClick={() => setExpanded((e) => !e)}
            aria-expanded={expanded}
            className="w-full flex items-center gap-1.5 px-4 py-2.5 border-t border-[var(--color-border)] text-xs font-semibold text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-surface-2)] transition-colors"
          >
            <ChevronRight
              className={`w-3.5 h-3.5 transition-transform ${expanded ? "rotate-90" : ""}`}
              aria-hidden="true"
            />
            {expanded ? "Hide" : "Show"} likely causes &amp; what to check
          </button>
          {expanded && (
            <ul className="px-4 pb-4 pt-1 space-y-2 list-disc list-inside">
              {entry.causes.map((cause, i) => (
                <li key={i} className="text-sm text-[var(--color-text-secondary)]">
                  {cause}
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}
