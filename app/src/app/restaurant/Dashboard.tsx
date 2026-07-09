"use client";

import { useState, useEffect, useMemo, useRef, FormEvent, FC } from "react";
import { Home, Trash2 as TrashIcon, Inbox, Flame, CheckCircle, Menu, X, Search, SearchX, Clock3 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { ChefMascot } from "@/components/ui/ChefMascot";
import { Input } from "@/components/ui/Input";
import { Modal, ModalActions } from "@/components/ui/Modal";
import { ToastProvider, useActionToast, useToast } from "@/components/ui/Toast";
import { StatusStepper } from "@/components/ui/StatusStepper";
import { SettingsToggles } from "@/components/ui/SettingsToggles";
import { Select } from "@/components/ui/Select";
import { HealthPin } from "@/components/ui/HealthPin";
import { normalizeStatus, type ApiOrderStatus } from "@/lib/order-status";
import { fetchJson } from "@/lib/api-client";
import {
  formatOrderDisplayInput,
  NAMING_STYLES,
  normalizeOrderLookupKey,
  suggestNextOrderName,
  type NamingStyle,
} from "@/lib/order-naming";
import { useDropdownReveal } from "@/lib/useDropdownReveal";
import { ErrorBoundary } from "@/components/ui/ErrorBoundary";
import { useSideBySideFit, useAutoFitText, useUiSelfCheck } from "@/lib/ui-awareness";
import { computeStatusDurationMs, formatOrderAge } from "@/lib/order-duration";
import { CustomerHandoffCard } from "@/components/ui/CustomerHandoffCard";

export type OrderStatus = ApiOrderStatus;
export type Order = {
  id: number;
  order_number: string;
  status: OrderStatus;
  received_at: string;
  preparing_at: string | null;
  complete_at: string | null;
  acknowledged_at: string | null;
};
type Tab = "Home" | "Received" | "Preparing" | "Complete";
type StatusCounts = Record<Exclude<Tab, "Home">, number>;
type StatusUpdateResult = {
  order: Order;
  undo?: {
    token: string;
    previousStatus: OrderStatus;
    expiresInMs: number;
  } | null;
  undone?: boolean;
};

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
  async updateOrderStatus(id: number, status: OrderStatus, undoToken?: string): Promise<StatusUpdateResult> {
    return fetchJson<StatusUpdateResult>(`/api/orders/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status, ...(undoToken ? { undoToken } : {}) }),
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
  statusCounts: StatusCounts;
}> = ({ activeTab, setActiveTab, onLogout, restaurantName, statusCounts }) => {
  const [mobileOpen, setMobileOpen] = useState(false);
  // Guarantees a hover tooltip (and dev logging) whenever the kitchen name is
  // too long for the fixed-width sidebar and gets truncated.
  const { ref: kitchenNameRef } = useAutoFitText<HTMLHeadingElement>(restaurantName);
  const { shouldRender: showMobileMenu, animationClass: mobileMenuAnimationClass } = useDropdownReveal(
    mobileOpen,
    "inflow-reveal",
  );

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
            ? "bg-[var(--color-brand)] text-[var(--color-on-brand)] nav-active-accent"
            : "text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-2)] hover:text-white"
        }`}
      >
        <Icon className="w-5 h-5 shrink-0" />
        <span>{tab}</span>
        {tab !== "Home" && (
          <span className="ml-auto min-w-6 px-1.5 py-0.5 rounded-[var(--radius-full)] bg-[var(--color-surface-0)] text-[var(--color-text-secondary)] text-xs text-center">
            <span aria-hidden="true">{statusCounts[tab]}</span>
            <span className="sr-only">
              {statusCounts[tab]} {statusCounts[tab] === 1 ? "order" : "orders"}
            </span>
          </span>
        )}
      </button>
    ));

  return (
    <>
      <SettingsToggles
        health={<HealthPin />}
        mobileNavigation={
          <button
            type="button"
            onClick={() => setMobileOpen((open) => !open)}
            aria-label={mobileOpen ? "Close menu" : "Open menu"}
            aria-expanded={mobileOpen}
            aria-controls="kitchen-mobile-menu"
            className={`w-8 h-8 flex items-center justify-center rounded-[var(--radius-sm)] transition-colors ${
              mobileOpen
                ? "bg-[var(--color-brand)] text-[var(--color-on-brand)]"
                : "text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-2)] hover:text-[var(--color-text-primary)]"
            }`}
          >
            {mobileOpen ? <X className="w-4 h-4" /> : <Menu className="w-4 h-4" />}
          </button>
        }
      />

      {/* Mobile top bar */}
      <div className="md:hidden clear-top-right flex items-center p-4 border-b border-[var(--color-border)] bg-[var(--color-surface-1)] shrink-0">
        <div className="min-w-0">
          <h2 className="text-base font-bold text-[var(--color-text-primary)] truncate" title={restaurantName}>
            {restaurantName}
          </h2>
          <span className="text-xs font-medium text-[var(--color-brand-text)]">Kitchen Dashboard</span>
        </div>
      </div>
      {showMobileMenu && (
        <div
          id="kitchen-mobile-menu"
          className={`md:hidden flex flex-col gap-1 p-3 border-b border-[var(--color-border)] bg-[var(--color-surface-1)] shrink-0 ${mobileMenuAnimationClass}`}
        >
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
            ref={kitchenNameRef}
            className="font-display text-xl font-bold tracking-tight text-[var(--color-text-primary)] truncate w-full"
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

const OrderAge: FC<{ receivedAt: string }> = ({ receivedAt }) => {
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    const interval = setInterval(() => setNowMs(Date.now()), 30_000);
    return () => clearInterval(interval);
  }, []);

  const ageMs = computeStatusDurationMs(receivedAt, null, nowMs);
  if (ageMs === null) return null;

  return (
    <span
      className="inline-flex items-center gap-1 text-xs font-medium text-[var(--color-text-muted)] whitespace-nowrap"
      title="Time since this order was received"
    >
      <Clock3 className="w-3.5 h-3.5" aria-hidden="true" />
      {formatOrderAge(ageMs)}
    </span>
  );
};

const OrderCard: FC<{
  order: Order;
  justUpdated: boolean;
  isExiting: boolean;
  onAdvance: (id: number, status: OrderStatus) => void;
  onDelete: (id: number, skipConfirm: boolean) => void;
}> = ({ order, justUpdated, isExiting, onAdvance, onDelete }) => (
  <Card
    className={`flex flex-col p-4 sm:p-5 transition-all duration-200 ${isExiting ? "animate-order-exit" : "animate-order-enter"} ${justUpdated ? "ring-2 ring-[var(--color-brand)]" : ""}`}
  >
    <div className="flex items-start justify-between gap-3 mb-3 sm:mb-4">
      <p className="font-bold text-lg sm:text-xl text-[var(--color-text-primary)] break-all" title={order.order_number}>
        #{order.order_number}
      </p>
      <OrderAge receivedAt={order.received_at} />
    </div>
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

/**
 * A single row in the Home list. Self-aware layout: instead of a fixed
 * `sm:flex-row` breakpoint, it measures whether the order name and the
 * controls (stepper + delete) actually fit side by side and only then lays
 * them out in a row — otherwise it stacks them, so a long name is never
 * crammed against the buttons regardless of screen width. The name keeps
 * `truncate` (single-line) so its intrinsic width stays measurable and so an
 * extreme name still can't blow out the row when stacked.
 */
const HomeOrderRow: FC<{
  order: Order;
  exiting: boolean;
  justUpdated: boolean;
  onAdvance: (id: number, status: OrderStatus) => void;
  onDeleteOrder: (id: number, skipConfirm: boolean) => void;
}> = ({ order, exiting, justUpdated, onAdvance, onDeleteOrder }) => {
  const { containerRef, aRef, bRef, fits } = useSideBySideFit<HTMLDivElement, HTMLSpanElement, HTMLDivElement>(16);
  return (
    <div
      ref={containerRef}
      className={`bg-[var(--color-surface-2)] p-3 sm:p-4 rounded-[var(--radius-sm)] flex gap-2 sm:gap-3 transition-all duration-200 card-elevated ${
        fits ? "flex-row items-center justify-between" : "flex-col"
      } ${exiting ? "animate-order-exit" : "animate-order-enter"} ${
        justUpdated ? "ring-2 ring-[var(--color-brand)]" : ""
      }`}
    >
      <span ref={aRef} className="flex flex-col min-w-0" title={order.order_number}>
        <span className="font-bold text-base sm:text-lg text-[var(--color-text-primary)] truncate">
          #{order.order_number}
        </span>
        <OrderAge receivedAt={order.received_at} />
      </span>
      <div ref={bRef} className="flex items-center gap-2 sm:gap-3 min-w-0">
        <div className="flex-1 min-w-0">
          <StatusStepper status={order.status} onAdvance={(next) => onAdvance(order.id, next)} />
        </div>
        <button
          onClick={(e) => onDeleteOrder(order.id, e.shiftKey)}
          title="Hold Shift to skip the confirmation"
          aria-label={`Delete order ${order.order_number}`}
          className="text-[var(--color-text-muted)] hover:text-[var(--color-danger)] min-w-10 min-h-10 sm:min-w-0 sm:min-h-0 p-0 sm:p-2 flex items-center justify-center rounded-[var(--radius-full)] transition-colors shrink-0"
        >
          <TrashIcon className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};

const HomeTab: FC<{
  orders: Order[];
  recentlyUpdatedId: number | null;
  exitingIds: Set<number>;
  restaurantName: string;
  onAddOrder: (order: Order) => void;
  onDeleteOrder: (id: number, skipConfirm: boolean) => void;
  onAdvance: (id: number, status: OrderStatus) => void;
  onError: (message: string) => void;
}> = ({ orders, recentlyUpdatedId, exitingIds, restaurantName, onAddOrder, onDeleteOrder, onAdvance, onError }) => {
  const [orderNumber, setOrderNumber] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  // Persisted per-device (localStorage), same pattern as the theme/contrast/
  // size toggles — a kitchen picks a naming convention once and it sticks
  // across reloads rather than resetting to Freeform every visit.
  const [namingStyle, setNamingStyle] = useState<NamingStyle>("freeform");

  useEffect(() => {
    try {
      const stored = localStorage.getItem("orderNamingStyle");
      if (stored && NAMING_STYLES.some((s) => s.value === stored)) {
        setNamingStyle(stored as NamingStyle);
      }
    } catch {
      // localStorage can throw (private mode, sandboxed iframe, storage
      // disabled) -- a persisted preference is a nicety, never worth a crash.
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
    try {
      localStorage.setItem("orderNamingStyle", value);
    } catch {
      // Persisting the choice is best-effort; ignore storage failures.
    }
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
      setOrderNumber(value.replace(/[^a-zA-Z\s'_-]/g, "").slice(0, 60));
    } else {
      const uppercase = namingStyle === "sequential" || namingStyle === "letter-number";
      setOrderNumber(formatOrderDisplayInput(value, uppercase));
    }
  };

  const activeStyle = NAMING_STYLES.find((s) => s.value === namingStyle) ?? NAMING_STYLES[NAMING_STYLES.length - 1];

  // Computed once per render and reused for both the rendered list and the
  // "no matches" empty state below -- previously this filter ran twice per
  // render (identical predicate, only to check .length the second time).
  const filteredOrders = useMemo(
    () => {
      const displayQuery = searchQuery.trim().toLowerCase();
      const lookupQuery = normalizeOrderLookupKey(searchQuery);
      return orders.filter((order) => {
        const displayMatch = order.order_number.toLowerCase().includes(displayQuery);
        const lookupMatch = lookupQuery.length > 0 && normalizeOrderLookupKey(order.order_number).includes(lookupQuery);
        return displayMatch || lookupMatch;
      });
    },
    [orders, searchQuery],
  );

  return (
    <div className="space-y-6">
      <Card>
        <h3 className="text-xl font-bold text-[var(--color-text-primary)] mb-4">Add New Order</h3>
        <div className="mb-4">
          <label htmlFor="namingStyle" className="block text-sm font-medium text-[var(--color-text-secondary)] mb-1">
            Naming Style
          </label>
          <Select
            id="namingStyle"
            value={namingStyle}
            onChange={handleStyleChange}
            ariaLabel="Naming style"
            className="w-full sm:w-64"
            options={NAMING_STYLES.map(({ value, label }) => ({ value, label }))}
          />
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

      <Card className="flex flex-col">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-4 gap-2 sm:gap-4 shrink-0">
          <h3 className="text-lg sm:text-xl font-bold text-[var(--color-text-primary)] shrink-0">
            <span className="sm:hidden">Active Orders</span>
            <span className="hidden sm:inline">All Active Orders</span>
          </h3>
          <div className="relative w-full sm:max-w-xs">
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
        <div className="space-y-3 max-h-[60vh] overflow-y-auto">
          {filteredOrders.map((order) => (
            <HomeOrderRow
              key={order.id}
              order={order}
              exiting={exitingIds.has(order.id)}
              justUpdated={recentlyUpdatedId === order.id}
              onAdvance={onAdvance}
              onDeleteOrder={onDeleteOrder}
            />
          ))}
          {orders.length === 0 && (
            <div className="flex flex-col items-center py-8">
              {/* Container-aware mascot (2D or 3D per user pref) fits itself at
                  any viewport — no hide-on-mobile band-aid needed. */}
              <ChefMascot size={88} lines={["Quiet kitchen tonight...", "Add your first order above!", "I'll just be here... waiting...", "The stove is cold, boss."]} />
            </div>
          )}
          {orders.length > 0 && filteredOrders.length === 0 && (
            <div role="status" className="flex flex-col items-center justify-center px-4 py-8 text-center">
              <SearchX className="w-7 h-7 text-[var(--color-text-muted)] mb-2" aria-hidden="true" />
              <p className="font-medium text-[var(--color-text-secondary)]">
                No orders match &ldquo;{searchQuery}&rdquo;
              </p>
              <p className="mt-1 text-sm text-[var(--color-text-muted)]">Try a different order name.</p>
            </div>
          )}
        </div>
      </Card>

      <CompleteCapSettingCard restaurantName={restaurantName} onError={onError} />
      <CustomerHandoffCard restaurantName={restaurantName} />
    </div>
  );
};

const COMPLETE_CAP_PRESETS = [
  { label: "1 hour", hours: 1 },
  { label: "6 hours", hours: 6 },
  { label: "12 hours", hours: 12 },
  { label: "24 hours", hours: 24 },
];

/**
 * Self-service setting for how long the customer tracker's "time in
 * Complete" counter runs before it caps, absent the customer explicitly
 * clicking "Order Picked Up". Lives here (not admin/db) because this is
 * meant to be each kitchen's own call, not something only an admin sets --
 * see api/restaurants/by-name/[restaurantName]/settings, which is
 * kitchen-authenticated for exactly this reason.
 */
const CompleteCapSettingCard: FC<{ restaurantName: string; onError: (message: string) => void }> = ({
  restaurantName,
  onError,
}) => {
  const [hours, setHours] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchJson<{ completeCapHours: number }>(
      `/api/restaurants/by-name/${encodeURIComponent(restaurantName)}/settings`,
    )
      .then((data) => setHours(data.completeCapHours))
      .catch(() => setHours(12));
  }, [restaurantName]);

  const handleChange = async (newHours: number) => {
    setHours(newHours);
    setSaving(true);
    try {
      await fetchJson(`/api/restaurants/by-name/${encodeURIComponent(restaurantName)}/settings`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ completeCapHours: newHours }),
      });
    } catch (err) {
      onError(err instanceof Error ? err.message : "Failed to update setting");
    } finally {
      setSaving(false);
    }
  };

  if (hours === null) return null;

  return (
    <Card>
      <h3 className="text-xl font-bold text-[var(--color-text-primary)] mb-1">Order Pickup Window</h3>
      <p className="text-sm text-[var(--color-text-secondary)] mb-4">
        How long the customer tracker counts time since an order was marked Complete, if the customer never taps
        &ldquo;Order Picked Up&rdquo; themselves.
      </p>
      <div className="flex flex-wrap gap-2">
        {COMPLETE_CAP_PRESETS.map((preset) => (
          <button
            key={preset.hours}
            onClick={() => handleChange(preset.hours)}
            disabled={saving}
            aria-pressed={hours === preset.hours}
            className={`min-h-10 px-4 py-2 rounded-[var(--radius-sm)] text-sm font-medium border transition-colors disabled:opacity-60 ${
              hours === preset.hours
                ? "bg-[var(--color-brand)] border-[var(--color-brand)] text-[var(--color-on-brand)]"
                : "bg-[var(--color-surface-2)] border-[var(--color-border-strong)] text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]"
            }`}
          >
            {preset.label}
          </button>
        ))}
      </div>
    </Card>
  );
};

const OrderGrid: FC<{
  orders: Order[];
  recentlyUpdatedId: number | null;
  exitingIds: Set<number>;
  onAdvance: (id: number, status: OrderStatus) => void;
  onDelete: (id: number, skipConfirm: boolean) => void;
}> = ({ orders, recentlyUpdatedId, exitingIds, onAdvance, onDelete }) => {
  if (orders.length === 0) {
    return (
      <div className="flex flex-col items-center py-8">
        {/* Container-aware mascot (2D or 3D per user pref) fits itself. */}
        <ChefMascot size={84} lines={["All caught up!", "Nothing on the stove right now.", "No orders ready for pickup yet.", "Kitchen's taking a breather."]} />
      </div>
    );
  }
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5 max-h-[65vh] overflow-y-auto">
      {orders.map((order) => (
        <OrderCard
          key={order.id}
          order={order}
          justUpdated={recentlyUpdatedId === order.id}
          isExiting={exitingIds.has(order.id)}
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
  const showActionToast = useActionToast();
  const [activeTab, setActiveTab] = useState<Tab>("Home");
  const [orders, setOrders] = useState<Order[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  // Dev-only: warns in the console if anything on the dashboard spills past
  // the viewport (the usual cause of a stray horizontal scrollbar).
  useUiSelfCheck();
  const [orderToDelete, setOrderToDelete] = useState<number | null>(null);
  const [recentlyUpdatedId, setRecentlyUpdatedId] = useState<number | null>(null);
  // Orders mid-slide-out-to-delete -- still rendered (with the exit
  // animation class) until deleteOrder's timer actually removes them from
  // `orders`, see deleteOrder below.
  const [exitingIds, setExitingIds] = useState<Set<number>>(new Set());
  const flashTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const statusCounts = useMemo<StatusCounts>(() => {
    const counts: StatusCounts = { Received: 0, Preparing: 0, Complete: 0 };
    for (const order of orders) {
      const status = normalizeStatus(order.status);
      if (status === "received") counts.Received += 1;
      if (status === "preparing") counts.Preparing += 1;
      if (status === "complete") counts.Complete += 1;
    }
    return counts;
  }, [orders]);

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

  const handleUndoStatus = async (
    id: number,
    mistakenStatus: OrderStatus,
    previousStatus: OrderStatus,
    undoToken: string,
  ) => {
    setOrders((prev) => prev.map((order) => {
      if (order.id !== id) return order;
      if (mistakenStatus === "Preparing") {
        return { ...order, status: previousStatus, preparing_at: null };
      }
      return { ...order, status: previousStatus, complete_at: null };
    }));
    flash(id);

    try {
      const response = await api.updateOrderStatus(id, previousStatus, undoToken);
      setOrders((prev) => prev.map((order) => (order.id === id ? { ...order, ...response.order } : order)));
      showToast("Status change undone", "success");
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Could not undo status change", "error");
      void fetchOrders();
    }
  };

  const handleAdvanceStatus = async (id: number, status: OrderStatus) => {
    const previousOrder = orders.find((order) => order.id === id);
    if (!previousOrder) return;

    try {
      setOrders((prev) => prev.map((o) => (o.id === id ? { ...o, status } : o)));
      flash(id);
      const response = await api.updateOrderStatus(id, status);
      setOrders((prev) => prev.map((order) => (order.id === id ? { ...order, ...response.order } : order)));

      if (response.undo) {
        const undo = response.undo;
        showActionToast(
          `Order #${previousOrder.order_number} moved to ${status}`,
          "success",
          {
            label: "Undo",
            durationMs: undo.expiresInMs,
            onClick: () => handleUndoStatus(id, status, undo.previousStatus, undo.token),
          },
        );
      }
    } catch (error) {
      console.error("Failed to update status", error);
      showToast(error instanceof Error ? error.message : "Failed to update status", "error");
      void fetchOrders();
    }
  };

  // 300ms matches .animate-order-exit's own animation duration in
  // globals.css -- kept as a plain timer rather than an `animationend`
  // listener because Reduce Motion disables that animation outright
  // (`animation: none !important`), which would mean the listener never
  // fires and the card would sit deleted-but-still-visible forever.
  const ORDER_EXIT_ANIMATION_MS = 300;

  const deleteOrder = async (id: number) => {
    // Play the slide-out first, then actually remove the order from state
    // once the animation has had time to finish -- deleting from `orders`
    // immediately (the old behavior) left no time for any exit animation
    // to render at all.
    setExitingIds((prev) => new Set(prev).add(id));
    try {
      await api.deleteOrder(id);
      showToast("Order deleted successfully", "success");
      setTimeout(() => {
        setOrders((prev) => prev.filter((o) => o.id !== id));
        setExitingIds((prev) => {
          const next = new Set(prev);
          next.delete(id);
          return next;
        });
      }, ORDER_EXIT_ANIMATION_MS);
    } catch (error) {
      console.error("Failed to delete order", error);
      showToast("Failed to delete order", "error");
      setExitingIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
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
    if (isLoading) return <p className="text-[var(--color-text-muted)]">Setting up the kitchen...</p>;

    let displayedOrders =
      activeTab === "Home" ? orders : orders.filter((o) => normalizeStatus(o.status) === normalizeStatus(activeTab));

    if (activeTab === "Received" || activeTab === "Preparing") {
      displayedOrders = [...displayedOrders].sort((left, right) => {
        const leftTime = new Date(left.received_at).getTime();
        const rightTime = new Date(right.received_at).getTime();
        if (!Number.isFinite(leftTime) || !Number.isFinite(rightTime)) return left.id - right.id;
        return leftTime - rightTime || left.id - right.id;
      });
    }

    if (activeTab === "Home") {
      return (
        <HomeTab
          orders={displayedOrders}
          recentlyUpdatedId={recentlyUpdatedId}
          exitingIds={exitingIds}
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
        exitingIds={exitingIds}
        onAdvance={handleAdvanceStatus}
        onDelete={requestDeleteOrder}
      />
    );
  };

  return (
    <div className="h-dvh flex flex-col md:flex-row overflow-hidden">
      <Nav
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        onLogout={onLogout}
        restaurantName={restaurantName}
        statusCounts={statusCounts}
      />
      <main className="flex-grow p-4 sm:p-6 md:p-8 overflow-y-auto">
        <h1 className="font-display text-2xl sm:text-3xl font-bold text-[var(--color-text-primary)] mb-6 shrink-0">{activeTab}</h1>
        <div key={activeTab} className="tab-content-enter">
          <ErrorBoundary label={`dashboard:${activeTab}`}>{renderContent()}</ErrorBoundary>
        </div>
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
