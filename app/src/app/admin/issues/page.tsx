"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { SettingsToggles } from "@/components/ui/SettingsToggles";
import { HealthPin } from "@/components/ui/HealthPin";
import { ToastProvider, useToast } from "@/components/ui/Toast";
import { fetchJson } from "@/lib/api-client";

/**
 * Read-only review of bug reports/feedback submitted through /help/errors's
 * "Report an Issue" button (see components/ui/ReportIssueButton.tsx and
 * api/issues/route.ts). A SIBLING of /admin/db and /admin/audit -- its own
 * top-level page, reachable only from the gateway (/) sidebar, not nested
 * under or linked from within another admin page's header (same pattern as
 * Audit Log, see CLAUDE.md and app/page.tsx's navExtra comment).
 *
 * No WebSocket live-update here (unlike /admin/audit) -- issue reports don't
 * broadcast over the existing order-events WS channel (they're unrelated to
 * orders), and manual refresh is a perfectly reasonable interaction for a
 * "check for new reports" admin page that isn't watching a live operational
 * feed. A dedicated broadcast channel for this would be new infrastructure
 * for a low-frequency, non-time-sensitive feature -- not worth it unless
 * reports need to be seen in real time later.
 */
type ReportedIssueRow = {
  id: number;
  description: string;
  restaurant_name: string | null;
  context: string | null;
  contact: string | null;
  status: string;
  created_at: string;
};

function AdminIssuesContent() {
  const router = useRouter();
  const showToast = useToast();
  const [issues, setIssues] = useState<ReportedIssueRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const loadIssues = useCallback(async () => {
    setIsLoading(true);
    try {
      const data = await fetchJson<{ issues: ReportedIssueRow[] }>("/api/dev/issues");
      setIssues(data.issues);
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Failed to load reported issues", "error", err);
    } finally {
      setIsLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    fetchJson<{ authenticated: boolean; type?: string }>("/api/session")
      .then((session) => {
        if (!session.authenticated || session.type !== "admin") {
          router.push("/");
          return;
        }
        void loadIssues();
      })
      .catch(() => router.push("/"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router]);

  return (
    <div className="h-dvh flex flex-col overflow-hidden p-4 sm:p-8">
      <SettingsToggles health={<HealthPin />} />

      <div className="shrink-0">
        <PageHeader
          title="Issue Review"
          backHref="/"
          actions={
            <Button variant="secondary" onClick={() => void loadIssues()} disabled={isLoading}>
              <RefreshCw size={16} className={isLoading ? "animate-spin" : ""} />
              Refresh
            </Button>
          }
        />
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto relative z-0">
        <Card className="!p-0 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="sticky top-0 bg-[var(--color-surface-1)] z-10 shadow-[0_1px_0_var(--color-border)]">
                <tr className="border-b border-[var(--color-border)]">
                  <th scope="col" className="py-3 px-4 text-left text-[var(--color-text-muted)] font-medium">When</th>
                  <th scope="col" className="py-3 px-4 text-left text-[var(--color-text-muted)] font-medium">Description</th>
                  <th scope="col" className="py-3 px-4 text-left text-[var(--color-text-muted)] font-medium">Kitchen</th>
                  <th scope="col" className="py-3 px-4 text-left text-[var(--color-text-muted)] font-medium">Context</th>
                  <th scope="col" className="py-3 px-4 text-left text-[var(--color-text-muted)] font-medium">Contact</th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  <tr>
                    <td colSpan={5} className="py-6 px-4 text-center text-[var(--color-text-muted)]">Loading...</td>
                  </tr>
                ) : issues.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-6 px-4 text-center text-[var(--color-text-muted)]">No issues reported yet.</td>
                  </tr>
                ) : (
                  issues.map((issue) => (
                    <tr key={issue.id} className="border-b border-[var(--color-border)] last:border-0 align-top">
                      <td className="py-3 px-4 text-[var(--color-text-primary)] whitespace-nowrap">
                        {new Date(issue.created_at).toLocaleString()}
                      </td>
                      <td className="py-3 px-4 text-[var(--color-text-primary)] whitespace-pre-wrap max-w-md">
                        {issue.description}
                      </td>
                      <td className="py-3 px-4 text-[var(--color-text-secondary)]">
                        {issue.restaurant_name ?? <span className="text-[var(--color-text-muted)]">—</span>}
                      </td>
                      <td className="py-3 px-4 text-[var(--color-text-secondary)] max-w-xs">
                        {issue.context ?? <span className="text-[var(--color-text-muted)]">—</span>}
                      </td>
                      <td className="py-3 px-4 text-[var(--color-text-secondary)]">
                        {issue.contact ?? <span className="text-[var(--color-text-muted)]">Anonymous</span>}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    </div>
  );
}

export default function AdminIssuesPage() {
  return (
    <ToastProvider>
      <AdminIssuesContent />
    </ToastProvider>
  );
}
