"use client";

import { Component, ErrorInfo, ReactNode } from "react";

interface Props {
  children: ReactNode;
  /** Custom fallback UI. If omitted, a small on-theme inline message is shown. */
  fallback?: ReactNode;
  /** Label included in the console error, to tell boundaries apart. */
  label?: string;
}

interface State {
  hasError: boolean;
}

/**
 * A reusable React error boundary for wrapping a SECTION of a page (a card, a
 * widget, a self-aware layout region) so that if it throws during render, only
 * that section shows a friendly fallback instead of the whole route going to a
 * blank/white screen. Next's route-level error.tsx catches everything under a
 * route; this is the finer-grained tool for "keep the rest of this page alive."
 *
 * Error boundaries only catch errors thrown during render / lifecycle / in
 * child effects — NOT in async event handlers (those still need try/catch,
 * which the API layer already does). That's expected React behaviour.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(`[ErrorBoundary${this.props.label ? ` · ${this.props.label}` : ""}]`, error, info.componentStack);
  }

  private reset = () => this.setState({ hasError: false });

  render() {
    if (!this.state.hasError) return this.props.children;
    if (this.props.fallback !== undefined) return this.props.fallback;

    return (
      <div
        role="alert"
        className="flex flex-col items-center justify-center gap-3 p-6 text-center rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface-1)]"
      >
        <p className="font-display text-lg font-semibold text-[var(--color-text-primary)]">This part hiccuped.</p>
        <p className="text-sm text-[var(--color-text-secondary)] max-w-sm">
          Something in this section ran into a problem — the rest of the page is still working.
        </p>
        <button
          onClick={this.reset}
          className="px-4 py-2 rounded-[var(--radius-sm)] text-sm font-semibold bg-[var(--color-brand)] hover:bg-[var(--color-brand-hover)] text-white transition-colors"
        >
          Try again
        </button>
      </div>
    );
  }
}
