"use client";

import { useState, useEffect, FormEvent, FC } from "react";
import { KitchenDashboard } from "./Dashboard";
import RegisterPage from "./register/page";
import { AuthCard } from "@/components/ui/AuthCard";
import { Input, Label } from "@/components/ui/Input";
import { Checkbox } from "@/components/ui/Checkbox";
import { Button } from "@/components/ui/Button";
import { KitchenPortalLanding } from "@/components/ui/KitchenPortalLanding";

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
    await fetch("/api/logout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "restaurant" }),
    });
  },
  async getRestaurantCount() {
    const response = await fetch("/api/restaurants");
    const data = await response.json();
    return typeof data.count === "number" ? data.count : 1;
  },
};

const Login: FC<{ onLoginSuccess: (name: string) => void; onBack: () => void }> = ({ onLoginSuccess, onBack }) => {
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
        <button
          type="button"
          onClick={onBack}
          className="text-[var(--color-text-secondary)] hover:text-[var(--color-brand-text)] transition-colors"
        >
          &larr; Back to Kitchen Portal
        </button>
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

type View = "landing" | "login" | "register";

export default function RestaurantPage() {
  const [loggedInRestaurant, setLoggedInRestaurant] = useState<string | null>(null);
  const [checkingSession, setCheckingSession] = useState(true);
  const [noRestaurantsYet, setNoRestaurantsYet] = useState(false);
  const [view, setView] = useState<View>("landing");

  useEffect(() => {
    Promise.all([api.getSession(), api.getRestaurantCount()]).then(([session, count]) => {
      if (session.authenticated && session.type === "restaurant") {
        setLoggedInRestaurant(session.name);
      } else if (count === 0) {
        setNoRestaurantsYet(true);
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
    setView("landing");
  };

  if (checkingSession) return null;

  // No kitchens registered anywhere yet — there's nothing to log into, so
  // skip the landing page's "Log In" choice entirely and go straight to
  // registration (see restaurant/register/page.tsx's onRegistered callback).
  if (!loggedInRestaurant && noRestaurantsYet) {
    return (
      <RegisterPage
        onRegistered={(name) => {
          setNoRestaurantsYet(false);
          handleLoginSuccess(name);
        }}
      />
    );
  }

  if (!loggedInRestaurant) {
    if (view === "login") {
      return <Login onLoginSuccess={handleLoginSuccess} onBack={() => setView("landing")} />;
    }
    if (view === "register") {
      return <RegisterPage onRegistered={handleLoginSuccess} onBack={() => setView("landing")} />;
    }
    return (
      <KitchenPortalLanding
        onChooseLogin={() => setView("login")}
        onChooseRegister={() => setView("register")}
      />
    );
  }

  return <KitchenDashboard restaurantName={loggedInRestaurant} onLogout={handleLogout} />;
}
