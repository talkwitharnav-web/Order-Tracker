import { FC } from "react";
import { Utensils, Soup, Wheat, Cherry, CookingPot, Salad } from "lucide-react";

const ICONS = [
  { Icon: Utensils, top: "8%", left: "6%", size: 90, rotate: -18 },
  { Icon: Wheat, top: "18%", left: "88%", size: 110, rotate: 12 },
  { Icon: Soup, top: "62%", left: "4%", size: 100, rotate: 8 },
  { Icon: CookingPot, top: "78%", left: "92%", size: 95, rotate: -10 },
  { Icon: Cherry, top: "42%", left: "94%", size: 70, rotate: 20 },
  { Icon: Salad, top: "90%", left: "20%", size: 85, rotate: -6 },
];

const BANNERS = [
  { text: "FOOD!", top: "28%", left: "78%", rotate: -8 },
  { text: "YUM", top: "50%", left: "10%", rotate: 6 },
  { text: "TASTY", top: "72%", left: "70%", rotate: -4 },
];

/**
 * Purely decorative, very-low-opacity food-icon watermarks + playful banner
 * words scattered across the page background. Fixed positioning so it sits
 * behind content and doesn't affect layout/scroll.
 */
export const BackgroundArt: FC = () => (
  <div className="fixed inset-0 -z-10 overflow-hidden pointer-events-none" aria-hidden="true">
    {ICONS.map(({ Icon, top, left, size, rotate }, i) => (
      <Icon
        key={i}
        style={{
          position: "absolute",
          top,
          left,
          width: size,
          height: size,
          transform: `rotate(${rotate}deg)`,
          color: "var(--color-brand)",
          opacity: 0.06,
        }}
      />
    ))}
    {BANNERS.map(({ text, top, left, rotate }) => (
      <span
        key={text}
        className="font-display font-bold select-none"
        style={{
          position: "absolute",
          top,
          left,
          transform: `rotate(${rotate}deg)`,
          fontSize: "2rem",
          color: "var(--color-accent-olive)",
          opacity: 0.08,
          letterSpacing: "0.05em",
        }}
      >
        {text}
      </span>
    ))}
  </div>
);
