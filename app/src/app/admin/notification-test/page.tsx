"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, CheckCircle2, TriangleAlert, XCircle } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { ToastProvider, useToast } from "@/components/ui/Toast";
import { fetchJson } from "@/lib/api-client";
import styles from "./page.module.css";

function NotificationControls() {
  const showToast = useToast();

  return (
    <div className={styles.buttonRow} aria-label="Notification test controls">
      <Button
        type="button"
        className={styles.successButton}
        onClick={() => showToast("Order saved successfully.", "success")}
      >
        <CheckCircle2 className="w-4 h-4" aria-hidden="true" />
        Push success
      </Button>
      <Button
        type="button"
        className={styles.warningButton}
        onClick={() => showToast("Order is nearing its target time.", "warning")}
      >
        <TriangleAlert className="w-4 h-4" aria-hidden="true" />
        Push warning
      </Button>
      <Button
        type="button"
        className={styles.dangerButton}
        onClick={() => showToast("Could not update the order.", "error")}
      >
        <XCircle className="w-4 h-4" aria-hidden="true" />
        Push error
      </Button>
    </div>
  );
}

export default function NotificationTestPage() {
  const router = useRouter();
  const [authorized, setAuthorized] = useState(false);

  useEffect(() => {
    let cancelled = false;

    fetchJson<{ authenticated: boolean; type?: string }>("/api/session")
      .then((session) => {
        if (cancelled) return;
        if (session.authenticated && session.type === "admin") {
          setAuthorized(true);
        } else {
          router.replace("/");
        }
      })
      .catch(() => router.replace("/"));

    return () => {
      cancelled = true;
    };
  }, [router]);

  if (!authorized) {
    return (
      <main className={styles.loading}>
        <span className={styles.loadingDot} aria-hidden="true" />
        Opening notification laboratory...
      </main>
    );
  }

  return (
    <ToastProvider>
      <main className={styles.lab}>
        <header className={styles.header}>
          <div className={styles.headerInner}>
            <Link href="/" className={styles.backLink}>
              <ArrowLeft className="w-4 h-4" aria-hidden="true" />
              Gateway
            </Link>
            <p className={styles.eyebrow}>Isolated notification laboratory</p>
            <h1>Bistro Glaze Notifications</h1>
            <p className={styles.intro}>
              Trigger the real notification system over varied restaurant surfaces. Nothing on this page changes
              production toast styling.
            </p>
            <NotificationControls />
          </div>
        </header>

        <section className={styles.lightSection}>
          <div className={styles.sectionInner}>
            <span>Light parchment</span>
            <h2>Service overview</h2>
            <div className={styles.cardGrid}>
              <article><strong>18</strong><p>Open orders</p></article>
              <article><strong>11m</strong><p>Average preparation</p></article>
              <article><strong>42</strong><p>Completed today</p></article>
            </div>
          </div>
        </section>

        <section className={styles.colorSection}>
          <div className={styles.colorStripeBrand}>Terracotta pass</div>
          <div className={styles.colorStripeOlive}>Olive pickup shelf</div>
          <div className={styles.colorStripeWarning}>Warm pending light</div>
        </section>

        <section className={styles.darkSection}>
          <div className={styles.sectionInner}>
            <span>Dark espresso</span>
            <h2>Dinner service</h2>
            <p>
              This region tests semantic tint, neutral ceramic highlights, icon contrast, and message readability over
              a dark moving-work surface.
            </p>
            <div className={styles.darkRows} aria-hidden="true">
              <i /><i /><i /><i />
            </div>
          </div>
        </section>

        <section className={styles.gridSection}>
          <div className={styles.sectionInner}>
            <span>Fine-detail stress area</span>
            <h2>Lines should remain visible beneath the material</h2>
          </div>
        </section>
      </main>
    </ToastProvider>
  );
}
