"use client";

import { useState, useEffect, useCallback, FC } from "react";
import { useRouter } from "next/navigation";
import { KitchenDashboard } from "../restaurant/Dashboard";
import CustomerPage from "../customer/page";
import { PageHeader } from "@/components/ui/PageHeader";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Modal, ModalActions } from "@/components/ui/Modal";

const DataTable: FC<{ title: string; data: Record<string, unknown>[] }> = ({ title, data }) => (
  <div className="mb-8">
    <h2 className="text-lg font-semibold text-[var(--color-text-primary)] mb-3">{title}</h2>
    {data.length > 0 ? (
      <Card className="p-0 overflow-x-auto max-h-[500px]">
        <table className="w-full text-left text-sm">
          <thead className="sticky top-0 bg-[var(--color-surface-2)]">
            <tr>
              {Object.keys(data[0]).map((key) => (
                <th key={key} scope="col" className="p-3 font-medium text-[var(--color-text-muted)]">
                  {key}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.map((row, i) => (
              <tr key={i} className="border-b border-[var(--color-border)] last:border-0">
                {Object.values(row).map((val, j) => (
                  <td
                    key={j}
                    className="p-3 text-[var(--color-text-secondary)] font-mono text-xs whitespace-nowrap"
                  >
                    {String(val)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    ) : (
      <p className="text-[var(--color-text-muted)]">No data in this table.</p>
    )}
  </div>
);

type SimMode = "ADMIN" | "KITCHEN" | "CUSTOMER";

function AdminDashboard() {
  const [data, setData] = useState<{ restaurants: Record<string, unknown>[]; orders: Record<string, unknown>[] } | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);
  const [isPurging, setIsPurging] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [simMode, setSimMode] = useState<SimMode>("ADMIN");
  const [simRestaurantName, setSimRestaurantName] = useState("");

  const fetchData = useCallback(async () => {
    try {
      const response = await fetch("/api/dev/db");
      if (!response.ok) throw new Error("Failed to fetch database contents");
      const dbData = await response.json();
      setData(dbData);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    }
  }, []);

  useEffect(() => {
    fetchData();
    const intervalId = setInterval(fetchData, 5000);
    return () => clearInterval(intervalId);
  }, [fetchData]);

  const handlePurge = async () => {
    setConfirmOpen(false);
    setIsPurging(true);
    try {
      const response = await fetch("/api/dev/db", { method: "DELETE" });
      if (!response.ok) throw new Error("Failed to purge database");
      await fetchData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error during purge");
    } finally {
      setIsPurging(false);
    }
  };

  const renderSimMode = () => {
    switch (simMode) {
      case "KITCHEN":
        return (
          <div className="mt-4">
            <Input
              type="text"
              placeholder="Enter restaurant name to simulate"
              value={simRestaurantName}
              onChange={(e) => setSimRestaurantName(e.target.value)}
              className="mb-4"
            />
            {simRestaurantName ? (
              <div className="h-[80vh] overflow-y-auto rounded-[var(--radius-md)]">
                <KitchenDashboard restaurantName={simRestaurantName} onLogout={() => {}} />
              </div>
            ) : (
              <p className="text-[var(--color-text-muted)]">
                Enter a restaurant name to begin kitchen simulation.
              </p>
            )}
          </div>
        );
      case "CUSTOMER":
        return (
          <div className="mt-4 h-[80vh] overflow-y-auto rounded-[var(--radius-md)]">
            <CustomerPage />
          </div>
        );
      case "ADMIN":
      default:
        return (
          data && (
            <>
              <DataTable title="Restaurants" data={data.restaurants} />
              <DataTable title="Master Live Feed (Orders)" data={data.orders} />
            </>
          )
        );
    }
  };

  return (
    <div className="min-h-screen p-4 sm:p-8">
      <Modal isOpen={confirmOpen} title="Purge Database" onClose={() => setConfirmOpen(false)} danger>
        <p className="text-[var(--color-text-secondary)] mb-6">
          Are you sure you want to permanently delete all data from the database? This cannot be undone.
        </p>
        <ModalActions onCancel={() => setConfirmOpen(false)} onConfirm={handlePurge} danger confirmLabel="Purge" />
      </Modal>

      <PageHeader
        title="God Mode"
        backHref="/"
        actions={
          <>
            <Button variant="secondary" onClick={fetchData} disabled={isPurging}>
              Refresh
            </Button>
            <Button variant="danger" onClick={() => setConfirmOpen(true)} disabled={isPurging}>
              {isPurging ? "Purging..." : "Purge DB"}
            </Button>
          </>
        }
      />

      <main>
        {error && <p className="text-red-400 mb-4">{error}</p>}
        <Card className="mb-8">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <h2 className="text-lg font-semibold text-[var(--color-text-primary)]">Simulation Zone</h2>
            <div className="flex flex-wrap gap-2">
              {(["ADMIN", "KITCHEN", "CUSTOMER"] as SimMode[]).map((mode) => (
                <button
                  key={mode}
                  onClick={() => setSimMode(mode)}
                  aria-pressed={simMode === mode}
                  className={`px-4 py-2 rounded-[var(--radius-sm)] text-sm font-semibold transition-colors ${
                    simMode === mode
                      ? "bg-[var(--color-brand)] text-white"
                      : "bg-[var(--color-surface-2)] text-[var(--color-text-secondary)] hover:bg-[var(--color-border-strong)] hover:text-white"
                  }`}
                >
                  {mode.charAt(0) + mode.slice(1).toLowerCase()} View
                </button>
              ))}
            </div>
          </div>
          {simMode !== "ADMIN" && (
            <div className="mt-4 p-4 rounded-[var(--radius-sm)] ring-2 ring-[var(--color-brand)]/40 relative bg-[var(--color-surface-0)]/50">
              <div className="sticky top-0 bg-[var(--color-surface-0)]/90 backdrop-blur-sm z-10 py-2 px-4 mb-4 rounded-[var(--radius-sm)]">
                <h3 className="text-sm font-bold text-center text-[var(--color-brand-text)] uppercase tracking-wide">
                  Simulation Mode — {simMode}
                </h3>
              </div>
              <div className="pt-2">{renderSimMode()}</div>
            </div>
          )}
        </Card>

        {simMode === "ADMIN" && renderSimMode()}
      </main>
    </div>
  );
}

export default function AdminPage() {
  const router = useRouter();
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    const isAdmin = localStorage.getItem("isAdmin") === "true";
    if (isAdmin) {
      setIsAuthenticated(true);
    } else {
      router.push("/");
    }
    setChecked(true);
  }, [router]);

  if (!checked) return null;
  if (!isAuthenticated) return null;

  return <AdminDashboard />;
}
