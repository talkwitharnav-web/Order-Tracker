import Link from "next/link";

export default function NotFound() {
  return (
    <div className="min-h-dvh flex items-center justify-center p-4">
      <div className="text-center space-y-6">
        <h1 className="font-display text-6xl font-bold text-[var(--color-text-primary)]">404</h1>
        <p className="text-lg text-[var(--color-text-secondary)]">
          This page could not be found.
        </p>
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Link
            href="/restaurant/home"
            className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-[var(--radius-sm)] font-semibold bg-[var(--color-brand)] text-white hover:bg-[var(--color-brand-hover)] transition-colors"
          >
            Go to Kitchen Portal
          </Link>
          <Link
            href="/customer"
            className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-[var(--radius-sm)] font-semibold border border-[var(--color-border-strong)] text-[var(--color-text-primary)] hover:bg-[var(--color-surface-2)] transition-colors"
          >
            Track an Order
          </Link>
        </div>
      </div>
    </div>
  );
}
