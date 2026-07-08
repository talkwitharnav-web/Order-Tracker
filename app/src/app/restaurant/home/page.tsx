"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { KitchenPortalLanding } from "@/components/ui/KitchenPortalLanding";
import { fetchJson } from "@/lib/api-client";

async function getRestaurantCount() {
  try {
    const data = await fetchJson<{ count?: number }>("/api/restaurants");
    return typeof data.count === "number" ? data.count : 1;
  } catch {
    // Fail-safe default: never wrongly lock users into the registration
    // screen just because this one status check couldn't reach the server.
    return 1;
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

/**
 * Kitchen Portal landing: Log In / Register choice. Checks for an existing
 * remembered session first — if one exists, skips straight to the dashboard
 * welcome-back screen instead of showing Login/Register buttons.
 */
export default function RestaurantHomePage() {
  const router = useRouter();
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    Promise.all([hasActiveSession(), getRestaurantCount()]).then(([hasSession, count]) => {
      if (hasSession) {
        router.replace("/restaurant/restauranthome");
        return;
      }
      if (count === 0) {
        router.replace("/restaurant/signup");
        return;
      }
      setChecking(false);
    });
  }, [router]);

  if (checking) return (
    <div className="min-h-dvh flex items-center justify-center">
      <p className="text-[var(--color-text-muted)] text-sm">Loading...</p>
    </div>
  );

  return (
    <KitchenPortalLanding
      onChooseLogin={() => router.push("/restaurant/login")}
      onChooseRegister={() => router.push("/restaurant/signup")}
    />
  );
}
