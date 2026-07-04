import { InputHTMLAttributes } from "react";

/**
 * Plain checkbox styled with a couple of Tailwind utilities instead of the
 * `form-checkbox` class, which depends on the @tailwindcss/forms plugin that
 * isn't installed in this project (previously used without the plugin
 * present, so it likely rendered unstyled).
 */
export function Checkbox({
  label,
  className = "",
  ...props
}: InputHTMLAttributes<HTMLInputElement> & { label: string }) {
  return (
    <label className="flex items-center gap-2 text-[var(--color-text-secondary)] cursor-pointer select-none">
      <input
        type="checkbox"
        className={`h-4 w-4 rounded border-[var(--color-border-strong)] bg-[var(--color-surface-0)] text-[var(--color-brand)] focus:ring-2 focus:ring-[var(--color-brand)] focus:ring-offset-0 ${className}`}
        {...props}
      />
      <span>{label}</span>
    </label>
  );
}
