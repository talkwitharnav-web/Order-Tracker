"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Lock, Database, ScrollText, MessageSquareWarning } from "lucide-react";
import { AuthCard } from "@/components/ui/AuthCard";
import { Input, Label } from "@/components/ui/Input";
import { Checkbox } from "@/components/ui/Checkbox";
import { Button } from "@/components/ui/Button";
import { ChefMascot } from "@/components/ui/ChefMascot";
import { GatewaySidebar, GatewayMobileNav } from "@/components/ui/GatewaySidebar";
import { SettingsToggles } from "@/components/ui/SettingsToggles";
import { HealthPin } from "@/components/ui/HealthPin";

export default function GatewayCommandCenter() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [rememberMe, setRememberMe] = useState(false);
  const [error, setError] = useState("");
  const [checkingSession, setCheckingSession] = useState(true);
  const [hasAdminSession, setHasAdminSession] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const router = useRouter();

  useEffect(() => {
    fetch("/api/session")
      .then((res) => res.json())
      .then((session) => {
        setHasAdminSession(!!(session.authenticated && session.type === "admin"));
        setCheckingSession(false);
      });
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    try {
      const response = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password, rememberMe }),
      });
      if (!response.ok) {
        setError("Invalid credentials. Please try again.");
        return;
      }
      router.push("/admin/db");
    } catch {
      setError("Invalid credentials. Please try again.");
    }
  };

  const handleLogout = async () => {
    setLoggingOut(true);
    await fetch("/api/logout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "admin" }),
    });
    setTimeout(() => {
      setHasAdminSession(false);
      setLoggingOut(false);
    }, 350);
  };

  if (checkingSession) return null;

  // Both admin-only sidebar links -- Audit Log is a sibling of Access DB
  // here, not nested under /admin/db, since it's its own independent view
  // (see admin/audit/page.tsx), not a sub-feature of the DB console.
  const navExtra = hasAdminSession ? (
    <>
      <a
        href="/admin/db"
        className="flex items-center gap-3 px-3 py-2.5 rounded-[var(--radius-sm)] text-sm font-medium text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-2)] hover:text-[var(--color-text-primary)] transition-colors"
      >
        <Database size={18} />
        Access DB
      </a>
      <a
        href="/admin/audit"
        className="flex items-center gap-3 px-3 py-2.5 rounded-[var(--radius-sm)] text-sm font-medium text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-2)] hover:text-[var(--color-text-primary)] transition-colors"
      >
        <ScrollText size={18} />
        Audit Log
      </a>
      <a
        href="/admin/issues"
        className="flex items-center gap-3 px-3 py-2.5 rounded-[var(--radius-sm)] text-sm font-medium text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-2)] hover:text-[var(--color-text-primary)] transition-colors"
      >
        <MessageSquareWarning size={18} />
        Issue Review
      </a>
    </>
  ) : null;

  const sidebarActions = hasAdminSession ? (
    <button
      onClick={handleLogout}
      className="w-full text-left px-3 py-2.5 rounded-[var(--radius-sm)] text-sm font-medium text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-2)] hover:text-[var(--color-danger)] transition-colors"
    >
      Log Out
    </button>
  ) : null;

  return (
    <div className="flex min-h-dvh">
      <SettingsToggles health={hasAdminSession ? <HealthPin /> : undefined} />
      <GatewaySidebar navExtra={navExtra} actions={sidebarActions} />
      <div className="flex-1 flex flex-col">
        <GatewayMobileNav />

        {hasAdminSession ? (
          <div className="flex-1 flex flex-col items-center justify-center p-4 gap-6">
            {/* Hidden below md: -- see ChefSprite's own file for why. A
                plain wrapper div carries the hidden/md:block toggle rather
                than ChefSprite's own className, since its internal
                .chef-sprite-wrap sets display:flex, which collides in
                specificity with Tailwind's .hidden/.md\:block (same
                pattern as KitchenPortalLanding). */}
            <div className="hidden md:block">
              <ChefMascot className={loggingOut ? "chef-sprite-out" : ""} />
            </div>
            <div className="md:hidden flex flex-col items-center gap-2 w-full max-w-xs">
              <button
                onClick={handleLogout}
                className="w-full px-4 py-2.5 rounded-[var(--radius-sm)] text-sm font-medium border border-[var(--color-border-strong)] text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-2)] transition-colors"
              >
                Log Out
              </button>
              <a
                href="/admin/db"
                className="w-full text-center px-4 py-2.5 rounded-[var(--radius-sm)] text-sm font-semibold bg-[var(--color-brand)] hover:bg-[var(--color-brand-hover)] text-[var(--color-on-brand)] transition-colors"
              >
                Access DB
              </a>
              <a
                href="/admin/audit"
                className="w-full text-center px-4 py-2.5 rounded-[var(--radius-sm)] text-sm font-semibold border border-[var(--color-border-strong)] text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-2)] transition-colors"
              >
                Audit Log
              </a>
              <a
                href="/admin/issues"
                className="w-full text-center px-4 py-2.5 rounded-[var(--radius-sm)] text-sm font-semibold border border-[var(--color-border-strong)] text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-2)] transition-colors"
              >
                Issue Review
              </a>
            </div>
          </div>
        ) : (
          <div className="flex-1 flex items-center justify-center">
            <AuthCard title="Admin Access" onSubmit={handleLogin} error={error || null} fillParent>
              <div className="hidden sm:flex justify-center mb-2">
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
        )}
      </div>
    </div>
  );
}
