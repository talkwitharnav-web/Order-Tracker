import { FC, ReactNode } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

export const PageHeader: FC<{
  title: string;
  backHref?: string;
  actions?: ReactNode;
}> = ({ title, backHref, actions }) => (
  <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-8">
    <div className="flex items-center gap-3">
      {backHref && (
        <Link
          href={backHref}
          className="text-[var(--color-text-secondary)] hover:text-[var(--color-brand-text)] transition-colors"
          aria-label="Back"
        >
          <ArrowLeft className="w-5 h-5" />
        </Link>
      )}
      <h1 className="font-display text-2xl sm:text-3xl font-semibold text-[var(--color-text-primary)]">{title}</h1>
    </div>
    {actions && <div className="flex flex-wrap items-center gap-3">{actions}</div>}
  </header>
);
