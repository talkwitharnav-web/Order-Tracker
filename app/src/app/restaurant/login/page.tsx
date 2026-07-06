"use client";

import { useState, FormEvent } from "react";
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

export default function RestaurantLoginPage() {
  const router = useRouter();
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
      await login(trimmedName, password, rememberMe);
      // ?fresh=1 tells restauranthome to skip the "still signed in, continue
      // or log out?" screen -- that screen exists for REVISITING an already-
      // active session, not for a login/signup that just happened this
      // instant (showing it there is just an extra, redundant click). The
      // session check itself still runs either way -- this only controls
      // whether the confirm screen is shown, never whether access is granted.
      router.push("/restaurant/restauranthome?fresh=1");
    } catch (err) {
      setError(err instanceof Error ? err.message : "An unknown error occurred");
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
      <Checkbox label="Remember Me" checked={rememberMe} onChange={(e) => setRememberMe(e.target.checked)} />
      <Button type="submit" size="lg" disabled={isLoading} className="w-full">
        {isLoading ? "Signing in..." : "Sign In"}
      </Button>
    </AuthCard>
  );
}
