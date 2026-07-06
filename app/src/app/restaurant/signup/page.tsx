"use client";

import { useState, FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { AuthCard } from "@/components/ui/AuthCard";
import { Input, Label } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { fetchJson } from "@/lib/api-client";

export default function RestaurantSignupPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

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
      // Registration is not idempotent-safe to retry on network failure
      // (a "timed out" request could have actually succeeded server-side,
      // and retrying would hit the unique-name 409 rather than silently
      // double-creating anything) — use plain fetchJson with its default
      // timeout but no retries.
      await fetchJson(
        "/api/restaurants/register",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: trimmedName, password }),
        },
        { retries: 0 }
      );
      // register/route.ts sets the restaurant session cookie on success
      // (auto-login on signup). ?fresh=1 tells restauranthome to skip the
      // "still signed in, continue or log out?" screen for this specific
      // just-happened login/signup -- see the identical comment in
      // restaurant/login/page.tsx for why.
      router.push("/restaurant/restauranthome?fresh=1");
    } catch (err) {
      setError(err instanceof Error ? err.message : "An unknown error occurred");
      setIsLoading(false);
    }
  };

  return (
    <AuthCard
      title="Create Kitchen Account"
      onSubmit={handleRegister}
      error={error}
      footer={
        <Link
          href="/restaurant/login"
          className="inline-block py-3 text-[var(--color-text-secondary)] hover:text-[var(--color-brand-text)] transition-colors"
        >
          Already have an account? Login
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
          placeholder="e.g., 'The Midnight Table'"
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
      <Button type="submit" size="lg" disabled={isLoading} className="w-full">
        {isLoading ? "Creating..." : "Register Kitchen"}
      </Button>
    </AuthCard>
  );
}
