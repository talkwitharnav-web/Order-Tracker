"use client";

import { useState, FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { AuthCard } from "@/components/ui/AuthCard";
import { Input, Label } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { fetchJson } from "@/lib/api-client";

export default function RegisterPage({
  onRegistered,
  onBack,
}: {
  onRegistered?: (name: string) => void;
  onBack?: () => void;
}) {
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
      // Registration is not idempotent-safe to retry on network failure
      // (a "timed out" request could have actually succeeded server-side,
      // and retrying would hit the unique-name 409 rather than silently
      // double-creating anything) — use plain fetchJson with its default
      // timeout but no retries.
      await fetchJson("/api/restaurants/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: trimmedName, password }),
      }, { retries: 0 });

      if (onRegistered) {
        onRegistered(trimmedName);
      } else {
        router.push("/restaurant");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "An unknown error occurred");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <AuthCard
      title="Create Kitchen Account"
      onSubmit={handleRegister}
      error={error}
      footer={
        onBack ? (
          <button
            type="button"
            onClick={onBack}
            className="text-[var(--color-text-secondary)] hover:text-[var(--color-brand-text)] transition-colors"
          >
            &larr; Back to Kitchen Portal
          </button>
        ) : (
          <Link
            href="/restaurant"
            className="text-[var(--color-text-secondary)] hover:text-[var(--color-brand-text)] transition-colors"
          >
            Already have an account? Login
          </Link>
        )
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
