"use client";

import { useState, FC } from "react";
import { Copy, Check } from "lucide-react";

/**
 * Renders a value alongside a small copy-to-clipboard button -- used where
 * a value genuinely needs to be copyable (admin/db's password/name columns)
 * now that text selection is disabled app-wide (see globals.css's `* {
 * user-select: none }` rule). Deliberately does NOT fall back to
 * select-and-copy; this is the only copy mechanism for these values.
 */
export const CopyableValue: FC<{ value: string; label: string; className?: string }> = ({
  value,
  label,
  className = "",
}) => {
  const [copied, setCopied] = useState(false);

  const copyWithFallback = () => {
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const textarea = document.createElement("textarea");
    textarea.value = value;
    textarea.readOnly = true;
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";
    try {
      document.body.appendChild(textarea);
      textarea.select();
      return document.execCommand("copy");
    } finally {
      textarea.remove();
      if (previousFocus?.isConnected) previousFocus.focus();
    }
  };

  const handleCopy = async () => {
    let succeeded = false;
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(value);
        succeeded = true;
      }
    } catch {
      // Plain-HTTP LAN origins may deny the modern Clipboard API.
    }

    if (!succeeded) {
      try {
        succeeded = copyWithFallback();
      } catch {
        succeeded = false;
      }
    }

    if (succeeded) {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }
  };

  return (
    <button
      onClick={handleCopy}
      aria-label={`Copy ${label}`}
      title={`Copy ${label}`}
      className={`inline-flex items-center gap-1.5 group ${className}`}
    >
      <span className="truncate">{value}</span>
      {copied ? (
        <Check size={13} className="shrink-0 text-[var(--color-success)]" />
      ) : (
        <Copy
          size={13}
          className="shrink-0 text-[var(--color-text-muted)] group-hover:text-[var(--color-text-primary)] transition-colors"
        />
      )}
    </button>
  );
};
