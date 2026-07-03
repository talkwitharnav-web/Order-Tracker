"use client";

import Link from "next/link";
import { FC } from "react";

const DevTools: FC = () => {
  const handleSeed = async () => {
    try {
      const response = await fetch("/api/dev/seed", { method: "POST" });
      if (!response.ok) throw new Error("Failed to seed database");
      alert("Database seeded successfully!");
    } catch (error) {
      console.error(error);
      alert("Error seeding database.");
    }
  };

  return (
    <>
      <button
        onClick={handleSeed}
        className="fixed top-4 right-4 bg-slate-800 text-slate-300 text-xs font-mono px-3 py-1 rounded-full border border-slate-700 hover:bg-slate-700 hover:text-white transition-colors"
      >
        Populate DB
      </button>
      <Link
        href="/admin/db"
        className="fixed bottom-4 right-4 bg-slate-800 text-slate-300 text-xs font-mono px-3 py-1 rounded-full border border-slate-700 hover:bg-slate-700 hover:text-white transition-colors"
      >
        View DB
      </Link>
    </>
  );
};

export default function HomePage() {
  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center font-sans text-white">
      <main className="container mx-auto p-4 md:p-8 text-center">
        <div className="bg-slate-900/80 backdrop-blur-md border border-slate-800 p-12 rounded-2xl shadow-2xl max-w-3xl mx-auto">
          <h1 className="text-5xl font-bold text-white mb-4">
            Restaurant Order Tracker
          </h1>
          <p className="text-xl text-slate-300 mb-12">
            A simple, modern solution for kitchens and customers.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <Link
              href="/restaurant"
              className="group block p-8 bg-gradient-to-br from-amber-600 to-amber-700 rounded-xl shadow-2xl hover:shadow-amber-500/30 transition-all transform hover:-translate-y-1"
            >
              <h2 className="text-3xl font-bold text-white mb-2 transition-transform group-hover:scale-105">
                Kitchen View
              </h2>
              <p className="text-amber-200">Manage incoming orders.</p>
            </Link>
            <Link
              href="/customer"
              className="group block p-8 bg-gradient-to-br from-emerald-600 to-emerald-700 rounded-xl shadow-2xl hover:shadow-emerald-500/30 transition-all transform hover:-translate-y-1"
            >
              <h2 className="text-3xl font-bold text-white mb-2 transition-transform group-hover:scale-105">
                Customer View
              </h2>
              <p className="text-emerald-200">Track your order status.</p>
            </Link>
          </div>
        </div>
      </main>
      <DevTools />
    </div>
  );
}
