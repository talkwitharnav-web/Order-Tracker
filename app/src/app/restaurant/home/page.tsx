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

/**
 * Kitchen Portal landing: Log In / Register choice. Deliberately has no
 * session check of its own (see restauranthome/page.tsx, which owns the
 * "already logged in?" question) — this page's only job is the first-run
 * gate: if literally zero kitchens exist anywhere, skip straight to signup
 * since there's nothing to log into yet.
 */
export default function RestaurantHomePage() {
  const router = useRouter();
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    getRestaurantCount().then((count) => {
      if (count === 0) {
        router.replace("/restaurant/signup");
        return;
      }
      setChecking(false);
    });
  }, [router]);

  if (checking) return null;

  return (
    <KitchenPortalLanding
      onChooseLogin={() => router.push("/restaurant/login")}
      onChooseRegister={() => router.push("/restaurant/signup")}
    />
  );
}
