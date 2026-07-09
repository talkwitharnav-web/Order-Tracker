"use client";

import { useEffect, useState, FC } from "react";
import Image from "next/image";
import QRCode from "qrcode";
import { ExternalLink, Printer } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { CopyableValue } from "@/components/ui/CopyableValue";
import { fetchJson } from "@/lib/api-client";

type Handoff = { customerUrl: string; qrDataUrl: string | null };

export const CustomerHandoffCard: FC<{ restaurantName: string }> = ({ restaurantName }) => {
  const [handoff, setHandoff] = useState<Handoff | null>(null);

  useEffect(() => {
    let cancelled = false;
    const buildHandoff = async () => {
      let origin = window.location.origin;
      if (["localhost", "127.0.0.1", "::1"].includes(window.location.hostname)) {
        try {
          const resolved = await fetchJson<{ origin: string }>("/api/customer-origin", {}, { retries: 0 });
          origin = resolved.origin;
        } catch {
          // Fall back to the current origin if LAN detection is unavailable.
        }
      }

      const customerUrl = new URL("/customer", origin);
      customerUrl.searchParams.set("restaurant", restaurantName);
      const url = customerUrl.toString();

      try {
        const qrDataUrl = await QRCode.toDataURL(url, {
          errorCorrectionLevel: "M",
          margin: 2,
          width: 320,
          color: { dark: "#1a1512", light: "#ffffff" },
        });
        if (!cancelled) setHandoff({ customerUrl: url, qrDataUrl });
      } catch {
        if (!cancelled) setHandoff({ customerUrl: url, qrDataUrl: null });
      }
    };

    void buildHandoff();

    return () => {
      cancelled = true;
    };
  }, [restaurantName]);

  return (
    <Card data-print-customer-sign className="customer-handoff-sign">
      <div className="customer-handoff-layout">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-[var(--color-brand-text)]">Customer Tracker</p>
          <h3 className="font-display text-xl sm:text-2xl font-bold text-[var(--color-text-primary)] mt-1">
            Scan to track your order
          </h3>
          <p className="text-sm text-[var(--color-text-secondary)] mt-2">
            {restaurantName}
          </p>
          <p className="text-sm text-[var(--color-text-muted)] mt-1">
            Enter the order name from your receipt or pickup ticket.
          </p>

          <div data-no-print className="mt-5 space-y-3">
            {handoff ? (
              <div className="rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-2 overflow-hidden">
                <CopyableValue
                  value={handoff.customerUrl}
                  label="customer tracker link"
                  className="w-full justify-between text-sm text-[var(--color-text-secondary)]"
                />
              </div>
            ) : (
              <div className="h-10 rounded-[var(--radius-sm)] bg-[var(--color-surface-2)]" aria-hidden="true" />
            )}
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="secondary"
                disabled={!handoff}
                onClick={() => handoff && window.open(handoff.customerUrl, "_blank", "noopener,noreferrer")}
              >
                <ExternalLink className="w-4 h-4" aria-hidden="true" />
                Open tracker
              </Button>
              <Button type="button" disabled={!handoff} onClick={() => window.print()}>
                <Printer className="w-4 h-4" aria-hidden="true" />
                Print sign
              </Button>
            </div>
          </div>
        </div>

        <div className="customer-handoff-qr" aria-label="QR code for the customer order tracker">
          {handoff?.qrDataUrl ? (
            <Image
              src={handoff.qrDataUrl}
              alt="Customer tracker QR code"
              width={320}
              height={320}
              unoptimized
              className="w-full h-full"
            />
          ) : (
            <span className="text-xs text-[var(--color-text-muted)] text-center px-3">
              QR code unavailable. Use the printed link.
            </span>
          )}
        </div>
      </div>

      {handoff && (
        <p className="customer-handoff-print-url mt-5 break-all text-xs text-[var(--color-text-muted)]">
          {handoff.customerUrl}
        </p>
      )}
    </Card>
  );
};