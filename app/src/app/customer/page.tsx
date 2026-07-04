"use client";

import { useState, FormEvent, useEffect, FC } from "react";
import { Clock, Flame, CheckCircle } from "lucide-react";

// --- TYPES ---
type OrderStatus = "Received" | "Making" | "Finished";
type Order = {
  id: number;
  restaurant_name: string;
  order_number: string;
  status: OrderStatus;
  updated_at: string;
};

// --- TIME HELPER ---
const timeSince = (date: string) => {
  const seconds = Math.floor(
    (new Date().getTime() - new Date(date).getTime()) / 1000,
  );
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

// --- ORDER STATUS CARD ---
const OrderStatusCard: FC<{ order: Order }> = ({ order }) => {
  const [lastUpdated, setLastUpdated] = useState(timeSince(order.updated_at));

  useEffect(() => {
    const timer = setInterval(() => {
      setLastUpdated(timeSince(order.updated_at));
    }, 1000);
    return () => clearInterval(timer);
  }, [order.updated_at]);

  const statusConfig = {
    Received: {
      Icon: Clock,
      color: "slate",
      title: "Order Placed",
      description: "We've got your order and will start preparing it soon.",
    },
    Making: {
      Icon: Flame,
      color: "amber",
      title: "In the Kitchen",
      description: "Our chefs are putting their love and care into your meal.",
    },
    Finished: {
      Icon: CheckCircle,
      color: "emerald",
      title: "Ready for Pickup!",
      description: "Your order is ready. Come and get it!",
    },
  };

  const { Icon, color, title, description } = statusConfig[order.status];

  const colorClasses = {
    slate: {
      border: "border-slate-700",
      text: "text-slate-300",
      icon: "text-slate-500",
      bg: "bg-slate-800/50",
      pulse: "shadow-slate-800/50",
    },
    amber: {
      border: "border-amber-500/50",
      text: "text-amber-300",
      icon: "text-amber-500",
      bg: "bg-amber-950/30",
      pulse: "shadow-amber-500/30",
    },
    emerald: {
      border: "border-emerald-500/50",
      text: "text-emerald-300",
      icon: "text-emerald-500",
      bg: "bg-emerald-950/30",
      pulse: "shadow-emerald-500/30",
    },
  };

  const currentColors = colorClasses[color];

  return (
    <div
      className={`relative mt-12 w-full p-8 rounded-2xl overflow-hidden transition-all duration-500 ease-in-out ${currentColors.border} ${currentColors.bg} border-2`}
    >
      <div
        className={`absolute inset-0 -z-10 bg-gradient-to-br from-slate-900 via-${color}-950/50 to-slate-900 animate-pulse-gradient`}
      />
      <div className="text-center">
        <Icon
          className={`w-24 h-24 mx-auto ${currentColors.icon} transition-colors duration-500 ease-in-out mb-4 animate-pulse`}
        />
        <h2
          className={`text-4xl font-bold ${currentColors.text} transition-colors duration-500 ease-in-out`}
        >
          {title}
        </h2>
        <p className="text-slate-400 mt-2 text-lg">{description}</p>
        <p className="text-xs text-slate-500 mt-6">
          Order #{order.order_number} &bull; Last updated {lastUpdated}
        </p>
      </div>
    </div>
  );
};


// --- CUSTOMER PAGE ---
export default function CustomerPage() {
  const [restaurantName, setRestaurantName] = useState("");
  const [orderNumber, setOrderNumber] = useState("");
  const [order, setOrder] = useState<Order | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchOrderStatus = async (restName: string, ordNum: string) => {
    try {
      const query = new URLSearchParams({
        restaurant_name: restName,
        order_number: ordNum,
      });
      const response = await fetch(`/api/orders/search?${query}`);
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Failed to track order");
      }
      setOrder(data);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "An unknown error occurred",
      );
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

    const interval = setInterval(() => {
      fetchOrderStatus(order.restaurant_name, order.order_number);
    }, 5000); // Poll every 5 seconds

    return () => clearInterval(interval);
  }, [order]);

  const formatInput = (value: string) => {
    return value.toUpperCase().replace(/[^A-Z0-9- ]/g, "");
  };

  return (
    <>
      <style jsx global>{`
        @keyframes pulse-gradient {
          0%, 100% {
            opacity: 0.3;
          }
          50% {
            opacity: 0.6;
          }
        }
        .animate-pulse-gradient {
          animation: pulse-gradient 5s ease-in-out infinite;
        }
      `}</style>
      <div className="min-h-screen bg-slate-950 flex items-center justify-center font-sans p-4">
        <main className="w-full max-w-2xl mx-auto">
          <div className="bg-slate-900/80 backdrop-blur-md border border-slate-800 p-10 rounded-2xl shadow-2xl">
            <div className="text-center">
              <h1 className="text-4xl font-bold text-white mb-2">
                Track Your Order
              </h1>
              <p className="text-slate-400 mb-8">
                Enter your details to see the real-time status of your meal.
              </p>
            </div>
            <form onSubmit={handleTrackOrder} className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label
                    htmlFor="restaurantName"
                    className="block text-lg font-medium text-slate-300 mb-2"
                  >
                    Restaurant
                  </label>
                  <input
                    id="restaurantName"
                    type="text"
                    value={restaurantName}
                    onChange={(e) =>
                      setRestaurantName(formatInput(e.target.value))
                    }
                    placeholder="e.g., 'THE GOLDEN SPOON'"
                    className="w-full p-4 text-lg bg-slate-950 text-white border-2 border-slate-800 rounded-xl shadow-sm focus:ring-2 focus:ring-amber-500 focus:border-amber-500 placeholder:text-slate-600 transition-all"
                    required
                  />
                </div>
                <div>
                  <label
                    htmlFor="orderNumber"
                    className="block text-lg font-medium text-slate-300 mb-2"
                  >
                    Order #
                  </label>
                  <input
                    id="orderNumber"
                    type="text"
                    value={orderNumber}
                    onChange={(e) => setOrderNumber(formatInput(e.target.value))}
                    placeholder="e.g., 'ORD-12345'"
                    className="w-full p-4 text-lg bg-slate-950 text-white border-2 border-slate-800 rounded-xl shadow-sm focus:ring-2 focus:ring-amber-500 focus:border-amber-500 placeholder:text-slate-600 transition-all"
                    required
                  />
                </div>
              </div>
              <button
                type="submit"
                disabled={isLoading}
                className="w-full px-8 py-4 text-xl font-semibold text-white bg-amber-600 rounded-xl shadow-lg hover:bg-amber-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-slate-900 focus:ring-amber-500 disabled:bg-slate-700 transition-all duration-200 transform hover:scale-[1.02]"
              >
                {isLoading ? "Searching..." : "Find My Order"}
              </button>
            </form>

            {error && (
              <div className="mt-8 bg-red-900/50 border border-red-700 p-4 rounded-xl">
                <p className="font-semibold text-red-300 text-center">{error}</p>
              </div>
            )}

            {order && <OrderStatusCard order={order} />}
          </div>
        </main>
      </div>
    </>
  );
}
