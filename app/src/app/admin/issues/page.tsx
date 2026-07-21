"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { PageHeader } from "@/components/ui/PageHeader";
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
 * Live-updates over the same authenticated admin WS channel (`?admin=1`) as
 * /admin/db and /admin/audit -- see api/issues/route.ts's
 * broadcastIssueReported() call and ws-hub.ts's own comment for why this is a
 * separate no-payload event rather than reusing order_updated/order_deleted.
 * No manual "Refresh" button: this page must reflect a newly-submitted
 * report the instant it lands, not on some later manual action.
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

  // Read via a ref (not a dependency) so the socket effect below doesn't
  // tear down and reconnect every time loadIssues' identity changes --
  // identical pattern to admin/audit's selectedKitchenRef/loadEventsRef.
  const loadIssuesRef = useRef(loadIssues);
  useEffect(() => {
    loadIssuesRef.current = loadIssues;
  }, [loadIssues]);

  useEffect(() => {
    let socket: WebSocket | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let closedByEffect = false;
    let reconnectAttempt = 0;

    const RECONNECT_BASE_MS = 2000;
    const RECONNECT_MAX_MS = 30000;

    const connect = () => {
      const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
      socket = new WebSocket(`${protocol}//${window.location.host}/ws?admin=1`);

      socket.onopen = () => {
        reconnectAttempt = 0;
      };

      socket.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.type === "issue_reported") {
            void loadIssuesRef.current();
          }
        } catch {
          // ignore malformed messages
        }
      };

      socket.onclose = () => {
        if (!closedByEffect) {
          const delay = Math.min(RECONNECT_BASE_MS * 2 ** reconnectAttempt, RECONNECT_MAX_MS);
          reconnectAttempt += 1;
          reconnectTimer = setTimeout(connect, delay);
        }
      };
    };

    connect();

    return () => {
      closedByEffect = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      socket?.close();
    };
  }, []);

  return (
    <div className="h-dvh flex flex-col overflow-hidden p-4 sm:p-8">
      <SettingsToggles health={<HealthPin />} />

      <div className="shrink-0">
        <PageHeader title="Issue Review" backHref="/" />
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto relative z-0">
        <Card className="!p-0 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="sticky top-0 bg-[var(--color-surface-1)] z-10 shadow-[0_1px_0_var(--color-border)]">
                <tr className="border-b border-[var(--color-border)]">
                  <th scope="col" className="py-3 px-4 text-left text-[var(--color-text-muted)] font-medium">When</th>
                  <th scope="col" className="py-3 px-4 text-left text-[var(--color-text-muted)] font-medium">Kitchen</th>
                  <th scope="col" className="py-3 px-4 text-left text-[var(--color-text-muted)] font-medium">Context</th>
                  <th scope="col" className="py-3 px-4 text-left text-[var(--color-text-muted)] font-medium">Issue</th>
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
                      <td className="py-3 px-4 text-[var(--color-text-secondary)]">
                        {issue.restaurant_name ?? <span className="text-[var(--color-text-muted)]">—</span>}
                      </td>
                      <td className="py-3 px-4 text-[var(--color-text-secondary)] max-w-xs">
                        {issue.context ?? <span className="text-[var(--color-text-muted)]">—</span>}
                      </td>
                      <td className="py-3 px-4 text-[var(--color-text-primary)] whitespace-pre-wrap max-w-md">
                        {issue.description}
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
