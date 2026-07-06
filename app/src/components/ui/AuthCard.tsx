import { FC, FormEvent, ReactNode } from "react";
import { Card } from "./Card";

export const AuthCard: FC<{
  title: string;
  onSubmit: (e: FormEvent) => void;
  children: ReactNode;
  error?: string | null;
  footer?: ReactNode;
  // Standalone auth pages need AuthCard to claim the full viewport height
  // itself (min-h-screen). The gateway page nests it inside its own
  // flex-1 column alongside GatewayMobileNav, where min-h-screen here
  // would stack with the nav bar's height and overflow the viewport —
  // that page passes fillParent so AuthCard just fills its flex parent.
  fillParent?: boolean;
}> = ({ title, onSubmit, children, error, footer, fillParent }) => (
  <div className={`${fillParent ? "flex-1" : "min-h-screen"} flex items-center justify-center p-4`}>
    <main className="w-full max-w-md mx-auto">
      <Card className="p-6 sm:p-10">
        <h1 className="font-display text-3xl sm:text-4xl font-semibold text-[var(--color-text-primary)] mb-8 text-center">
          {title}
        </h1>
        <form onSubmit={onSubmit} className="space-y-6">
          {children}
        </form>
        {error && (
          <div className="mt-6 bg-[var(--color-danger)]/10 border border-[var(--color-danger)]/40 p-4 rounded-[var(--radius-sm)]">
            <p className="font-semibold text-[var(--color-danger)] text-center">{error}</p>
          </div>
        )}
        {footer && <div className="mt-8 text-center">{footer}</div>}
      </Card>
    </main>
  </div>
);
