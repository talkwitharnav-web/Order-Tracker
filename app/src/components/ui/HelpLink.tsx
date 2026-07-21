import { FC } from "react";
import { CircleHelp } from "lucide-react";

/**
 * Opens /help/errors (the error-code reference, see lib/error-codes.ts) in
 * a new tab -- same icon-button sizing/hover styling as every other
 * SettingsToggles icon (FullscreenToggle, ThemeToggle), placed just before
 * the theme toggle per explicit placement request.
 */
export const HelpLink: FC = () => (
  <a
    href="/help/errors"
    target="_blank"
    rel="noopener noreferrer"
    aria-label="Help page"
    className="w-8 h-8 flex items-center justify-center rounded-[var(--radius-sm)] text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-2)] hover:text-[var(--color-text-primary)] transition-colors"
  >
    <CircleHelp size={16} />
  </a>
);
