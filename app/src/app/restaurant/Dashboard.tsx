"use client";

import { useState, useEffect, useRef, FormEvent, FC } from "react";
import { Home, Trash2 as TrashIcon, Inbox, Flame, CheckCircle, Menu, X, Search } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Modal, ModalActions } from "@/components/ui/Modal";
import { ToastProvider, useToast } from "@/components/ui/Toast";
import { StatusStepper } from "@/components/ui/StatusStepper";
import { SettingsToggles } from "@/components/ui/SettingsToggles";
import { HealthPin } from "@/components/ui/HealthPin";
import { normalizeStatus, type ApiOrderStatus } from "@/lib/order-status";
import { fetchJson } from "@/lib/api-client";
import { NAMING_STYLES, suggestNextOrderName, type NamingStyle } from "@/lib/order-naming";

export type OrderStatus = ApiOrderStatus;
export type Order = {
  id: number;
  order_number: string;
  status: OrderStatus;
};
type Tab = "Home" | "Received" | "Preparing" | "Complete";

const TAB_ITEMS: { tab: Tab; Icon: typeof Home }[] = [
  { tab: "Home", Icon: Home },
  { tab: "Received", Icon: Inbox },
  { tab: "Preparing", Icon: Flame },
  { tab: "Complete", Icon: CheckCircle },
];

// --- API HELPERS ---
const api = {
  async getOrders(restName: string): Promise<Order[]> {
    const url = `/api/orders/restaurant/${encodeURIComponent(restName)}`;
    // No retries here: this is called every 5s by the poll loop, so a
    // transient failure just gets picked up on the next tick anyway —
    // retrying would only pile up redundant in-flight requests.
    return fetchJson<Order[]>(url, {}, { retries: 0 });
  },
  async createOrder(restName: string, orderNum: string): Promise<Order> {
    // No retries: creating an order isn't idempotent from the client's
    // point of view (a "timed out" request could have actually landed), and
    // the DB's unique-order-name index would just turn a retry into a
    // confusing 409 rather than silently creating a duplicate — but better
    // to surface that once than to blind-retry a possibly-already-created order.
    return fetchJson<Order>("/api/orders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ restaurant_name: restName, order_number: orderNum }),
    }, { retries: 0 });
  },
  async updateOrderStatus(id: number, status: OrderStatus) {
    return fetchJson(`/api/orders/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
  },
  async deleteOrder(id: number) {
    return fetchJson(`/api/orders/${id}`, { method: "DELETE" });
  },
};

// --- NAVIGATION (top bar on mobile, sidebar from md: up) ---
const Nav: FC<{
  activeTab: Tab;
  setActiveTab: (tab: Tab) => void;
  onLogout: () => void;
  restaurantName: string;
}> = ({ activeTab, setActiveTab, onLogout, restaurantName }) => {
  const [mobileOpen, setMobileOpen] = useState(false);

  const navButtons = (onSelect: (tab: Tab) => void) =>
    TAB_ITEMS.map(({ tab, Icon }) => (
      <button
        key={tab}
        onClick={() => onSelect(tab)}
        aria-current={activeTab === tab ? "page" : undefined}
        className={`flex items-center gap-2 px-4 py-3 rounded-[var(--radius-sm)] text-sm font-semibold transition-colors w-full md:w-auto ${
          tab === "Home" ? "justify-center md:justify-start" : ""
        } ${
          activeTab === tab
            ? "bg-[var(--color-brand)] text-white"
            : "text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-2)] hover:text-white"
        }`}
      >
        <Icon className="w-5 h-5 shrink-0" />
        <span>{tab}</span>
      </button>
    ));

  return (
    <>
      <SettingsToggles health={<HealthPin />} />

      {/* Mobile top bar */}
      <div className="md:hidden clear-top-right flex items-center justify-between p-4 border-b border-[var(--color-border)] bg-[var(--color-surface-1)]">
        <div className="min-w-0">
          <h2 className="text-base font-bold text-[var(--color-text-primary)] truncate" title={restaurantName}>
            {restaurantName}
          </h2>
          <span className="text-xs font-medium text-[var(--color-brand-text)]">Kitchen Dashboard</span>
        </div>
        <button
          onClick={() => setMobileOpen((o) => !o)}
          aria-label={mobileOpen ? "Close menu" : "Open menu"}
          className="p-2 text-[var(--color-text-secondary)]"
        >
          {mobileOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
        </button>
      </div>
      {mobileOpen && (
        <div className="md:hidden flex flex-col gap-1 p-3 border-b border-[var(--color-border)] bg-[var(--color-surface-1)]">
          {navButtons((tab) => {
            setActiveTab(tab);
            setMobileOpen(false);
          })}
          <button
            onClick={onLogout}
            className="w-full text-left px-4 py-3 text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-2)] hover:text-[var(--color-danger)] rounded-[var(--radius-sm)] transition-colors"
          >
            Logout
          </button>
        </div>
      )}

      {/* Desktop sidebar */}
      <div className="hidden md:flex w-60 shrink-0 sticky top-0 h-screen overflow-y-auto bg-[var(--color-surface-1)] border-r border-[var(--color-border)] flex-col p-4">
        <div className="flex flex-col items-start gap-1 w-full overflow-hidden px-2 mb-6">
          <h2
            className="text-xl font-bold tracking-tight text-[var(--color-text-primary)] truncate w-full"
            title={restaurantName}
          >
            {restaurantName}
          </h2>
          <span className="text-sm font-medium text-[var(--color-brand-text)]">Kitchen Dashboard</span>
        </div>
        <nav className="flex-grow space-y-2">{navButtons(setActiveTab)}</nav>
        <button
          onClick={onLogout}
          className="w-full text-left px-4 py-3 text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-2)] hover:text-[var(--color-danger)] rounded-[var(--radius-sm)] transition-colors mt-4"
        >
          Logout
        </button>
      </div>
    </>
  );
};

const OrderCard: FC<{
  order: Order;
  justUpdated: boolean;
  onAdvance: (id: number, status: OrderStatus) => void;
  onDelete: (id: number, skipConfirm: boolean) => void;
}> = ({ order, justUpdated, onAdvance, onDelete }) => (
  <Card
    className={`flex flex-col p-5 transition-shadow duration-500 ${justUpdated ? "ring-2 ring-[var(--color-brand)]" : ""}`}
  >
    <p className="font-bold text-xl text-[var(--color-text-primary)] mb-4">#{order.order_number}</p>
    <StatusStepper status={order.status} onAdvance={(next) => onAdvance(order.id, next)} />
    <button
      onClick={(e) => onDelete(order.id, e.shiftKey)}
      title="Hold Shift to skip the confirmation"
      className="w-full mt-4 py-2 text-sm font-medium rounded-[var(--radius-sm)] bg-[var(--color-danger)]/10 text-[var(--color-danger)] hover:bg-[var(--color-danger)]/20 transition-colors"
    >
      Delete
    </button>
  </Card>
);

const HomeTab: FC<{
  orders: Order[];
  recentlyUpdatedId: number | null;
  restaurantName: string;
  onAddOrder: (order: Order) => void;
  onDeleteOrder: (id: number, skipConfirm: boolean) => void;
  onAdvance: (id: number, status: OrderStatus) => void;
  onError: (message: string) => void;
}> = ({ orders, recentlyUpdatedId, restaurantName, onAddOrder, onDeleteOrder, onAdvance, onError }) => {
  const [orderNumber, setOrderNumber] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  // Persisted per-device (localStorage), same pattern as the theme/contrast/
  // size toggles — a kitchen picks a naming convention once and it sticks
  // across reloads rather than resetting to Freeform every visit.
  const [namingStyle, setNamingStyle] = useState<NamingStyle>("freeform");

  useEffect(() => {
    const stored = localStorage.getItem("orderNamingStyle");
    if (stored && NAMING_STYLES.some((s) => s.value === stored)) {
      setNamingStyle(stored as NamingStyle);
    }
  }, []);

  // Auto-fill a suggested next value whenever the style changes (or a new
  // order lands and shifts what "next" should be) for the styles that have
  // one — sequential/letter-number/table-pager. Customer-name and freeform
  // are always manual entry, so the field is just cleared for those.
  useEffect(() => {
    if (namingStyle === "customer-name" || namingStyle === "freeform") {
      setOrderNumber("");
      return;
    }
    setOrderNumber(suggestNextOrderName(namingStyle, orders.map((o) => o.order_number)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [namingStyle, orders.length]);

  const handleStyleChange = (value: NamingStyle) => {
    setNamingStyle(value);
    localStorage.setItem("orderNamingStyle", value);
  };

  const handleCreateOrder = async (e: FormEvent) => {
    e.preventDefault();
    if (!orderNumber.trim()) return;
    try {
      const newOrder = await api.createOrder(restaurantName, orderNumber);
      onAddOrder(newOrder);
      // Sequential/letter-number/table-pager immediately suggest the next
      // value again so the kitchen can just keep hitting Add Order during a
      // rush without retyping; name-based/freeform styles clear for a fresh
      // manual entry, matching their non-generated nature.
      if (namingStyle === "customer-name" || namingStyle === "freeform") {
        setOrderNumber("");
      } else {
        setOrderNumber(suggestNextOrderName(namingStyle, [...orders.map((o) => o.order_number), newOrder.order_number]));
      }
    } catch (error) {
      onError(error instanceof Error ? error.message : "Failed to create order");
    }
  };

  const formatOrderNumber = (value: string) => {
    if (namingStyle === "customer-name") {
      // Names keep natural casing/spacing (letters, spaces, hyphens,
      // apostrophes only) rather than the POS-style uppercase-alphanumeric
      // restriction used for code-based styles.
      setOrderNumber(value.replace(/[^a-zA-Z\s'-]/g, "").slice(0, 60));
    } else {
      setOrderNumber(value.toUpperCase().replace(/[^A-Z0-9-]/g, ""));
    }
  };

  const activeStyle = NAMING_STYLES.find((s) => s.value === namingStyle) ?? NAMING_STYLES[NAMING_STYLES.length - 1];

  return (
    <div className="space-y-6">
      <Card>
        <h3 className="text-xl font-bold text-[var(--color-text-primary)] mb-4">Add New Order</h3>
        <div className="mb-4">
          <label htmlFor="namingStyle" className="block text-sm font-medium text-[var(--color-text-secondary)] mb-1">
            Naming Style
          </label>
          <select
            id="namingStyle"
            value={namingStyle}
            onChange={(e) => handleStyleChange(e.target.value as NamingStyle)}
            className="w-full sm:w-auto px-4 py-2.5 text-sm bg-[var(--color-surface-0)] text-[var(--color-text-primary)] border border-[var(--color-border-strong)] rounded-[var(--radius-sm)] focus:outline-none focus:ring-2 focus:ring-[var(--color-brand)] focus:border-[var(--color-brand)]"
          >
            {NAMING_STYLES.map(({ value, label }) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </div>
        <form onSubmit={handleCreateOrder} className="flex flex-col sm:flex-row sm:items-end gap-4">
          <div className="flex-grow">
            <label htmlFor="orderNumber" className="block text-sm font-medium text-[var(--color-text-secondary)] mb-1">
              Order Name
            </label>
            <Input
              id="orderNumber"
              type="text"
              value={orderNumber}
              onChange={(e) => formatOrderNumber(e.target.value)}
              placeholder={activeStyle.example}
            />
          </div>
          <Button type="submit" disabled={!orderNumber.trim()} className="sm:w-auto w-full">
            Add Order
          </Button>
        </form>
      </Card>

      <Card>
        <div className="flex items-center justify-between mb-4 gap-4">
          <h3 className="text-xl font-bold text-[var(--color-text-primary)]">All Active Orders</h3>
          <div className="relative w-full max-w-xs">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-text-muted)] pointer-events-none" />
            <Input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search orders..."
              aria-label="Search orders"
              className="pl-9"
            />
          </div>
        </div>
        <div className="space-y-3">
          {orders
            .filter((order) => order.order_number.toLowerCase().includes(searchQuery.trim().toLowerCase()))
            .map((order) => (
              <div
                key={order.id}
                className={`bg-[var(--color-surface-2)] p-4 rounded-[var(--radius-sm)] flex flex-col sm:flex-row sm:items-center gap-3 sm:justify-between transition-shadow duration-500 ${
                  recentlyUpdatedId === order.id ? "ring-2 ring-[var(--color-brand)]" : ""
                }`}
              >
                <span className="font-bold text-lg text-[var(--color-text-primary)]">#{order.order_number}</span>
                <div className="flex items-center gap-3">
                  <StatusStepper status={order.status} onAdvance={(next) => onAdvance(order.id, next)} />
                  <button
                    onClick={(e) => onDeleteOrder(order.id, e.shiftKey)}
                    title="Hold Shift to skip the confirmation"
                    aria-label={`Delete order ${order.order_number}`}
                    className="text-[var(--color-text-muted)] hover:text-[var(--color-danger)] p-2 rounded-[var(--radius-full)] transition-colors shrink-0"
                  >
                    <TrashIcon className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          {orders.length === 0 && <p className="text-[var(--color-text-muted)]">No active orders.</p>}
          {orders.length > 0 &&
            orders.filter((order) => order.order_number.toLowerCase().includes(searchQuery.trim().toLowerCase()))
              .length === 0 && <p className="text-[var(--color-text-muted)]">No orders match your search.</p>}
        </div>
      </Card>
    </div>
  );
};

const OrderGrid: FC<{
  orders: Order[];
  recentlyUpdatedId: number | null;
  onAdvance: (id: number, status: OrderStatus) => void;
  onDelete: (id: number, skipConfirm: boolean) => void;
}> = ({ orders, recentlyUpdatedId, onAdvance, onDelete }) => {
  if (orders.length === 0) {
    return <p className="text-[var(--color-text-muted)]">No orders in this category.</p>;
  }
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
      {orders.map((order) => (
        <OrderCard
          key={order.id}
          order={order}
          justUpdated={recentlyUpdatedId === order.id}
          onAdvance={onAdvance}
          onDelete={onDelete}
        />
      ))}
    </div>
  );
};

function KitchenDashboardContent({
  restaurantName,
  onLogout,
}: {
  restaurantName: string;
  onLogout: () => void;
}) {
  const showToast = useToast();
  const [activeTab, setActiveTab] = useState<Tab>("Home");
  const [orders, setOrders] = useState<Order[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [orderToDelete, setOrderToDelete] = useState<number | null>(null);
  const [recentlyUpdatedId, setRecentlyUpdatedId] = useState<number | null>(null);
  const flashTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const flash = (id: number) => {
    setRecentlyUpdatedId(id);
    if (flashTimeoutRef.current) clearTimeout(flashTimeoutRef.current);
    flashTimeoutRef.current = setTimeout(() => setRecentlyUpdatedId(null), 1200);
  };

  // The poll loop runs every 5s, so a transient failure shouldn't toast every
  // single tick (that would spam the screen during e.g. a 30s DB blip) — only
  // surface it once per outage, and once more when it recovers.
  const wasPollFailingRef = useRef(false);

  const fetchOrders = async (isInitial = false) => {
    if (isInitial) setIsLoading(true);
    try {
      const fetchedOrders = await api.getOrders(restaurantName);
      setOrders(fetchedOrders);
      if (wasPollFailingRef.current) {
        wasPollFailingRef.current = false;
        showToast("Connection restored", "success");
      }
    } catch (error) {
      console.error("Failed to fetch orders:", error);
      if (!wasPollFailingRef.current) {
        wasPollFailingRef.current = true;
        showToast("Losing connection to the server — retrying...", "error");
      }
    } finally {
      if (isInitial) setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchOrders(true);
    const interval = setInterval(() => fetchOrders(false), 5000);
    return () => clearInterval(interval);
  }, [restaurantName]);

  const handleAdvanceStatus = async (id: number, status: OrderStatus) => {
    try {
      setOrders((prev) => prev.map((o) => (o.id === id ? { ...o, status } : o)));
      flash(id);
      await api.updateOrderStatus(id, status);
    } catch (error) {
      console.error("Failed to update status", error);
      showToast("Failed to update status", "error");
      fetchOrders();
    }
  };

  const deleteOrder = async (id: number) => {
    try {
      setOrders((prev) => prev.filter((o) => o.id !== id));
      await api.deleteOrder(id);
      showToast("Order deleted successfully", "success");
    } catch (error) {
      console.error("Failed to delete order", error);
      showToast("Failed to delete order", "error");
      fetchOrders();
    }
  };

  // Holding Shift while clicking Delete skips the "are you sure" modal --
  // if someone deliberately holds an extra key, they've already signaled
  // they mean it, so the confirmation would just be friction at that point.
  const requestDeleteOrder = (id: number, skipConfirm: boolean) => {
    if (skipConfirm) {
      deleteOrder(id);
      return;
    }
    setOrderToDelete(id);
  };

  const confirmDeleteOrder = async () => {
    if (orderToDelete === null) return;
    const id = orderToDelete;
    setOrderToDelete(null);
    await deleteOrder(id);
  };

  const handleAddOrder = (newOrder: Order) => {
    setOrders((prev) => [newOrder, ...prev]);
    flash(newOrder.id);
  };

  const renderContent = () => {
    if (isLoading) return <p className="text-[var(--color-text-muted)]">Loading orders...</p>;

    const displayedOrders =
      activeTab === "Home" ? orders : orders.filter((o) => normalizeStatus(o.status) === normalizeStatus(activeTab));

    if (activeTab === "Home") {
      return (
        <HomeTab
          orders={displayedOrders}
          recentlyUpdatedId={recentlyUpdatedId}
          restaurantName={restaurantName}
          onAddOrder={handleAddOrder}
          onDeleteOrder={requestDeleteOrder}
          onAdvance={handleAdvanceStatus}
          onError={(message) => showToast(message, "error")}
        />
      );
    }

    return (
      <OrderGrid
        orders={displayedOrders}
        recentlyUpdatedId={recentlyUpdatedId}
        onAdvance={handleAdvanceStatus}
        onDelete={requestDeleteOrder}
      />
    );
  };

  return (
    <div className="min-h-screen flex flex-col md:flex-row">
      <Nav activeTab={activeTab} setActiveTab={setActiveTab} onLogout={onLogout} restaurantName={restaurantName} />
      <main className="flex-grow p-4 sm:p-6 md:p-8 overflow-auto">
        <h1 className="text-2xl sm:text-3xl font-bold text-[var(--color-text-primary)] mb-6">{activeTab}</h1>
        {renderContent()}
      </main>

      <Modal isOpen={orderToDelete !== null} title="Confirm Deletion" onClose={() => setOrderToDelete(null)} danger>
        <p className="text-[var(--color-text-secondary)] mb-6">
          Are you sure you want to delete this order? This action cannot be undone.
        </p>
        <ModalActions onCancel={() => setOrderToDelete(null)} onConfirm={confirmDeleteOrder} danger confirmLabel="Delete" />
      </Modal>
    </div>
  );
}

export const KitchenDashboard: FC<{ restaurantName: string; onLogout: () => void }> = (props) => (
  <ToastProvider>
    <KitchenDashboardContent {...props} />
  </ToastProvider>
);
