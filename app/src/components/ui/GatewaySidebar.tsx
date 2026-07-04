import { FC, ReactNode } from "react";
import Link from "next/link";
import { ChefHat, Search, UtensilsCrossed } from "lucide-react";

export const GatewaySidebar: FC<{ navExtra?: ReactNode; actions?: ReactNode }> = ({ navExtra, actions }) => (
  <aside className="hidden md:flex md:flex-col w-60 shrink-0 min-h-screen bg-[var(--color-surface-1)] border-r border-[var(--color-border)] p-5">
    <div className="flex items-center gap-2 px-2 mb-8">
      <UtensilsCrossed className="w-6 h-6 text-[var(--color-brand)]" />
      <span className="font-display text-lg font-semibold text-[var(--color-text-primary)]">Bistro Hub</span>
    </div>

    <nav className="flex flex-col gap-1">
      <Link
        href="/restaurant"
        className="flex items-center gap-3 px-3 py-2.5 rounded-[var(--radius-sm)] text-sm font-medium text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-2)] hover:text-[var(--color-text-primary)] transition-colors"
      >
        <ChefHat size={18} />
        Kitchen Portal
      </Link>
      <Link
        href="/customer"
        className="flex items-center gap-3 px-3 py-2.5 rounded-[var(--radius-sm)] text-sm font-medium text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-2)] hover:text-[var(--color-text-primary)] transition-colors"
      >
        <Search size={18} />
        Customer Tracker
      </Link>
      {navExtra}
    </nav>

    <div className="flex-grow" />

    {actions && <div className="flex flex-col gap-2 pt-4 border-t border-[var(--color-border)]">{actions}</div>}
  </aside>
);

export const GatewayMobileNav: FC = () => (
  <nav className="md:hidden flex items-center gap-2 p-3 border-b border-[var(--color-border)] bg-[var(--color-surface-1)]">
    <div className="flex items-center gap-2 px-1 mr-auto">
      <UtensilsCrossed className="w-5 h-5 text-[var(--color-brand)]" />
      <span className="font-display text-base font-semibold text-[var(--color-text-primary)]">Bistro Hub</span>
    </div>
    <Link
      href="/restaurant"
      aria-label="Kitchen Portal"
      className="p-2 rounded-[var(--radius-sm)] text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-2)] hover:text-[var(--color-text-primary)] transition-colors"
    >
      <ChefHat size={18} />
    </Link>
    <Link
      href="/customer"
      aria-label="Customer Tracker"
      className="p-2 rounded-[var(--radius-sm)] text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-2)] hover:text-[var(--color-text-primary)] transition-colors"
    >
      <Search size={18} />
    </Link>
  </nav>
);
