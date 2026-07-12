"use client";

import { useState, useEffect, useMemo, useRef, useCallback, FormEvent, FC } from "react";
import { useRouter } from "next/navigation";
import { Home, Trash2 as TrashIcon, Inbox, Flame, CheckCircle, Menu, X, Search, SearchX, Clock3, Users, TriangleAlert } from "lucide-react";
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
import { fetchJson, ApiError } from "@/lib/api-client";
import { PinPad, type PinPadEmployee, type VerifiedPinIdentity } from "@/components/ui/PinPad";
import { StrengthMeter } from "@/components/ui/StrengthMeter";
import { scorePinStrength } from "@/lib/credential-strength";
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
import { sortByPriority, isOrderOverdue, OVERDUE_THRESHOLD_MINUTES } from "@/lib/order-priority";
import { getEmployeeSession, clearEmployeeSession, type EmployeeSession } from "@/lib/employee-session";

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
type Tab = "Home" | "Received" | "Preparing" | "Complete" | "Staff";
type StatusCounts = Record<Exclude<Tab, "Home" | "Staff">, number>;
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
  { tab: "Staff", Icon: Users },
];

// Raw shape returned by GET .../employees -- snake_case, matches the DB
// columns directly (see lib/db.ts restaurant_employees/restaurant_roles).
type EmployeeApiRow = {
  id: number;
  name: string;
  account_type: "manager" | "employee";
  role_id: number | null;
  role_name: string | null;
  pin_length: number;
  created_at: string;
};

function toPinPadEmployee(row: EmployeeApiRow): PinPadEmployee {
  return {
    id: row.id,
    name: row.name,
    accountType: row.account_type,
    roleName: row.role_name,
    pinLength: row.pin_length === 6 ? 6 : 4,
  };
}

// --- API HELPERS ---
const api = {
  async getOrders(restName: string): Promise<Order[]> {
    const url = `/api/orders/restaurant/${encodeURIComponent(restName)}`;
    // No retries here: this is called every 5s by the poll loop, so a
    // transient failure just gets picked up on the next tick anyway —
    // retrying would only pile up redundant in-flight requests.
    return fetchJson<Order[]>(url, {}, { retries: 0 });
  },
  async createOrder(
    restName: string,
    orderNum: string,
    employee?: { employeeId: number } | null,
  ): Promise<Order> {
    // No retries: creating an order isn't idempotent from the client's
    // point of view (a "timed out" request could have actually landed), and
    // the DB's unique-order-name index would just turn a retry into a
    // confusing 409 rather than silently creating a duplicate — but better
    // to surface that once than to blind-retry a possibly-already-created order.
    return fetchJson<Order>("/api/orders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        restaurant_name: restName,
        order_number: orderNum,
        ...(employee ? { employeeId: employee.employeeId } : {}),
      }),
    }, { retries: 0 });
  },
  async updateOrderStatus(
    id: number,
    status: OrderStatus,
    undoToken?: string,
    employee?: { employeeId: number } | null,
  ): Promise<StatusUpdateResult> {
    return fetchJson<StatusUpdateResult>(`/api/orders/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        status,
        ...(undoToken ? { undoToken } : {}),
        ...(employee ? { employeeId: employee.employeeId } : {}),
      }),
    });
  },
  async getEmployees(restName: string): Promise<{ employees: PinPadEmployee[] }> {
    const data = await fetchJson<{ employees: EmployeeApiRow[] }>(
      `/api/restaurants/by-name/${encodeURIComponent(restName)}/employees`,
      {},
      { retries: 0 },
    );
    return { employees: data.employees.map(toPinPadEmployee) };
  },
  async verifyPin(restName: string, pin: string, pinLength: 4 | 6): Promise<VerifiedPinIdentity | null> {
    try {
      const data = await fetchJson<{ employee: VerifiedPinIdentity }>(
        `/api/restaurants/by-name/${encodeURIComponent(restName)}/employees/verify-pin`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ pin, pinLength }),
        },
        { retries: 0 },
      );
      return data.employee;
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) return null;
      throw err;
    }
  },
  async deleteOrder(id: number, employee?: { employeeId: number } | null) {
    return fetchJson(`/api/orders/${id}`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(employee ? { employeeId: employee.employeeId } : {}),
    });
  },
  async markPickedUp(id: number, employee?: { employeeId: number } | null) {
    return fetchJson(`/api/orders/${id}/acknowledge`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(employee ? { employeeId: employee.employeeId } : {}),
    });
  },
  async logoutEmployee(restName: string, employeeId: number) {
    return fetchJson(`/api/restaurants/by-name/${encodeURIComponent(restName)}/employees/logout`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ employeeId }),
    }, { retries: 0 });
  },
};

// --- NAVIGATION (top bar on mobile, sidebar from md: up) ---
const Nav: FC<{
  activeTab: Tab;
  setActiveTab: (tab: Tab) => void;
  onLogout: () => void;
  onLogoutStaff: (() => void) | null;
  restaurantName: string;
  statusCounts: StatusCounts;
}> = ({ activeTab, setActiveTab, onLogout, onLogoutStaff, restaurantName, statusCounts }) => {
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
        {tab !== "Home" && tab !== "Staff" && (
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
        showClock
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
          {onLogoutStaff && (
            <button
              onClick={() => {
                onLogoutStaff();
                setMobileOpen(false);
              }}
              className="w-full text-left px-4 py-3 text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-2)] hover:text-[var(--color-text-primary)] rounded-[var(--radius-sm)] transition-colors"
            >
              Logout Staff
            </button>
          )}
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
        {onLogoutStaff && (
          <button
            onClick={onLogoutStaff}
            className="w-full text-left px-4 py-3 text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-2)] hover:text-[var(--color-text-primary)] rounded-[var(--radius-sm)] transition-colors mt-4"
          >
            Logout Staff
          </button>
        )}
        <button
          onClick={onLogout}
          className={`w-full text-left px-4 py-3 text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-2)] hover:text-[var(--color-danger)] rounded-[var(--radius-sm)] transition-colors ${onLogoutStaff ? "mt-1" : "mt-4"}`}
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

/**
 * Live "has this order overstayed its current status's threshold" check,
 * ticking on the same 30s cadence as OrderAge -- a card must turn overdue on
 * its own between the 5s order-list polls, not wait for the next poll to
 * happen to land after the threshold passed.
 */
function useOrderOverdue(order: Order): boolean {
  const [nowMs, setNowMs] = useState(() => Date.now());
  useEffect(() => {
    const interval = setInterval(() => setNowMs(Date.now()), 30_000);
    return () => clearInterval(interval);
  }, []);
  return isOrderOverdue(order, nowMs);
}

/** Small "overdue" pill -- icon + text, never color-only, matching StatusBadge's approach. */
const OverdueBadge: FC<{ status: OrderStatus }> = ({ status }) => {
  const minutes = OVERDUE_THRESHOLD_MINUTES[normalizeStatus(status)];
  const label =
    normalizeStatus(status) === "complete"
      ? `Past ${minutes}m — confirm pickup`
      : `Past ${minutes}m`;
  return (
    <span
      className="inline-flex items-center gap-1 text-xs font-bold text-[var(--color-warning)] whitespace-nowrap"
      title={
        normalizeStatus(status) === "complete"
          ? "This order has been Complete a while — make sure the customer actually got it or can access it."
          : `This order has been in ${status} longer than ${minutes} minutes.`
      }
    >
      <TriangleAlert className="w-3.5 h-3.5" aria-hidden="true" />
      {label}
    </span>
  );
};

const OrderCard: FC<{
  order: Order;
  justUpdated: boolean;
  isExiting: boolean;
  onAdvance: (id: number, status: OrderStatus) => void;
  onDelete: (id: number, skipConfirm: boolean) => void;
  onMarkPickedUp: (id: number) => void;
}> = ({ order, justUpdated, isExiting, onAdvance, onDelete, onMarkPickedUp }) => {
  const overdue = useOrderOverdue(order);
  const showMarkPickedUp = normalizeStatus(order.status) === "complete" && !order.acknowledged_at;
  return (
    <Card
      style={overdue && !justUpdated ? { backgroundColor: "color-mix(in srgb, var(--color-danger) 12%, var(--color-surface-1))" } : undefined}
      className={`flex flex-col p-4 sm:p-5 transition-all duration-200 ${isExiting ? "animate-order-exit" : "animate-order-enter"} ${
        justUpdated ? "ring-2 ring-[var(--color-brand)]" : overdue ? "ring-2 ring-[var(--color-danger)]" : ""
      }`}
    >
      <div className="flex items-start justify-between gap-3 mb-3 sm:mb-4">
        <p className="font-bold text-lg sm:text-xl text-[var(--color-text-primary)] break-all" title={order.order_number}>
          #{order.order_number}
        </p>
        <OrderAge receivedAt={order.received_at} />
      </div>
      {overdue && (
        <div className="mb-3">
          <OverdueBadge status={order.status} />
        </div>
      )}
      <StatusStepper status={order.status} onAdvance={(next) => onAdvance(order.id, next)} acknowledgedAt={order.acknowledged_at} />
      {showMarkPickedUp && (
        <button
          onClick={() => onMarkPickedUp(order.id)}
          className="w-full mt-4 py-2 text-sm font-medium rounded-[var(--radius-sm)] bg-[var(--color-success)]/10 text-[var(--color-success)] hover:bg-[var(--color-success)]/20 transition-colors"
        >
          Mark as Picked Up
        </button>
      )}
      <button
        onClick={(e) => onDelete(order.id, e.shiftKey)}
        title="Hold Shift to skip the confirmation"
        className="w-full mt-2 py-2 text-sm font-medium rounded-[var(--radius-sm)] bg-[var(--color-danger)]/10 text-[var(--color-danger)] hover:bg-[var(--color-danger)]/20 transition-colors"
      >
        Delete
      </button>
    </Card>
  );
};

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
  onMarkPickedUp: (id: number) => void;
}> = ({ order, exiting, justUpdated, onAdvance, onDeleteOrder, onMarkPickedUp }) => {
  const { containerRef, aRef, bRef, fits } = useSideBySideFit<HTMLDivElement, HTMLSpanElement, HTMLDivElement>(16);
  const overdue = useOrderOverdue(order);
  const showMarkPickedUp = normalizeStatus(order.status) === "complete" && !order.acknowledged_at;
  return (
    <div
      ref={containerRef}
      style={overdue && !justUpdated ? { backgroundColor: "color-mix(in srgb, var(--color-danger) 15%, var(--color-surface-2))" } : undefined}
      className={`bg-[var(--color-surface-2)] p-3 sm:p-4 rounded-[var(--radius-sm)] flex gap-2 sm:gap-3 transition-all duration-200 card-elevated ${
        fits ? "flex-row items-center justify-between" : "flex-col"
      } ${exiting ? "animate-order-exit" : "animate-order-enter"} ${
        justUpdated ? "ring-2 ring-[var(--color-brand)]" : overdue ? "ring-2 ring-[var(--color-danger)]" : ""
      }`}
    >
      <span ref={aRef} className="flex flex-col min-w-0" title={order.order_number}>
        <span className="font-bold text-base sm:text-lg text-[var(--color-text-primary)] truncate">
          #{order.order_number}
        </span>
        <OrderAge receivedAt={order.received_at} />
        {overdue && <OverdueBadge status={order.status} />}
      </span>
      <div ref={bRef} className="flex items-center gap-2 sm:gap-3 min-w-0">
        <div className="flex-1 min-w-0">
          <StatusStepper status={order.status} onAdvance={(next) => onAdvance(order.id, next)} acknowledgedAt={order.acknowledged_at} />
        </div>
        {showMarkPickedUp && (
          <button
            onClick={() => onMarkPickedUp(order.id)}
            title="Mark as Picked Up"
            aria-label={`Mark order ${order.order_number} as picked up`}
            className="text-[var(--color-text-muted)] hover:text-[var(--color-success)] min-w-10 min-h-10 sm:min-w-0 sm:min-h-0 p-0 sm:p-2 flex items-center justify-center rounded-[var(--radius-full)] transition-colors shrink-0"
          >
            <CheckCircle className="w-4 h-4" />
          </button>
        )}
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
  onCreateOrder: (orderNumber: string) => Promise<Order | null>;
  onDeleteOrder: (id: number, skipConfirm: boolean) => void;
  onAdvance: (id: number, status: OrderStatus) => void;
  onMarkPickedUp: (id: number) => void;
  onError: (message: string) => void;
}> = ({ orders, recentlyUpdatedId, exitingIds, restaurantName, onCreateOrder, onDeleteOrder, onAdvance, onMarkPickedUp, onError }) => {
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
      // onCreateOrder itself gates on the employee PIN (if this kitchen has
      // any staff configured) before the order is actually created -- see
      // KitchenDashboardContent.requestCreateOrder. Returns null if the
      // PIN prompt was cancelled, in which case nothing was created and
      // there's nothing further to do here.
      const newOrder = await onCreateOrder(orderNumber);
      if (!newOrder) return;
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
      const matched = orders.filter((order) => {
        const displayMatch = order.order_number.toLowerCase().includes(displayQuery);
        const lookupMatch = lookupQuery.length > 0 && normalizeOrderLookupKey(order.order_number).includes(lookupQuery);
        return displayMatch || lookupMatch;
      });
      // Automatic priority order, not a user-chosen sort: Received first,
      // then Preparing, then Complete, each oldest-in-status first -- so
      // whatever needs attention soonest is always at the top of Home too.
      return sortByPriority(matched);
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
              onMarkPickedUp={onMarkPickedUp}
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
  { label: "2 hours", hours: 2 },
  { label: "4 hours", hours: 4 },
];

// Mirrors the PUT /settings route's own bounds exactly, so an invalid custom
// value is rejected instantly client-side rather than round-tripping to a
// 400 -- see api/restaurants/by-name/[restaurantName]/settings/route.ts.
const COMPLETE_CAP_MIN_HOURS = 0.1;
const COMPLETE_CAP_MAX_HOURS = 168;

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
  // Custom HH:MM entry -- two plain number fields rather than one
  // colon-parsed text field, for fewer parsing edge cases and a proper
  // numeric mobile keyboard on each. Shown whenever the loaded/selected
  // value doesn't match one of the 3 fixed presets, or the user explicitly
  // opens it via the Custom button.
  const [showCustom, setShowCustom] = useState(false);
  const [customH, setCustomH] = useState("");
  const [customM, setCustomM] = useState("");

  useEffect(() => {
    fetchJson<{ completeCapHours: number }>(
      `/api/restaurants/by-name/${encodeURIComponent(restaurantName)}/settings`,
    )
      .then((data) => {
        setHours(data.completeCapHours);
        if (!COMPLETE_CAP_PRESETS.some((p) => p.hours === data.completeCapHours)) {
          setShowCustom(true);
          setCustomH(String(Math.floor(data.completeCapHours)));
          setCustomM(String(Math.round((data.completeCapHours % 1) * 60)));
        }
      })
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

  // Auto-applies whenever customH/customM change, instead of requiring a
  // manual Apply tap -- the user found that button "too much work for
  // staff" for a setting that's just two number fields. Debounced so a
  // still-typing multi-digit hour/minute value doesn't fire a PUT per
  // keystroke; skips silently (no error toast) while the value is out of
  // range mid-edit, since e.g. clearing "10" to type "100" passes through
  // an empty/invalid intermediate state that isn't a real user mistake yet.
  useEffect(() => {
    if (!showCustom) return;
    const h = Number(customH) || 0;
    const m = Number(customM) || 0;
    const decimalHours = h + m / 60;
    if (!Number.isFinite(decimalHours) || decimalHours < COMPLETE_CAP_MIN_HOURS || decimalHours > COMPLETE_CAP_MAX_HOURS) {
      return;
    }
    if (decimalHours === hours) return;
    const timer = setTimeout(() => void handleChange(decimalHours), 500);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customH, customM, showCustom]);

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
            onClick={() => {
              setShowCustom(false);
              handleChange(preset.hours);
            }}
            disabled={saving}
            aria-pressed={!showCustom && hours === preset.hours}
            className={`min-h-10 px-4 py-2 rounded-[var(--radius-sm)] text-sm font-medium border transition-colors disabled:opacity-60 ${
              !showCustom && hours === preset.hours
                ? "bg-[var(--color-brand)] border-[var(--color-brand)] text-[var(--color-on-brand)]"
                : "bg-[var(--color-surface-2)] border-[var(--color-border-strong)] text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]"
            }`}
          >
            {preset.label}
          </button>
        ))}
        <button
          onClick={() => setShowCustom(true)}
          disabled={saving}
          aria-pressed={showCustom}
          className={`min-h-10 px-4 py-2 rounded-[var(--radius-sm)] text-sm font-medium border transition-colors disabled:opacity-60 ${
            showCustom
              ? "bg-[var(--color-brand)] border-[var(--color-brand)] text-[var(--color-on-brand)]"
              : "bg-[var(--color-surface-2)] border-[var(--color-border-strong)] text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]"
          }`}
        >
          Custom
        </button>
      </div>
      {showCustom && (
        <div className="flex flex-wrap items-end gap-2 mt-3">
          <div>
            <label htmlFor="cap-hours" className="block text-xs font-medium text-[var(--color-text-secondary)] mb-1">
              Hours
            </label>
            <Input
              id="cap-hours"
              type="text"
              inputMode="numeric"
              value={customH}
              onChange={(e) => setCustomH(e.target.value.replace(/\D/g, "").slice(0, 3))}
              placeholder="0"
              className="w-20"
            />
          </div>
          <div>
            <label htmlFor="cap-minutes" className="block text-xs font-medium text-[var(--color-text-secondary)] mb-1">
              Minutes
            </label>
            <Input
              id="cap-minutes"
              type="text"
              inputMode="numeric"
              value={customM}
              onChange={(e) => setCustomM(e.target.value.replace(/\D/g, "").slice(0, 2))}
              placeholder="00"
              className="w-20"
            />
          </div>
        </div>
      )}
    </Card>
  );
};

type RoleApiRow = { id: number; name: string; created_at: string };

/**
 * Manager-gated employee roster: add/edit/deactivate employees, reset PINs,
 * and manage the kitchen's own custom role labels (Chef, Cashier, etc. --
 * see SYSTEM_MEMORY.md "Employee Attribution"). Client-side display is a
 * convenience only -- every mutation here is re-authorized server-side by
 * requireRestaurantOrAdmin, same as every other kitchen-scoped route. The
 * "unlock with a manager's own PIN" step exists because there's no
 * per-employee session to check accountType against, so this reuses the
 * same PinPad and restricts which employees can unlock it to managers.
 */
const StaffTab: FC<{ restaurantName: string; onError: (message: string) => void }> = ({
  restaurantName,
  onError,
}) => {
  const [employees, setEmployees] = useState<PinPadEmployee[]>([]);
  const [roles, setRoles] = useState<RoleApiRow[]>([]);
  const [unlocked, setUnlocked] = useState(false);
  const [pinPadOpen, setPinPadOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newPin, setNewPin] = useState("");
  const [newAccountType, setNewAccountType] = useState<"manager" | "employee">("employee");
  // PIN length is DERIVED from account type, not independently choosable --
  // managers require a 6-digit PIN (see lib/employee-auth.ts
  // requiredPinLength; the server enforces this regardless, this just keeps
  // the UI from prompting for a length that would be rejected).
  const newPinLength = newAccountType === "manager" ? 6 : 4;
  const [newRoleId, setNewRoleId] = useState<string>("");
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [newRoleName, setNewRoleName] = useState("");

  const managers = employees.filter((e) => e.accountType === "manager");

  const loadAll = useCallback(() => {
    api.getEmployees(restaurantName).then((data) => setEmployees(data.employees)).catch(() => {});
    fetchJson<{ roles: RoleApiRow[] }>(`/api/restaurants/by-name/${encodeURIComponent(restaurantName)}/roles`)
      .then((data) => setRoles(data.roles))
      .catch(() => {});
  }, [restaurantName]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  const roleOptions = [
    { value: "", label: "No role label" },
    ...roles.map((r) => ({ value: String(r.id), label: r.name })),
  ];

  const addEmployee = async (e: FormEvent) => {
    e.preventDefault();
    if (!newName.trim() || !new RegExp(`^\\d{${newPinLength}}$`).test(newPin)) {
      onError(`Enter a name and a ${newPinLength}-digit PIN`);
      return;
    }
    setSaving(true);
    try {
      await fetchJson(`/api/restaurants/by-name/${encodeURIComponent(restaurantName)}/employees`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newName.trim(),
          pin: newPin,
          pinLength: newPinLength,
          accountType: newAccountType,
          roleId: newRoleId ? Number(newRoleId) : undefined,
        }),
      });
      setNewName("");
      setNewPin("");
      setNewAccountType("employee");
      setNewRoleId("");
      loadAll();
    } catch (err) {
      onError(err instanceof Error ? err.message : "Failed to add employee");
    } finally {
      setSaving(false);
    }
  };

  const deactivate = async (id: number) => {
    try {
      await fetchJson(`/api/restaurants/by-name/${encodeURIComponent(restaurantName)}/employees/${id}`, {
        method: "DELETE",
      });
      loadAll();
    } catch (err) {
      onError(err instanceof Error ? err.message : "Failed to deactivate employee");
    }
  };

  const updateEmployee = async (id: number, patch: Record<string, unknown>) => {
    try {
      await fetchJson(`/api/restaurants/by-name/${encodeURIComponent(restaurantName)}/employees/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      loadAll();
    } catch (err) {
      onError(err instanceof Error ? err.message : "Failed to update employee");
    }
  };

  const addRole = async (e: FormEvent) => {
    e.preventDefault();
    if (!newRoleName.trim()) return;
    try {
      await fetchJson(`/api/restaurants/by-name/${encodeURIComponent(restaurantName)}/roles`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newRoleName.trim() }),
      });
      setNewRoleName("");
      loadAll();
    } catch (err) {
      onError(err instanceof Error ? err.message : "Failed to add role");
    }
  };

  const deleteRole = async (id: number) => {
    try {
      await fetchJson(`/api/restaurants/by-name/${encodeURIComponent(restaurantName)}/roles/${id}`, {
        method: "DELETE",
      });
      loadAll();
    } catch (err) {
      onError(err instanceof Error ? err.message : "Failed to delete role");
    }
  };

  if (!unlocked) {
    return (
      <Card>
        <h3 className="text-xl font-bold text-[var(--color-text-primary)] mb-1">Staff</h3>
        <p className="text-sm text-[var(--color-text-secondary)] mb-4">
          Manage who can be attributed to order actions. A manager PIN is required to open this panel.
        </p>
        <Button
          type="button"
          variant="secondary"
          onClick={() => {
            // Opening the PIN pad when no manager account exists yet would
            // just lead to a guaranteed "Try again" -- no PIN could ever
            // unlock this panel, since verification only ever succeeds for
            // an actual manager (checked again below on success). Catching
            // it here instead gives a real, actionable message.
            if (managers.length === 0) {
              onError("You don't have a registered manager, please ask admin to register one");
              return;
            }
            setPinPadOpen(true);
          }}
        >
          Unlock with manager PIN
        </Button>
        <PinPad
          isOpen={pinPadOpen}
          onClose={() => setPinPadOpen(false)}
          onVerify={(pin, pinLength) => api.verifyPin(restaurantName, pin, pinLength)}
          // This unlock can ONLY ever be a manager (see the accountType check
          // below), and managers always have a 6-digit PIN (requiredPinLength
          // in lib/employee-auth.ts) -- so force 6 digits instead of showing
          // the generic Manager length-toggle here. Without this, the pad
          // defaulted to 4-digit mode and auto-submitted (then rejected) a
          // manager's real PIN after its 4th digit unless they happened to
          // tap a toggle that served no purpose on this screen.
          forcedPinLength={6}
          onVerified={(employee) => {
            // The pad's Manager toggle only controls expected PIN LENGTH,
            // not who it's checked against -- verifyPin can still resolve to
            // a non-manager (e.g. someone types a random 6-digit string that
            // happens not to match anyone, or in a future world with 6-digit
            // employee PINs). The Staff tab specifically must only unlock
            // for an actual manager account, so that check happens here,
            // client-side-displayed but not the real security boundary --
            // every mutation this tab performs is independently re-authorized
            // server-side by requireRestaurantOrAdmin regardless.
            if (employee.accountType !== "manager") {
              onError("That PIN doesn't belong to a manager account.");
              return;
            }
            setPinPadOpen(false);
            setUnlocked(true);
          }}
        />
        {managers.length === 0 && employees.length === 0 && (
          <p className="text-xs text-[var(--color-text-muted)] mt-3">
            No employees yet. Ask an admin to add your first manager from the admin console, or add employees below
            once unlocked.
          </p>
        )}
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <h3 className="text-xl font-bold text-[var(--color-text-primary)] mb-4">Employees</h3>
        <ul className="space-y-2 mb-4">
          {employees.map((employee) => (
            <li
              key={employee.id}
              className="flex flex-wrap items-center justify-between gap-3 px-3 py-2 rounded-[var(--radius-sm)] bg-[var(--color-surface-2)]"
            >
              {editingId === employee.id ? (
                <EmployeeEditRow
                  employee={employee}
                  roleOptions={roleOptions}
                  onCancel={() => setEditingId(null)}
                  onSave={async (patch) => {
                    await updateEmployee(employee.id, patch);
                    setEditingId(null);
                  }}
                />
              ) : (
                <>
                  <span className="text-sm font-medium text-[var(--color-text-primary)]">
                    {employee.name}{" "}
                    <span className="text-[var(--color-text-muted)] font-normal">
                      ({employee.accountType === "manager" ? "Manager" : "Employee"}
                      {employee.roleName ? `, ${employee.roleName}` : ""})
                    </span>
                  </span>
                  <div className="flex gap-2">
                    <Button type="button" variant="ghost" size="md" onClick={() => setEditingId(employee.id)}>
                      Edit
                    </Button>
                    <Button type="button" variant="ghost" size="md" onClick={() => deactivate(employee.id)}>
                      Remove
                    </Button>
                  </div>
                </>
              )}
            </li>
          ))}
          {employees.length === 0 && (
            <li className="text-sm text-[var(--color-text-muted)]">No employees yet.</li>
          )}
        </ul>

        <form onSubmit={addEmployee} className="flex flex-wrap items-end gap-2">
          <Input
            aria-label="Employee name"
            placeholder="Full name"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            className="flex-1 min-w-[10rem]"
          />
          <Select
            ariaLabel="Account type"
            value={newAccountType}
            options={[
              { value: "employee", label: "Employee (4-digit PIN)" },
              { value: "manager", label: "Manager (6-digit PIN)" },
            ]}
            onChange={(v) => {
              setNewAccountType(v);
              setNewPin("");
            }}
          />
          <div className="w-36">
            <Input
              aria-label="Employee PIN"
              placeholder={`${newPinLength}-digit PIN`}
              inputMode="numeric"
              value={newPin}
              onChange={(e) => setNewPin(e.target.value.replace(/\D/g, "").slice(0, newPinLength))}
            />
            <StrengthMeter {...scorePinStrength(newPin, newPinLength)} empty={newPin.length === 0} />
          </div>
          <Select
            ariaLabel="Role label"
            value={newRoleId}
            options={roleOptions}
            onChange={setNewRoleId}
          />
          <Button type="submit" disabled={saving}>
            Add
          </Button>
        </form>
      </Card>

      <Card>
        <h3 className="text-xl font-bold text-[var(--color-text-primary)] mb-1">Roles</h3>
        <p className="text-sm text-[var(--color-text-secondary)] mb-4">
          Custom labels (Chef, Cashier, Dishwasher, ...) you can assign to any employee above. Labels are for
          organization only -- Manager/Employee above controls Staff-tab access.
        </p>
        <ul className="space-y-2 mb-4">
          {roles.map((role) => (
            <li
              key={role.id}
              className="flex items-center justify-between gap-3 px-3 py-2 rounded-[var(--radius-sm)] bg-[var(--color-surface-2)]"
            >
              <span className="text-sm font-medium text-[var(--color-text-primary)]">{role.name}</span>
              <Button type="button" variant="ghost" size="md" onClick={() => deleteRole(role.id)}>
                Delete
              </Button>
            </li>
          ))}
          {roles.length === 0 && <li className="text-sm text-[var(--color-text-muted)]">No custom roles yet.</li>}
        </ul>
        <form onSubmit={addRole} className="flex flex-wrap items-end gap-2">
          <Input
            aria-label="New role name"
            placeholder="Role name (e.g. Chef)"
            value={newRoleName}
            onChange={(e) => setNewRoleName(e.target.value)}
            className="flex-1 min-w-[10rem]"
          />
          <Button type="submit">Add Role</Button>
        </form>
      </Card>
    </div>
  );
};

const EmployeeEditRow: FC<{
  employee: PinPadEmployee;
  roleOptions: { value: string; label: string }[];
  onCancel: () => void;
  onSave: (patch: Record<string, unknown>) => Promise<void>;
}> = ({ employee, roleOptions, onCancel, onSave }) => {
  const currentRoleId = roleOptions.find((r) => r.label === employee.roleName)?.value ?? "";
  const [name, setName] = useState(employee.name);
  const [accountType, setAccountType] = useState<"manager" | "employee">(employee.accountType);
  const [roleId, setRoleId] = useState(currentRoleId);
  const [resetPin, setResetPin] = useState("");
  const [saving, setSaving] = useState(false);

  // PIN length is DERIVED from the currently-selected account type, not
  // independently choosable -- managers require a 6-digit PIN (see
  // lib/employee-auth.ts requiredPinLength). Promoting employee->manager
  // here forces a PIN reset in the same save, matching the server's
  // rejection of a promotion that doesn't also fix the PIN length.
  const requiredLength = accountType === "manager" ? 6 : 4;
  const isPromotingToManager = accountType === "manager" && employee.accountType !== "manager";
  const mustResetPin = isPromotingToManager || employee.pinLength !== requiredLength;

  const save = async () => {
    if (mustResetPin && !new RegExp(`^\\d{${requiredLength}}$`).test(resetPin)) return;
    setSaving(true);
    const patch: Record<string, unknown> = {
      name,
      accountType,
      roleId: roleId ? Number(roleId) : null,
    };
    if (resetPin) {
      patch.pin = resetPin;
      patch.pinLength = requiredLength;
    }
    await onSave(patch);
    setSaving(false);
  };

  return (
    <div className="flex flex-wrap items-end gap-2 w-full">
      <Input aria-label="Edit name" value={name} onChange={(e) => setName(e.target.value)} className="flex-1 min-w-[8rem]" />
      <Select
        ariaLabel="Edit account type"
        value={accountType}
        options={[
          { value: "employee", label: "Employee (4-digit PIN)" },
          { value: "manager", label: "Manager (6-digit PIN)" },
        ]}
        onChange={(v) => {
          setAccountType(v);
          setResetPin("");
        }}
      />
      <Select ariaLabel="Edit role label" value={roleId} options={roleOptions} onChange={setRoleId} />
      <div className="w-48">
        <Input
          aria-label={mustResetPin ? `New ${requiredLength}-digit PIN (required)` : "Reset PIN (optional)"}
          placeholder={mustResetPin ? `New ${requiredLength}-digit PIN (required)` : "New PIN (optional)"}
          inputMode="numeric"
          value={resetPin}
          onChange={(e) => setResetPin(e.target.value.replace(/\D/g, "").slice(0, requiredLength))}
        />
        <StrengthMeter {...scorePinStrength(resetPin, requiredLength)} empty={resetPin.length === 0} />
      </div>
      <Button
        type="button"
        onClick={save}
        disabled={saving || (mustResetPin && resetPin.length !== requiredLength)}
      >
        Save
      </Button>
      <Button type="button" variant="ghost" onClick={onCancel}>
        Cancel
      </Button>
      {isPromotingToManager && (
        <p className="text-xs text-[var(--color-text-muted)] w-full">
          Promoting to Manager requires setting a new 6-digit PIN.
        </p>
      )}
    </div>
  );
};

const OrderGrid: FC<{
  orders: Order[];
  recentlyUpdatedId: number | null;
  exitingIds: Set<number>;
  onAdvance: (id: number, status: OrderStatus) => void;
  onDelete: (id: number, skipConfirm: boolean) => void;
  onMarkPickedUp: (id: number) => void;
}> = ({ orders, recentlyUpdatedId, exitingIds, onAdvance, onDelete, onMarkPickedUp }) => {
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
          onMarkPickedUp={onMarkPickedUp}
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
  const router = useRouter();
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
  // Employee roster -- an empty roster means this kitchen hasn't set up
  // employees yet, so order actions proceed unattributed and the staff
  // sign-in step (app/restaurant/staff-login) is skipped entirely (see
  // restauranthome/page.tsx). A non-empty roster means someone signed in
  // there before ever reaching this dashboard (see lib/employee-session.ts)
  // -- every order action for the rest of THIS session is attributed to
  // that one signed-in employee, with no further per-action PIN prompt.
  const [employees, setEmployees] = useState<PinPadEmployee[]>([]);
  // Lazy initializer (not a setState-in-effect) -- restaurantName is already
  // known synchronously as a prop by first render, and this component only
  // ever mounts client-side (KitchenDashboard is rendered from
  // restauranthome/page.tsx after its own session check resolves), so
  // there's no SSR/hydration-mismatch risk reading sessionStorage here.
  const [signedInEmployee] = useState<EmployeeSession | null>(() => getEmployeeSession(restaurantName));

  useEffect(() => {
    api.getEmployees(restaurantName)
      .then((data) => setEmployees(data.employees))
      .catch(() => setEmployees([]));
  }, [restaurantName]);
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

  // fetchOrders is redefined every render (it closes over showToast/state
  // setters) -- read the latest version via a ref inside the socket effect
  // below so that effect doesn't need fetchOrders in its own deps (which
  // would tear down and reopen the WebSocket on every render).
  const fetchOrdersRef = useRef(fetchOrders);
  useEffect(() => {
    fetchOrdersRef.current = fetchOrders;
  });

  // Kitchen-scoped live order updates, same ws-hub broadcast/`?restaurant=`
  // channel the customer tracker already uses (see customer/page.tsx) --
  // every order create/status-change/delete/acknowledge route already calls
  // broadcast() with this restaurant's name, so this was previously getting
  // that data up to 5s stale for no reason other than nothing was listening
  // for it here. Replaces the old 5s setInterval poll outright rather than
  // running both: a WS message always arrives faster than the next poll
  // tick would have anyway, so there's nothing the interval still adds.
  useEffect(() => {
    fetchOrdersRef.current(true);

    let socket: WebSocket | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let closedByEffect = false;
    let reconnectAttempt = 0;

    const RECONNECT_BASE_MS = 2000;
    const RECONNECT_MAX_MS = 30000;

    const connect = () => {
      const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
      const restaurantParam = encodeURIComponent(restaurantName);
      socket = new WebSocket(`${protocol}//${window.location.host}/ws?restaurant=${restaurantParam}`);

      socket.onopen = () => {
        reconnectAttempt = 0;
      };

      socket.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.type === "order_updated" || data.type === "order_deleted") {
            void fetchOrdersRef.current(false);
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
  }, [restaurantName]);

  // One-time overdue toast per order+status: keyed by `${id}:${status}` so an
  // order that leaves and later re-enters a status (e.g. a kitchen Undo) can
  // fire again, but a single overdue order sitting there doesn't retoast
  // every tick. Checked on its own timer independent of the 5s order poll,
  // since "overdue" is purely a function of elapsed time, not new server data.
  const overdueToastedRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    const checkOverdue = () => {
      const now = Date.now();
      for (const order of orders) {
        if (!isOrderOverdue(order, now)) continue;
        const key = `${order.id}:${normalizeStatus(order.status)}`;
        if (overdueToastedRef.current.has(key)) continue;
        overdueToastedRef.current.add(key);
        const minutes = OVERDUE_THRESHOLD_MINUTES[normalizeStatus(order.status)];
        const message =
          normalizeStatus(order.status) === "complete"
            ? `Order #${order.order_number} has been Complete over ${minutes}m — make sure the customer got it or can access it.`
            : `Order #${order.order_number} has been ${order.status} over ${minutes}m.`;
        showToast(message, "warning");
      }
    };
    checkOverdue();
    const interval = setInterval(checkOverdue, 30_000);
    return () => clearInterval(interval);
  }, [orders, showToast]);

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

  // Attributed to whoever is currently signed in for this shift (see
  // lib/employee-session.ts) -- null if this kitchen has no employees
  // configured, matching the previous unattributed-by-default behavior.
  const currentEmployeeCredential = signedInEmployee ? { employeeId: signedInEmployee.employeeId } : null;

  const performAdvanceStatus = async (id: number, status: OrderStatus) => {
    const previousOrder = orders.find((order) => order.id === id);
    if (!previousOrder) return;

    try {
      setOrders((prev) => prev.map((o) => (o.id === id ? { ...o, status } : o)));
      flash(id);
      const response = await api.updateOrderStatus(id, status, undefined, currentEmployeeCredential);
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

  // Entry point every order card actually calls. PIN attribution already
  // happened once at staff sign-in (see restauranthome/page.tsx's gate) --
  // no per-action prompt needed here anymore.
  const handleAdvanceStatus = (id: number, status: OrderStatus) => {
    void performAdvanceStatus(id, status);
  };

  const performCreateOrder = async (orderNumber: string): Promise<Order | null> => {
    try {
      const newOrder = await api.createOrder(restaurantName, orderNumber, currentEmployeeCredential);
      handleAddOrder(newOrder);
      return newOrder;
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Failed to create order", "error");
      return null;
    }
  };

  // Entry point HomeTab calls (awaited). No PIN prompt here anymore -- see
  // handleAdvanceStatus above.
  const requestCreateOrder = (orderNumber: string): Promise<Order | null> => {
    return performCreateOrder(orderNumber);
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
      await api.deleteOrder(id, currentEmployeeCredential);
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
      showToast(error instanceof Error ? error.message : "Failed to delete order", "error");
      setExitingIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
      fetchOrders();
    }
  };

  // Deleting is attributed the same way as create/status-change now (see
  // handleAdvanceStatus above) -- no per-action PIN prompt. Holding Shift
  // while clicking Delete still skips only the "are you sure" confirmation
  // modal (an extra deliberate keypress already signals intent).
  const requestDeleteOrder = (id: number, skipConfirm: boolean) => {
    if (skipConfirm) {
      void deleteOrder(id);
      return;
    }
    setOrderToDelete(id);
  };

  const confirmDeleteOrder = () => {
    if (orderToDelete === null) return;
    const id = orderToDelete;
    setOrderToDelete(null);
    void deleteOrder(id);
  };

  const handleAddOrder = (newOrder: Order) => {
    setOrders((prev) => [newOrder, ...prev]);
    flash(newOrder.id);
  };

  // Kitchen-side "Mark as Picked Up" -- previously only the customer's own
  // tracker page could set acknowledged_at (see api/orders/[id]/acknowledge,
  // deliberately unauthenticated for that path). Sending employeeId here
  // opts into that route's newer authenticated branch, which also writes an
  // audit event, same attribution as any other order action this session.
  const handleMarkPickedUp = async (id: number) => {
    setOrders((prev) => prev.map((o) => (o.id === id ? { ...o, acknowledged_at: new Date().toISOString() } : o)));
    try {
      await api.markPickedUp(id, currentEmployeeCredential);
      showToast("Order marked as picked up", "success");
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Failed to mark order as picked up", "error");
      void fetchOrders();
    }
  };

  // Clicking "Logout Staff" signs out only the currently-signed-in employee
  // -- the kitchen's own restaurant_session/Remember-Me is untouched, so the
  // next screen is the staff sign-in step (see restauranthome/page.tsx's
  // gate), not the kitchen login. Best-effort on the audit call (same
  // resilience pattern as the full kitchen logout below): sessionStorage is
  // always cleared and the redirect always happens even if the network call
  // fails, since staying "signed in" client-side after a failed logout
  // attempt would be worse than a missed audit row.
  const handleLogoutStaff = async () => {
    if (signedInEmployee) {
      try {
        await api.logoutEmployee(restaurantName, signedInEmployee.employeeId);
      } catch {
        // best-effort; still proceed to sign the staff session out locally
      }
    }
    clearEmployeeSession();
    router.push("/restaurant/staff-login");
  };

  const renderContent = () => {
    if (isLoading) return <p className="text-[var(--color-text-muted)]">Setting up the kitchen...</p>;

    if (activeTab === "Home") {
      return (
        <HomeTab
          orders={orders}
          recentlyUpdatedId={recentlyUpdatedId}
          exitingIds={exitingIds}
          restaurantName={restaurantName}
          onCreateOrder={requestCreateOrder}
          onDeleteOrder={requestDeleteOrder}
          onAdvance={handleAdvanceStatus}
          onMarkPickedUp={handleMarkPickedUp}
          onError={(message) => showToast(message, "error")}
        />
      );
    }

    if (activeTab === "Staff") {
      return <StaffTab restaurantName={restaurantName} onError={(message) => showToast(message, "error")} />;
    }

    const displayedOrders = sortByPriority(
      orders.filter((o) => normalizeStatus(o.status) === normalizeStatus(activeTab)),
    );

    return (
      <OrderGrid
        orders={displayedOrders}
        recentlyUpdatedId={recentlyUpdatedId}
        exitingIds={exitingIds}
        onAdvance={handleAdvanceStatus}
        onDelete={requestDeleteOrder}
        onMarkPickedUp={handleMarkPickedUp}
      />
    );
  };

  return (
    <div className="h-dvh flex flex-col md:flex-row overflow-hidden">
      <Nav
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        onLogout={onLogout}
        onLogoutStaff={employees.length > 0 ? handleLogoutStaff : null}
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
