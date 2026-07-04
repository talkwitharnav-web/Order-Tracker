"use client";

import { useState, useEffect, FormEvent, FC } from "react";
import {
  Home,
  Clock,
  Flame,
  CheckCircle,
  Trash2 as TrashIcon,
} from "lucide-react";

// --- TYPES ---
export type OrderStatus = "Received" | "Preparing" | "Complete";
export type Order = {
  id: number;
  order_number: string;
  status: OrderStatus;
};
type Tab = "Home" | "Received" | "Preparing" | "Complete";

// --- ICONS ---
const StatusIcon: FC<{ status: OrderStatus }> = ({ status }) => {
  const iconProps = {
    className: "w-5 h-5 mr-2 inline-block",
  };
  switch (status) {
    case "Received":
      return <Clock {...iconProps} />;
    case "Preparing":
      return <Flame {...iconProps} />;
    case "Complete":
      return <CheckCircle {...iconProps} />;
    default:
      return null;
  }
};

// --- API HELPERS ---
const api = {
  async getOrders(restName: string) {
    const url = `/api/orders/restaurant/${restName}`;
    const response = await fetch(url);
    if (!response.ok) throw new Error("Failed to fetch orders");
    return response.json();
  },
  async createOrder(restName: string, orderNum: string): Promise<Order> {
    const response = await fetch("/api/orders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        restaurant_name: restName,
        order_number: orderNum,
      }),
    });
    if (!response.ok) throw new Error("Failed to create order");
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
    const response = await fetch(`/api/orders/${id}`, {
      method: "DELETE",
    });
    if (!response.ok) throw new Error("Failed to delete order");
    return response.json();
  },
};

// --- DASHBOARD COMPONENTS ---

const Sidebar: FC<{
  activeTab: Tab;
  setActiveTab: (tab: Tab) => void;
  onLogout: () => void;
  restaurantName: string;
}> = ({ activeTab, setActiveTab, onLogout, restaurantName }) => {
  const navItems: Tab[] = ["Home", "Received", "Preparing", "Complete"];
  const navIcons: Record<Tab, React.ComponentType<{ className?: string }>> = {
    Home: Home,
    Received: Clock,
    Preparing: Flame,
    Complete: CheckCircle,
  };

  return (
    <div className="w-64 bg-slate-900 text-slate-200 flex flex-col p-4 border-r border-slate-800">
      <div className="mb-10 px-2">
        <h2 className="text-2xl font-bold text-white">{restaurantName}</h2>
        <span className="text-sm text-amber-500">Kitchen Dashboard</span>
      </div>
      <nav className="flex-grow space-y-2">
        {navItems.map((name) => {
          const Icon = navIcons[name];
          return (
            <button
              key={name}
              onClick={() => setActiveTab(name)}
              className={`w-full flex items-center px-4 py-3 rounded-lg text-base font-semibold transition-colors duration-200 ${
                activeTab === name
                  ? "bg-amber-600 text-white shadow-lg"
                  : "text-slate-400 hover:bg-slate-800 hover:text-white"
              }`}
            >
              <Icon className="w-5 h-5 mr-3" />
              <span className="flex-1 text-left">{name}</span>
            </button>
          );
        })}
      </nav>
      <button
        onClick={onLogout}
        className="w-full text-left px-4 py-3 text-slate-400 hover:bg-slate-800 hover:text-red-500 rounded-lg transition-colors mt-4"
      >
        Logout
      </button>
    </div>
  );
};

const OrderCard: FC<{
  order: Order;
  onUpdateStatus: (id: number, status: OrderStatus) => void;
  onDelete: (id: number) => void;
}> = ({ order, onUpdateStatus, onDelete }) => {
  const statusClasses: Record<OrderStatus, string> = {
    Received: "bg-slate-200 text-slate-800",
    Preparing: "bg-amber-200 text-amber-800",
    Complete: "bg-emerald-200 text-emerald-800",
  };

  return (
    <div className="bg-slate-800 p-6 rounded-xl shadow-lg border border-slate-700 flex flex-col">
      <div className="flex justify-between items-start mb-4">
        <p className="font-bold text-2xl text-white flex items-center">
          <StatusIcon status={order.status} /> #{order.order_number}
        </p>
        <span
          className={`px-3 py-1 text-sm font-semibold rounded-full ${
            statusClasses[order.status]
          }`}
        >
          {order.status}
        </span>
      </div>
      <div className="flex-grow" />
      <div className="flex flex-col gap-2 mt-4">
        {order.status === "Received" && (
          <button
            onClick={() => onUpdateStatus(order.id, "Preparing")}
            className="w-full py-2 text-sm font-medium rounded-lg shadow-sm bg-slate-700 hover:bg-slate-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-slate-800 focus:ring-amber-500 transition-all"
          >
            Mark Preparing
          </button>
        )}
        {order.status === "Preparing" && (
          <button
            onClick={() => onUpdateStatus(order.id, "Complete")}
            className="w-full py-2 text-sm font-medium rounded-lg shadow-sm bg-slate-700 hover:bg-slate-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-slate-800 focus:ring-amber-500 transition-all"
          >
            Mark Complete
          </button>
        )}
        <button
          onClick={() => onDelete(order.id)}
          className="w-full py-2 text-sm font-medium rounded-lg shadow-sm bg-red-900/50 text-red-300 hover:bg-red-900 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-slate-800 focus:ring-red-500 transition-all"
        >
          Delete
        </button>
      </div>
    </div>
  );
};

const HomeTab: FC<{
  orders: Order[];
  restaurantName: string;
  onAddOrder: (order: Order) => void;
  onDeleteOrder: (id: number) => void;
}> = ({ orders, restaurantName, onAddOrder, onDeleteOrder }) => {
  const [orderNumber, setOrderNumber] = useState("");

  const handleCreateOrder = async (e: FormEvent) => {
    e.preventDefault();
    if (!orderNumber.trim()) return;
    try {
      const newOrder = await api.createOrder(restaurantName, orderNumber);
      onAddOrder(newOrder);
      setOrderNumber("");
    } catch (error) {
      console.error("Failed to create order", error);
    }
  };

  const formatOrderNumber = (value: string) => {
    const cleaned = value.toUpperCase().replace(/[^A-Z0-9-]/g, "");
    setOrderNumber(cleaned);
  };

  return (
    <div className="space-y-8">
      <div className="bg-slate-800 border border-slate-700 p-8 rounded-2xl">
        <h3 className="text-2xl font-bold text-white mb-4">Add New Order</h3>
        <form onSubmit={handleCreateOrder} className="flex items-end gap-4">
          <div className="flex-grow">
            <label
              htmlFor="orderNumber"
              className="block text-sm font-medium text-slate-400 mb-1"
            >
              Order Number
            </label>
            <input
              id="orderNumber"
              type="text"
              value={orderNumber}
              onChange={(e) => formatOrderNumber(e.target.value)}
              placeholder="e.g., 'ORD-54321'"
              className="w-full p-3 bg-slate-900 text-white border border-slate-600 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-amber-500 placeholder:text-slate-500"
            />
          </div>
          <button
            type="submit"
            disabled={!orderNumber.trim()}
            className="px-6 py-3 font-semibold text-white bg-amber-600 rounded-lg shadow-md hover:bg-amber-700 disabled:bg-slate-700 disabled:cursor-not-allowed"
          >
            Add Order
          </button>
        </form>
      </div>

      <div className="bg-slate-800 border border-slate-700 p-8 rounded-2xl">
        <h3 className="text-2xl font-bold text-white mb-4">
          All Active Orders
        </h3>
        <div className="space-y-4">
          {orders.map((order) => (
            <div
              key={order.id}
              className="bg-slate-900 p-4 rounded-lg flex justify-between items-center"
            >
              <div>
                <span className="font-bold text-xl text-white">
                  <StatusIcon status={order.status} /> #{order.order_number}
                </span>
                <span
                  className={`ml-4 px-2 py-0.5 text-xs font-semibold rounded-full ${
                    order.status === "Received"
                      ? "bg-slate-200 text-slate-800"
                      : order.status === "Preparing"
                        ? "bg-amber-200 text-amber-800"
                        : "bg-emerald-200 text-emerald-800"
                  }`}
                >
                  {order.status}
                </span>
              </div>
              <button
                onClick={() => onDeleteOrder(order.id)}
                className="text-slate-500 hover:text-red-500 p-2 rounded-full transition-colors"
              >
                <TrashIcon />
              </button>
            </div>
          ))}
          {orders.length === 0 && (
            <p className="text-slate-400">No active orders.</p>
          )}
        </div>
      </div>
    </div>
  );
};

const OrderGrid: FC<{
  orders: Order[];
  onUpdateStatus: (id: number, status: OrderStatus) => void;
  onDelete: (id: number) => void;
}> = ({ orders, onUpdateStatus, onDelete }) => {
  if (orders.length === 0) {
    return <p className="text-slate-400">No orders in this category.</p>;
  }
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      {orders.map((order) => (
        <OrderCard
          key={order.id}
          order={order}
          onUpdateStatus={onUpdateStatus}
          onDelete={onDelete}
        />
      ))}
    </div>
  );
};

export const KitchenDashboard: FC<{ restaurantName: string; onLogout: () => void }> = ({
  restaurantName,
  onLogout,
}) => {
  const [activeTab, setActiveTab] = useState<Tab>("Home");
  const [orders, setOrders] = useState<Order[]>([]);
  const [isLoading, setIsLoading] = useState(true);

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

  const handleUpdateStatus = async (id: number, status: OrderStatus) => {
    try {
      setOrders((prevOrders) =>
        prevOrders.map((o) => (o.id === id ? { ...o, status } : o)),
      );
      await api.updateOrderStatus(id, status);
    } catch (error) {
      console.error("Failed to update status", error);
      fetchOrders();
    }
  };

  const handleDeleteOrder = async (id: number) => {
    if (window.confirm("Are you sure you want to delete this order?")) {
      try {
        setOrders((prevOrders) => prevOrders.filter((o) => o.id !== id));
        await api.deleteOrder(id);
      } catch (error) {
        console.error("Failed to delete order", error);
        fetchOrders();
      }
    }
  };

  const handleAddOrder = (newOrder: Order) => {
    setOrders((prevOrders) => [newOrder, ...prevOrders]);
  };

  const renderContent = () => {
    if (isLoading) return <p className="text-slate-400">Loading orders...</p>;

    const displayedOrders =
      activeTab === "Home"
        ? orders
        : orders.filter((o) => o.status === activeTab);

    switch (activeTab) {
      case "Home":
        return (
          <HomeTab
            orders={displayedOrders}
            restaurantName={restaurantName}
            onAddOrder={handleAddOrder}
            onDeleteOrder={handleDeleteOrder}
          />
        );
      case "Received":
      case "Preparing":
      case "Complete":
        return (
          <OrderGrid
            orders={displayedOrders}
            onUpdateStatus={handleUpdateStatus}
            onDelete={handleDeleteOrder}
          />
        );
      default:
        return null;
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 flex font-sans text-white">
      <Sidebar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        onLogout={onLogout}
        restaurantName={restaurantName}
      />
      <main className="flex-grow p-8 overflow-auto">
        <h1 className="text-4xl font-bold text-white mb-8">{activeTab}</h1>
        {renderContent()}
      </main>
    </div>
  );
};