"use client";

import { FC } from "react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { ChefSprite } from "@/components/ui/ChefSprite";

const GUARD_LINES = [
  "I guarded your session with my life!",
  "Still logged in, still on duty.",
  "Nobody touched your dashboard while you were away.",
  "Session's safe. I didn't even blink.",
  "Welcome back — I kept the seat warm.",
];

/**
 * Shown on the Kitchen Portal when a valid restaurant session already
 * exists, instead of silently dropping straight back into the dashboard or
 * (worse) silently forcing a fresh login. Gives an explicit, visible
 * confirmation that the session is still yours before continuing — a
 * deliberate pause point rather than an invisible auto-restore, so a session
 * hiccup is at least legible instead of feeling like the app "forgot" you.
 */
export const SessionWelcomeBack: FC<{
  restaurantName: string;
  onContinue: () => void;
  onLogout: () => void;
}> = ({ restaurantName, onContinue, onLogout }) => (
  <div className="min-h-dvh flex items-center justify-center p-4">
    <main className="w-full max-w-md mx-auto">
      <Card className="p-4 sm:p-10 text-center">
        <div className="flex justify-center mb-1 sm:mb-2">
          <ChefSprite lines={GUARD_LINES} size={110} className="sm:hidden" />
          <ChefSprite lines={GUARD_LINES} size={140} className="hidden sm:block" />
        </div>
        <h1 className="font-display text-2xl sm:text-4xl font-semibold text-[var(--color-text-primary)] mt-1 sm:mt-2 mb-1 sm:mb-2">
          Welcome back, {restaurantName}
        </h1>
        <p className="text-sm sm:text-base text-[var(--color-text-secondary)] mb-4 sm:mb-8">
          You&apos;re still signed in. Pick up where you left off, or log out.
        </p>

        <div className="flex flex-col gap-3">
          <Button size="lg" onClick={onContinue} className="w-full">
            Continue
          </Button>
          <Button size="lg" variant="secondary" onClick={onLogout} className="w-full">
            Log Out
          </Button>
        </div>
      </Card>
    </main>
  </div>
);
