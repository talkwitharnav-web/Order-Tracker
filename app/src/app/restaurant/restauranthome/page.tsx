"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { KitchenDashboard } from "../Dashboard";
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
 * The actual Kitchen Dashboard route. A valid restaurant session resumes
 * directly into the dashboard; without one, there is nothing to show and the
 * visitor is redirected to the logged-out Log In/Register landing page.
 */
export default function RestaurantHomeDashboardPage() {
  const router = useRouter();
  const [checkingSession, setCheckingSession] = useState(true);
  const [activeRestaurant, setActiveRestaurant] = useState<string | null>(null);

  useEffect(() => {
    getSession().then((session) => {
      if (session.restaurant) {
        setActiveRestaurant(session.restaurant.name);
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

  if (checkingSession) return (
    <div className="min-h-dvh flex items-center justify-center">
      <p className="text-[var(--color-text-muted)] text-sm">Loading...</p>
    </div>
  );

  if (!activeRestaurant) return null;

  return (
    <div className="content-fade-in">
      <KitchenDashboard restaurantName={activeRestaurant} onLogout={handleLogout} />
    </div>
  );
}
