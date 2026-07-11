"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { KitchenDashboard } from "../Dashboard";
import { fetchJson, fetchWithRetry } from "@/lib/api-client";
import { getEmployeeSession, clearEmployeeSession } from "@/lib/employee-session";

type EmployeeApiRow = { id: number };

async function getSession() {
  try {
    return await fetchJson<{ restaurant: { name: string } | null }>("/api/session");
  } catch {
    return { restaurant: null };
  }
}

async function getEmployeeCount(restaurantName: string) {
  try {
    const data = await fetchJson<{ employees: EmployeeApiRow[] }>(
      `/api/restaurants/by-name/${encodeURIComponent(restaurantName)}/employees`,
    );
    return data.employees.length;
  } catch {
    return 0;
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
 *
 * If this kitchen has any employees configured, an additional gate applies:
 * a signed-in employee (see lib/employee-session.ts) must be present before
 * the dashboard renders -- "Remember Me" on the kitchen's own login never
 * carries this over, so every fresh dashboard session re-requires the
 * one-time staff sign-in, even on a remembered kitchen.
 */
export default function RestaurantHomeDashboardPage() {
  const router = useRouter();
  const [checkingSession, setCheckingSession] = useState(true);
  const [activeRestaurant, setActiveRestaurant] = useState<string | null>(null);

  useEffect(() => {
    getSession().then(async (session) => {
      if (!session.restaurant) {
        router.replace("/restaurant/home");
        return;
      }
      const name = session.restaurant.name;
      const employeeCount = await getEmployeeCount(name);
      if (employeeCount > 0 && !getEmployeeSession(name)) {
        router.replace("/restaurant/staff-login");
        return;
      }
      setActiveRestaurant(name);
      setCheckingSession(false);
    });
  }, [router]);

  const handleLogout = async () => {
    clearEmployeeSession();
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
