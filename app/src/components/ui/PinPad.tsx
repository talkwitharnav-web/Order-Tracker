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

export type VerifiedPinIdentity = { id: number; name: string; accountType: "manager" | "employee" };

/**
 * Numeric keypad for the per-action PIN check (see SYSTEM_MEMORY.md
 * "Employee Attribution"). Deliberately not a text input -- a shared kitchen
 * tablet needs this fast and thumb-friendly, and a dedicated keypad avoids
 * the mobile OS bringing up a full text keyboard for a PIN.
 *
 * No name picker: staff do NOT select themselves from a list first (that
 * was pure friction -- an extra tap for every single order on a shared
 * tablet mid-rush). They just type their PIN; the server resolves WHOSE PIN
 * it is (see lib/employee-auth.ts findEmployeeByPinOnly), which only works
 * unambiguously because employee create/edit rejects a PIN that collides
 * with another active employee's PIN of the same length.
 *
 * The Manager toggle is a pure length/mode switch, not a filter: pressing it
 * only changes the pad to expect/auto-submit at 6 digits instead of 4 (and
 * turns the toggle button the warning-orange color while active). It does
 * NOT restrict who the PIN is checked against server-side -- forgetting to
 * press it just means the pad stays at 4 digits and auto-submits before a
 * 6-digit manager PIN is fully typed, so it simply won't match (surfaced as
 * the same "Try again" as any other wrong PIN, not a special error).
 */

export const PinPad: FC<{
  isOpen: boolean;
  onClose: () => void;
  onVerify: (pin: string, pinLength: 4 | 6) => Promise<VerifiedPinIdentity | null>;
  onVerified: (employee: VerifiedPinIdentity, pin: string) => void;
}> = (props) => (
  // Remounting on each open (via `key`) resets all internal state for free --
  // avoids a setState-in-effect to "reset on open", which would otherwise
  // need to run every render this component is open, not just once per open.
  <PinPadContent key={props.isOpen ? "open" : "closed"} {...props} />
);

const PinPadContent: FC<{
  isOpen: boolean;
  onClose: () => void;
  onVerify: (pin: string, pinLength: 4 | 6) => Promise<VerifiedPinIdentity | null>;
  onVerified: (employee: VerifiedPinIdentity, pin: string) => void;
}> = ({ isOpen, onClose, onVerify, onVerified }) => {
  const [isManager, setIsManager] = useState(false);
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

  const pinLength: 4 | 6 = isManager ? 6 : 4;

  const submit = async (candidatePin: string) => {
    if (submittingRef.current) return;
    submittingRef.current = true;
    setVerifying(true);
    setError(null);
    try {
      const employee = await onVerify(candidatePin, pinLength);
      if (employee) {
        onVerified(employee, candidatePin);
      } else {
        setError("Try again");
        setPin("");
      }
    } catch {
      setError("Try again");
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

  const toggleManager = () => {
    if (verifying) return;
    setIsManager((prev) => !prev);
    setPin("");
    setError(null);
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
  }, [isOpen, pin, pinLength, verifying]);

  return (
    <Modal isOpen={isOpen} title="Enter your PIN" onClose={onClose}>
      <div className="flex justify-center mb-4">
        <button
          type="button"
          onClick={toggleManager}
          disabled={verifying}
          aria-pressed={isManager}
          className={`px-4 py-2 rounded-[var(--radius-sm)] text-sm font-semibold border transition-colors disabled:opacity-50 ${
            isManager
              ? "bg-[var(--color-warning)] text-white border-[var(--color-warning)]"
              : "bg-[var(--color-surface-2)] text-[var(--color-text-secondary)] border-[var(--color-border-strong)]"
          }`}
        >
          Manager
        </button>
      </div>

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
            disabled={verifying}
            onClick={() => pressDigit(digit)}
          >
            {digit}
          </Button>
        ))}
        <Button
          type="button"
          variant="ghost"
          size="lg"
          disabled={verifying || pin.length === 0}
          onClick={backspace}
        >
          ⌫
        </Button>
        <Button
          key="0"
          type="button"
          variant="secondary"
          size="lg"
          disabled={verifying}
          onClick={() => pressDigit("0")}
        >
          0
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="lg"
          disabled={verifying || pin.length < pinLength}
          onClick={() => submit(pin)}
        >
          ✓
        </Button>
      </div>
    </Modal>
  );
};
