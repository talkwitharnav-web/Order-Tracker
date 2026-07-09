"use client";

import { useState, useEffect, FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { AuthCard } from "@/components/ui/AuthCard";
import { Input, Label } from "@/components/ui/Input";
import { Checkbox } from "@/components/ui/Checkbox";
import { Button } from "@/components/ui/Button";
import { fetchJson } from "@/lib/api-client";

async function getActiveSessionName() {
  try {
    const session = await fetchJson<{ restaurant: { name: string } | null }>("/api/session");
    return session.restaurant?.name ?? null;
  } catch {
    return null;
  }
}

export default function RestaurantSignupPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [rememberMe, setRememberMe] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  // See the identical check + comment in restaurant/login/page.tsx -- this
  // page is just as reachable via browser back/forward navigation while a
  // session is still valid, and should redirect rather than force a new
  // registration over an already-logged-in kitchen.
  const [checkingSession, setCheckingSession] = useState(true);
  // Previously this redirected instantly with no explanation -- clicking
  // "Register a New Kitchen" from the portal while already signed in just
  // silently bounced to the dashboard, which read as a broken button. Now
  // it names the signed-in kitchen and pauses briefly so that's visible
  // before the redirect happens.
  const [alreadySignedInAs, setAlreadySignedInAs] = useState<string | null>(null);

  useEffect(() => {
    getActiveSessionName().then((activeName) => {
      if (activeName) {
        setAlreadySignedInAs(activeName);
        const timer = setTimeout(() => router.replace("/restaurant/restauranthome"), 1800);
        return () => clearTimeout(timer);
      }
      setCheckingSession(false);
    });
  }, [router]);

  if (alreadySignedInAs) {
    return (
      <div className="min-h-dvh flex items-center justify-center p-4 text-center">
        <p className="text-[var(--color-text-secondary)]">
          You&apos;re currently signed in as <strong className="text-[var(--color-text-primary)]">{alreadySignedInAs}</strong>.
          <br />
          Log out first to register a new kitchen. Taking you to your dashboard&hellip;
        </p>
      </div>
    );
  }

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
          body: JSON.stringify({ name: trimmedName, password, rememberMe }),
        },
        { retries: 0 }
      );
      // register/route.ts sets the restaurant session cookie on success,
      // so signup can continue directly into the dashboard.
      router.push("/restaurant/restauranthome");
    } catch (err) {
      setError(err instanceof Error ? err.message : "An unknown error occurred");
      setIsLoading(false);
    }
  };

  if (checkingSession) return null;

  return (
    <AuthCard
      title="Create Kitchen Account"
      onSubmit={handleRegister}
      error={error}
      footer={
        <div className="flex flex-col gap-1">
          <Link
            href="/restaurant/login"
            className="inline-block py-1 text-[var(--color-text-secondary)] hover:text-[var(--color-brand-text)] transition-colors"
          >
            Already have an account? Login
          </Link>
          <button
            type="button"
            onClick={() => router.push("/restaurant/home")}
            className="inline-block py-1 text-[var(--color-text-secondary)] hover:text-[var(--color-brand-text)] transition-colors"
          >
            &larr; Back to Kitchen Portal
          </button>
        </div>
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
          autoComplete="new-password"
          minLength={8}
          maxLength={200}
          aria-describedby="password-requirements"
          value={password}
          onChange={(e) => setPassword(e.target.value.replace(/\s/g, ""))}
          placeholder="••••••••"
          required
        />
        <p id="password-requirements" className="mt-1.5 text-xs text-[var(--color-text-muted)]">
          Use 8–200 characters with no spaces.
        </p>
      </div>
      <Checkbox label="Remember Me" checked={rememberMe} onChange={(e) => setRememberMe(e.target.checked)} />
      <Button type="submit" size="lg" disabled={isLoading} className="w-full">
        {isLoading ? "Creating..." : "Register Kitchen"}
      </Button>
    </AuthCard>
  );
}
