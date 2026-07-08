"use client";

import { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
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
 *
 * SessionWelcomeBack ("still signed in, continue or log out?") is meant for
 * REVISITING an already-active session (closing the tab and coming back, a
 * second browser tab, browser back/forward navigation) — not for a
 * login/signup that just happened this instant, where it's just a redundant
 * extra click. login/page.tsx and signup/page.tsx append ?fresh=1 when they
 * navigate here right after a successful auth, which skips straight to the
 * dashboard. The session check itself still always runs regardless of this
 * param — ?fresh=1 only controls whether the confirm screen is shown, it
 * can never grant access on its own (an unauthenticated visitor with
 * ?fresh=1 in the URL still gets redirected to /restaurant/home like anyone
 * else, since `session.restaurant` would be null).
 */
export default function RestaurantHomeDashboardPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const isFreshLogin = searchParams.get("fresh") === "1";
  const [checkingSession, setCheckingSession] = useState(true);
  const [awaitingContinue, setAwaitingContinue] = useState<string | null>(null);
  const [activeRestaurant, setActiveRestaurant] = useState<string | null>(null);

  useEffect(() => {
    getSession().then((session) => {
      if (session.restaurant) {
        if (isFreshLogin) {
          setActiveRestaurant(session.restaurant.name);
          // Drop ?fresh=1 from the visible URL once it's served its purpose
          // (skipping the confirm screen for this one mount) -- without a
          // history entry of its own, so the back button still lands
          // wherever it would have before this param existed.
          router.replace("/restaurant/restauranthome");
        } else {
          setAwaitingContinue(session.restaurant.name);
        }
      } else {
        router.replace("/restaurant/home");
        return;
      }
      setCheckingSession(false);
    });
    // isFreshLogin is derived from the URL present at mount time -- this
    // effect intentionally runs once per mount, same as before, not on
    // every search-param change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
