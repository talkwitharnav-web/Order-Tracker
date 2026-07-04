"use client";

import { useState, FormEvent, useEffect, useRef, FC } from "react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input, Label } from "@/components/ui/Input";
import { StatusIcon } from "@/components/ui/StatusBadge";
import { getStatusVisual, type CustomerOrderStatus } from "@/lib/order-status";

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

const STATUS_DESCRIPTION: Record<CustomerOrderStatus, string> = {
  Received: "We've got your order and will start preparing it soon.",
  Making: "Our chefs are putting their love and care into your meal.",
  Finished: "Your order is ready. Come and get it!",
};

const OrderStatusCard: FC<{ order: Order }> = ({ order }) => {
  const [lastUpdated, setLastUpdated] = useState(timeSince(order.updated_at));

  useEffect(() => {
    const timer = setInterval(() => setLastUpdated(timeSince(order.updated_at)), 1000);
    return () => clearInterval(timer);
  }, [order.updated_at]);

  const visual = getStatusVisual(order.status);
  const title =
    order.status === "Received"
      ? "Order Placed"
      : order.status === "Making"
        ? "In the Kitchen"
        : "Ready for Pickup!";

  return (
    <div
      className={`mt-8 w-full p-8 rounded-[var(--radius-md)] border ${visual.border} ${visual.bg} text-center`}
    >
      <StatusIcon status={order.status} className="w-16 h-16 mx-auto mb-4 animate-pulse" />
      <h2 className={`text-3xl font-bold ${visual.text}`}>{title}</h2>
      <p className="text-[var(--color-text-secondary)] mt-2 text-base">
        {STATUS_DESCRIPTION[order.status]}
      </p>
      <p className="text-xs text-[var(--color-text-muted)] mt-6">
        Order #{order.order_number} &bull; Last updated {lastUpdated}
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
      const response = await fetch(`/api/orders/search?${query}`);
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Failed to track order");
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
      setError("Please enter both a restaurant and order number.");
      return;
    }
    setIsLoading(true);
    setError(null);
    setOrder(null);
    await fetchOrderStatus(trimmedRestName, trimmedOrdNum);
    setIsLoading(false);
  };

  useEffect(() => {
    if (!order || order.status === "Finished") return;

    let socket: WebSocket | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let closedByEffect = false;

    const connect = () => {
      setConnection("connecting");
      const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
      socket = new WebSocket(`${protocol}//${window.location.host}/ws`);

      socket.onopen = () => setConnection("live");

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
          reconnectTimer = setTimeout(connect, 2000);
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
      <main className="w-full max-w-2xl mx-auto">
        <Card className="p-6 sm:p-10">
          <div className="text-center mb-8">
            <h1 className="text-3xl sm:text-4xl font-bold text-[var(--color-text-primary)] mb-2">
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
                <Label htmlFor="orderNumber">Order #</Label>
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
              <p className="font-semibold text-red-300 text-center">{error}</p>
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
