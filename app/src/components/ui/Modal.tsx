"use client";

import { FC, ReactNode, useEffect, useRef } from "react";
import { Button } from "./Button";

interface ModalProps {
  isOpen: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  danger?: boolean;
}

export const Modal: FC<ModalProps> = ({ isOpen, title, onClose, children, danger = false }) => {
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeyDown);

    const panel = panelRef.current;
    const focusable = panel?.querySelectorAll<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
    );
    focusable?.[0]?.focus();

    return () => document.removeEventListener("keydown", onKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 bg-black/70 flex justify-center items-center z-50 p-4"
      onClick={onClose}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
        onClick={(e) => e.stopPropagation()}
        className={`bg-[var(--color-surface-1)] border ${
          danger ? "border-[var(--color-danger)]" : "border-[var(--color-border-strong)]"
        } rounded-[var(--radius-md)] shadow-xl p-6 w-full max-w-md`}
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
}> = ({ onCancel, onConfirm, confirmLabel = "Confirm", danger = false }) => (
  <div className="flex justify-end gap-3 mt-6">
    <Button variant="secondary" onClick={onCancel}>
      Cancel
    </Button>
    <Button variant={danger ? "danger" : "primary"} onClick={onConfirm}>
      {confirmLabel}
    </Button>
  </div>
);
