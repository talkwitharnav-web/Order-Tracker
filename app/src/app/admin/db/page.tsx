"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Database, Trash2, Key, ShieldAlert } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Modal, ModalActions } from "@/components/ui/Modal";
import { ToastProvider, useToast } from "@/components/ui/Toast";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { SettingsToggles } from "@/components/ui/SettingsToggles";
import { HealthPin } from "@/components/ui/HealthPin";
import { fetchJson, fetchWithRetry } from "@/lib/api-client";

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

interface ConfirmState {
  isOpen: boolean;
  title: string;
  message: string;
  danger: boolean;
  onConfirm: () => void;
}

const EMPTY_CONFIRM: ConfirmState = {
  isOpen: false,
  title: "",
  message: "",
  danger: false,
  onConfirm: () => {},
};

function AdminDbContent() {
  const router = useRouter();
  const showToast = useToast();
  const [restaurants, setRestaurants] = useState<Restaurant[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [confirmState, setConfirmState] = useState<ConfirmState>(EMPTY_CONFIRM);
  const [passwordResetTarget, setPasswordResetTarget] = useState<number | null>(null);
  const [newPassword, setNewPassword] = useState("");

  const fetchData = useCallback(async () => {
    try {
      const data = await fetchJson<{ restaurants: Restaurant[]; orders: Order[] }>("/api/dev/db");
      setRestaurants(data.restaurants);
      setOrders(data.orders);
    } catch (err) {
      showToast(err instanceof Error ? err.message : "An unknown error occurred", "error");
    } finally {
      setIsLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    fetchJson<{ authenticated: boolean; type?: string }>("/api/session")
      .then((session) => {
        if (session.authenticated && session.type === "admin") {
          fetchData();
        } else {
          router.push("/");
        }
      })
      .catch(() => router.push("/"));
  }, [router, fetchData]);

  const handleLogout = async () => {
    try {
      await fetchWithRetry("/api/logout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "admin" }),
      });
    } catch {
      // Logout is best-effort client-side navigation-wise: even if the
      // network call never lands, sending the user back to "/" is still
      // the right outcome (the cookie will simply still be valid there,
      // which is safe, not a security gap — see logout route).
    }
    router.push("/");
  };

  const closeConfirm = () => setConfirmState(EMPTY_CONFIRM);

  const performAction = async (action: () => ReturnType<typeof fetchWithRetry>, successMessage: string) => {
    closeConfirm();
    try {
      const res = await action();
      const resJson = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(resJson.error || `Action failed with status: ${res.status}`);
      }
      showToast(successMessage, "success");
      fetchData();
    } catch (err) {
      showToast(err instanceof Error ? err.message : "An unknown error occurred", "error");
    }
  };

  const handleSeed = () => {
    setConfirmState({
      isOpen: true,
      title: "Seed Database",
      message: "Are you sure you want to seed the database? This will clear existing data.",
      danger: false,
      onConfirm: () =>
        performAction(() => fetchWithRetry("/api/dev/seed", { method: "POST" }), "Database seeded successfully!"),
    });
  };

  const handlePurge = () => {
    setConfirmState({
      isOpen: true,
      title: "Purge Database",
      message: "Are you sure you want to purge the database? THIS ACTION IS IRREVERSIBLE.",
      danger: true,
      onConfirm: () =>
        performAction(() => fetchWithRetry("/api/dev/db", { method: "DELETE" }), "Database purged successfully!"),
    });
  };

  const handleDelete = (type: "restaurant" | "order", id: number) => {
    setConfirmState({
      isOpen: true,
      title: `Delete ${type}`,
      message: `Are you sure you want to delete this ${type}? This cannot be undone.`,
      danger: true,
      onConfirm: () =>
        performAction(
          () => fetchWithRetry(`/api/${type}s/${id}`, { method: "DELETE" }),
          `${type.charAt(0).toUpperCase() + type.slice(1)} deleted successfully!`,
        ),
    });
  };

  const handleStatusChange = (orderId: number, newStatus: string) => {
    performAction(
      () =>
        fetchWithRetry(`/api/orders/${orderId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: newStatus }),
        }),
      "Order status updated successfully!",
    );
  };

  const handlePasswordReset = async () => {
    if (!passwordResetTarget) return;
    try {
      const res = await fetchWithRetry(`/api/restaurants/${passwordResetTarget}/password`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ newPassword }),
      });
      const resJson = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(resJson.error || `Action failed with status: ${res.status}`);
      showToast("Password updated successfully!", "success");
      setNewPassword("");
      setPasswordResetTarget(null);
      fetchData();
    } catch (err) {
      showToast(err instanceof Error ? err.message : "An unknown error occurred", "error");
    }
  };

  if (isLoading) {
    return (
      <div className="flex justify-center items-center min-h-screen text-[var(--color-text-secondary)]">
        Loading...
      </div>
    );
  }

  return (
    <>
      <Modal isOpen={confirmState.isOpen} title={confirmState.title} onClose={closeConfirm} danger={confirmState.danger}>
        <p className="text-[var(--color-text-secondary)] mb-6">{confirmState.message}</p>
        <ModalActions
          onCancel={closeConfirm}
          onConfirm={confirmState.onConfirm}
          danger={confirmState.danger}
          confirmLabel="Confirm"
        />
      </Modal>

      <Modal
        isOpen={passwordResetTarget !== null}
        title="Change Password"
        onClose={() => {
          setPasswordResetTarget(null);
          setNewPassword("");
        }}
      >
        <Input
          type="text"
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
          placeholder="Enter new password"
          className="mb-2"
        />
        <ModalActions
          onCancel={() => {
            setPasswordResetTarget(null);
            setNewPassword("");
          }}
          onConfirm={handlePasswordReset}
          confirmLabel="Update Password"
        />
      </Modal>

      <div className="min-h-screen p-4 sm:p-8">
        <SettingsToggles health={<HealthPin showDbSize />} />
        <PageHeader
          title="Admin Dashboard"
          backHref="/"
          actions={
            <>
              <Button variant="secondary" onClick={handleSeed}>
                <Database size={16} />
                Seed Database
              </Button>
              <Button variant="danger" onClick={handlePurge}>
                <ShieldAlert size={16} />
                Purge Database
              </Button>
              <Button variant="ghost" onClick={handleLogout}>
                Logout
              </Button>
            </>
          }
        />

        <section className="mb-10">
          <h2 className="text-lg font-semibold text-[var(--color-text-primary)] mb-3">Restaurants</h2>
          <Card className="p-0 overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--color-border)]">
                  <th scope="col" className="py-3 px-4 text-left text-[var(--color-text-muted)] font-medium">
                    ID
                  </th>
                  <th scope="col" className="py-3 px-4 text-left text-[var(--color-text-muted)] font-medium">
                    Name
                  </th>
                  <th
                    scope="col"
                    className="py-3 px-4 text-left text-[var(--color-text-muted)] font-medium hidden lg:table-cell"
                  >
                    Hashed Password
                  </th>
                  <th
                    scope="col"
                    className="py-3 px-4 text-left text-[var(--color-text-muted)] font-medium hidden md:table-cell"
                  >
                    Raw Password
                  </th>
                  <th className="sticky right-0 py-3 px-4 text-right text-[var(--color-text-muted)] font-medium bg-[var(--color-surface-1)]">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {restaurants.map((r) => (
                  <tr key={r.id} className="border-b border-[var(--color-border)] last:border-0">
                    <td className="py-3 px-4 text-[var(--color-text-secondary)]">{r.id}</td>
                    <td className="py-3 px-4 text-[var(--color-text-primary)] font-medium">{r.name}</td>
                    <td className="py-3 px-4 text-[var(--color-text-muted)] font-mono text-xs break-all hidden lg:table-cell">
                      {r.password}
                    </td>
                    <td className="py-3 px-4 text-[var(--color-text-muted)] font-mono text-xs hidden md:table-cell">
                      {r.raw_password}
                    </td>
                    <td className="sticky right-0 py-3 px-4 text-right bg-[var(--color-surface-1)]">
                      <div className="flex justify-end gap-2">
                        <button
                          onClick={() => setPasswordResetTarget(r.id)}
                          aria-label={`Reset password for ${r.name}`}
                          className="p-2 bg-[var(--color-brand)] hover:bg-[var(--color-brand-hover)] text-white rounded-[var(--radius-sm)] transition-colors"
                        >
                          <Key size={16} />
                        </button>
                        <button
                          onClick={() => handleDelete("restaurant", r.id)}
                          aria-label={`Delete ${r.name}`}
                          className="p-2 bg-[var(--color-danger)] hover:bg-[var(--color-danger-hover)] text-white rounded-[var(--radius-sm)] transition-colors"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-[var(--color-text-primary)] mb-3">Orders</h2>
          <Card className="p-0 overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--color-border)]">
                  <th scope="col" className="py-3 px-4 text-left text-[var(--color-text-muted)] font-medium">
                    ID
                  </th>
                  <th scope="col" className="py-3 px-4 text-left text-[var(--color-text-muted)] font-medium">
                    Restaurant
                  </th>
                  <th scope="col" className="py-3 px-4 text-left text-[var(--color-text-muted)] font-medium">
                    Order Name
                  </th>
                  <th scope="col" className="py-3 px-4 text-left text-[var(--color-text-muted)] font-medium">
                    Status
                  </th>
                  <th
                    scope="col"
                    className="py-3 px-4 text-left text-[var(--color-text-muted)] font-medium hidden md:table-cell"
                  >
                    Created At
                  </th>
                  <th className="sticky right-0 py-3 px-4 text-right text-[var(--color-text-muted)] font-medium bg-[var(--color-surface-1)]">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {orders.map((o) => (
                  <tr key={o.id} className="border-b border-[var(--color-border)] last:border-0">
                    <td className="py-3 px-4 text-[var(--color-text-secondary)]">{o.id}</td>
                    <td className="py-3 px-4 text-[var(--color-text-primary)]">{o.restaurant_name}</td>
                    <td className="py-3 px-4 text-[var(--color-text-secondary)]">{o.order_number}</td>
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-2">
                        <StatusBadge status={o.status} />
                        <select
                          value={o.status}
                          onChange={(e) => handleStatusChange(o.id, e.target.value)}
                          aria-label={`Change status for order ${o.order_number}`}
                          className="bg-[var(--color-surface-2)] text-[var(--color-text-primary)] rounded-[var(--radius-sm)] p-1 text-xs border border-[var(--color-border-strong)] focus:outline-none focus:ring-2 focus:ring-[var(--color-brand)]"
                        >
                          <option value="Received">Received</option>
                          <option value="Preparing">Preparing</option>
                          <option value="Complete">Complete</option>
                        </select>
                      </div>
                    </td>
                    <td className="py-3 px-4 text-[var(--color-text-muted)] hidden md:table-cell">
                      {new Date(o.created_at).toLocaleString()}
                    </td>
                    <td className="sticky right-0 py-3 px-4 text-right bg-[var(--color-surface-1)]">
                      <button
                        onClick={() => handleDelete("order", o.id)}
                        aria-label={`Delete order ${o.order_number}`}
                        className="p-2 bg-[var(--color-danger)] hover:bg-[var(--color-danger-hover)] text-white rounded-[var(--radius-sm)] transition-colors"
                      >
                        <Trash2 size={16} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </section>
      </div>
    </>
  );
}

export default function AdminDbPage() {
  return (
    <ToastProvider>
      <AdminDbContent />
    </ToastProvider>
  );
}
