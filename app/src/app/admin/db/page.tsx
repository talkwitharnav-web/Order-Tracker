"use client";

import { useState, useEffect, FC } from "react";
import Link from "next/link";

interface DbData {
  restaurants: any[];
  orders: any[];
}

const DataTable: FC<{ title: string; data: any[] }> = ({ title, data }) => (
  <div className="mb-8">
    <h2 className="text-2xl font-bold text-amber-500 mb-4">{title}</h2>
    {data.length > 0 ? (
      <div className="overflow-x-auto bg-slate-800/50 border border-slate-700 rounded-lg p-4">
        <table className="w-full text-left">
          <thead>
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

export default function DbViewPage() {
  const [data, setData] = useState<DbData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isPurging, setIsPurging] = useState(false);

  const fetchData = async () => {
    setIsLoading(true);
    try {
      const response = await fetch("/api/dev/db");
      if (!response.ok) throw new Error("Failed to fetch database contents");
      const dbData = await response.json();
      setData(dbData);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setIsLoading(false);
    }
  };

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
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Unknown error during purge",
        );
      } finally {
        setIsPurging(false);
      }
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  return (
    <div className="min-h-screen bg-slate-950 font-sans text-white p-8">
      <header className="flex justify-between items-center mb-8">
        <h1 className="text-4xl font-bold">Database Viewer</h1>
        <div className="flex items-center gap-4">
          <Link
            href="/"
            className="text-amber-500 hover:text-amber-400 transition-colors"
          >
            &larr; Back to Home
          </Link>
          <button
            onClick={fetchData}
            disabled={isLoading || isPurging}
            className="bg-slate-800 text-slate-300 px-4 py-2 rounded-lg border border-slate-700 hover:bg-slate-700 disabled:opacity-50"
          >
            {isLoading ? "Refreshing..." : "Refresh"}
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
        {isLoading && <p>Loading database...</p>}
        {error && <p className="text-red-400">{error}</p>}
        {data && (
          <>
            <DataTable title="Restaurants" data={data.restaurants} />
            <DataTable title="Orders" data={data.orders} />
          </>
        )}
      </main>
    </div>
  );
}
