import { forwardRef, InputHTMLAttributes, TextareaHTMLAttributes } from "react";

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  ({ className = "", ...props }, ref) => (
    <input
      ref={ref}
      className={`w-full px-4 py-3 text-base bg-[var(--color-surface-0)] text-[var(--color-text-primary)] border border-[var(--color-border-strong)] rounded-[var(--radius-sm)] placeholder:text-[var(--color-text-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--color-brand)] focus:border-[var(--color-brand)] transition-colors ${className}`}
      {...props}
    />
  ),
);
Input.displayName = "Input";

// Same visual language as Input -- same padding/border/focus-ring recipe --
// just a multi-line element. Kept in this file rather than a new one since
// it's a trivial styling twin of Input, not a component with its own
// distinct behavior.
export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(
  ({ className = "", ...props }, ref) => (
    <textarea
      ref={ref}
      className={`w-full px-4 py-3 text-base bg-[var(--color-surface-0)] text-[var(--color-text-primary)] border border-[var(--color-border-strong)] rounded-[var(--radius-sm)] placeholder:text-[var(--color-text-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--color-brand)] focus:border-[var(--color-brand)] transition-colors resize-y ${className}`}
      {...props}
    />
  ),
);
Textarea.displayName = "Textarea";

export const Label = ({
  className = "",
  ...props
}: React.LabelHTMLAttributes<HTMLLabelElement>) => (
  <label
    className={`block text-sm font-medium text-[var(--color-text-secondary)] mb-2 ${className}`}
    {...props}
  />
);
