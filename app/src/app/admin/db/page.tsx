"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Database, Trash2, Key, ShieldAlert, RotateCcw, Search, ArrowUp, ArrowDown, ArrowUpDown, Pencil } from "lucide-react";
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
import { fetchJson, fetchWithRetry } from "@/lib/api-client";

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
      message: "Are you sure you want to seed the database? This will clear existing data.",
      danger: false,
      confirmationPhrase: "SEED DATABASE",
      onConfirm: () =>
        performAction(
          () => fetchWithRetry("/api/dev/seed", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ confirmation: "SEED DATABASE" }),
          }),
          "Database seeded successfully!",
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
  const allOrderRows: OrderRow[] = [
    ...orders.map((o) => ({ ...o, isDeleted: false })),
    ...(showDeleted ? deletedOrders.map((o) => ({ ...o, isDeleted: true })) : []),
  ];

  const visibleOrderRows = allOrderRows
    .filter((o) => {
      const q = orderSearch.trim().toLowerCase();
      const matchesSearch = o.order_number.toLowerCase().includes(q);
      const matchesRestaurant =
        orderRestaurantFilter.length === 0 || orderRestaurantFilter.includes(o.restaurant_name);
      const matchesStatus =
        orderStatusFilter.length === 0 ||
        (o.isDeleted && orderStatusFilter.includes("Deleted")) ||
        (!o.isDeleted && orderStatusFilter.includes(o.status));
      return matchesSearch && matchesRestaurant && matchesStatus;
    })
    .sort((a, b) => {
      if (!orderSort) return 0;
      const dir = orderSort.direction === "asc" ? 1 : -1;
      if (orderSort.key === "id") return (a.id - b.id) * dir;
      return (new Date(a.created_at).getTime() - new Date(b.created_at).getTime()) * dir;
    });

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
        />
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
              <Button variant="secondary" onClick={handleSeed}>
                <Database size={16} />
                Seed Database
              </Button>
              <Button variant={showDeleted ? "primary" : "secondary"} onClick={() => setShowDeleted((v) => !v)}>
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
                    onChange={(e) => setOrderSearch(e.target.value)}
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
                {visibleOrderRows.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-6 px-4 text-center text-[var(--color-text-muted)]">
                      No orders match your filters.
                    </td>
                  </tr>
                ) : (
                  visibleOrderRows.map((o) => (
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
                      <td className="py-3 px-4 text-[var(--color-text-muted)] hidden md:table-cell">
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
