"use client";

import { useState, useEffect, FormEvent, FC } from "react";
import Link from "next/link";
import { KitchenDashboard } from "./Dashboard";
import { AuthCard } from "@/components/ui/AuthCard";
import { Input, Label } from "@/components/ui/Input";
import { Checkbox } from "@/components/ui/Checkbox";
import { Button } from "@/components/ui/Button";

const api = {
  async login(name: string, pass: string, rememberMe: boolean) {
    const response = await fetch("/api/restaurants/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, password: pass, rememberMe }),
    });
    if (!response.ok) {
      throw new Error("Login failed. Please check kitchen name and password.");
    }
    return response.json();
  },
  async getSession() {
    const response = await fetch("/api/session");
    return response.json();
  },
  async logout() {
    await fetch("/api/logout", { method: "POST" });
  },
};

const Login: FC<{ onLoginSuccess: (name: string) => void }> = ({ onLoginSuccess }) => {
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [rememberMe, setRememberMe] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

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
      await api.login(trimmedName, password, rememberMe);
      onLoginSuccess(trimmedName);
    } catch (err) {
      setError(err instanceof Error ? err.message : "An unknown error occurred");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <AuthCard
      title="Kitchen Login"
      onSubmit={handleLogin}
      error={error}
      footer={
        <Link
          href="/restaurant/register"
          className="text-[var(--color-text-secondary)] hover:text-[var(--color-brand-text)] transition-colors"
        >
          Need a kitchen account? Register
        </Link>
      }
    >
      <div>
        <Label htmlFor="kitchenName">Kitchen Name</Label>
        <Input
          id="kitchenName"
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value.replace(/\s{2,}/g, " "))}
          placeholder="e.g., 'The Golden Spoon'"
          required
        />
      </div>
      <div>
        <Label htmlFor="password">Password</Label>
        <Input
          id="password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value.replace(/\s/g, ""))}
          placeholder="••••••••"
          required
        />
      </div>
      <Checkbox
        label="Remember Me"
        checked={rememberMe}
        onChange={(e) => setRememberMe(e.target.checked)}
      />
      <Button type="submit" size="lg" disabled={isLoading} className="w-full">
        {isLoading ? "Signing in..." : "Sign In"}
      </Button>
    </AuthCard>
  );
};

export default function RestaurantPage() {
  const [loggedInRestaurant, setLoggedInRestaurant] = useState<string | null>(null);
  const [checkingSession, setCheckingSession] = useState(true);

  useEffect(() => {
    api.getSession().then((session) => {
      if (session.authenticated && session.type === "restaurant") {
        setLoggedInRestaurant(session.name);
      }
      setCheckingSession(false);
    });
  }, []);

  const handleLoginSuccess = (name: string) => {
    setLoggedInRestaurant(name);
  };

  const handleLogout = async () => {
    await api.logout();
    setLoggedInRestaurant(null);
  };

  if (checkingSession) return null;

  if (!loggedInRestaurant) {
    return <Login onLoginSuccess={handleLoginSuccess} />;
  }

  return <KitchenDashboard restaurantName={loggedInRestaurant} onLogout={handleLogout} />;
}
