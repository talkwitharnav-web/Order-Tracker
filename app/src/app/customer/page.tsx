"use client";

import { useState, FormEvent, useEffect, useRef, FC } from "react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input, Label } from "@/components/ui/Input";
import { StatusIcon } from "@/components/ui/StatusBadge";
import { ThemeToggle } from "@/components/ui/ThemeToggle";
import { getStatusVisual, normalizeStatus, type CustomerOrderStatus, type StatusKey } from "@/lib/order-status";
import { fetchJson } from "@/lib/api-client";

type Order = {
  id: number;
  restaurant_name: string;
  order_number: string;
  status: CustomerOrderStatus;
  updated_at: string;
};

const timeSince = (date: string) => {
  const seconds = Math.floor((new Date().getTime() - new Date(date).getTime()) / 1000);
  let interval = seconds / 31536000;
  if (interval > 1) return Math.floor(interval) + " years ago";
  interval = seconds / 2592000;
  if (interval > 1) return Math.floor(interval) + " months ago";
  interval = seconds / 86400;
  if (interval > 1) return Math.floor(interval) + " days ago";
  interval = seconds / 3600;
  if (interval > 1) return Math.floor(interval) + " hours ago";
  interval = seconds / 60;
  if (interval > 1) return Math.floor(interval) + " minutes ago";
  if (seconds < 10) return "just now";
  return Math.floor(seconds) + " seconds ago";
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

const OrderStatusCard: FC<{ order: Order }> = ({ order }) => {
  const [lastUpdated, setLastUpdated] = useState(timeSince(order.updated_at));

  useEffect(() => {
    const timer = setInterval(() => setLastUpdated(timeSince(order.updated_at)), 1000);
    return () => clearInterval(timer);
  }, [order.updated_at]);

  const statusKey = normalizeStatus(order.status);
  const visual = getStatusVisual(order.status);
  const title = STATUS_TITLE[statusKey];

  return (
    <div
      className={`mt-8 w-full p-8 rounded-[var(--radius-md)] border ${visual.border} ${visual.bg} text-center`}
    >
      <StatusIcon status={order.status} className="w-16 h-16 mx-auto mb-4 animate-pulse" />
      <h2 className={`text-3xl font-bold ${visual.text}`}>{title}</h2>
      <p className="text-[var(--color-text-secondary)] mt-2 text-base">
        {STATUS_DESCRIPTION[statusKey]}
      </p>
      <p className="text-xs text-[var(--color-text-muted)] mt-6">
        Order &ldquo;{order.order_number}&rdquo; &bull; Last updated {lastUpdated}
      </p>
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
      <span className={`w-2 h-2 rounded-full ${config.dot}`} />
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
  const orderRef = useRef<Order | null>(null);
  useEffect(() => {
    orderRef.current = order;
  }, [order]);

  const fetchOrderStatus = async (restName: string, ordNum: string) => {
    try {
      const query = new URLSearchParams({ restaurant_name: restName, order_number: ordNum });
      const data = await fetchJson<Order>(`/api/orders/search?${query}`);
      setOrder(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "An unknown error occurred");
      setOrder(null);
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
      };

      socket.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          const current = orderRef.current;
          if ((data.type === "order_updated" || data.type === "order_deleted") && current) {
            fetchOrderStatus(current.restaurant_name, current.order_number);
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
  }, [order?.id]);

  const formatInput = (value: string) => value.toUpperCase().replace(/[^A-Z0-9- ]/g, "");

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <ThemeToggle className="fixed top-4 right-4 z-20" />
      <main className="w-full max-w-2xl mx-auto">
        <Card className="p-6 sm:p-10">
          <div className="text-center mb-8">
            <h1 className="font-display text-3xl sm:text-4xl font-semibold text-[var(--color-text-primary)] mb-2">
              Track Your Order
            </h1>
            <p className="text-[var(--color-text-secondary)]">
              Enter your details to see the real-time status of your meal.
            </p>
          </div>
          <form onSubmit={handleTrackOrder} className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <Label htmlFor="restaurantName">Restaurant</Label>
                <Input
                  id="restaurantName"
                  type="text"
                  value={restaurantName}
                  onChange={(e) => setRestaurantName(formatInput(e.target.value))}
                  placeholder="e.g., 'THE GOLDEN SPOON'"
                  required
                />
              </div>
              <div>
                <Label htmlFor="orderNumber">Order Name</Label>
                <Input
                  id="orderNumber"
                  type="text"
                  value={orderNumber}
                  onChange={(e) => setOrderNumber(formatInput(e.target.value))}
                  placeholder="e.g., 'ORD-12345'"
                  required
                />
              </div>
            </div>
            <Button type="submit" variant="primary" size="lg" disabled={isLoading} className="w-full">
              {isLoading ? "Searching..." : "Find My Order"}
            </Button>
          </form>

          {error && (
            <div className="mt-8 bg-[var(--color-danger)]/10 border border-[var(--color-danger)]/40 p-4 rounded-[var(--radius-sm)]">
              <p className="font-semibold text-[var(--color-danger)] text-center">{error}</p>
            </div>
          )}

          {order && (
            <>
              <OrderStatusCard order={order} />
              <ConnectionIndicator state={connection} />
            </>
          )}
        </Card>
      </main>
    </div>
  );
}
