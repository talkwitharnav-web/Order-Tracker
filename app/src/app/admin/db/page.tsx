"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

// --- INTERFACES ---
interface Restaurant {
  id: number;
  name: string;
  password?: string;
  raw_password?: string;
}

interface Order {
  id: number;
  restaurant_name: string;
  order_number: string;
  status: string;
  created_at: string;
}

interface ModalState {
  isOpen: boolean;
  title: string;
  message: string;
  onConfirm: () => void;
}

interface ToastState {
  message: string;
  type: "success" | "error";
}

// --- MODAL COMPONENT ---
const ConfirmationModal = ({ isOpen, title, message, onConfirm, onCancel }: ModalState & { onCancel: () => void }) => {
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 bg-black bg-opacity-70 flex justify-center items-center z-50">
      <div className="bg-gray-900 border border-red-500 rounded-lg shadow-xl p-6 w-full max-w-md mx-4">
        <h2 className="text-2xl font-bold text-red-500 mb-4">{title}</h2>
        <p className="text-gray-300 mb-6">{message}</p>
        <div className="flex justify-end gap-4">
          <button onClick={onCancel} className="px-4 py-2 bg-gray-700 text-white rounded-lg hover:bg-gray-600 transition-colors">Cancel</button>
          <button onClick={onConfirm} className="px-4 py-2 bg-red-600 text-white font-bold rounded-lg hover:bg-red-700 transition-colors">Confirm</button>
        </div>
      </div>
    </div>
  );
};

// --- TOAST COMPONENT ---
const Toast = ({ message, type, onDismiss }: ToastState & { onDismiss: () => void }) => (
  <div className="fixed top-4 right-4 z-50 animate-in slide-in-from-right duration-300 fade-in">
    <div className={`rounded-lg shadow-lg p-4 text-white ${type === 'success' ? 'bg-green-600' : 'bg-red-600'}`}>
      <div className="flex items-center">
        <span>{message}</span>
        <button onClick={onDismiss} className="ml-4 text-xl font-bold">&times;</button>
      </div>
    </div>
  </div>
);

// --- PASSWORD RESET MODAL COMPONENT ---
const PasswordResetModal = ({
  isOpen,
  onConfirm,
  onCancel,
  newPassword,
  setNewPassword,
}: {
  isOpen: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  newPassword: string;
  setNewPassword: (pw: string) => void;
}) => {
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 bg-black bg-opacity-70 flex justify-center items-center z-50">
      <div className="bg-gray-900 border border-amber-500 rounded-lg shadow-xl p-6 w-full max-w-md mx-4">
        <h2 className="text-2xl font-bold text-amber-500 mb-4">Change Password</h2>
        <input
          type="text"
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
          placeholder="Enter new password"
          className="w-full bg-gray-800 text-white rounded p-2 border border-gray-700 mb-6 focus:outline-none focus:ring-2 focus:ring-amber-500"
        />
        <div className="flex justify-end gap-4">
          <button onClick={onCancel} className="px-4 py-2 bg-gray-700 text-white rounded-lg hover:bg-gray-600 transition-colors">Cancel</button>
          <button onClick={onConfirm} className="px-4 py-2 bg-amber-600 text-white font-bold rounded-lg hover:bg-amber-700 transition-colors">Confirm</button>
        </div>
      </div>
    </div>
  );
};


// --- ADMIN PAGE ---
export default function AdminDbPage() {
  const router = useRouter();
  const [restaurants, setRestaurants] = useState<Restaurant[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [modalState, setModalState] = useState<ModalState>({ isOpen: false, title: "", message: "", onConfirm: () => {} });
  const [toast, setToast] = useState<ToastState | null>(null);
  const toastTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const [passwordResetTarget, setPasswordResetTarget] = useState<number | null>(null);
  const [newPassword, setNewPassword] = useState('');

  const showToast = (message: string, type: "success" | "error") => {
    if (toastTimeoutRef.current) {
      clearTimeout(toastTimeoutRef.current);
    }
    setToast({ message, type });
    toastTimeoutRef.current = setTimeout(() => {
      setToast(null);
      toastTimeoutRef.current = null;
    }, 3000);
  };
  
  const fetchData = useCallback(async () => {
    try {
      const res = await fetch("/api/dev/db");
      if (!res.ok) throw new Error("Failed to fetch data. The server might be offline.");
      const data = await res.json();
      setRestaurants(data.restaurants);
      setOrders(data.orders);
    } catch (err) {
      showToast(err instanceof Error ? err.message : "An unknown error occurred", "error");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (localStorage.getItem("isAdmin") !== "true") {
      router.push("/");
    } else {
      fetchData();
    }
    return () => {
      if (toastTimeoutRef.current) {
        clearTimeout(toastTimeoutRef.current);
      }
    };
  }, [router, fetchData]);

  const closeModal = () => setModalState({ isOpen: false, title: "", message: "", onConfirm: () => {} });

  const performAction = async (action: () => Promise<Response>, successMessage: string) => {
    closeModal();
    try {
      const res = await action();
      const resJson = await res.json().catch(() => ({})); // Gracefully handle empty responses
      if (!res.ok) {
          throw new Error(resJson.error || `Action failed with status: ${res.status}`);
      }
      showToast(successMessage, "success");
      fetchData(); // Refresh data
    } catch (err) {
      showToast(err instanceof Error ? err.message : "An unknown error occurred", "error");
    }
  };

  const handleSeed = () => {
    setModalState({
      isOpen: true,
      title: "Seed Database",
      message: "Are you sure you want to seed the database? This will clear existing data.",
      onConfirm: () => performAction(() => fetch("/api/dev/seed", { method: "POST" }), "Database seeded successfully!"),
    });
  };

  const handlePurge = () => {
    setModalState({
      isOpen: true,
      title: "Purge Database",
      message: "Are you sure you want to purge the database? THIS ACTION IS IRREVERSIBLE.",
      onConfirm: () => performAction(() => fetch("/api/dev/db", { method: "DELETE" }), "Database purged successfully!"),
    });
  };

  const handleDelete = (type: "restaurant" | "order", id: number) => {
    setModalState({
      isOpen: true,
      title: `Delete ${type}`,
      message: `Are you sure you want to delete this ${type}? This cannot be undone.`,
      onConfirm: () => performAction(() => fetch(`/api/${type}s/${id}`, { method: "DELETE" }), `${type.charAt(0).toUpperCase() + type.slice(1)} deleted successfully!`),
    });
  };

  const handleStatusChange = (orderId: number, newStatus: string) => {
    performAction(
      () =>
        fetch(`/api/orders/${orderId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: newStatus }),
        }),
      "Order status updated successfully!",
    );
  };

  const handlePasswordReset = () => {
    if (!passwordResetTarget) return;

    const action = () => fetch(`/api/restaurants/${passwordResetTarget}/password`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ newPassword }),
    });

    // We can't use performAction directly as it closes all modals
    // and we need to keep the password modal open on failure.
    (async () => {
      try {
        const res = await action();
        const resJson = await res.json().catch(() => ({}));
        if (!res.ok) {
            throw new Error(resJson.error || `Action failed with status: ${res.status}`);
        }
        showToast("Password updated successfully!", "success");
        setNewPassword('');
        setPasswordResetTarget(null);
        fetchData();
      } catch (err) {
        showToast(err instanceof Error ? err.message : "An unknown error occurred", "error");
      }
    })();
  };

  if (isLoading) return <div className="flex justify-center items-center min-h-screen bg-black text-white">Loading...</div>;

  return (
    <>
      <ConfirmationModal {...modalState} onCancel={closeModal} />
      <PasswordResetModal 
        isOpen={passwordResetTarget !== null}
        onCancel={() => {
          setPasswordResetTarget(null);
          setNewPassword('');
        }}
        onConfirm={handlePasswordReset}
        newPassword={newPassword}
        setNewPassword={setNewPassword}
      />
      {toast && <Toast message={toast.message} type={toast.type} onDismiss={() => setToast(null)} />}
      
      <div className="bg-black text-white min-h-screen p-8 font-mono">
        <header className="flex justify-between items-center mb-8">
          <h1 className="text-3xl font-bold text-red-500">ADMIN DASHBOARD</h1>
          <Link href="/" className="bg-gray-800 hover:bg-red-700 text-white font-bold py-2 px-4 rounded">
            Back to Home
          </Link>
        </header>

        <div className="mb-8 flex gap-4">
          <button onClick={handleSeed} className="bg-yellow-500 hover:bg-yellow-600 text-black font-bold py-2 px-4 rounded">Seed Database</button>
          <button onClick={handlePurge} className="bg-red-600 hover:bg-red-700 text-white font-bold py-2 px-4 rounded">Purge Database</button>
        </div>

        <section className="mb-12">
          <h2 className="text-2xl font-semibold mb-4 border-b border-gray-700 pb-2">Restaurants</h2>
          <div className="overflow-x-auto">
            <table className="min-w-full bg-gray-900 border border-gray-700">
              <thead>
                <tr>
                  <th className="py-2 px-4 border-b border-gray-700">ID</th>
                  <th className="py-2 px-4 border-b border-gray-700">Name</th>
                  <th className="py-2 px-4 border-b border-gray-700">Hashed Password</th>
                  <th className="py-2 px-4 border-b border-gray-700">Raw Password</th>
                  <th className="py-2 px-4 border-b border-gray-700">Actions</th>
                </tr>
              </thead>
              <tbody>
                {restaurants.map((r) => (
                  <tr key={r.id}>
                    <td className="py-2 px-4 border-b border-gray-800">{r.id}</td>
                    <td className="py-2 px-4 border-b border-gray-800">{r.name}</td>
                    <td className="py-2 px-4 border-b border-gray-800 break-all">{r.password}</td>
                    <td className="py-2 px-4 border-b border-gray-800">{r.raw_password}</td>
                    <td className="py-2 px-4 border-b border-gray-800">
                      <div className="flex gap-2">
                        <button onClick={() => setPasswordResetTarget(r.id)} className="bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold py-1 px-2 rounded">Change Password</button>
                        <button onClick={() => handleDelete("restaurant", r.id)} className="bg-red-700 hover:bg-red-800 text-white text-xs font-bold py-1 px-2 rounded">Delete</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section>
          <h2 className="text-2xl font-semibold mb-4 border-b border-gray-700 pb-2">Orders</h2>
          <div className="overflow-x-auto">
            <table className="min-w-full bg-gray-900 border border-gray-700">
              <thead>
                <tr>
                  <th className="py-2 px-4 border-b border-gray-700">ID</th>
                  <th className="py-2 px-4 border-b border-gray-700">Restaurant Name</th>
                  <th className="py-2 px-4 border-b border-gray-700">Order Number</th>
                  <th className="py-2 px-4 border-b border-gray-700">Status</th>
                  <th className="py-2 px-4 border-b border-gray-700">Created At</th>
                  <th className="py-2 px-4 border-b border-gray-700">Actions</th>
                </tr>
              </thead>
              <tbody>
                {orders.map((o) => (
                  <tr key={o.id}>
                    <td className="py-2 px-4 border-b border-gray-800">{o.id}</td>
                    <td className="py-2 px-4 border-b border-gray-800">{o.restaurant_name}</td>
                    <td className="py-2 px-4 border-b border-gray-800">{o.order_number}</td>
                    <td className="py-2 px-4 border-b border-gray-800">
                      <select
                        value={o.status}
                        onChange={(e) => handleStatusChange(o.id, e.target.value)}
                        className="bg-gray-800 text-white rounded p-1 border border-gray-700 hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-red-500"
                      >
                        <option value="Received">Received</option>
                        <option value="Preparing">Preparing</option>
                        <option value="Complete">Complete</option>
                      </select>
                    </td>
                    <td className="py-2 px-4 border-b border-gray-800">{new Date(o.created_at).toLocaleString()}</td>
                    <td className="py-2 px-4 border-b border-gray-800">
                      <button onClick={() => handleDelete("order", o.id)} className="bg-red-700 hover:bg-red-800 text-white text-xs font-bold py-1 px-2 rounded">Delete</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </>
  );
}
