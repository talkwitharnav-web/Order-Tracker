"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Search, X, ShieldAlert } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Modal, ModalActions } from "@/components/ui/Modal";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { SettingsToggles } from "@/components/ui/SettingsToggles";
import { HealthPin } from "@/components/ui/HealthPin";
import { ToastProvider, useToast } from "@/components/ui/Toast";
import { fetchJson, fetchWithRetry, ApiError } from "@/lib/api-client";

/**
 * History of every order status transition across every kitchen -- "who
 * did what" (see /api/dev/audit and db.ts's order_status_events table
 * comment). Deliberately a fully independent page at /admin/audit -- a
 * SIBLING of /admin/db and /admin/staff, not nested under or reachable
 * through /admin/db -- linked from the post-login gateway sidebar (see
 * app/page.tsx's navExtra) alongside "Access DB", not from within the DB
 * console's own header. Data itself is already durably persisted in
 * Postgres (order_status_events is a real table, not in-memory).
 *
 * Default view is the full chronological log across all kitchens. Typing in
 * the kitchen search narrows to matching kitchen names in a dropdown;
 * picking one filters the log to that kitchen AND reveals a second,
 * employee-name filter scoped to people seen in that kitchen's own events
 * (an employee name is only unique per-restaurant, not globally, so that
 * filter only makes sense once a kitchen is chosen -- matches the API's own
 * 400 if employeeName were sent without restaurantName).
 *
 * Purge Audit Log requires typing the exact phrase "PURGE AUDIT" -- its own
 * distinct phrase from /admin/db's "PURGE DATABASE", so the two irreversible
 * actions (wipe every kitchen/order vs. wipe only this history) can never be
 * triggered by muscle-memory or a stray copy-paste into the wrong modal.
 */

type AuditEventRow = {
  id: number;
  order_id: number | null;
  // Nullable: an EmployeeLogout event (see api/restaurants/by-name/
  // [restaurantName]/employees/logout) has no associated order at all.
  order_number: string | null;
  restaurant_name: string;
  from_status: string | null;
  to_status: string;
  employee_name: string | null;
  created_at: string;
};

function AdminAuditContent() {
  const router = useRouter();
  const showToast = useToast();
  const [events, setEvents] = useState<AuditEventRow[]>([]);
  const [restaurantNames, setRestaurantNames] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const [kitchenSearch, setKitchenSearch] = useState("");
  const [kitchenDropdownOpen, setKitchenDropdownOpen] = useState(false);
  const [selectedKitchen, setSelectedKitchen] = useState<string | null>(null);
  const [employeeFilter, setEmployeeFilter] = useState<string>("");

  const [purgeModalOpen, setPurgeModalOpen] = useState(false);
  const [purgeConfirmationInput, setPurgeConfirmationInput] = useState("");
  const [purging, setPurging] = useState(false);

  const loadEvents = useCallback(
    async (restaurantName: string | null) => {
      setIsLoading(true);
      try {
        const params = new URLSearchParams();
        if (restaurantName) params.set("restaurantName", restaurantName);
        const data = await fetchJson<{ events: AuditEventRow[]; restaurantNames: string[] }>(
          `/api/dev/audit${params.toString() ? `?${params}` : ""}`,
        );
        setEvents(data.events);
        setRestaurantNames(data.restaurantNames);
      } catch (err) {
        showToast(err instanceof Error ? err.message : "Failed to load audit log", "error", err);
      } finally {
        setIsLoading(false);
      }
    },
    [showToast],
  );

  useEffect(() => {
    fetchJson<{ authenticated: boolean; type?: string }>("/api/session")
      .then((session) => {
        if (!session.authenticated || session.type !== "admin") {
          router.push("/");
          return;
        }
        void loadEvents(null);
      })
      .catch(() => router.push("/"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router]);

  // Every order creation/status-change/Undo writes a row to order_status_events
  // AND calls the shared ws-hub broadcast() in the same request (see
  // api/orders/route.ts and api/orders/[id]/route.ts) -- broadcast() already
  // fans "order_updated"/"order_deleted" out to every admin socket (see
  // lib/ws-hub.ts), the exact same channel /admin/db already uses to live-update
  // without polling. Reusing it here means the audit log gets pushed updates
  // instantly instead of requiring a manual refresh, with no separate 5s poll.
  // Re-run loadEvents with whatever kitchen is currently selected -- read via a
  // ref (not a dependency) so the socket effect below doesn't tear down and
  // reconnect every time the user changes the kitchen filter.
  const selectedKitchenRef = useRef(selectedKitchen);
  useEffect(() => {
    selectedKitchenRef.current = selectedKitchen;
  }, [selectedKitchen]);
  const loadEventsRef = useRef(loadEvents);
  useEffect(() => {
    loadEventsRef.current = loadEvents;
  }, [loadEvents]);

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
          if (data.type === "order_updated" || data.type === "order_deleted") {
            void loadEventsRef.current(selectedKitchenRef.current);
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

  const closePurgeModal = () => {
    setPurgeModalOpen(false);
    setPurgeConfirmationInput("");
  };

  const handlePurgeAudit = async () => {
    if (purgeConfirmationInput !== "PURGE AUDIT") return;
    setPurging(true);
    try {
      const res = await fetchWithRetry("/api/dev/audit", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirmation: "PURGE AUDIT" }),
      });
      const resJson = await res.json().catch(() => ({}));
      if (!res.ok) throw new ApiError(res.status, resJson.error || `Action failed with status: ${res.status}`, resJson.code);
      closePurgeModal();
      showToast("Audit log purged successfully!", "success");
      setSelectedKitchen(null);
      setKitchenSearch("");
      setEmployeeFilter("");
      void loadEvents(null);
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Failed to purge audit log", "error", err);
    } finally {
      setPurging(false);
    }
  };

  const matchingKitchens = restaurantNames.filter((name) =>
    name.toLowerCase().includes(kitchenSearch.trim().toLowerCase()),
  );

  const selectKitchen = (name: string) => {
    setSelectedKitchen(name);
    setKitchenSearch(name);
    setKitchenDropdownOpen(false);
    setEmployeeFilter("");
    void loadEvents(name);
  };

  const clearKitchen = () => {
    setSelectedKitchen(null);
    setKitchenSearch("");
    setEmployeeFilter("");
    void loadEvents(null);
  };

  // Employee names seen within the currently-loaded (already kitchen-scoped)
  // events -- only meaningful once a kitchen is selected, matching the API's
  // own requirement that employeeName filtering needs restaurantName too.
  const employeeNames = selectedKitchen
    ? Array.from(new Set(events.map((e) => e.employee_name).filter((n): n is string => !!n))).sort((a, b) =>
        a.localeCompare(b),
      )
    : [];

  const visibleEvents = employeeFilter
    ? events.filter((e) => e.employee_name === employeeFilter)
    : events;

  return (
    <div className="h-dvh flex flex-col overflow-hidden p-4 sm:p-8">
      <SettingsToggles health={<HealthPin showAuditSize />} />

      <Modal isOpen={purgeModalOpen} title="Purge Audit Log" onClose={closePurgeModal} danger>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void handlePurgeAudit();
          }}
        >
          <p className="text-[var(--color-text-secondary)] mb-6">
            This permanently deletes every audit event for every kitchen. It does NOT delete any restaurant or
            order -- only this history. THIS ACTION IS IRREVERSIBLE.
          </p>
          <div className="mb-2">
            <label htmlFor="purge-audit-confirmation" className="block text-sm font-medium text-[var(--color-text-primary)] mb-2">
              Type <strong>PURGE AUDIT</strong> to continue
            </label>
            <Input
              id="purge-audit-confirmation"
              type="text"
              value={purgeConfirmationInput}
              onChange={(event) => setPurgeConfirmationInput(event.target.value)}
              autoComplete="off"
            />
          </div>
          <ModalActions
            onCancel={closePurgeModal}
            onConfirm={handlePurgeAudit}
            danger
            confirmLabel="Purge Audit Log"
            confirmDisabled={purging || purgeConfirmationInput !== "PURGE AUDIT"}
            submit
          />
        </form>
      </Modal>

      <div className="shrink-0">
        <PageHeader
          title="Audit Log"
          backHref="/"
          actions={
            <Button variant="danger" onClick={() => setPurgeModalOpen(true)}>
              <ShieldAlert size={16} />
              Purge Audit Log
            </Button>
          }
        />
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto relative z-0">
        <div className="flex flex-wrap items-start gap-3 mb-4">
          <div className="relative w-full max-w-md">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-text-muted)] pointer-events-none" />
            <Input
              type="text"
              value={kitchenSearch}
              onChange={(e) => {
                setKitchenSearch(e.target.value);
                setKitchenDropdownOpen(true);
                if (selectedKitchen) clearKitchen();
              }}
              onFocus={() => setKitchenDropdownOpen(true)}
              placeholder="Search a kitchen to filter by..."
              aria-label="Search kitchen to filter audit log"
              className="pl-9 pr-9"
            />
            {selectedKitchen && (
              <button
                type="button"
                onClick={clearKitchen}
                aria-label="Clear kitchen filter"
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            )}

            {kitchenDropdownOpen && !selectedKitchen && kitchenSearch.trim() !== "" && (
              <Card className="!p-0 absolute left-0 top-full mt-1 w-full max-h-64 overflow-y-auto z-30 shadow-lg">
                {matchingKitchens.length === 0 ? (
                  <p className="text-sm text-[var(--color-text-muted)] p-3">No kitchen matches &ldquo;{kitchenSearch}&rdquo;.</p>
                ) : (
                  <ul>
                    {matchingKitchens.map((name) => (
                      <li key={name} className="border-b border-[var(--color-border)] last:border-0">
                        <button
                          type="button"
                          onClick={() => selectKitchen(name)}
                          className="w-full text-left px-4 py-2.5 hover:bg-[var(--color-surface-2)] text-[var(--color-text-primary)] transition-colors text-sm"
                        >
                          {name}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </Card>
            )}
          </div>

          {selectedKitchen && employeeNames.length > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setEmployeeFilter("")}
                className={`px-3 py-1.5 rounded-[var(--radius-full)] text-xs font-semibold border transition-colors ${
                  employeeFilter === ""
                    ? "bg-[var(--color-brand)] text-[var(--color-on-brand)] border-[var(--color-brand)]"
                    : "bg-[var(--color-surface-2)] text-[var(--color-text-secondary)] border-[var(--color-border-strong)]"
                }`}
              >
                Everyone
              </button>
              {employeeNames.map((name) => (
                <button
                  key={name}
                  type="button"
                  onClick={() => setEmployeeFilter(name)}
                  className={`px-3 py-1.5 rounded-[var(--radius-full)] text-xs font-semibold border transition-colors ${
                    employeeFilter === name
                      ? "bg-[var(--color-brand)] text-[var(--color-on-brand)] border-[var(--color-brand)]"
                      : "bg-[var(--color-surface-2)] text-[var(--color-text-secondary)] border-[var(--color-border-strong)]"
                  }`}
                >
                  {name}
                </button>
              ))}
            </div>
          )}
        </div>

        <Card className="!p-0 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="sticky top-0 bg-[var(--color-surface-1)] z-10 shadow-[0_1px_0_var(--color-border)]">
                <tr className="border-b border-[var(--color-border)]">
                  <th scope="col" className="py-3 px-4 text-left text-[var(--color-text-muted)] font-medium">When</th>
                  <th scope="col" className="py-3 px-4 text-left text-[var(--color-text-muted)] font-medium">Kitchen</th>
                  <th scope="col" className="py-3 px-4 text-left text-[var(--color-text-muted)] font-medium">Order</th>
                  <th scope="col" className="py-3 px-4 text-left text-[var(--color-text-muted)] font-medium">Change</th>
                  <th scope="col" className="py-3 px-4 text-left text-[var(--color-text-muted)] font-medium">By</th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  <tr>
                    <td colSpan={5} className="py-6 px-4 text-center text-[var(--color-text-muted)]">Loading...</td>
                  </tr>
                ) : visibleEvents.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-6 px-4 text-center text-[var(--color-text-muted)]">No audit events match.</td>
                  </tr>
                ) : (
                  visibleEvents.map((event) => (
                    <tr key={event.id} className="border-b border-[var(--color-border)] last:border-0">
                      <td className="py-3 px-4 text-[var(--color-text-primary)] whitespace-nowrap">
                        {new Date(event.created_at).toLocaleString()}
                      </td>
                      <td className="py-3 px-4 text-[var(--color-text-primary)]">{event.restaurant_name}</td>
                      <td className="py-3 px-4 text-[var(--color-text-secondary)]">
                        {event.order_number ?? <span className="text-[var(--color-text-muted)]">—</span>}
                      </td>
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-2">
                          {event.to_status === "EmployeeLogout" ? (
                            // A staff sign-out has no order/status transition
                            // at all -- see the "Logout Staff" flow in
                            // Dashboard.tsx, distinct from the kitchen itself
                            // logging out (which never reaches this table).
                            <span className="text-xs font-medium text-[var(--color-text-muted)]">
                              {event.employee_name ?? "An employee"} logged out
                            </span>
                          ) : event.to_status === "PickedUp" ? (
                            // Kitchen-side "Mark as Picked Up" -- also a
                            // lifecycle marker, not a real order status; the
                            // order's own Complete status is unaffected, this
                            // just records who confirmed the handoff.
                            <span className="text-xs font-semibold text-[var(--color-success)]">Picked Up</span>
                          ) : event.to_status === "Deleted" ? (
                            // "Deleted" is a lifecycle event, not a real order
                            // status -- StatusBadge/normalizeStatus only know
                            // Received/Preparing/Complete (see SYSTEM_MEMORY.md's
                            // status-vocab note) and would warn + fall back to
                            // "Received" if handed this literally. Render it as
                            // its own danger-toned label instead of a StatusBadge.
                            <>
                              {event.from_status && <StatusBadge status={event.from_status} />}
                              <span className="text-[var(--color-text-muted)]">&rarr;</span>
                              <span className="text-xs font-semibold text-[var(--color-danger)]">Deleted</span>
                            </>
                          ) : event.from_status ? (
                            <>
                              <StatusBadge status={event.from_status} />
                              <span className="text-[var(--color-text-muted)]">&rarr;</span>
                              <StatusBadge status={event.to_status} />
                            </>
                          ) : (
                            <>
                              <span className="text-xs font-medium text-[var(--color-text-muted)]">Created</span>
                              <span className="text-[var(--color-text-muted)]">&rarr;</span>
                              <StatusBadge status={event.to_status} />
                            </>
                          )}
                        </div>
                      </td>
                      <td className="py-3 px-4 text-[var(--color-text-secondary)]">
                        {event.employee_name ?? <span className="text-[var(--color-text-muted)]">Unattributed</span>}
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

export default function AdminAuditPage() {
  return (
    <ToastProvider>
      <AdminAuditContent />
    </ToastProvider>
  );
}
