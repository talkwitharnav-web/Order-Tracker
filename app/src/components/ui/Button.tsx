"use client";

import { ButtonHTMLAttributes, FC } from "react";

type Variant = "primary" | "secondary" | "danger" | "ghost";
type Size = "md" | "lg";

const variantClasses: Record<Variant, string> = {
  primary:
    "bg-[var(--color-brand)] text-white hover:bg-[var(--color-brand-hover)] disabled:bg-[var(--color-surface-2)] disabled:text-[var(--color-text-muted)]",
  secondary:
    "bg-[var(--color-surface-2)] text-[var(--color-text-secondary)] border border-[var(--color-border-strong)] hover:bg-[var(--color-border-strong)] hover:text-white disabled:opacity-50",
  danger:
    "bg-[var(--color-danger)] text-white hover:bg-[var(--color-danger-hover)] disabled:opacity-50",
  ghost:
    "text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-2)] hover:text-white disabled:opacity-50",
};

const sizeClasses: Record<Size, string> = {
  md: "px-4 py-2 text-sm",
  lg: "px-6 py-3.5 text-base",
};

export const Button: FC<
  ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: Size }
> = ({ variant = "primary", size = "md", className = "", ...props }) => {
  return (
    <button
      className={`inline-flex items-center justify-center gap-2 rounded-[var(--radius-sm)] font-semibold transition-colors duration-150 disabled:cursor-not-allowed focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-brand)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--color-surface-0)] ${variantClasses[variant]} ${sizeClasses[size]} ${className}`}
      {...props}
    />
  );
};
