"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChefHat, Search, Lock } from "lucide-react";

export default function GatewayCommandCenter() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [rememberMe, setRememberMe] = useState(false);
  const [error, setError] = useState("");
  const router = useRouter();

  useEffect(() => {
    const savedUsername = localStorage.getItem("admin_username");
    const savedPassword = localStorage.getItem("admin_password");
    if (savedUsername && savedPassword) {
      setUsername(savedUsername);
      setPassword(savedPassword);
      setRememberMe(true);
    }
  }, []);

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (username === "darkglory" && password === "Re$t@ur@nt@dm!n") {
      localStorage.setItem("isAdmin", "true");
      if (rememberMe) {
        localStorage.setItem("admin_username", username);
        localStorage.setItem("admin_password", password);
      } else {
        localStorage.removeItem("admin_username");
        localStorage.removeItem("admin_password");
      }
      router.push("/admin/db");
    } else {
      setError("Invalid credentials. Please try again.");
    }
  };

  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-24 bg-black text-gray-300 font-mono relative">
      <Link
        href="/restaurant"
        className="absolute top-4 left-4 px-4 py-2 bg-gray-800 text-white rounded-lg hover:bg-red-700 transition-colors flex items-center gap-2"
      >
        <ChefHat size={20} />
        Kitchen Portal
      </Link>
      <Link
        href="/customer"
        className="absolute bottom-4 left-4 px-4 py-2 bg-gray-800 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-2"
      >
        <Search size={20} />
        Customer Tracker
      </Link>

      <div className="w-full max-w-md">
        <form
          onSubmit={handleLogin}
          className="bg-gray-900 shadow-md rounded px-8 pt-6 pb-8 mb-4 border border-gray-700"
        >
          <h1 className="text-2xl text-center font-bold mb-6 text-red-500 flex items-center justify-center gap-2">
            <Lock size={24} />
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
          <div className="mb-6">
            <label className="flex items-center text-gray-400">
              <input
                type="checkbox"
                className="form-checkbox h-5 w-5 bg-gray-800 border-gray-600 text-red-600 focus:ring-red-500 rounded"
                checked={rememberMe}
                onChange={(e) => setRememberMe(e.target.checked)}
              />
              <span className="ml-2">Remember Me</span>
            </label>
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
      </div>
    </main>
  );
}
