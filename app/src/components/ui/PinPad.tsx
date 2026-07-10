"use client";

import { FC, useEffect, useRef, useState } from "react";
import { Modal } from "./Modal";
import { Button } from "./Button";

export type PinPadEmployee = {
  id: number;
  name: string;
  accountType: "manager" | "employee";
  roleName?: string | null;
  pinLength: 4 | 6;
};

/**
 * Numeric keypad for the per-action employee PIN check (see
 * SYSTEM_MEMORY.md "Employee Attribution"). Deliberately not a text input --
 * a shared kitchen tablet needs this fast and thumb-friendly, and a
 * dedicated keypad avoids the mobile OS bringing up a full text keyboard for
 * a PIN.
 *
 * Each employee has their own fixed pinLength (4 or 6, chosen when their
 * account was created) -- once a specific employee is selected, the pad
 * shows exactly that many dots and auto-submits the instant that many
 * digits are entered. No debounce/guessing is needed since the exact length
 * is already known, unlike a single global min/max across all employees.
 */

export const PinPad: FC<{
  isOpen: boolean;
  employees: PinPadEmployee[];
  onClose: () => void;
  onVerify: (employeeId: number, pin: string) => Promise<boolean>;
  onVerified: (employee: PinPadEmployee, pin: string) => void;
}> = (props) => (
  // Remounting on each open (via `key`) resets all internal state for free --
  // avoids a setState-in-effect to "reset on open", which would otherwise
  // need to run every render this component is open, not just once per open.
  <PinPadContent key={props.isOpen ? "open" : "closed"} {...props} />
);

const PinPadContent: FC<{
  isOpen: boolean;
  employees: PinPadEmployee[];
  onClose: () => void;
  onVerify: (employeeId: number, pin: string) => Promise<boolean>;
  onVerified: (employee: PinPadEmployee, pin: string) => void;
}> = ({ isOpen, employees, onClose, onVerify, onVerified }) => {
  const [selectedId, setSelectedId] = useState<number | null>(
    employees.length === 1 ? employees[0].id : null,
  );
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [verifying, setVerifying] = useState(false);
  // Synchronous guard against submitting the same PIN twice -- `verifying`
  // (state) is only current after a re-render, so two calls to submit()
  // that both happen before that re-render (e.g. React StrictMode's dev-only
  // double-effect-invocation briefly attaching two keydown listeners, or a
  // fast double-tap/double-keypress) can both pass the `verifying` check
  // and both fire a verify-pin request with the same PIN. A ref updates
  // immediately, closing that window.
  const submittingRef = useRef(false);

  const selectedEmployee = employees.find((e) => e.id === selectedId) ?? null;
  const pinLength = selectedEmployee?.pinLength ?? 4;

  const submit = async (candidatePin: string) => {
    if (selectedId === null || submittingRef.current) return;
    submittingRef.current = true;
    setVerifying(true);
    setError(null);
    try {
      const ok = await onVerify(selectedId, candidatePin);
      if (ok) {
        const employee = employees.find((e) => e.id === selectedId);
        if (employee) onVerified(employee, candidatePin);
      } else {
        setError("Incorrect PIN");
        setPin("");
      }
    } catch {
      setError("Could not verify PIN. Try again.");
      setPin("");
    } finally {
      submittingRef.current = false;
      setVerifying(false);
    }
  };

  const pressDigit = (digit: string) => {
    if (verifying) return;
    setError(null);
    setPin((prev) => {
      const next = prev.length < pinLength ? prev + digit : prev;
      if (next.length === pinLength) void submit(next);
      return next;
    });
  };

  const backspace = () => {
    if (verifying) return;
    setError(null);
    setPin((prev) => prev.slice(0, -1));
  };

  // A shared kitchen tablet still often has a physical/bluetooth keyboard
  // attached (or this gets used on desktop) -- number keys, Backspace, and
  // Enter should work the same as tapping the on-screen pad, not just
  // clicks. Global `document` listener (not a per-button handler) so it
  // works regardless of which element currently has focus inside the
  // modal, matching Modal's own Escape/Tab handling.
  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key >= "0" && e.key <= "9") {
        e.preventDefault();
        pressDigit(e.key);
      } else if (e.key === "Backspace") {
        e.preventDefault();
        backspace();
      } else if (e.key === "Enter") {
        e.preventDefault();
        if (pin.length >= pinLength) void submit(pin);
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, pin, pinLength, selectedId, verifying]);

  return (
    <Modal isOpen={isOpen} title="Confirm who you are" onClose={onClose}>
      {employees.length === 0 ? (
        <p className="text-sm text-[var(--color-text-muted)]">
          No employees set up yet. A manager can add employees from the Staff tab.
        </p>
      ) : (
        <>
          {employees.length > 1 && (
            <div className="flex flex-wrap gap-2 mb-4">
              {employees.map((employee) => (
                <button
                  key={employee.id}
                  type="button"
                  onClick={() => {
                    setSelectedId(employee.id);
                    setPin("");
                    setError(null);
                  }}
                  className={`px-3 py-2 rounded-[var(--radius-sm)] text-sm font-semibold border transition-colors ${
                    selectedId === employee.id
                      ? "bg-[var(--color-brand)] text-[var(--color-on-brand)] border-[var(--color-brand)]"
                      : "bg-[var(--color-surface-2)] text-[var(--color-text-secondary)] border-[var(--color-border-strong)]"
                  }`}
                >
                  {employee.name}
                </button>
              ))}
            </div>
          )}

          <div className="flex items-center justify-center gap-3 mb-4" aria-live="polite">
            {Array.from({ length: pinLength }).map((_, i) => (
              <span
                key={i}
                className={`w-3 h-3 rounded-full border border-[var(--color-border-strong)] ${
                  i < pin.length ? "bg-[var(--color-brand)]" : "bg-transparent"
                }`}
              />
            ))}
          </div>

          {error && <p className="text-sm text-[var(--color-danger)] text-center mb-3">{error}</p>}

          <div className="grid grid-cols-3 gap-2">
            {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((digit) => (
              <Button
                key={digit}
                type="button"
                variant="secondary"
                size="lg"
                disabled={selectedId === null || verifying}
                onClick={() => pressDigit(digit)}
              >
                {digit}
              </Button>
            ))}
            <Button
              type="button"
              variant="ghost"
              size="lg"
              disabled={selectedId === null || verifying || pin.length === 0}
              onClick={backspace}
            >
              ⌫
            </Button>
            <Button
              key="0"
              type="button"
              variant="secondary"
              size="lg"
              disabled={selectedId === null || verifying}
              onClick={() => pressDigit("0")}
            >
              0
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="lg"
              disabled={selectedId === null || verifying || pin.length < pinLength}
              onClick={() => submit(pin)}
            >
              ✓
            </Button>
          </div>
        </>
      )}
    </Modal>
  );
};
