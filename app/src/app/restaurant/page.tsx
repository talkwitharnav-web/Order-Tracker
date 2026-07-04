"use client";

import { useState, useEffect, FormEvent, FC } from "react";
import Link from "next/link";
import { KitchenDashboard } from "./Dashboard";

// --- API HELPERS ---
const api = {
  async login(name: string, pass: string) {
    const response = await fetch("/api/restaurants/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, password: pass }),
    });
    if (!response.ok) {
      // Do not try to parse the body on failed responses.
      // The body may not be JSON, causing a crash.
      throw new Error("Login failed. Please check kitchen name and password.");
    }
    return response.json();
  },
};

// --- LOGIN COMPONENT ---
const Login: FC<{ onLoginSuccess: (name: string) => void }> = ({
  onLoginSuccess,
}) => {
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [rememberMe, setRememberMe] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    const savedUsername = localStorage.getItem("kitchen_username");
    const savedPassword = localStorage.getItem("kitchen_password");
    if (savedUsername && savedPassword) {
      setName(savedUsername);
      setPassword(savedPassword);
      setRememberMe(true);
    }
  }, []);

  const handleLogin = async (e: FormEvent) => {
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
      await api.login(trimmedName, password);
      if (rememberMe) {
        localStorage.setItem("kitchen_username", trimmedName);
        localStorage.setItem("kitchen_password", password);
      } else {
        localStorage.removeItem("kitchen_username");
        localStorage.removeItem("kitchen_password");
      }
      onLoginSuccess(trimmedName);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "An unknown error occurred",
      );
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-900 flex items-center justify-center font-sans text-white">
      <main className="w-full max-w-md mx-auto p-8">
        <div className="bg-slate-800/50 backdrop-blur-sm border border-slate-700 p-10 rounded-2xl shadow-2xl">
          <h1 className="text-4xl font-bold text-white mb-8 text-center">
            Kitchen Login
          </h1>
          <form onSubmit={handleLogin} className="space-y-6">
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
                placeholder="e.g., 'The Golden Spoon'"
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
            <div className="pb-2">
              <label className="flex items-center text-slate-400">
                <input
                  type="checkbox"
                  className="form-checkbox h-5 w-5 bg-slate-900 border-slate-700 text-amber-600 focus:ring-amber-500 rounded"
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                />
                <span className="ml-2">Remember Me</span>
              </label>
            </div>
            <button
              type="submit"
              disabled={isLoading}
              className="w-full px-8 py-4 text-lg font-semibold text-white bg-amber-600 rounded-xl shadow-lg hover:bg-amber-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-amber-500 disabled:bg-slate-700 transition-all duration-200"
            >
              {isLoading ? "Signing in..." : "Sign In"}
            </button>
          </form>
          {error && <p className="mt-4 text-center text-red-400">{error}</p>}
          <div className="mt-8 text-center">
            <Link
              href="/restaurant/register"
              className="text-slate-400 hover:text-amber-500 transition-colors"
            >
              Need a kitchen account? Register
            </Link>
          </div>
        </div>
      </main>
    </div>
  );
};


// --- MAIN PAGE COMPONENT ---
export default function RestaurantPage() {
  const [loggedInRestaurant, setLoggedInRestaurant] = useState<string | null>(
    null,
  );

  useEffect(() => {
    // Check for saved session on initial load
    const savedRestaurant = localStorage.getItem("restaurantName");
    if (savedRestaurant) {
      setLoggedInRestaurant(savedRestaurant);
    }
  }, []);

  const handleLoginSuccess = (name: string) => {
    localStorage.setItem("restaurantName", name);
    setLoggedInRestaurant(name);
  };

  const handleLogout = () => {
    localStorage.removeItem("restaurantName");
    setLoggedInRestaurant(null);
  };

  if (!loggedInRestaurant) {
    return <Login onLoginSuccess={handleLoginSuccess} />;
  }

  return (
    <KitchenDashboard restaurantName={loggedInRestaurant} onLogout={handleLogout} />
  );
}
