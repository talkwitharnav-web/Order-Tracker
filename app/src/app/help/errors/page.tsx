import { listErrorCodesByCategory } from "@/lib/error-codes";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card } from "@/components/ui/Card";

/**
 * Static error-code reference -- opened in a new tab from the help (?) icon
 * in SettingsToggles, and linked to directly (with a #<code> anchor) from
 * ErrorCodeCard's "View full error reference" link. Server component (no
 * "use client"): this is pure read-only reference content sourced straight
 * from lib/error-codes.ts, the same registry errJson() reads server-side --
 * a new error code is automatically listed here the moment it's added to
 * that one file, nothing else to keep in sync.
 *
 * Not added to server.js's PUBLIC_ALLOWED_PREFIXES -- this is staff
 * reference material (linked from the authenticated kitchen/admin toolbar),
 * gated the same as /admin/db rather than exposed on a public LAN host.
 */
export default function ErrorCodesHelpPage() {
  const categories = listErrorCodesByCategory();

  return (
    <div className="min-h-dvh p-4 sm:p-8">
      <main className="max-w-3xl mx-auto">
        <PageHeader title="Error Code Reference" />
        <p className="text-sm text-[var(--color-text-secondary)] mb-8">
          Every error this app can show carries a short code (e.g. <span className="font-mono">#300</span>) next to
          its message. Look it up here for what it means and what to do about it.
        </p>

        <div className="space-y-8">
          {categories.map((group) => (
            <section key={group.category}>
              <h2 className="font-display text-lg font-semibold text-[var(--color-text-primary)] mb-3">
                {group.category}
              </h2>
              <div className="space-y-3">
                {group.entries.map((entry) => (
                  <Card key={entry.code} id={String(entry.code)} className="scroll-mt-4 p-4">
                    <div className="flex items-start gap-3">
                      <span className="shrink-0 font-mono font-bold text-sm px-2 py-1 rounded-[var(--radius-sm)] bg-[var(--color-surface-2)] text-[var(--color-text-primary)]">
                        #{entry.code}
                      </span>
                      <div>
                        <p className="font-semibold text-[var(--color-text-primary)]">{entry.title}</p>
                        <p className="text-sm text-[var(--color-text-secondary)] mt-1">{entry.meaning}</p>
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
            </section>
          ))}
        </div>
      </main>
    </div>
  );
}
