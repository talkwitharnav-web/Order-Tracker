"use client";

import { useState, FormEvent, useEffect, useRef, FC, useCallback } from "react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input, Label } from "@/components/ui/Input";
import { StatusIcon } from "@/components/ui/StatusBadge";
import { SettingsToggles } from "@/components/ui/SettingsToggles";
import { RestaurantAutocomplete } from "@/components/ui/RestaurantAutocomplete";
import { getStatusVisual, normalizeStatus, type CustomerOrderStatus, type StatusKey } from "@/lib/order-status";
import { ApiError, fetchJson } from "@/lib/api-client";
import { formatOrderDisplayInput } from "@/lib/order-naming";

type Order = {
  id: number;
  restaurant_name: string;
  order_number: string;
  status: CustomerOrderStatus;
  updated_at: string;
  acknowledged_at: string | null;
};

type StoredTracking = { restaurantName: string; orderNumber: string };
type FetchOrderOptions = { background?: boolean; persist?: boolean };
const TRACKING_STORAGE_KEY = "restaurant-order-tracker:active-order";
const formatRestaurantInput = (value: string) => value.replace(/[^a-zA-Z0-9 '.,#_-]/g, "").slice(0, 200);

const clearStoredTracking = () => {
  try {
    sessionStorage.removeItem(TRACKING_STORAGE_KEY);
  } catch {
    // Tracking recovery is best-effort when storage is unavailable.
  }
};

const saveStoredTracking = (restaurantName: string, orderNumber: string) => {
  try {
    sessionStorage.setItem(TRACKING_STORAGE_KEY, JSON.stringify({ restaurantName, orderNumber }));
  } catch {
    // The live tracker still works when private-mode storage is unavailable.
  }
};

const readStoredTracking = (): StoredTracking | null => {
  try {
    const raw = sessionStorage.getItem(TRACKING_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<StoredTracking>;
    if (typeof parsed.restaurantName !== "string" || typeof parsed.orderNumber !== "string") {
      clearStoredTracking();
      return null;
    }
    const restaurantName = parsed.restaurantName.trim();
    const orderNumber = parsed.orderNumber.trim();
    if (!restaurantName || !orderNumber) {
      clearStoredTracking();
      return null;
    }
    return { restaurantName, orderNumber };
  } catch {
    clearStoredTracking();
    return null;
  }
};

const timeSince = (date: string) => {
  const seconds = Math.floor((new Date().getTime() - new Date(date).getTime()) / 1000);
  const ago = (value: number, unit: string) => `${value} ${unit}${value === 1 ? "" : "s"} ago`;
  let interval = seconds / 31536000;
  if (interval >= 1) return ago(Math.floor(interval), "year");
  interval = seconds / 2592000;
  if (interval >= 1) return ago(Math.floor(interval), "month");
  interval = seconds / 86400;
  if (interval >= 1) return ago(Math.floor(interval), "day");
  interval = seconds / 3600;
  if (interval >= 1) return ago(Math.floor(interval), "hour");
  interval = seconds / 60;
  if (interval >= 1) return ago(Math.floor(interval), "minute");
  if (seconds < 10) return "just now";
  return ago(Math.max(0, seconds), "second");
};

// Keyed by the canonical StatusKey (see order-status.ts), not the raw string
// on the order — the order's `status` field can arrive in either the
// Kitchen/API vocabulary (Received/Preparing/Complete) or this page's own
// CustomerOrderStatus type (Received/Making/Finished) depending on where it
// came from (see SYSTEM_MEMORY.md's status-vocab-inconsistency quirk).
// Comparing `order.status` directly against "Making"/"Finished" here used to
// silently fail for any order carrying the API vocabulary (e.g. a fresh order
// marked "Preparing" by the kitchen matched none of the three branches and
// fell through to "Ready for Pickup!" despite still being in progress) even
// though the color/icon below were already correct, because those go through
// getStatusVisual -> normalizeStatus. Routing title/description through the
// same normalizeStatus() keeps every display detail in sync regardless of
// which vocabulary produced the value.
const STATUS_TITLE: Record<StatusKey, string> = {
  received: "Order Placed",
  preparing: "In the Kitchen",
  complete: "Ready for Pickup!",
};

const STATUS_DESCRIPTION: Record<StatusKey, string> = {
  received: "We've got your order and will start preparing it soon.",
  preparing: "Our chefs are putting their love and care into your meal.",
  complete: "Your order is ready. Come and get it!",
};

const CONFETTI_COLORS = ["#c1602f", "#6b7a4f", "#e07a45", "#9caf7a", "#f2c9a0", "#d8c6a3"];

const ConfettiBurst: FC = () => {
  const particles = Array.from({ length: 8 }, (_, i) => {
    const angle = (i / 8) * 360;
    const distance = 40 + Math.random() * 30;
    const x = Math.cos((angle * Math.PI) / 180) * distance;
    const y = Math.sin((angle * Math.PI) / 180) * distance - 20;
    return { x, y, color: CONFETTI_COLORS[i % CONFETTI_COLORS.length], delay: Math.random() * 0.1 };
  });

  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden" aria-hidden="true">
      {particles.map((p, i) => (
        <span
          key={i}
          className="confetti-particle"
          style={{
            left: "50%",
            top: "40%",
            backgroundColor: p.color,
            ['--confetti-x' as string]: `${p.x}px`,
            ['--confetti-y' as string]: `${p.y}px`,
            animationDelay: `${p.delay}s`,
          }}
        />
      ))}
    </div>
  );
};

const OrderStatusCard: FC<{ order: Order; onAcknowledge: () => void; acknowledging: boolean }> = ({
  order,
  onAcknowledge,
  acknowledging,
}) => {
  const [lastUpdated, setLastUpdated] = useState(timeSince(order.updated_at));

  useEffect(() => {
    const timer = setInterval(() => setLastUpdated(timeSince(order.updated_at)), 1000);
    return () => clearInterval(timer);
  }, [order.updated_at]);

  const statusKey = normalizeStatus(order.status);
  const visual = getStatusVisual(order.status);
  const title = STATUS_TITLE[statusKey];
  // "Order Picked Up" only makes sense once the order has actually reached
  // Complete, and only until the customer has already clicked it once --
  // acknowledged_at flows through the same GET response this page already
  // polls/refetches on every WS update, so it disappears the moment the
  // click lands, same as any other status change on this page.
  const showAcknowledge = statusKey === "complete" && !order.acknowledged_at;
  const [showConfetti, setShowConfetti] = useState(false);
  const prevStatusRef = useRef(statusKey);
  const [breathe, setBreathe] = useState(false);

  useEffect(() => {
    if (prevStatusRef.current !== statusKey) {
      setBreathe(true);
      const timer = setTimeout(() => setBreathe(false), 300);
      prevStatusRef.current = statusKey;
      return () => clearTimeout(timer);
    }
  }, [statusKey]);

  useEffect(() => {
    if (order.acknowledged_at && !showConfetti) {
      setShowConfetti(true);
      const timer = setTimeout(() => setShowConfetti(false), 800);
      return () => clearTimeout(timer);
    }
  }, [order.acknowledged_at]);

  return (
    <div
      className={`relative mt-8 w-full p-8 rounded-[var(--radius-md)] border ${visual.border} ${visual.bg} text-center ${breathe ? "animate-status-breathe" : ""}`}
    >
      {showConfetti && <ConfettiBurst />}
      <StatusIcon status={order.status} className="w-16 h-16 mx-auto mb-4 animate-pulse" />
      <h2 className={`text-3xl font-bold ${visual.text}`}>
        {order.acknowledged_at ? "Enjoy Your Meal!" : title}
      </h2>
      <p className="text-[var(--color-text-secondary)] mt-2 text-base">
        {order.acknowledged_at ? "Thanks for picking up your order. Bon appétit!" : STATUS_DESCRIPTION[statusKey]}
      </p>
      <p className="text-xs text-[var(--color-text-muted)] mt-6">
        Order &ldquo;{order.order_number}&rdquo; &bull; Last updated {lastUpdated}
      </p>
      {showAcknowledge && (
        <Button onClick={onAcknowledge} disabled={acknowledging} className="mt-6">
          {acknowledging ? "Marking as picked up..." : "Order Picked Up"}
        </Button>
      )}
    </div>
  );
};

type ConnectionState = "connecting" | "live" | "reconnecting";

const ConnectionIndicator: FC<{ state: ConnectionState }> = ({ state }) => {
  const config = {
    connecting: { dot: "bg-[var(--color-text-muted)]", label: "Connecting…" },
    live: { dot: "bg-[var(--color-success)] animate-pulse", label: "Live" },
    reconnecting: { dot: "bg-[var(--color-danger)] animate-pulse", label: "Reconnecting…" },
  }[state];

  return (
    <div className="flex items-center gap-2 justify-center text-xs text-[var(--color-text-muted)] mt-4">
      <span className="relative flex items-center justify-center w-2 h-2">
        <span className={`absolute inset-0 rounded-full ${config.dot}`} />
        {state === "live" && <span className="live-ripple-ring" />}
      </span>
      {config.label}
    </div>
  );
};

export default function CustomerPage() {
  const [restaurantName, setRestaurantName] = useState("");
  const [orderNumber, setOrderNumber] = useState("");
  const [order, setOrder] = useState<Order | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [connection, setConnection] = useState<ConnectionState>("connecting");
  const [acknowledging, setAcknowledging] = useState(false);
  const orderRef = useRef<Order | null>(null);
  useEffect(() => {
    orderRef.current = order;
  }, [order]);

  const fetchOrderStatus = useCallback(async (
    restName: string,
    ordNum: string,
    { background = false, persist = true }: FetchOrderOptions = {},
  ): Promise<Order | null> => {
    try {
      const query = new URLSearchParams({ restaurant_name: restName, order_number: ordNum });
      const data = await fetchJson<Order>(`/api/orders/search?${query}`);
      setOrder(data);
      setError(null);
      if (data.acknowledged_at) {
        clearStoredTracking();
      } else if (persist) {
        saveStoredTracking(data.restaurant_name, data.order_number);
      }
      return data;
    } catch (err) {
      setError(err instanceof Error ? err.message : "An unknown error occurred");
      const notFound = err instanceof ApiError && err.status === 404;
      if (!background || notFound) setOrder(null);
      if (notFound) clearStoredTracking();
      return null;
    }
  }, []);

  useEffect(() => {
    const linkedValue = new URLSearchParams(window.location.search).get("restaurant");
    const linkedRestaurant = linkedValue ? formatRestaurantInput(linkedValue).trim() : "";
    const stored = readStoredTracking();

    if (linkedRestaurant && (!stored || stored.restaurantName.toLowerCase() !== linkedRestaurant.toLowerCase())) {
      let cancelled = false;
      clearStoredTracking();
      queueMicrotask(() => {
        if (cancelled) return;
        setRestaurantName(linkedRestaurant);
        setOrderNumber("");
        setOrder(null);
        setError(null);
      });
      return () => {
        cancelled = true;
      };
    }

    if (!stored) return;

    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) return;
      setRestaurantName(stored.restaurantName);
      setOrderNumber(stored.orderNumber);
      setIsLoading(true);
      void fetchOrderStatus(stored.restaurantName, stored.orderNumber).finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    });
    return () => {
      cancelled = true;
    };
  }, [fetchOrderStatus]);

  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState !== "visible") return;
      const current = orderRef.current;
      if (current) {
        void fetchOrderStatus(current.restaurant_name, current.order_number, { background: true });
      }
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => document.removeEventListener("visibilitychange", handleVisibilityChange);
  }, [fetchOrderStatus]);

  const handleAcknowledge = async () => {
    if (!order) return;
    setAcknowledging(true);
    try {
      await fetchJson(`/api/orders/${order.id}/acknowledge`, { method: "POST" });
      clearStoredTracking();
      setOrder((current) => current ? { ...current, acknowledged_at: new Date().toISOString() } : current);
      await fetchOrderStatus(order.restaurant_name, order.order_number, { background: true, persist: false });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to mark order as picked up");
    } finally {
      setAcknowledging(false);
    }
  };

  const handleTrackOrder = async (e: FormEvent) => {
    e.preventDefault();
    const trimmedRestName = restaurantName.trim();
    const trimmedOrdNum = orderNumber.trim();
    if (!trimmedRestName || !trimmedOrdNum) {
      setError("Please enter both a restaurant and order name.");
      return;
    }
    setIsLoading(true);
    setError(null);
    setOrder(null);
    await fetchOrderStatus(trimmedRestName, trimmedOrdNum);
    setIsLoading(false);
  };

  useEffect(() => {
    // Same vocabulary mismatch as the status card above: an order can arrive
    // with either vocab's "done" spelling ("Finished" or "Complete"), so
    // check via normalizeStatus rather than a literal "Finished" comparison
    // — otherwise a completed order using the API vocabulary would keep the
    // socket open (and keep polling for updates) forever.
    if (!order || normalizeStatus(order.status) === "complete") return;

    let socket: WebSocket | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let closedByEffect = false;
    let reconnectAttempt = 0;
    let hasConnected = false;

    // Exponential backoff (2s, 4s, 8s... capped at 30s) instead of a fixed
    // 2s retry forever — a fixed interval means a real outage (server
    // restart, network drop) hammers the server with a reconnect attempt
    // every 2s indefinitely; backing off caps how much load a widespread
    // outage adds while still recovering quickly from a brief blip.
    const RECONNECT_BASE_MS = 2000;
    const RECONNECT_MAX_MS = 30000;

    const connect = () => {
      setConnection("connecting");
      const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
      // The restaurant name is sent so the server only delivers broadcasts
      // for this one restaurant to this socket, instead of every
      // restaurant's live order stream (see SECURITY_ATTACK_LOG.md F7).
      const restaurantParam = encodeURIComponent(order.restaurant_name);
      socket = new WebSocket(`${protocol}//${window.location.host}/ws?restaurant=${restaurantParam}`);

      socket.onopen = () => {
        reconnectAttempt = 0;
        setConnection("live");
        if (hasConnected) {
          const current = orderRef.current;
          if (current) {
            void fetchOrderStatus(current.restaurant_name, current.order_number, { background: true });
          }
        }
        hasConnected = true;
      };

      socket.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          const current = orderRef.current;
          if ((data.type === "order_updated" || data.type === "order_deleted") && current) {
            void fetchOrderStatus(current.restaurant_name, current.order_number, { background: true });
          }
        } catch {
          // ignore malformed messages
        }
      };

      socket.onclose = () => {
        if (!closedByEffect) {
          setConnection("reconnecting");
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
    // Depends on the normalized completion state, not just order?.id -- a
    // live WS update can flip the SAME order (same id) from
    // Received/Preparing to Complete via setOrder in fetchOrderStatus above.
    // With only order?.id in the deps, this effect never re-ran on that
    // transition, so the guard at the top (skip connecting once complete)
    // only ever prevented opening a NEW socket for an already-complete
    // order — it never closed a socket that was already open when the order
    // became complete while connected, leaving it running (and reconnecting
    // on any drop) indefinitely on a long-lived tab.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetchOrderStatus, order?.id, order && normalizeStatus(order.status) === "complete"]);

  // Keep the customer's readable spelling; the server canonicalizes case,
  // spaces, punctuation, and a leading # to the same lookup key.
  return (
    <div className="min-h-dvh flex items-center justify-center p-4">
      <SettingsToggles />
      <main className="clear-top-right-top-only w-full max-w-2xl mx-auto">
        <Card className="p-4 sm:p-10">
          <div className="text-center mb-4 sm:mb-8">
            <h1 className="font-display text-2xl sm:text-4xl font-semibold text-[var(--color-text-primary)] mb-2">
              Track Your Order
            </h1>
            <p className="text-sm sm:text-base text-[var(--color-text-secondary)]">
              Enter your details to see the real-time status of your meal.
            </p>
          </div>
          <form onSubmit={handleTrackOrder} className="space-y-4 sm:space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <RestaurantAutocomplete
                id="restaurantName"
                value={restaurantName}
                onChange={(value) => setRestaurantName(formatRestaurantInput(value))}
                placeholder="e.g., 'The Golden Spoon'"
              />
              <div>
                <Label htmlFor="orderNumber">Order Name</Label>
                <Input
                  id="orderNumber"
                  type="text"
                  value={orderNumber}
                  onChange={(e) => setOrderNumber(formatOrderDisplayInput(e.target.value))}
                  placeholder="e.g., 'ORD-12345'"
                  required
                />
              </div>
            </div>
            <Button type="submit" variant="primary" size="lg" disabled={isLoading} className="w-full">
              {isLoading ? "Looking for your order..." : "Find My Order"}
            </Button>
          </form>

          {error && (
            <div
              role="alert"
              aria-atomic="true"
              className="alert-reveal mt-8 bg-[var(--color-danger)]/10 border border-[var(--color-danger)]/40 p-4 rounded-[var(--radius-sm)]"
            >
              <p className="font-semibold text-[var(--color-danger)] text-center">{error}</p>
            </div>
          )}

          {order && (
            <div className="alert-reveal">
              <OrderStatusCard order={order} onAcknowledge={handleAcknowledge} acknowledging={acknowledging} />
              <ConnectionIndicator state={connection} />
            </div>
          )}
        </Card>
      </main>
    </div>
  );
}
