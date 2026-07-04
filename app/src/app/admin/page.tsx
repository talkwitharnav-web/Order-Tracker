"use client";

import { useState, useEffect, FC } from "react";
import Link from "next/link";
import { KitchenDashboard } from "../restaurant/Dashboard";
import CustomerPage from "../customer/page";

// --- Components ---

const DataTable: FC<{ title: string; data: any[] }> = ({ title, data }) => (
  <div className="mb-8">
    <h2 className="text-2xl font-bold text-amber-500 mb-4">{title}</h2>
    {data.length > 0 ? (
      <div className="overflow-x-auto bg-slate-800/50 border border-slate-700 rounded-lg p-4 max-h-[500px]">
        <table className="w-full text-left">
          <thead className="sticky top-0 bg-slate-800">
            <tr className="border-b border-slate-600">
              {Object.keys(data[0]).map((key) => (
                <th
                  key={key}
                  className="p-3 text-sm font-semibold text-slate-300"
                >
                  {key}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.map((row, i) => (
              <tr key={i} className="border-b border-slate-700 last:border-0">
                {Object.values(row).map((val: any, j) => (
                  <td
                    key={j}
                    className="p-3 text-sm text-slate-400 font-mono whitespace-nowrap"
                  >
                    {String(val)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    ) : (
      <p className="text-slate-500">No data in this table.</p>
    )}
  </div>
);

type SimMode = "ADMIN" | "KITCHEN" | "CUSTOMER";

const AdminDashboard: FC = () => {
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPurging, setIsPurging] = useState(false);
  const [simMode, setSimMode] = useState<SimMode>("ADMIN");
  const [simRestaurantName, setSimRestaurantName] = useState("");

  const fetchData = async () => {
    try {
      const response = await fetch("/api/dev/db");
      if (!response.ok) throw new Error("Failed to fetch database contents");
      const dbData = await response.json();
      setData(dbData);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    }
  };

  useEffect(() => {
    fetchData();
    const intervalId = setInterval(fetchData, 5000); // Poll every 5 seconds
    return () => clearInterval(intervalId);
  }, []);

  const handlePurge = async () => {
    if (
      window.confirm(
        "ARE YOU SURE you want to permanently delete all data from the database? This cannot be undone.",
      )
    ) {
      setIsPurging(true);
      try {
        const response = await fetch("/api/dev/db", { method: "DELETE" });
        if (!response.ok) throw new Error("Failed to purge database");
        await fetchData(); // Refresh data after purge
      } catch (err) => {
        setError(
          err instanceof Error ? err.message : "Unknown error during purge",
        );
      } finally {
        setIsPurging(false);
      }
    }
  };

  const renderSimMode = () => {
    switch (simMode) {
      case "KITCHEN":
        return (
          <div className="mt-4">
            <div className="flex gap-4 mb-4">
              <input
                type="text"
                placeholder="Enter restaurant name to simulate"
                value={simRestaurantName}
                onChange={(e) => setSimRestaurantName(e.target.value)}
                className="w-full bg-slate-800 border border-slate-700 rounded-lg py-3 px-4 text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
              />
            </div>
            {simRestaurantName ? (
              <div className="h-[80vh] overflow-y-auto">
                <KitchenDashboard
                  restaurantName={simRestaurantName}
                  onLogout={() => {
                    /* no-op in sim */
                  }}
                />
              </div>
            ) : (
              <p className="text-slate-500">
                Enter a restaurant name to begin kitchen simulation.
              </p>
            )}
          </div>
        );
      case "CUSTOMER":
        return (
          <div className="mt-4 h-[80vh] overflow-y-auto">
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
    <div className="min-h-screen bg-slate-950 font-sans text-white p-8">
      <header className="flex justify-between items-center mb-8">
        <h1 className="text-4xl font-bold">God Mode</h1>
        <div className="flex items-center gap-4">
          <Link
            href="/"
            className="text-amber-500 hover:text-amber-400 transition-colors"
          >
            &larr; Back to Home
          </Link>
          <button
            onClick={fetchData}
            disabled={isPurging}
            className="bg-slate-800 text-slate-300 px-4 py-2 rounded-lg border border-slate-700 hover:bg-slate-700 disabled:opacity-50"
          >
            Refresh
          </button>
          <button
            onClick={handlePurge}
            disabled={isPurging}
            className="bg-red-900/80 text-red-200 px-4 py-2 rounded-lg border border-red-700 hover:bg-red-800 disabled:opacity-50"
          >
            {isPurging ? "Purging..." : "Purge DB"}
          </button>
        </div>
      </header>

      <main>
        {error && <p className="text-red-400">{error}</p>}
        <div className="mb-8 p-4 bg-slate-900 border border-slate-700 rounded-xl">
          <div className="flex items-center justify-between">
            <h2 className="text-2xl font-bold text-indigo-400">
              Simulation Zone
            </h2>
            <div className="flex gap-2">
              {(["ADMIN", "KITCHEN", "CUSTOMER"] as SimMode[]).map((mode) => (
                <button
                  key={mode}
                  onClick={() => setSimMode(mode)}
                  className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${
                    simMode === mode
                      ? "bg-indigo-600 text-white"
                      : "bg-slate-800 text-slate-300 hover:bg-slate-700"
                  }`}
                >
                  {mode.charAt(0) + mode.slice(1).toLowerCase()} View
                </button>
              ))}
            </div>
          </div>
          {simMode !== "ADMIN" && (
            <div className="mt-4 p-4 rounded-lg ring-4 ring-indigo-500/50 relative bg-slate-950/50">
              <div className="sticky top-0 bg-slate-950/80 backdrop-blur-sm z-10 py-2 px-4 mb-4 rounded-t-lg">
                <h3 className="text-lg font-bold text-center text-indigo-300">
                  SIMULATION MODE - {simMode}
                </h3>
              </div>
              <div className="pt-2">{renderSimMode()}</div>
            </div>
          )}
        </div>

        {simMode === "ADMIN" && renderSimMode()}
      </main>
    </div>
  );
};


const AdminLoginPage: FC<{ onLoginSuccess: () => void }> = ({ onLoginSuccess }) => {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (username === "darkglory" && password === "Re$t@ur@nt@dm!n") {
      sessionStorage.setItem("isAdminAuthenticated", "true");
      onLoginSuccess();
    } else {
      setError("Invalid username or password.");
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <form
          onSubmit={handleLogin}
          className="bg-slate-900 shadow-2xl shadow-amber-900/10 rounded-xl p-8 border border-slate-700"
        >
          <h1 className="text-3xl font-bold text-center text-amber-500 mb-6">
            Admin Access
          </h1>
          {error && <p className="text-red-500 text-center mb-4">{error}</p>}
          <div className="mb-4">
            <label
              htmlFor="username"
              className="block text-slate-400 text-sm font-bold mb-2"
            >
              Username
            </label>
            <input
              type="text"
              id="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full bg-slate-800 border border-slate-700 rounded-lg py-3 px-4 text-white focus:outline-none focus:ring-2 focus:ring-amber-500 transition-all"
              required
            />
          </div>
          <div className="mb-6">
            <label
              htmlFor="password"
              className="block text-slate-400 text-sm font-bold mb-2"
            >
              Password
            </label>
            <input
              type="password"
              id="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full bg-slate-800 border border-slate-700 rounded-lg py-3 px-4 text-white focus:outline-none focus:ring-2 focus:ring-amber-500 transition-all"
              required
            />
          </div>
          <button
            type="submit"
            className="w-full bg-amber-600 hover:bg-amber-500 text-white font-bold py-3 px-4 rounded-lg focus:outline-none focus:shadow-outline transition-colors"
          >
            Sign In
          </button>
        </form>
      </div>
    </div>
  );
};


export default function AdminPage() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  useEffect(() => {
    const isAdmin = sessionStorage.getItem("isAdminAuthenticated") === "true";
    if (isAdmin) {
      setIsAuthenticated(true);
    }
  }, []);

  if (!isAuthenticated) {
    return <AdminLoginPage onLoginSuccess={() => setIsAuthenticated(true)} />;
  }

  return <AdminDashboard />;
}
