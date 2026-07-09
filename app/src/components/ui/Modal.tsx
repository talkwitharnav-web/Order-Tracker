"use client";

import { FC, ReactNode, useEffect, useRef } from "react";
import { Button } from "./Button";
import { useDropdownReveal } from "@/lib/useDropdownReveal";

interface ModalProps {
  isOpen: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  danger?: boolean;
}

export const Modal: FC<ModalProps> = ({ isOpen, title, onClose, children, danger = false }) => {
  const panelRef = useRef<HTMLDivElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const onCloseRef = useRef(onClose);
  // useDropdownReveal's own animationClass names (dropdown-reveal[-out])
  // don't fit a centered modal's scale+fade shape -- only shouldRender
  // (the deferred-unmount timing) is reused here; modal-backdrop-reveal[-out]/
  // modal-panel-reveal[-out] below are this component's own animation pair.
  const { shouldRender } = useDropdownReveal(isOpen);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (isOpen && previousFocusRef.current === null) {
      previousFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    }

    if (!shouldRender) {
      const previousFocus = previousFocusRef.current;
      previousFocusRef.current = null;
      if (previousFocus?.isConnected) previousFocus.focus();
    }
  }, [isOpen, shouldRender]);

  useEffect(() => {
    if (!shouldRender) return;

    const panel = panelRef.current;
    if (!panel) return;

    const getFocusable = () => {
      return Array.from(
        panel.querySelectorAll<HTMLElement>(
          'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
      ).filter((element) => element.getClientRects().length > 0 && element.getAttribute("aria-hidden") !== "true");
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        if (isOpen) onCloseRef.current();
        return;
      }
      if (e.key !== "Tab") return;

      const focusable = getFocusable();
      if (focusable.length === 0) {
        e.preventDefault();
        panel.focus();
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;
      if (e.shiftKey && (active === first || !panel.contains(active))) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && (active === last || !panel.contains(active))) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown);

    if (isOpen && !panel.contains(document.activeElement)) {
      const firstFocusable = getFocusable()[0];
      if (firstFocusable) firstFocusable.focus();
      else panel.focus();
    }

    return () => document.removeEventListener("keydown", onKeyDown);
  }, [isOpen, shouldRender]);

  if (!shouldRender) return null;

  const backdropClass = isOpen ? "modal-backdrop-reveal" : "modal-backdrop-reveal-out";
  const panelClass = isOpen ? "modal-panel-reveal" : "modal-panel-reveal-out";

  return (
    <div
      className={`fixed inset-0 bg-black/70 modal-backdrop-blur flex justify-center items-center z-50 p-4 ${backdropClass}`}
      onClick={onClose}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        className={`bg-[var(--color-surface-1)] border ${
          danger ? "border-[var(--color-danger)]" : "border-[var(--color-border-strong)]"
        } rounded-[var(--radius-md)] shadow-xl p-6 w-full max-w-md ${panelClass}`}
      >
        <h2
          id="modal-title"
          className={`text-xl font-bold mb-4 ${danger ? "text-[var(--color-danger)]" : "text-[var(--color-text-primary)]"}`}
        >
          {title}
        </h2>
        {children}
      </div>
    </div>
  );
};

export const ModalActions: FC<{
  onCancel: () => void;
  onConfirm: () => void;
  confirmLabel?: string;
  danger?: boolean;
  confirmDisabled?: boolean;
}> = ({ onCancel, onConfirm, confirmLabel = "Confirm", danger = false, confirmDisabled = false }) => (
  <div className="flex justify-end gap-3 mt-6">
    <Button variant="secondary" onClick={onCancel}>
      Cancel
    </Button>
    <Button variant={danger ? "danger" : "primary"} onClick={onConfirm} disabled={confirmDisabled}>
      {confirmLabel}
    </Button>
  </div>
);
