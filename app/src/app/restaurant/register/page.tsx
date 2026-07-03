"use client";

import { useState, FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

export default function RegisterPage() {
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();

  const handleRegister = async (e: FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);
    const trimmedName = name.trim();
    if (!trimmedName) {
      setError("Kitchen name cannot be empty.");
      setIsLoading(false);
      return;
    }

    try {
      const response = await fetch("/api/restaurants/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: trimmedName, password }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Registration failed");
      }

      // On success, save to localStorage and redirect to the dashboard
      localStorage.setItem("restaurantName", trimmedName);
      router.push("/restaurant");
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "An unknown error occurred",
      );
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-900 flex items-center justify-center font-sans">
      <main className="w-full max-w-md mx-auto p-8">
        <div className="bg-slate-800/50 backdrop-blur-sm border border-slate-700 p-10 rounded-2xl shadow-2xl">
          <h1 className="text-4xl font-bold text-white mb-8 text-center">
            Create Kitchen Account
          </h1>
          <form onSubmit={handleRegister} className="space-y-6">
            <div>
              <label
                htmlFor="kitchenName"
                className="block text-lg font-medium text-slate-300 mb-2"
              >
                Kitchen Name
              </label>
              <input
                id="kitchenName"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value.replace(/\s{2,}/g, " "))}
                placeholder="e.g., 'The Midnight Table'"
                className="w-full p-4 text-lg bg-slate-900 text-white border border-slate-700 rounded-xl shadow-sm focus:ring-2 focus:ring-amber-500 focus:border-amber-500 placeholder:text-slate-500"
                required
              />
            </div>
            <div>
              <label
                htmlFor="password"
                className="block text-lg font-medium text-slate-300 mb-2"
              >
                Password
              </label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value.replace(/\s/g, ""))}
                placeholder="••••••••"
                className="w-full p-4 text-lg bg-slate-900 text-white border border-slate-700 rounded-xl shadow-sm focus:ring-2 focus:ring-amber-500 focus:border-amber-500 placeholder:text-slate-500"
                required
              />
            </div>
            <button
              type="submit"
              disabled={isLoading}
              className="w-full px-8 py-4 text-lg font-semibold text-white bg-amber-600 rounded-xl shadow-lg hover:bg-amber-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-amber-500 disabled:bg-slate-700 transition-all duration-200 transform hover:scale-[1.02]"
            >
              {isLoading ? "Creating..." : "Register Kitchen"}
            </button>
          </form>
          {error && (
            <div className="mt-6 bg-red-900/50 border border-red-700 p-4 rounded-xl">
              <p className="font-semibold text-red-300 text-center">{error}</p>
            </div>
          )}
          <div className="mt-8 text-center">
            <Link
              href="/restaurant"
              className="text-slate-400 hover:text-amber-500 transition-colors"
            >
              Already have an account? Login
            </Link>
          </div>
        </div>
      </main>
    </div>
  );
}
