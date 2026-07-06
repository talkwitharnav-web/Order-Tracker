"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { KitchenDashboard } from "../Dashboard";
import { SessionWelcomeBack } from "@/components/ui/SessionWelcomeBack";
import { fetchJson, fetchWithRetry } from "@/lib/api-client";

async function getSession() {
  try {
    return await fetchJson<{ restaurant: { name: string } | null }>("/api/session");
  } catch {
    return { restaurant: null };
  }
}

async function logout() {
  try {
    await fetchWithRetry("/api/logout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "restaurant" }),
    });
  } catch {
    // best-effort; UI still navigates back to the login view regardless
  }
}

/**
 * The actual Kitchen Dashboard route. Owns the "are you still logged in?"
 * question (moved here from the old single /restaurant page, per the
 * 2026-07 route split — see CLAUDE.md) rather than /restaurant/home, so
 * that landing page's only job is the logged-out Log In/Register choice.
 * No valid session here means there's nothing to show, so this page
 * redirects back to /restaurant/home rather than rendering anything itself.
 */
export default function RestaurantHomeDashboardPage() {
  const router = useRouter();
  const [checkingSession, setCheckingSession] = useState(true);
  const [awaitingContinue, setAwaitingContinue] = useState<string | null>(null);
  const [activeRestaurant, setActiveRestaurant] = useState<string | null>(null);

  useEffect(() => {
    getSession().then((session) => {
      if (session.restaurant) {
        setAwaitingContinue(session.restaurant.name);
      } else {
        router.replace("/restaurant/home");
        return;
      }
      setCheckingSession(false);
    });
  }, [router]);

  const handleLogout = async () => {
    await logout();
    router.push("/restaurant/home");
  };

  if (checkingSession) return null;

  if (awaitingContinue) {
    return (
      <SessionWelcomeBack
        restaurantName={awaitingContinue}
        onContinue={() => {
          setActiveRestaurant(awaitingContinue);
          setAwaitingContinue(null);
        }}
        onLogout={handleLogout}
      />
    );
  }

  if (!activeRestaurant) return null;

  return <KitchenDashboard restaurantName={activeRestaurant} onLogout={handleLogout} />;
}
