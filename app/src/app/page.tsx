"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChefHat, Search, Lock } from "lucide-react";
import { AuthCard } from "@/components/ui/AuthCard";
import { Input, Label } from "@/components/ui/Input";
import { Checkbox } from "@/components/ui/Checkbox";
import { Button } from "@/components/ui/Button";

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
    <div className="relative">
      <Link
        href="/restaurant"
        className="fixed top-4 left-4 z-10 px-4 py-2 bg-[var(--color-surface-1)] border border-[var(--color-border-strong)] text-[var(--color-text-secondary)] rounded-[var(--radius-sm)] hover:bg-[var(--color-surface-2)] hover:text-white transition-colors flex items-center gap-2 text-sm"
      >
        <ChefHat size={18} />
        Kitchen Portal
      </Link>
      <Link
        href="/customer"
        className="fixed bottom-4 left-4 z-10 px-4 py-2 bg-[var(--color-surface-1)] border border-[var(--color-border-strong)] text-[var(--color-text-secondary)] rounded-[var(--radius-sm)] hover:bg-[var(--color-surface-2)] hover:text-white transition-colors flex items-center gap-2 text-sm"
      >
        <Search size={18} />
        Customer Tracker
      </Link>

      <AuthCard
        title="Admin Access"
        onSubmit={handleLogin}
        error={error || null}
      >
        <div className="flex justify-center mb-2">
          <Lock className="w-8 h-8 text-[var(--color-brand-text)]" />
        </div>
        <div>
          <Label htmlFor="username">Username</Label>
          <Input
            id="username"
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
          />
        </div>
        <div>
          <Label htmlFor="password">Password</Label>
          <Input
            id="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>
        <Checkbox
          label="Remember Me"
          checked={rememberMe}
          onChange={(e) => setRememberMe(e.target.checked)}
        />
        <Button type="submit" size="lg" className="w-full">
          Sign In
        </Button>
      </AuthCard>
    </div>
  );
}
