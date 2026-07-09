"use client";

import { useEffect } from "react";
import Link from "next/link";

/**
 * Route-level error boundary (Next App Router convention). Automatically wraps
 * every route segment under app/, so any uncaught render error in a page or its
 * client children shows this friendly recovery screen instead of a dead white
 * page. `reset()` re-attempts rendering the segment.
 */
export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[route error]", error);
  }, [error]);

  return (
    <div className="min-h-dvh flex flex-col items-center justify-center gap-4 p-6 text-center">
      <h1 className="font-display text-2xl sm:text-3xl font-semibold text-[var(--color-text-primary)]">
        Something went wrong
      </h1>
      <p className="text-sm text-[var(--color-text-secondary)] max-w-md">
        This page hit an unexpected error. You can try again, or head back to the start — nothing you&apos;ve saved is
        lost.
      </p>
      <div className="flex flex-wrap items-center justify-center gap-3">
        <button
          onClick={reset}
          className="px-5 py-2.5 rounded-[var(--radius-sm)] text-sm font-semibold bg-[var(--color-brand)] hover:bg-[var(--color-brand-hover)] text-white transition-colors"
        >
          Try again
        </button>
        <Link
          href="/"
          className="px-5 py-2.5 rounded-[var(--radius-sm)] text-sm font-semibold border border-[var(--color-border-strong)] text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-2)] hover:text-[var(--color-text-primary)] transition-colors"
        >
          Go home
        </Link>
      </div>
    </div>
  );
}
