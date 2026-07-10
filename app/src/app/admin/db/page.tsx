"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { Database, Trash2, Key, ShieldAlert, RotateCcw, Search, ArrowUp, ArrowDown, ArrowUpDown, Pencil, Users } from "lucide-react";
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

interface Restaurant {
  id: number;
  name: string;
  password?: string;
  raw_password?: string;
  complete_cap_hours?: number;
}

interface Order {
  id: number;
  restaurant_name: string;
  order_number: string;
  status: string;
  created_at: string;
  received_at: string | null;
  preparing_at: string | null;
  complete_at: string | null;
  acknowledged_at: string | null;
  deleted_at: string | null;
}

type OrderRow = Order & { isDeleted: boolean };

type SortDirection = "asc" | "desc";
type OrderSortKey = "id" | "created_at";

function orderRowKey(order: OrderRow) {
  return `order-${order.id}`;
}

function filteredAndSortedOrders(
  rows: OrderRow[],
  search: string,
  restaurantFilter: string[],
  statusFilter: string[],
  sort: { key: OrderSortKey; direction: SortDirection } | null,
) {
  return rows
    .filter((order) => {
      const query = search.trim().toLowerCase();
      const matchesSearch = order.order_number.toLowerCase().includes(query);
      const matchesRestaurant =
        restaurantFilter.length === 0 || restaurantFilter.includes(order.restaurant_name);
      const matchesStatus =
        statusFilter.length === 0 ||
        (order.isDeleted && statusFilter.includes("Deleted")) ||
        (!order.isDeleted && statusFilter.includes(order.status));
      return matchesSearch && matchesRestaurant && matchesStatus;
    })
    .sort((first, second) => {
      if (!sort) return 0;
      const direction = sort.direction === "asc" ? 1 : -1;
      if (sort.key === "id") return (first.id - second.id) * direction;
      return (new Date(first.created_at).getTime() - new Date(second.created_at).getTime()) * direction;
    });
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
  const [orders, setOrders] = useState<Order[]>([]);
  const [deletedOrders, setDeletedOrders] = useState<Order[]>([]);
  const [showDeleted, setShowDeleted] = useState(false);
  const [restaurantSearch, setRestaurantSearch] = useState("");
  const [orderSearch, setOrderSearch] = useState("");
  const [orderRestaurantFilter, setOrderRestaurantFilter] = useState<string[]>([]);
  const [orderStatusFilter, setOrderStatusFilter] = useState<string[]>([]);
  const [orderSort, setOrderSort] = useState<{ key: OrderSortKey; direction: SortDirection } | null>(null);
  const [isLoading, setIsLoading] = useState(true);
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
  const [filterExitingOrderKeys, setFilterExitingOrderKeys] = useState<Set<string>>(() => new Set());
  const [filterEnteringOrderKeys, setFilterEnteringOrderKeys] = useState<Set<string>>(() => new Set());
  const filterAnimationTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const data = await fetchJson<{
        restaurants: Restaurant[];
        orders: Order[];
        deletedOrders: Order[];
      }>("/api/dev/db");
      setRestaurants(data.restaurants);
      setOrders(data.orders);
      setDeletedOrders(data.deletedOrders);
    } catch (err) {
      showToast(err instanceof Error ? err.message : "An unknown error occurred", "error");
    } finally {
      setIsLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    fetchJson<{ authenticated: boolean; type?: string }>("/api/session")
      .then((session) => {
        if (session.authenticated && session.type === "admin") {
          fetchData();
        } else {
          router.push("/");
        }
      })
      .catch(() => router.push("/"));
  }, [router, fetchData]);

  // This page previously only ever fetched once on mount, so any order
  // created/advanced/deleted elsewhere (a kitchen, another admin tab) never
  // showed up here without a manual reload. The app already has a WS hub for
  // exactly this (see lib/ws-hub.ts, used today by the customer tracker) --
  // it's normally scoped to one restaurant per socket, but this page needs
  // every restaurant's activity at once, so it connects via the separate
  // `?admin=1` path (authenticated by the admin_session cookie server-side,
  // see server.js's /ws upgrade handler) instead of declaring one restaurant
  // name. Reconnects with the same exponential backoff as the customer
  // tracker's socket (see app/customer/page.tsx) rather than a fixed
  // interval, so a real outage doesn't hammer the server with retries.
  const fetchDataRef = useRef(fetchData);
  useEffect(() => {
    fetchDataRef.current = fetchData;
  }, [fetchData]);

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
            if (!anyModalOpenRef.current) void fetchDataRef.current();
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

  useEffect(() => () => {
    if (filterAnimationTimerRef.current) clearTimeout(filterAnimationTimerRef.current);
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
      fetchData();
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
      // fetchData() refetch performAction triggers) once the animation has
      // had time to finish -- doing this immediately, as the generic path
      // still does for restaurants, left no time for any exit animation to
      // render before the row vanished on the next refetch.
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
      fetchData();
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
      fetchData();
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

  // Merged view of live + (optionally) deleted orders, tagged with
  // isDeleted so the table can render them inline (deleted rows visually
  // muted, undelete instead of delete/status-change) rather than needing a
  // separate section -- lets one search/filter/sort apply across both.
  const availableOrderRows: OrderRow[] = [
    ...orders.map((o) => ({ ...o, isDeleted: false })),
    ...deletedOrders.map((o) => ({ ...o, isDeleted: true })),
  ];
  const allOrderRows = showDeleted
    ? availableOrderRows
    : availableOrderRows.filter((order) => !order.isDeleted);

  const visibleOrderRows = filteredAndSortedOrders(
    allOrderRows,
    orderSearch,
    orderRestaurantFilter,
    orderStatusFilter,
    orderSort,
  );

  const visibleOrderKeys = visibleOrderRows.length > 0
    ? visibleOrderRows.map(orderRowKey)
    : ["empty"];
  const visibleOrderKeySet = new Set(visibleOrderKeys);
  const renderedOrderRows = filteredAndSortedOrders(
    availableOrderRows.filter((order) => {
      const key = orderRowKey(order);
      return visibleOrderKeySet.has(key) || filterExitingOrderKeys.has(key);
    }),
    "",
    [],
    [],
    orderSort,
  );

  const runOrderFilterTransition = (nextRows: OrderRow[], update: () => void) => {
    const nextKeys = nextRows.length > 0 ? nextRows.map(orderRowKey) : ["empty"];
    const currentKeySet = new Set(visibleOrderKeys);
    const currentRenderedKeySet = new Set(renderedOrderRows.map(orderRowKey));
    const nextKeySet = new Set(nextKeys);
    const exitingKeys = new Set(
      Array.from(currentRenderedKeySet).filter((key) => !nextKeySet.has(key)),
    );
    const enteringKeys = new Set(nextKeys.filter((key) => !currentKeySet.has(key) && key !== "empty"));
    const root = document.documentElement;
    const reduceMotion = root.getAttribute("data-motion") === "reduced"
      || window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    if (reduceMotion || (exitingKeys.size === 0 && enteringKeys.size === 0)) {
      if (filterAnimationTimerRef.current) clearTimeout(filterAnimationTimerRef.current);
      setFilterExitingOrderKeys(new Set());
      setFilterEnteringOrderKeys(new Set());
      update();
      return;
    }

    if (filterAnimationTimerRef.current) clearTimeout(filterAnimationTimerRef.current);
    setFilterExitingOrderKeys(exitingKeys);
    setFilterEnteringOrderKeys(enteringKeys);
    update();
    filterAnimationTimerRef.current = setTimeout(() => {
      setFilterExitingOrderKeys(new Set());
      setFilterEnteringOrderKeys(new Set());
      filterAnimationTimerRef.current = null;
    }, ORDER_EXIT_ANIMATION_MS);
  };

  const handleRestaurantFilterChange = (nextFilter: string[]) => {
    const nextRows = filteredAndSortedOrders(
      allOrderRows,
      orderSearch,
      nextFilter,
      orderStatusFilter,
      orderSort,
    );
    runOrderFilterTransition(nextRows, () => setOrderRestaurantFilter(nextFilter));
  };

  const handleStatusFilterChange = (nextFilter: string[]) => {
    const nextRows = filteredAndSortedOrders(
      allOrderRows,
      orderSearch,
      orderRestaurantFilter,
      nextFilter,
      orderSort,
    );
    runOrderFilterTransition(nextRows, () => setOrderStatusFilter(nextFilter));
  };

  const handleOrderSearchChange = (nextSearch: string) => {
    const nextRows = filteredAndSortedOrders(
      allOrderRows,
      nextSearch,
      orderRestaurantFilter,
      orderStatusFilter,
      orderSort,
    );
    runOrderFilterTransition(nextRows, () => setOrderSearch(nextSearch));
  };

  const handleDeletedVisibilityChange = () => {
    const nextShowDeleted = !showDeleted;
    const nextAllRows: OrderRow[] = [
      ...orders.map((order) => ({ ...order, isDeleted: false })),
      ...(nextShowDeleted ? deletedOrders.map((order) => ({ ...order, isDeleted: true })) : []),
    ];
    const nextRows = filteredAndSortedOrders(
      nextAllRows,
      orderSearch,
      orderRestaurantFilter,
      orderStatusFilter,
      orderSort,
    );
    runOrderFilterTransition(nextRows, () => setShowDeleted(nextShowDeleted));
  };

  const allRestaurantNames = Array.from(
    new Set([...orders, ...deletedOrders].map((o) => o.restaurant_name)),
  );

  if (isLoading) {
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
              <Button variant={showDeleted ? "primary" : "secondary"} onClick={handleDeletedVisibilityChange}>
                <RotateCcw size={16} />
                Deleted ({deletedOrders.length})
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
          <Card className="!p-0 overflow-hidden max-h-[55vh] flex flex-col">
            <div className="flex flex-wrap items-center justify-between px-4 py-3 gap-3 shrink-0 border-b border-[var(--color-border)]">
              <h2 className="font-display text-lg font-semibold text-[var(--color-text-primary)]">Orders</h2>
              <div className="flex items-center gap-2 flex-wrap">
                <div className="relative w-full max-w-xs">
                  <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-text-muted)] pointer-events-none" />
                  <Input
                    type="text"
                    value={orderSearch}
                    onChange={(e) => handleOrderSearchChange(e.target.value)}
                    placeholder="Search order name..."
                    aria-label="Search orders by name"
                    className="pl-9"
                  />
                </div>
              </div>
            </div>
            <div className="overflow-x-auto overflow-y-auto flex-1">
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
                        onChange={handleRestaurantFilterChange}
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
                        onChange={handleStatusFilterChange}
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
                {renderedOrderRows.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-6 px-4 text-center text-[var(--color-text-muted)]">
                      No orders match your filters.
                    </td>
                  </tr>
                ) : (
                  renderedOrderRows.map((o) => (
                    <tr
                      key={o.id}
                      aria-hidden={filterExitingOrderKeys.has(orderRowKey(o)) || undefined}
                      className={`border-b border-[var(--color-border)] last:border-0 ${
                        o.isDeleted ? "opacity-60" : ""
                      } ${
                        exitingOrderIds.has(o.id) || filterExitingOrderKeys.has(orderRowKey(o))
                          ? "animate-order-exit"
                          : filterEnteringOrderKeys.has(orderRowKey(o))
                            ? "animate-order-filter-enter"
                            : ""
                      }`}
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
                              <StatusBadge status={o.status} />
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
