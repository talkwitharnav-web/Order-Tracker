"use client";

import { useEffect, useState, FC } from "react";
import { Maximize, Minimize } from "lucide-react";

// Chrome/Edge on Android support the standard Fullscreen API well enough
// that requesting it on <html> also collapses the browser chrome (address
// bar, nav buttons), genuinely reclaiming screen space on a small phone
// during a kitchen rush. iOS Safari does NOT support requestFullscreen() on
// ordinary page content at all (only <video> elements) -- there is no DOM
// API workaround for that, only a home-screen PWA launch bypasses Safari's
// chrome entirely, which is a separate, larger undertaking (web manifest +
// user opt-in via "Add to Home Screen") than a single button can drive.
// Rather than show a button that silently does nothing on iOS, capability
// is detected and the button simply doesn't render there.
function isFullscreenSupported(): boolean {
  if (typeof document === "undefined") return false;
  return document.fullscreenEnabled === true;
}

/**
 * Mobile-only (hidden sm:+, where a mouse/trackpad user already has plenty
 * of screen space) toggle for the Fullscreen API -- requesting fullscreen
 * on <html> lets supporting mobile browsers collapse their address bar and
 * nav chrome, reclaiming real screen real estate for the actual app on a
 * small phone. Self-hides entirely when the API isn't available (iOS
 * Safari) rather than rendering a dead control.
 */
export const FullscreenToggle: FC = () => {
  const [supported, setSupported] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    setSupported(isFullscreenSupported());
    const onChange = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", onChange);
    onChange();
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  if (!supported) return null;

  const toggle = () => {
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => {});
    } else {
      document.documentElement.requestFullscreen().catch(() => {});
    }
  };

  return (
    <button
      onClick={toggle}
      aria-label={isFullscreen ? "Exit fullscreen" : "Enter fullscreen"}
      className="sm:hidden w-8 h-8 flex items-center justify-center rounded-[var(--radius-sm)] text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-2)] hover:text-[var(--color-text-primary)] transition-colors"
    >
      {isFullscreen ? <Minimize size={16} /> : <Maximize size={16} />}
    </button>
  );
};
