import type { ComponentType } from "react";
import { Clock, Flame, CheckCircle } from "lucide-react";

/**
 * Two different enum vocabularies exist across the codebase for the same
 * 3-stage order lifecycle (see SYSTEM_MEMORY.md "Status vocab inconsistency").
 * This module is the single place that maps EITHER vocabulary to one
 * canonical visual representation, so status always looks the same
 * regardless of which layer's enum spelling produced it. It does not change
 * the underlying API contract — only the display layer.
 */
export type ApiOrderStatus = "Received" | "Preparing" | "Complete";
export type CustomerOrderStatus = "Received" | "Making" | "Finished";
export type AnyOrderStatus = ApiOrderStatus | CustomerOrderStatus;

export type StatusKey = "received" | "preparing" | "complete";

export interface StatusVisual {
  key: StatusKey;
  label: string;
  Icon: ComponentType<{ className?: string }>;
  bg: string;
  border: string;
  text: string;
  icon: string;
}

const STATUS_VISUALS: Record<StatusKey, StatusVisual> = {
  received: {
    key: "received",
    label: "Received",
    Icon: Clock,
    bg: "bg-[var(--color-status-received-bg)]",
    border: "border-[var(--color-status-received-border)]",
    text: "text-[var(--color-status-received-text)]",
    icon: "text-[var(--color-status-received-icon)]",
  },
  preparing: {
    key: "preparing",
    label: "Preparing",
    Icon: Flame,
    bg: "bg-[var(--color-status-preparing-bg)]",
    border: "border-[var(--color-status-preparing-border)]",
    text: "text-[var(--color-status-preparing-text)]",
    icon: "text-[var(--color-status-preparing-icon)]",
  },
  complete: {
    key: "complete",
    label: "Complete",
    Icon: CheckCircle,
    bg: "bg-[var(--color-status-complete-bg)]",
    border: "border-[var(--color-status-complete-border)]",
    text: "text-[var(--color-status-complete-text)]",
    icon: "text-[var(--color-status-complete-icon)]",
  },
};

const STATUS_KEY_BY_RAW: Record<string, StatusKey> = {
  received: "received",
  preparing: "preparing",
  making: "preparing",
  complete: "complete",
  finished: "complete",
};

export function normalizeStatus(raw: AnyOrderStatus | string): StatusKey {
  const key = STATUS_KEY_BY_RAW[raw.toLowerCase()];
  if (key) return key;
  // Falls back to "received" rather than throwing, since every call site
  // here is a UI display path that must always render something -- but the
  // fallback is logged rather than silent, since an unrecognized status
  // string (a manually-edited DB row, or a future bug introducing a third
  // vocabulary) would otherwise regress a genuinely Complete/Preparing order
  // back to looking freshly placed with no visible sign anything is wrong.
  console.warn(`normalizeStatus: unrecognized status "${raw}", defaulting to "received"`);
  return "received";
}

export function getStatusVisual(raw: AnyOrderStatus | string): StatusVisual {
  return STATUS_VISUALS[normalizeStatus(raw)];
}

export const ORDERED_STATUS_KEYS: StatusKey[] = ["received", "preparing", "complete"];

export function getAllStatusVisuals(): StatusVisual[] {
  return ORDERED_STATUS_KEYS.map((k) => STATUS_VISUALS[k]);
}
