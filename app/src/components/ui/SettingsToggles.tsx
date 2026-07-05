import { FC } from "react";
import { ThemeToggle } from "@/components/ui/ThemeToggle";
import { ContrastToggle } from "@/components/ui/ContrastToggle";
import { UiSizeToggle } from "@/components/ui/UiSizeToggle";

/**
 * Groups the three independent display-preference controls (theme,
 * high-contrast, UI size) into one fixed top-right cluster, replacing the
 * lone ThemeToggle that used to sit there on every page. Kept as three
 * separate underlying components/localStorage keys (not one combined
 * "accessibility mode") since each is an orthogonal axis a user might want
 * independently — bundling them would force an all-or-nothing choice.
 */
export const SettingsToggles: FC<{ className?: string }> = ({ className }) => (
  <div className={`fixed top-4 right-4 z-20 flex items-center gap-2 ${className ?? ""}`}>
    <UiSizeToggle />
    <ContrastToggle />
    <ThemeToggle />
  </div>
);
