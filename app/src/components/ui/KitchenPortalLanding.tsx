import { FC } from "react";
import { ChefHat, Radio, ListChecks } from "lucide-react";
import { Card } from "./Card";
import { Button } from "./Button";
import { ChefSprite } from "./ChefSprite";

const BENEFITS = [
  { Icon: Radio, text: "Live order tracking" },
  { Icon: ListChecks, text: "Simple status updates" },
  { Icon: ChefHat, text: "Built for one kitchen at a time" },
];

const SPRITE_LINES = [
  "Ready when you are!",
  "Which kitchen's cooking today?",
  "Let's get you signed in.",
  "Order up... after you log in!",
  "New kitchen? I love making friends.",
  "Sharpen your knives, sign in first.",
  "First day? Second? I don't judge.",
  "The stove's warm, the login form's warmer.",
  "Every great kitchen starts with a login.",
  "I promise the dashboard is worth the wait.",
  "Aprons on, orders incoming.",
  "One kitchen at a time, one login at a time.",
  "Knock knock! Who's there? Your kitchen, waiting.",
  "No orders yet, but the day is young.",
  "Time to plug in your kitchen.",
  "I'll hold the door. Sign in whenever.",
  "Fresh dashboard, fresh start.",
  "New here? Hit register, I'll wait.",
  "Every order starts with a sign-in.",
  "Let's get cooking, figuratively speaking.",
  "I'm just the doorman. Come on in.",
  "Your orders are lonely without you.",
  "The kitchen missed you. Or will, once you log in.",
  "Whisk away the wait, sign in now.",
];

export const KitchenPortalLanding: FC<{
  onChooseLogin: () => void;
  onChooseRegister: () => void;
}> = ({ onChooseLogin, onChooseRegister }) => (
  <div className="min-h-dvh flex items-center justify-center p-4">
    <main className="w-full max-w-md mx-auto">
      <Card className="p-4 sm:p-10 text-center">
        {/* Two ChefSprite instances swapped by breakpoint (its `size` prop
            drives real SVG width/height attributes, not a CSS property, so
            a single instance can't be responsively resized with a Tailwind
            class alone). Wrapping divs carry the hidden/sm:block toggle
            instead of passing it as ChefSprite's own className -- its
            internal .chef-sprite-wrap class sets `display: flex` in
            globals.css, which collides in specificity with Tailwind's
            `.hidden`/`.sm\:block` (same single-class specificity, so
            whichever rule is later in the compiled stylesheet wins
            regardless of className order) -- confirmed live, this exact
            collision showed BOTH sprites at once instead of toggling. An
            extra plain wrapper div has no competing display rule of its
            own, so its hidden/block toggle can't lose that fight. */}
        <div className="flex justify-center mb-1 sm:mb-2">
          <div className="sm:hidden">
            <ChefSprite lines={SPRITE_LINES} size={120} />
          </div>
          <div className="hidden sm:block">
            <ChefSprite lines={SPRITE_LINES} size={168} />
          </div>
        </div>
        <h1 className="font-display text-2xl sm:text-4xl font-semibold text-[var(--color-text-primary)] mt-1 sm:mt-2 mb-1 sm:mb-2">
          Kitchen Portal
        </h1>
        <p className="text-sm sm:text-base text-[var(--color-text-secondary)] mb-4 sm:mb-8">
          Sign in to manage your kitchen&apos;s orders.
        </p>

        <div className="flex flex-col gap-3">
          <Button size="lg" onClick={onChooseLogin} className="w-full">
            Log In
          </Button>
          <Button size="lg" variant="secondary" onClick={onChooseRegister} className="w-full">
            Register a New Kitchen
          </Button>
        </div>

        {/* Supplementary marketing copy, not needed to actually log in/register
            — hidden below sm: since it was the single largest contributor to
            this card overflowing the viewport on short phone screens. */}
        <div className="hidden sm:grid grid-cols-3 gap-3 mt-10 pt-6 border-t border-[var(--color-border)]">
          {BENEFITS.map(({ Icon, text }) => (
            <div key={text} className="flex flex-col items-center gap-2">
              <Icon className="w-5 h-5 text-[var(--color-brand)]" />
              <span className="text-xs text-[var(--color-text-muted)] leading-tight">{text}</span>
            </div>
          ))}
        </div>
      </Card>
    </main>
  </div>
);
