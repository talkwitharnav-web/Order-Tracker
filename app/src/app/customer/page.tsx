"use client";

import { useState, FormEvent, useEffect, FC } from "react";

// --- TYPES ---
type OrderStatus = "Received" | "Making" | "Finished";
type Order = {
  id: number;
  restaurant_name: string;
  order_number: string;
  status: OrderStatus;
  updated_at: string;
};

// --- ICONS ---
const CheckCircleIcon = ({ className }: { className?: string }) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="24"
    height="24"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
  >
    <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
    <polyline points="22 4 12 14.01 9 11.01" />
  </svg>
);
const CookingPotIcon = ({ className }: { className?: string }) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="24"
    height="24"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
  >
    <path d="M2 12h20" />
    <path d="M20 12v8a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-8" />
    <path d="M4 12V9a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v3" />
    <path d="M8 8V4a2 2 0 1 1 4 0v4" />
    <path d="M12 8V4a2 2 0 1 1 4 0v4" />
  </svg>
);
const SparkleIcon = ({ className }: { className?: string }) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="24"
    height="24"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
  >
    <path d="M9.13 2.69 12 9l2.87-6.31M3 10h18" />
    <path d="m15.87 13.69 2.87 6.31L12 13l-6.87 6.99" />
  </svg>
);

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

// --- ORDER STATUS TRACKER ---
const OrderStatusTracker: FC<{ order: Order }> = ({ order }) => {
  const [lastUpdated, setLastUpdated] = useState(timeSince(order.updated_at));

  useEffect(() => {
    setLastUpdated(timeSince(order.updated_at));
    const interval = setInterval(() => {
      setLastUpdated(timeSince(order.updated_at));
    }, 1000);
    return () => clearInterval(interval);
  }, [order.updated_at]);

  const statusLevels = ["Received", "Making", "Finished"];
  const currentStatusIndex = statusLevels.indexOf(order.status);

  const getStatusStyle = (index: number) => {
    if (index < currentStatusIndex) return "completed";
    if (index === currentStatusIndex) return "active";
    return "upcoming";
  };

  const steps = [
    {
      name: "Order Placed",
      icon: <CheckCircleIcon className="w-8 h-8" />,
      status: "Received",
    },
    {
      name: "In the Kitchen",
      icon: <CookingPotIcon className="w-8 h-8" />,
      status: "Making",
    },
    {
      name: "Ready for Pickup",
      icon: <SparkleIcon className="w-8 h-8" />,
      status: "Finished",
    },
  ];

  return (
    <div className="mt-10 w-full">
      <div className="flex justify-between items-end mb-2">
        <h2 className="text-2xl font-semibold text-white">
          Order #{order.order_number}
        </h2>
        <p className="text-sm text-slate-400">Last updated: {lastUpdated}</p>
      </div>

      <div className="flex items-center">
        {steps.map((step, i) => {
          const style = getStatusStyle(i);
          return (
            <div key={step.name} className="flex-1 flex items-center">
              <div className={`flex flex-col items-center text-center`}>
                <div
                  className={`w-16 h-16 rounded-full flex items-center justify-center border-2 transition-all duration-500
                                    ${style === "completed" ? "bg-emerald-500/20 border-emerald-500 text-emerald-400" : ""}
                                    ${style === "active" && step.status === "Making" ? "bg-amber-500/20 border-amber-500 text-amber-400 animate-pulse" : ""}
                                    ${style === "active" && step.status !== "Making" ? "bg-slate-700 border-slate-500 text-slate-300" : ""}
                                    ${style === "upcoming" ? "bg-slate-800 border-slate-700 text-slate-500" : ""}
                                `}
                >
                  {step.icon}
                </div>
                <p
                  className={`mt-2 text-sm font-medium
                                    ${style === "upcoming" ? "text-slate-500" : "text-slate-200"}
                                `}
                >
                  {step.name}
                </p>
              </div>
              {i < steps.length - 1 && (
                <div
                  className={`flex-1 h-1 mx-4 rounded-full
                                     ${style === "completed" ? "bg-emerald-500" : "bg-slate-700"}
                                `}
                ></div>
              )}
            </div>
          );
        })}
      </div>
      {order.status === "Finished" && (
        <div className="mt-8 bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 p-6 rounded-2xl text-center shadow-lg">
          <h3 className="text-2xl font-bold">All Set!</h3>
          <p>Your order is ready for pickup. Thanks for choosing us!</p>
        </div>
      )}
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
      const response = await fetch(`/api/orders?${query}`);
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
    if (!restaurantName.trim() || !orderNumber.trim()) {
      setError("Please enter both a restaurant and order number.");
      return;
    }
    setIsLoading(true);
    setError(null);
    setOrder(null);
    await fetchOrderStatus(restaurantName, orderNumber);
    setIsLoading(false);
  };

  useEffect(() => {
    if (!order || order.status === "Finished") return;

    const interval = setInterval(() => {
      fetchOrderStatus(order.restaurant_name, order.order_number);
    }, 5000); // Poll every 5 seconds

    return () => clearInterval(interval);
  }, [order]);

  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center font-sans">
      <main className="w-full max-w-2xl mx-auto p-4 md:p-8">
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
                  onChange={(e) => setRestaurantName(e.target.value)}
                  placeholder="e.g., 'The Golden Spoon'"
                  className="w-full p-4 text-lg bg-slate-950 text-white border-2 border-slate-800 rounded-xl shadow-sm focus:ring-2 focus:ring-amber-500 focus:border-amber-500 placeholder:text-slate-600"
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
                  onChange={(e) => setOrderNumber(e.target.value)}
                  placeholder="e.g., 'ORD-12345'"
                  className="w-full p-4 text-lg bg-slate-950 text-white border-2 border-slate-800 rounded-xl shadow-sm focus:ring-2 focus:ring-amber-500 focus:border-amber-500 placeholder:text-slate-600"
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

          {order && <OrderStatusTracker order={order} />}
        </div>
      </main>
    </div>
  );
}
