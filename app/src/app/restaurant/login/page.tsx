"use client";

import { useState, useEffect, FormEvent } from "react";
import { useRouter } from "next/navigation";
import { AuthCard } from "@/components/ui/AuthCard";
import { Input, Label } from "@/components/ui/Input";
import { Checkbox } from "@/components/ui/Checkbox";
import { Button } from "@/components/ui/Button";
import { fetchJson } from "@/lib/api-client";

async function login(name: string, pass: string, rememberMe: boolean) {
  try {
    return await fetchJson("/api/restaurants/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, password: pass, rememberMe }),
    });
  } catch {
    throw new Error("Login failed. Please check kitchen name and password.");
  }
}

async function hasActiveSession() {
  try {
    const session = await fetchJson<{ restaurant: { name: string } | null }>("/api/session");
    return !!session.restaurant;
  } catch {
    return false;
  }
}

export default function RestaurantLoginPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [rememberMe, setRememberMe] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  // Starts true so the bare form never flashes before the session check
  // resolves -- this page is reachable directly via browser back/forward
  // navigation (you were on it before submitting), not just via a fresh
  // click from /restaurant/home, so a still-valid session can land here
  // with no chance for restauranthome's own check to run first. Redirecting
  // straight to the dashboard means back-navigating out of a logged-in
  // session never forces re-entering credentials that are still valid.
  const [checkingSession, setCheckingSession] = useState(true);

  useEffect(() => {
    hasActiveSession().then((active) => {
      if (active) {
        router.replace("/restaurant/restauranthome");
        return;
      }
      setCheckingSession(false);
    });
  }, [router]);

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
      await login(trimmedName, password, rememberMe);
      router.push("/restaurant/restauranthome");
    } catch (err) {
      setError(err instanceof Error ? err.message : "An unknown error occurred");
      setIsLoading(false);
    }
  };

  if (checkingSession) return null;

  return (
    <AuthCard
      title="Kitchen Login"
      onSubmit={handleLogin}
      error={error}
      footer={
        <button
          type="button"
          onClick={() => router.push("/restaurant/home")}
          className="inline-block py-3 text-[var(--color-text-secondary)] hover:text-[var(--color-brand-text)] transition-colors"
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
          onChange={(e) => {
            setError(null);
            setName(e.target.value.replace(/\s{2,}/g, " "));
          }}
          placeholder="e.g., 'The Golden Spoon'"
          required
        />
      </div>
      <div>
        <Label htmlFor="password">Password</Label>
        <Input
          id="password"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => {
            setError(null);
            setPassword(e.target.value.replace(/\s/g, ""));
          }}
          placeholder="••••••••"
          required
        />
      </div>
      <Checkbox label="Remember Me" checked={rememberMe} onChange={(e) => setRememberMe(e.target.checked)} />
      <Button type="submit" size="lg" disabled={isLoading} className="w-full">
        {isLoading ? "Signing in..." : "Sign In"}
      </Button>
      <p className="text-center text-sm text-[var(--color-text-secondary)]">
        New kitchen?{" "}
        <button
          type="button"
          onClick={() => router.push("/restaurant/signup")}
          className="font-semibold text-[var(--color-brand-text)] hover:underline"
        >
          Register here
        </button>
      </p>
    </AuthCard>
  );
}
