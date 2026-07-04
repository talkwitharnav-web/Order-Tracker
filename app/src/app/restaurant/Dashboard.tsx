"use client";

import { useState, useEffect, useRef, FormEvent, FC } from "react";
import { Home, Trash2 as TrashIcon, Inbox, Flame, CheckCircle, Menu, X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Modal, ModalActions } from "@/components/ui/Modal";
import { ToastProvider, useToast } from "@/components/ui/Toast";
import { StatusStepper } from "@/components/ui/StatusStepper";
import { normalizeStatus, type ApiOrderStatus } from "@/lib/order-status";

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
  async getOrders(restName: string) {
    const url = `/api/orders/restaurant/${encodeURIComponent(restName)}`;
    const response = await fetch(url);
    if (!response.ok) throw new Error("Failed to fetch orders");
    return response.json();
  },
  async createOrder(restName: string, orderNum: string): Promise<Order> {
    const response = await fetch("/api/orders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ restaurant_name: restName, order_number: orderNum }),
    });
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      throw new Error(body.error || "Failed to create order");
    }
    return response.json();
  },
  async updateOrderStatus(id: number, status: OrderStatus) {
    const response = await fetch(`/api/orders/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    if (!response.ok) throw new Error("Failed to update status");
    return response.json();
  },
  async deleteOrder(id: number) {
    const response = await fetch(`/api/orders/${id}`, { method: "DELETE" });
    if (!response.ok) throw new Error("Failed to delete order");
    return response.json();
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
      {/* Mobile top bar */}
      <div className="md:hidden flex items-center justify-between p-4 border-b border-[var(--color-border)] bg-[var(--color-surface-1)]">
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
      <div className="hidden md:flex w-60 shrink-0 bg-[var(--color-surface-1)] border-r border-[var(--color-border)] flex-col p-4">
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
  onDelete: (id: number) => void;
}> = ({ order, justUpdated, onAdvance, onDelete }) => (
  <Card
    className={`flex flex-col p-5 transition-shadow duration-500 ${justUpdated ? "ring-2 ring-[var(--color-brand)]" : ""}`}
  >
    <p className="font-bold text-xl text-[var(--color-text-primary)] mb-4">#{order.order_number}</p>
    <StatusStepper status={order.status} onAdvance={(next) => onAdvance(order.id, next)} />
    <button
      onClick={() => onDelete(order.id)}
      className="w-full mt-4 py-2 text-sm font-medium rounded-[var(--radius-sm)] bg-[var(--color-danger)]/10 text-red-300 hover:bg-[var(--color-danger)]/20 transition-colors"
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
  onDeleteOrder: (id: number) => void;
  onAdvance: (id: number, status: OrderStatus) => void;
  onError: (message: string) => void;
}> = ({ orders, recentlyUpdatedId, restaurantName, onAddOrder, onDeleteOrder, onAdvance, onError }) => {
  const [orderNumber, setOrderNumber] = useState("");

  const handleCreateOrder = async (e: FormEvent) => {
    e.preventDefault();
    if (!orderNumber.trim()) return;
    try {
      const newOrder = await api.createOrder(restaurantName, orderNumber);
      onAddOrder(newOrder);
      setOrderNumber("");
    } catch (error) {
      onError(error instanceof Error ? error.message : "Failed to create order");
    }
  };

  const formatOrderNumber = (value: string) => setOrderNumber(value.toUpperCase().replace(/[^A-Z0-9-]/g, ""));

  return (
    <div className="space-y-6">
      <Card>
        <h3 className="text-xl font-bold text-[var(--color-text-primary)] mb-4">Add New Order</h3>
        <form onSubmit={handleCreateOrder} className="flex flex-col sm:flex-row sm:items-end gap-4">
          <div className="flex-grow">
            <label htmlFor="orderNumber" className="block text-sm font-medium text-[var(--color-text-secondary)] mb-1">
              Order Number
            </label>
            <Input
              id="orderNumber"
              type="text"
              value={orderNumber}
              onChange={(e) => formatOrderNumber(e.target.value)}
              placeholder="e.g., 'ORD-54321'"
            />
          </div>
          <Button type="submit" disabled={!orderNumber.trim()} className="sm:w-auto w-full">
            Add Order
          </Button>
        </form>
      </Card>

      <Card>
        <h3 className="text-xl font-bold text-[var(--color-text-primary)] mb-4">All Active Orders</h3>
        <div className="space-y-3">
          {orders.map((order) => (
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
                  onClick={() => onDeleteOrder(order.id)}
                  aria-label={`Delete order ${order.order_number}`}
                  className="text-[var(--color-text-muted)] hover:text-[var(--color-danger)] p-2 rounded-[var(--radius-full)] transition-colors shrink-0"
                >
                  <TrashIcon className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
          {orders.length === 0 && <p className="text-[var(--color-text-muted)]">No active orders.</p>}
        </div>
      </Card>
    </div>
  );
};

const OrderGrid: FC<{
  orders: Order[];
  recentlyUpdatedId: number | null;
  onAdvance: (id: number, status: OrderStatus) => void;
  onDelete: (id: number) => void;
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

  const fetchOrders = async (isInitial = false) => {
    if (isInitial) setIsLoading(true);
    try {
      const fetchedOrders = await api.getOrders(restaurantName);
      setOrders(fetchedOrders);
    } catch (error) {
      console.error("Failed to fetch orders:", error);
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

  const confirmDeleteOrder = async () => {
    if (orderToDelete === null) return;
    try {
      setOrders((prev) => prev.filter((o) => o.id !== orderToDelete));
      await api.deleteOrder(orderToDelete);
      showToast("Order deleted successfully", "success");
    } catch (error) {
      console.error("Failed to delete order", error);
      showToast("Failed to delete order", "error");
      fetchOrders();
    } finally {
      setOrderToDelete(null);
    }
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
          onDeleteOrder={setOrderToDelete}
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
        onDelete={setOrderToDelete}
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
