"use client";

import { FC } from "react";
import Link from "next/link";
import { Modal } from "@/components/ui/Modal";
import { lookupErrorCode } from "@/lib/error-codes";

/**
 * The popup card behind an error toast's clickable "#123" chip -- reuses
 * Modal wholesale (blurred backdrop, portal-to-body, Escape/click-outside-
 * to-close, focus trap) rather than building a second bespoke overlay, so
 * this gets the same polish and the same bugfixes (see Modal.tsx's portal
 * comment) for free. `code === null` renders nothing; Modal's own
 * useDropdownReveal handles the mount/unmount animation timing either way.
 */
export const ErrorCodeCard: FC<{ code: number | null; onClose: () => void }> = ({ code, onClose }) => {
  const entry = code !== null ? lookupErrorCode(code) : null;

  return (
    <Modal isOpen={code !== null} title={entry ? `Error ${entry.code}` : "Unknown error code"} onClose={onClose}>
      {entry ? (
        <div className="space-y-3">
          <p className="text-sm font-semibold text-[var(--color-text-primary)]">{entry.title}</p>
          <p className="text-sm text-[var(--color-text-secondary)]">{entry.meaning}</p>
          <Link
            href={`/help/errors#${entry.code}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-block text-sm text-[var(--color-brand)] hover:text-[var(--color-brand-hover)] underline"
          >
            View full error reference &rarr;
          </Link>
        </div>
      ) : (
        <p className="text-sm text-[var(--color-text-secondary)]">
          This error code isn&apos;t in the reference list. It may be from an older version of the app.
        </p>
      )}
    </Modal>
  );
};
