"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * Bare /restaurant has no content of its own since the 2026-07 route split
 * (see CLAUDE.md) — the actual pages live at /restaurant/home (landing),
 * /login, /signup, and /restauranthome (dashboard). Anyone hitting this
 * exact path (old bookmarks, the sidebar link) gets sent to the landing
 * page automatically.
 */
export default function RestaurantIndexRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/restaurant/home");
  }, [router]);
  return (
    <div className="min-h-dvh flex items-center justify-center">
      <p className="text-[var(--color-text-muted)] text-sm">Loading...</p>
    </div>
  );
}
