"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { Database, Trash2, Key, ShieldAlert, RotateCcw, Search, ArrowUp, ArrowDown, ArrowUpDown, Pencil, Users, Loader2 } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Modal, ModalActions } from "@/components/ui/Modal";
import { ToastProvider, useToast } from "@/components/ui/Toast";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { SettingsToggles } from "@/components/ui/SettingsToggles";
import { HealthPin } from "@/components/ui/HealthPin";
import { RestaurantFilterDropdown } from "@/components/ui/RestaurantFilterDropdown";
import { StatusFilterDropdown } from "@/components/ui/StatusFilterDropdown";
import { CopyableValue } from "@/components/ui/CopyableValue";
import { Select } from "@/components/ui/Select";
import { StatusDurationCell, StatusDurationCompleteCell } from "@/components/ui/StatusDurationCell";
import { BackgroundArt } from "@/components/ui/BackgroundArt";
import { StrengthMeter } from "@/components/ui/StrengthMeter";
import { fetchJson, fetchWithRetry } from "@/lib/api-client";
import { scorePasswordStrength } from "@/lib/credential-strength";
import { useWindowedOrders, PREFETCH_ROWS, type Order, type Restaurant, type OrderSortKey, type SortDirection } from "@/lib/useWindowedOrders";

type OrderRow = Order & { isDeleted: boolean };

function toOrderRow(o: Order): OrderRow {
  return { ...o, isDeleted: o.deleted_at !== null };
}

/** Reusable sortable <th> -- click cycles asc -> desc -> off (no sort). */
function SortableHeader({
  label,
  sortKey,
  activeSort,
  onSort,
  className = "",
}: {
  label: string;
  sortKey: OrderSortKey;
  activeSort: { key: OrderSortKey; direction: SortDirection } | null;
  onSort: (key: OrderSortKey) => void;
  className?: string;
}) {
  const isActive = activeSort?.key === sortKey;
  const Icon = isActive ? (activeSort!.direction === "asc" ? ArrowUp : ArrowDown) : ArrowUpDown;
  return (
    <th scope="col" className={`py-3 px-4 text-left text-[var(--color-text-muted)] font-medium ${className}`}>
      <button
        onClick={() => onSort(sortKey)}
        className={`flex items-center gap-1.5 hover:text-[var(--color-text-primary)] transition-colors ${
          isActive ? "text-[var(--color-text-primary)]" : ""
        }`}
        aria-label={`Sort by ${label}${isActive ? ` (currently ${activeSort!.direction}ending)` : ""}`}
      >
        {label}
        <Icon size={14} className="shrink-0" />
      </button>
    </th>
  );
}

interface ConfirmState {
  isOpen: boolean;
  title: string;
  message: string;
  danger: boolean;
  onConfirm: () => void;
  confirmationPhrase?: string;
}

const EMPTY_CONFIRM: ConfirmState = {
  isOpen: false,
  title: "",
  message: "",
  danger: false,
  onConfirm: () => {},
};

function AdminDbContent() {
  const router = useRouter();
  const showToast = useToast();
  const [restaurants, setRestaurants] = useState<Restaurant[]>([]);
  const [deletedCount, setDeletedCount] = useState(0);
  const [showDeleted, setShowDeleted] = useState(false);
  const [restaurantSearch, setRestaurantSearch] = useState("");
  const [orderSearchInput, setOrderSearchInput] = useState("");
  const [orderSearch, setOrderSearch] = useState("");
  const [orderRestaurantFilter, setOrderRestaurantFilter] = useState<string[]>([]);
  const [orderStatusFilter, setOrderStatusFilter] = useState<string[]>([]);
  const [orderSort, setOrderSort] = useState<{ key: OrderSortKey; direction: SortDirection } | null>(null);
  const [isSessionLoading, setIsSessionLoading] = useState(true);
  const [confirmState, setConfirmState] = useState<ConfirmState>(EMPTY_CONFIRM);
  const [confirmationInput, setConfirmationInput] = useState("");
  // Order rows mid-slide-out-to-delete -- see deleteNow below. Restaurants
  // aren't included here: this table's rows aren't individually
  // slide-animated today and the request was specifically about orders.
  const [exitingOrderIds, setExitingOrderIds] = useState<Set<number>>(new Set());
  const [passwordResetTarget, setPasswordResetTarget] = useState<number | null>(null);
  const [newPassword, setNewPassword] = useState("");
  const [renameTarget, setRenameTarget] = useState<{ id: number; currentName: string } | null>(null);
  const [newName, setNewName] = useState("");
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // Debounce the search box the same way the old client-side implementation
  // did -- typing triggers a real Postgres query now (see useWindowedOrders),
  // so debouncing matters even more here than it did for pure in-memory
  // filtering.
  useEffect(() => {
    const timer = setTimeout(() => setOrderSearch(orderSearchInput), 300);
    return () => clearTimeout(timer);
  }, [orderSearchInput]);

  const handleFirstLoad = useCallback((data: { restaurants?: Restaurant[]; deletedCount?: number }) => {
    if (data.restaurants) setRestaurants(data.restaurants);
    if (data.deletedCount !== undefined) setDeletedCount(data.deletedCount);
  }, []);

  const {
    rows: orderRowsRaw,
    isLoadingTop,
    isLoadingBottom,
    isInitialLoading,
    loadMoreTop,
    loadMoreBottom,
    reload,
  } = useWindowedOrders(
    {
      includeDeleted: showDeleted,
      orderSearch,
      restaurantNames: orderRestaurantFilter,
      statusFilter: orderStatusFilter,
      sort: orderSort,
    },
    handleFirstLoad,
  );

  const orderRows: OrderRow[] = orderRowsRaw.map(toOrderRow);

  useEffect(() => {
    fetchJson<{ authenticated: boolean; type?: string }>("/api/session")
      .then((session) => {
        if (!(session.authenticated && session.type === "admin")) {
          router.push("/");
        }
      })
      .catch(() => router.push("/"))
      .finally(() => setIsSessionLoading(false));
  }, [router]);

  // Every order created/advanced/deleted elsewhere (a kitchen, another admin
  // tab) should show up here without a manual reload. The app already has a
  // WS hub for exactly this (see lib/ws-hub.ts, used today by the customer
  // tracker) -- it's normally scoped to one restaurant per socket, but this
  // page needs every restaurant's activity at once, so it connects via the
  // separate `?admin=1` path (authenticated by the admin_session cookie
  // server-side, see server.js's /ws upgrade handler) instead of declaring
  // one restaurant name. Reconnects with the same exponential backoff as the
  // customer tracker's socket rather than a fixed interval, so a real outage
  // doesn't hammer the server with retries.
  const reloadRef = useRef(reload);
  useEffect(() => {
    reloadRef.current = reload;
  }, [reload]);

  // Refetching mid-edit would reset in-progress input under an open
  // destructive-confirm/password/rename modal -- read via a ref (not a
  // dependency) so the socket effect below doesn't tear down and reopen the
  // connection every time a modal opens/closes.
  const anyModalOpen = confirmState.isOpen || passwordResetTarget !== null || renameTarget !== null;
  const anyModalOpenRef = useRef(anyModalOpen);
  useEffect(() => {
    anyModalOpenRef.current = anyModalOpen;
  }, [anyModalOpen]);

  useEffect(() => {
    if (isSessionLoading) return;
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
          // Windowed pagination means a live insert/delete elsewhere can't be
          // patched into the loaded window in place (it may belong on a page
          // that isn't even loaded) -- reload() re-fetches page one of the
          // current query, same as a fresh mount, which is the correct
          // behavior since "page one" is exactly where a brand new order
          // (highest id / most recent) belongs under the default sort anyway.
          // restaurant_created has no payload to patch in place with (a
          // brand new kitchen isn't part of the currently loaded order
          // window at all) -- same as order_updated/order_deleted, the fix
          // is just re-running reload(), which already re-fetches BOTH page
          // one of orders AND the restaurants list in one /api/dev/db
          // response (see useWindowedOrders' reload() -> onFirstLoad).
          if (data.type === "order_updated" || data.type === "order_deleted" || data.type === "restaurant_created") {
            if (!anyModalOpenRef.current) void reloadRef.current();
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
  }, [isSessionLoading]);

  // Fires on every scroll of the Orders table's own scroll container -- a
  // fast fling-scroll can dispatch dozens of raw `scroll` events per second,
  // so the actual edge-distance check is throttled to at most once per
  // animation frame (rAF), not run on every single event. Requests the next
  // page once the user is within PREFETCH_ROWS-worth of pixels from either
  // loaded edge, and the previous page once scrolled back near the top after
  // some has been evicted. No "Load More" button: this is the same near-edge
  // auto-load Gmail/Discord/iMessage use for huge lists. A rough
  // px-per-row estimate is fine here -- it only controls how early prefetch
  // kicks in, not correctness. loadMoreTop/loadMoreBottom themselves are
  // additionally guarded against re-entrancy by a synchronous ref inside
  // useWindowedOrders (see its own comment), so even rapid repeat calls here
  // can never stack up parallel duplicate requests.
  const ROW_HEIGHT_PX = 49;
  const scrollRafRef = useRef<number | null>(null);
  const handleOrdersScroll = useCallback(() => {
    if (scrollRafRef.current !== null) return;
    scrollRafRef.current = requestAnimationFrame(() => {
      scrollRafRef.current = null;
      const el = scrollContainerRef.current;
      if (!el) return;
      const prefetchDistance = PREFETCH_ROWS * ROW_HEIGHT_PX;
      if (el.scrollTop + el.clientHeight >= el.scrollHeight - prefetchDistance) {
        void loadMoreBottom();
      }
      if (el.scrollTop <= prefetchDistance) {
        void loadMoreTop();
      }
    });
  }, [loadMoreBottom, loadMoreTop]);

  useEffect(() => () => {
    if (scrollRafRef.current !== null) cancelAnimationFrame(scrollRafRef.current);
  }, []);

  const handleLogout = async () => {
    try {
      await fetchWithRetry("/api/logout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "admin" }),
      });
    } catch {
      // Logout is best-effort client-side navigation-wise: even if the
      // network call never lands, sending the user back to "/" is still
      // the right outcome (the cookie will simply still be valid there,
      // which is safe, not a security gap — see logout route).
    }
    router.push("/");
  };

  const closeConfirm = () => {
    setConfirmState(EMPTY_CONFIRM);
    setConfirmationInput("");
  };

  const performAction = async (action: () => ReturnType<typeof fetchWithRetry>, successMessage: string) => {
    closeConfirm();
    try {
      const res = await action();
      const resJson = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(resJson.error || `Action failed with status: ${res.status}`);
      }
      showToast(successMessage, "success");
      void reload();
    } catch (err) {
      showToast(err instanceof Error ? err.message : "An unknown error occurred", "error");
    }
  };

  const handleSeed = () => {
    setConfirmState({
      isOpen: true,
      title: "Seed Database",
      message: "This clears existing data, then creates 5 sample kitchens and 35 realistic orders across every status and history view. Every sample kitchen uses password123.",
      danger: false,
      confirmationPhrase: "SEED DATABASE",
      onConfirm: () =>
        performAction(
          () => fetchWithRetry("/api/dev/seed", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ confirmation: "SEED DATABASE" }),
          }),
          "Seeded 5 kitchens and 35 sample orders!",
        ),
    });
  };

  const handlePurge = () => {
    setConfirmState({
      isOpen: true,
      title: "Purge Database",
      message: "Are you sure you want to purge the database? THIS ACTION IS IRREVERSIBLE.",
      danger: true,
      confirmationPhrase: "PURGE DATABASE",
      onConfirm: () =>
        performAction(
          () => fetchWithRetry("/api/dev/db", {
            method: "DELETE",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ confirmation: "PURGE DATABASE" }),
          }),
          "Database purged successfully!",
        ),
    });
  };

  // Matches .animate-order-exit's own animation duration in globals.css.
  // A plain timer, not an `animationend` listener -- Reduce Motion disables
  // that animation outright (`animation: none !important`), which would
  // mean the listener never fires and the row would stay stuck mid-delete.
  const ORDER_EXIT_ANIMATION_MS = 300;

  const deleteNow = (type: "restaurant" | "order", id: number) => {
    if (type === "order") {
      // Play the slide-out first, then run the real delete (and the
      // reload() refetch performAction triggers) once the animation has had
      // time to finish -- doing this immediately, as the generic path still
      // does for restaurants, left no time for any exit animation to render
      // before the row vanished on the next refetch.
      setExitingOrderIds((prev) => new Set(prev).add(id));
      setTimeout(() => {
        performAction(
          () => fetchWithRetry(`/api/orders/${id}`, { method: "DELETE" }),
          "Order deleted successfully!",
        ).finally(() => {
          setExitingOrderIds((prev) => {
            const next = new Set(prev);
            next.delete(id);
            return next;
          });
        });
      }, ORDER_EXIT_ANIMATION_MS);
      return;
    }
    performAction(
      () => fetchWithRetry(`/api/${type}s/${id}`, { method: "DELETE" }),
      `${type.charAt(0).toUpperCase() + type.slice(1)} deleted successfully!`,
    );
  };

  // Holding Shift while clicking Delete skips the confirmation modal --
  // deliberately holding an extra key already signals intent, so the modal
  // would just be friction at that point. Same pattern as the Kitchen
  // Dashboard's delete buttons.
  const handleDelete = (type: "restaurant" | "order", id: number, skipConfirm: boolean) => {
    if (skipConfirm) {
      deleteNow(type, id);
      return;
    }
    setConfirmState({
      isOpen: true,
      title: `Delete ${type}`,
      message: `Are you sure you want to delete this ${type}? This cannot be undone.`,
      danger: true,
      onConfirm: () => deleteNow(type, id),
    });
  };

  const handleUndelete = (type: "restaurant" | "order", id: number) => {
    performAction(
      () => fetchWithRetry(`/api/${type}s/${id}/undelete`, { method: "POST" }),
      `${type.charAt(0).toUpperCase() + type.slice(1)} restored successfully!`,
    );
  };

  const handleStatusChange = (orderId: number, newStatus: string) => {
    performAction(
      () =>
        fetchWithRetry(`/api/orders/${orderId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: newStatus }),
        }),
      "Order status updated successfully!",
    );
  };

  const handlePasswordReset = async () => {
    if (!passwordResetTarget) return;
    try {
      const res = await fetchWithRetry(`/api/restaurants/${passwordResetTarget}/password`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ newPassword }),
      });
      const resJson = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(resJson.error || `Action failed with status: ${res.status}`);
      showToast("Password updated successfully!", "success");
      setNewPassword("");
      setPasswordResetTarget(null);
      void reload();
    } catch (err) {
      showToast(err instanceof Error ? err.message : "An unknown error occurred", "error");
    }
  };

  const handleRename = async () => {
    if (!renameTarget) return;
    try {
      const res = await fetchWithRetry(`/api/restaurants/${renameTarget.id}/rename`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ newName }),
      });
      const resJson = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(resJson.error || `Action failed with status: ${res.status}`);
      // Any currently logged-in kitchen session for this restaurant will
      // stop matching after a rename (its session cookie still has the old
      // name -- see the rename route's own comment) -- surface that here
      // rather than let it look like a silent, unexplained logout later.
      showToast(
        resJson.note ? `Kitchen renamed successfully. ${resJson.note}` : "Kitchen renamed successfully!",
        "success",
      );
      setNewName("");
      setRenameTarget(null);
      void reload();
    } catch (err) {
      showToast(err instanceof Error ? err.message : "An unknown error occurred", "error");
    }
  };

  const handleSort = (key: OrderSortKey) => {
    setOrderSort((prev) => {
      if (!prev || prev.key !== key) return { key, direction: "asc" };
      if (prev.direction === "asc") return { key, direction: "desc" };
      return null; // third click clears the sort
    });
  };

  // Sourced from the full `restaurants` list (every live kitchen, uncapped),
  // NOT from the windowed order rows -- those are only ever a partial slice
  // of the full history, so a kitchen whose currently-loaded orders don't
  // include any of its own would otherwise vanish from this filter entirely
  // even though it's a perfectly live, valid restaurant.
  const allRestaurantNames = Array.from(new Set(restaurants.map((r) => r.name))).sort((a, b) => a.localeCompare(b));

  if (isSessionLoading) {
    return (
      <div className="flex justify-center items-center min-h-dvh text-[var(--color-text-secondary)]">
        Loading...
      </div>
    );
  }

  return (
    <>
      <BackgroundArt />
      <Modal isOpen={confirmState.isOpen} title={confirmState.title} onClose={closeConfirm} danger={confirmState.danger}>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            if (!confirmState.confirmationPhrase || confirmationInput === confirmState.confirmationPhrase) {
              confirmState.onConfirm();
            }
          }}
        >
          <p className="text-[var(--color-text-secondary)] mb-6">{confirmState.message}</p>
          {confirmState.confirmationPhrase && (
            <div className="mb-2">
              <label htmlFor="destructive-confirmation" className="block text-sm font-medium text-[var(--color-text-primary)] mb-2">
                Type <strong>{confirmState.confirmationPhrase}</strong> to continue
              </label>
              <Input
                id="destructive-confirmation"
                type="text"
                value={confirmationInput}
                onChange={(event) => setConfirmationInput(event.target.value)}
                autoComplete="off"
              />
            </div>
          )}
          <ModalActions
            onCancel={closeConfirm}
            onConfirm={confirmState.onConfirm}
            danger={confirmState.danger}
            confirmLabel="Confirm"
            confirmDisabled={
              !!confirmState.confirmationPhrase && confirmationInput !== confirmState.confirmationPhrase
            }
            submit
          />
        </form>
      </Modal>

      <Modal
        isOpen={passwordResetTarget !== null}
        title="Change Password"
        onClose={() => {
          setPasswordResetTarget(null);
          setNewPassword("");
        }}
      >
        <Input
          type="text"
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
          placeholder="Enter new password"
          className="mb-2"
        />
        <StrengthMeter {...scorePasswordStrength(newPassword)} empty={newPassword.length === 0} />
        <ModalActions
          onCancel={() => {
            setPasswordResetTarget(null);
            setNewPassword("");
          }}
          onConfirm={handlePasswordReset}
          confirmLabel="Update Password"
        />
      </Modal>

      <Modal
        isOpen={renameTarget !== null}
        title="Rename Kitchen"
        onClose={() => {
          setRenameTarget(null);
          setNewName("");
        }}
      >
        <p className="text-[var(--color-text-secondary)] text-sm mb-4">
          This also changes the name the kitchen logs in with, and updates every one of its existing orders to match.
          Any device currently logged in as this kitchen will need to log back in under the new name.
        </p>
        <Input
          type="text"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder="Enter new kitchen name"
          className="mb-2"
        />
        <ModalActions
          onCancel={() => {
            setRenameTarget(null);
            setNewName("");
          }}
          onConfirm={handleRename}
          confirmLabel="Rename"
        />
      </Modal>

      <div className="h-dvh flex flex-col overflow-hidden p-4 sm:p-8">
        <SettingsToggles health={<HealthPin showDbSize />} />
        <div className="shrink-0">
        <PageHeader
          title="Admin Dashboard"
          backHref="/"
          actions={
            <>
              <Button variant="secondary" onClick={() => router.push("/admin/staff")}>
                <Users size={16} />
                Staff
              </Button>
              <Button variant="secondary" onClick={handleSeed}>
                <Database size={16} />
                Seed Database
              </Button>
              <Button variant={showDeleted ? "primary" : "secondary"} onClick={() => setShowDeleted((prev) => !prev)}>
                <RotateCcw size={16} />
                Deleted ({deletedCount})
              </Button>
              <Button variant="danger" onClick={handlePurge}>
                <ShieldAlert size={16} />
                Purge Database
              </Button>
              <Button variant="ghost" onClick={handleLogout}>
                Logout
              </Button>
            </>
          }
        />
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto relative z-0">
        <section className="mb-10">
          <div className="flex items-center justify-between mb-3 gap-4">
            <h2 className="font-display text-lg font-semibold text-[var(--color-text-primary)]">Restaurants</h2>
            <div className="relative w-full max-w-xs">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-text-muted)] pointer-events-none" />
              <Input
                type="text"
                value={restaurantSearch}
                onChange={(e) => setRestaurantSearch(e.target.value)}
                placeholder="Search restaurants..."
                aria-label="Search restaurants"
                className="pl-9"
              />
            </div>
          </div>
          <Card className="!p-0 overflow-x-auto max-h-[40vh] overflow-y-auto">
            <table className="min-w-full text-sm">
              <thead className="sticky top-0 bg-[var(--color-surface-1)] z-20 shadow-[0_1px_0_var(--color-border)]">
                <tr className="border-b border-[var(--color-border)]">
                  <th scope="col" className="py-3 px-4 text-left text-[var(--color-text-muted)] font-medium">
                    ID
                  </th>
                  <th scope="col" className="py-3 px-4 text-left text-[var(--color-text-muted)] font-medium">
                    Name
                  </th>
                  <th
                    scope="col"
                    className="py-3 px-4 text-left text-[var(--color-text-muted)] font-medium hidden lg:table-cell"
                  >
                    Hashed Password
                  </th>
                  <th
                    scope="col"
                    className="py-3 px-4 text-left text-[var(--color-text-muted)] font-medium hidden md:table-cell"
                  >
                    Raw Password
                  </th>
                  <th className="sticky right-0 py-3 px-4 text-right text-[var(--color-text-muted)] font-medium bg-[var(--color-surface-1)] z-10">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {restaurants
                  .filter((r) => r.name.toLowerCase().includes(restaurantSearch.trim().toLowerCase()))
                  .map((r) => (
                  <tr key={r.id} className="border-b border-[var(--color-border)] last:border-0">
                    <td className="py-3 px-4 text-[var(--color-text-secondary)]">{r.id}</td>
                    <td className="py-3 px-4 text-[var(--color-text-primary)] font-medium">
                      <CopyableValue value={r.name} label="kitchen name" />
                    </td>
                    <td className="py-3 px-4 text-[var(--color-text-muted)] font-mono text-xs break-all hidden lg:table-cell">
                      {r.password && <CopyableValue value={r.password} label="hashed password" />}
                    </td>
                    <td className="py-3 px-4 text-[var(--color-text-muted)] font-mono text-xs hidden md:table-cell">
                      {r.raw_password && <CopyableValue value={r.raw_password} label="raw password" />}
                    </td>
                    <td className="sticky right-0 py-3 px-4 text-right bg-[var(--color-surface-1)] z-10">
                      <div className="flex justify-end gap-2">
                        <button
                          onClick={() => {
                            setRenameTarget({ id: r.id, currentName: r.name });
                            setNewName(r.name);
                          }}
                          aria-label={`Rename ${r.name}`}
                          className="p-2 bg-[var(--color-surface-2)] hover:opacity-80 text-[var(--color-text-primary)] border border-[var(--color-border-strong)] rounded-[var(--radius-sm)] transition-colors"
                        >
                          <Pencil size={16} />
                        </button>
                        <button
                          onClick={() => setPasswordResetTarget(r.id)}
                          aria-label={`Reset password for ${r.name}`}
                          className="p-2 bg-[var(--color-brand)] hover:bg-[var(--color-brand-hover)] text-[var(--color-on-brand)] rounded-[var(--radius-sm)] transition-colors"
                        >
                          <Key size={16} />
                        </button>
                        <button
                          onClick={(e) => handleDelete("restaurant", r.id, e.shiftKey)}
                          title="Hold Shift to skip the confirmation"
                          aria-label={`Delete ${r.name}`}
                          className="p-2 bg-[var(--color-danger)] hover:bg-[var(--color-danger-hover)] text-white rounded-[var(--radius-sm)] transition-colors"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </section>

        <section>
          <Card className="!p-0 overflow-hidden max-h-[55vh] flex flex-col relative">
            <div className="flex flex-wrap items-center justify-between px-4 py-3 gap-3 shrink-0 border-b border-[var(--color-border)]">
              <h2 className="font-display text-lg font-semibold text-[var(--color-text-primary)]">Orders</h2>
              <div className="flex items-center gap-2 flex-wrap">
                <div className="relative w-full max-w-xs">
                  <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-text-muted)] pointer-events-none" />
                  <Input
                    type="text"
                    value={orderSearchInput}
                    onChange={(e) => setOrderSearchInput(e.target.value)}
                    placeholder="Search order name..."
                    aria-label="Search orders by name"
                    className="pl-9"
                  />
                </div>
              </div>
            </div>

            {/* Floating "loading more" pills -- pinned to the top/bottom edge
                of the scrollable card itself (not the whole page), so they
                stay visible exactly where the user is scrolling toward
                regardless of how many rows are currently rendered above/below.
                Matches the direction the user is actually scrolling: fetching
                the next page down shows the pill at the bottom edge, fetching
                the previous page up shows it at the top edge. */}
            {isLoadingTop && (
              <div
                aria-live="polite"
                className="absolute top-[calc(3.25rem+1px)] left-1/2 -translate-x-1/2 z-30 flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-[var(--color-border)] bg-[var(--color-surface-1)] shadow-md text-xs font-medium text-[var(--color-text-secondary)]"
              >
                <Loader2 size={13} className="animate-spin text-[var(--color-brand)]" />
                Loading earlier orders…
              </div>
            )}
            {isLoadingBottom && (
              <div
                aria-live="polite"
                className="absolute bottom-2 left-1/2 -translate-x-1/2 z-30 flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-[var(--color-border)] bg-[var(--color-surface-1)] shadow-md text-xs font-medium text-[var(--color-text-secondary)]"
              >
                <Loader2 size={13} className="animate-spin text-[var(--color-brand)]" />
                Loading more orders…
              </div>
            )}

            <div ref={scrollContainerRef} onScroll={handleOrdersScroll} className="overflow-x-auto overflow-y-auto flex-1">
            <table className="min-w-full text-sm">
              <thead className="sticky top-0 bg-[var(--color-surface-1)] z-20 shadow-[0_1px_0_var(--color-border)]">
                <tr className="border-b border-[var(--color-border)]">
                  <SortableHeader label="ID" sortKey="id" activeSort={orderSort} onSort={handleSort} />
                  <th scope="col" className="py-3 px-4 text-left text-[var(--color-text-muted)] font-medium">
                    <div className="flex items-center gap-2">
                      Restaurant
                      <RestaurantFilterDropdown
                        restaurantNames={allRestaurantNames}
                        selected={orderRestaurantFilter}
                        onChange={setOrderRestaurantFilter}
                      />
                    </div>
                  </th>
                  <th scope="col" className="py-3 px-4 text-left text-[var(--color-text-muted)] font-medium">
                    Order Name
                  </th>
                  <th scope="col" className="py-3 px-4 text-left text-[var(--color-text-muted)] font-medium">
                    <div className="flex items-center gap-2">
                      Status
                      <StatusFilterDropdown
                        selected={orderStatusFilter}
                        onChange={setOrderStatusFilter}
                        includeDeletedOption={showDeleted}
                      />
                    </div>
                  </th>
                  <th
                    scope="col"
                    className="py-3 px-4 text-left text-[var(--color-text-muted)] font-medium hidden lg:table-cell"
                    title="How long the order sat in each status (capped display at 5:00)"
                  >
                    Received
                  </th>
                  <th scope="col" className="py-3 px-4 text-left text-[var(--color-text-muted)] font-medium hidden lg:table-cell">
                    Preparing
                  </th>
                  <th scope="col" className="py-3 px-4 text-left text-[var(--color-text-muted)] font-medium hidden lg:table-cell">
                    Complete
                  </th>
                  <SortableHeader
                    label="Created At"
                    sortKey="created_at"
                    activeSort={orderSort}
                    onSort={handleSort}
                    className="hidden md:table-cell"
                  />
                  <th className="sticky right-0 py-3 px-4 text-right text-[var(--color-text-muted)] font-medium bg-[var(--color-surface-1)] z-10">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {isInitialLoading ? (
                  <tr>
                    <td colSpan={9} className="py-6 px-4 text-center text-[var(--color-text-muted)]">
                      <Loader2 size={16} className="inline animate-spin mr-2" />
                      Loading orders…
                    </td>
                  </tr>
                ) : orderRows.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="py-6 px-4 text-center text-[var(--color-text-muted)]">
                      No orders match your filters.
                    </td>
                  </tr>
                ) : (
                  orderRows.map((o) => (
                    <tr
                      key={o.id}
                      className={`border-b border-[var(--color-border)] last:border-0 ${
                        o.isDeleted ? "opacity-60" : ""
                      } ${exitingOrderIds.has(o.id) ? "animate-order-exit" : ""}`}
                    >
                      <td className="py-3 px-4 text-[var(--color-text-secondary)]">{o.id}</td>
                      <td className="py-3 px-4 text-[var(--color-text-primary)]">{o.restaurant_name}</td>
                      <td className="py-3 px-4 text-[var(--color-text-secondary)]">{o.order_number}</td>
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-2">
                          {o.isDeleted ? (
                            <span className="text-xs font-medium px-2 py-1 rounded-[var(--radius-sm)] bg-[var(--color-danger)]/10 text-[var(--color-danger)]">
                              Deleted
                            </span>
                          ) : (
                            <>
                              <StatusBadge status={o.status} acknowledgedAt={o.acknowledged_at} />
                              <Select
                                value={o.status}
                                onChange={(next) => handleStatusChange(o.id, next)}
                                ariaLabel={`Change status for order ${o.order_number}`}
                                size="sm"
                                options={[
                                  { value: "Received", label: "Received" },
                                  { value: "Preparing", label: "Preparing" },
                                  { value: "Complete", label: "Complete" },
                                ]}
                              />
                            </>
                          )}
                        </div>
                      </td>
                      <td className="py-3 px-4 hidden lg:table-cell">
                        <StatusDurationCell
                          startAt={o.received_at}
                          endAt={o.preparing_at ?? (o.isDeleted ? o.deleted_at : null)}
                        />
                      </td>
                      <td className="py-3 px-4 hidden lg:table-cell">
                        <StatusDurationCell
                          startAt={o.preparing_at}
                          endAt={o.complete_at ?? (o.isDeleted ? o.deleted_at : null)}
                        />
                      </td>
                      <td className="py-3 px-4 hidden lg:table-cell">
                        <StatusDurationCompleteCell
                          completeAt={o.complete_at}
                          acknowledgedAt={o.acknowledged_at}
                          completeCapHours={
                            restaurants.find((r) => r.name.toLowerCase() === o.restaurant_name.toLowerCase())
                              ?.complete_cap_hours ?? 12
                          }
                          endAt={o.isDeleted ? o.deleted_at : null}
                        />
                      </td>
                      <td className="py-3 px-4 text-[var(--color-text-primary)] hidden md:table-cell">
                        {new Date(o.created_at).toLocaleString()}
                      </td>
                      <td className="sticky right-0 py-3 px-4 text-right bg-[var(--color-surface-1)] z-10">
                        {o.isDeleted ? (
                          <button
                            onClick={() => handleUndelete("order", o.id)}
                            aria-label={`Restore order ${o.order_number}`}
                            className="p-2 bg-[var(--color-success)] hover:opacity-90 text-white rounded-[var(--radius-sm)] transition-colors"
                          >
                            <RotateCcw size={16} />
                          </button>
                        ) : (
                          <button
                            onClick={(e) => handleDelete("order", o.id, e.shiftKey)}
                            title="Hold Shift to skip the confirmation"
                            aria-label={`Delete order ${o.order_number}`}
                            className="p-2 bg-[var(--color-danger)] hover:bg-[var(--color-danger-hover)] text-white rounded-[var(--radius-sm)] transition-colors"
                          >
                            <Trash2 size={16} />
                          </button>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
            </div>
          </Card>
        </section>
        </div>

      </div>
    </>
  );
}

export default function AdminDbPage() {
  return (
    <ToastProvider>
      <AdminDbContent />
    </ToastProvider>
  );
}
