"use client";

import { useState } from "react";
import Link from "next/link";

export default function GatewayCommandCenter() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [error, setError] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (username === "darkglory" && password === "Re$t@ur@nt@dm!n") {
      setIsLoggedIn(true);
      setError("");
    } else {
      setError("Invalid credentials. Please try again.");
    }
  };

  const handleSeedPurge = async () => {
    setIsProcessing(true);
    setError("");
    try {
      const purgeRes = await fetch("/api/dev/db", { method: "DELETE" });
      if (!purgeRes.ok) {
        throw new Error("Failed to purge database.");
      }
      const seedRes = await fetch("/api/dev/seed", { method: "POST" });
      if (!seedRes.ok) {
        throw new Error("Failed to seed database.");
      }
      alert("Database purged and seeded successfully!");
    } catch (err) {
      setError(err instanceof Error ? err.message : "An unknown error occurred.");
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-24 bg-black text-gray-300 font-mono relative">
      <Link
        href="/restaurant"
        className="absolute top-4 left-4 px-4 py-2 bg-gray-800 text-white rounded-lg hover:bg-red-700 transition-colors"
      >
        Kitchen Portal
      </Link>
      <Link
        href="/customer"
        className="absolute bottom-4 left-4 px-4 py-2 bg-gray-800 text-white rounded-lg hover:bg-blue-700 transition-colors"
      >
        Customer Tracker
      </Link>

      <button
        onClick={handleSeedPurge}
        disabled={isProcessing}
        className="absolute top-4 right-4 px-4 py-2 bg-yellow-600 hover:bg-yellow-700 text-white font-bold rounded-lg transition-colors disabled:bg-gray-500"
      >
        {isProcessing ? "Processing..." : "Seed / Purge DB"}
      </button>

      <Link
        href="/admin/db"
        className="absolute bottom-4 right-4 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-lg transition-colors"
      >
        View DB
      </Link>

      <div className="w-full max-w-md">
        {!isLoggedIn ? (
          <form
            onSubmit={handleLogin}
            className="bg-gray-900 shadow-md rounded px-8 pt-6 pb-8 mb-4 border border-gray-700"
          >
            <h1 className="text-2xl text-center font-bold mb-6 text-red-500">
              Admin Login
            </h1>
            <div className="mb-4">
              <label
                className="block text-gray-400 text-sm font-bold mb-2"
                htmlFor="username"
              >
                Username
              </label>
              <input
                className="shadow appearance-none border rounded w-full py-2 px-3 bg-gray-800 border-gray-600 text-white leading-tight focus:outline-none focus:shadow-outline"
                id="username"
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
              />
            </div>
            <div className="mb-6">
              <label
                className="block text-gray-400 text-sm font-bold mb-2"
                htmlFor="password"
              >
                Password
              </label>
              <input
                className="shadow appearance-none border rounded w-full py-2 px-3 bg-gray-800 border-gray-600 text-white mb-3 leading-tight focus:outline-none focus:shadow-outline"
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
            {error && <p className="text-red-500 text-xs italic mb-4">{error}</p>}
            <div className="flex items-center justify-between">
              <button
                className="bg-red-600 hover:bg-red-700 text-white font-bold py-2 px-4 rounded focus:outline-none focus:shadow-outline w-full"
                type="submit"
              >
                Sign In
              </button>
            </div>
          </form>
        ) : (
          <div className="bg-gray-900 shadow-md rounded px-8 pt-6 pb-8 mb-4 border border-gray-700 text-center">
            <h1 className="text-2xl font-bold mb-6 text-green-500">
              Admin Control Panel
            </h1>
            <p className="text-gray-400">Welcome, darkglory.</p>
            <p className="text-gray-500 text-sm mt-4">You can now access restricted admin areas.</p>
          </div>
        )}
      </div>
    </main>
  );
}
