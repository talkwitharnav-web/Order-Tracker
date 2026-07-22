"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Bell,
  CalendarDays,
  CheckCircle2,
  ChefHat,
  Clock3,
  Flame,
  MapPin,
  Search,
  SlidersHorizontal,
  Sparkles,
  TriangleAlert,
  UserRound,
  Utensils,
} from "lucide-react";
import { fetchJson } from "@/lib/api-client";
import styles from "./page.module.css";

const ORDERS = [
  { id: "A-104", table: "Patio 3", item: "Roasted tomato rigatoni", status: "Preparing", tone: "warm" },
  { id: "A-105", table: "Counter 2", item: "Olive and herb flatbread", status: "Received", tone: "neutral" },
  { id: "A-106", table: "Dining 8", item: "Citrus salmon plate", status: "Ready", tone: "success" },
];

const ACTIVITY = [
  { icon: CheckCircle2, title: "Order A-103 picked up", detail: "Confirmed by Mara · 2 minutes ago", tone: "success" },
  { icon: Flame, title: "Order A-104 moved to Preparing", detail: "Updated by Jules · 5 minutes ago", tone: "warm" },
  { icon: TriangleAlert, title: "Patio order nearing target time", detail: "A-101 has been open for 18 minutes", tone: "warning" },
  { icon: Bell, title: "New customer order received", detail: "Order A-106 · Dining 8", tone: "brand" },
];

export default function GlazeTestingPage() {
  const router = useRouter();
  const [authorized, setAuthorized] = useState(false);
  const [specimenPosition, setSpecimenPosition] = useState<{ x: number; y: number } | null>(null);
  const [isDraggingSpecimen, setIsDraggingSpecimen] = useState(false);
  const dragOffset = useRef({ x: 0, y: 0 });

  const clampSpecimenPosition = (x: number, y: number, width: number, height: number) => ({
    x: Math.min(Math.max(0, x), window.innerWidth - width),
    y: Math.min(Math.max(0, y), window.innerHeight - height),
  });

  const handleSpecimenPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    const specimen = event.currentTarget;
    const rect = specimen.getBoundingClientRect();
    dragOffset.current = { x: event.clientX - rect.left, y: event.clientY - rect.top };
    setSpecimenPosition({ x: rect.left, y: rect.top });
    setIsDraggingSpecimen(true);
    specimen.setPointerCapture(event.pointerId);
  };

  const handleSpecimenPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;
    const rect = event.currentTarget.getBoundingClientRect();
    setSpecimenPosition(clampSpecimenPosition(
      event.clientX - dragOffset.current.x,
      event.clientY - dragOffset.current.y,
      rect.width,
      rect.height,
    ));
  };

  const handleSpecimenPointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    setIsDraggingSpecimen(false);
  };

  const handleSpecimenKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const direction = {
      ArrowLeft: [-1, 0],
      ArrowRight: [1, 0],
      ArrowUp: [0, -1],
      ArrowDown: [0, 1],
    }[event.key];
    if (!direction) return;

    event.preventDefault();
    const rect = event.currentTarget.getBoundingClientRect();
    const distance = event.shiftKey ? 10 : 2;
    setSpecimenPosition(clampSpecimenPosition(
      rect.left + direction[0] * distance,
      rect.top + direction[1] * distance,
      rect.width,
      rect.height,
    ));
  };

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
        Opening glaze laboratory...
      </main>
    );
  }

  return (
    <main className={styles.lab}>
      <div className={styles.backdropArt} aria-hidden="true">
        <span className={styles.artDiscOne} />
        <span className={styles.artDiscTwo} />
        <span className={styles.artGrid} />
      </div>

      <div
        className={`${styles.glazeSpecimen} ${isDraggingSpecimen ? styles.glazeSpecimenDragging : ""}`}
        role="button"
        tabIndex={0}
        aria-label="Draggable Bistro Glaze material specimen"
        data-testid="glaze-specimen"
        onPointerDown={handleSpecimenPointerDown}
        onPointerMove={handleSpecimenPointerMove}
        onPointerUp={handleSpecimenPointerUp}
        onPointerCancel={handleSpecimenPointerUp}
        onKeyDown={handleSpecimenKeyDown}
        style={{
          backdropFilter: "var(--specimen-backdrop-filter)",
          WebkitBackdropFilter: "var(--specimen-backdrop-filter)",
          ...(specimenPosition && {
            left: specimenPosition.x,
            top: specimenPosition.y,
            transform: "none",
          }),
        }}
      />

      <header className={styles.hero}>
        <div className={styles.heroInner}>
          <Link href="/" className={styles.backLink}>
            <ArrowLeft size={17} aria-hidden="true" />
            Gateway
          </Link>

          <div className={styles.eyebrow}>
            <Sparkles size={15} aria-hidden="true" />
            Isolated material laboratory
          </div>
          <h1>Bistro Glaze Playground</h1>
          <p>
            A scrollable mock restaurant workspace for studying one fixed material specimen over changing colors,
            text density, icons, and motion beneath it.
          </p>

          <div className={styles.heroMeta}>
            <span><MapPin size={15} aria-hidden="true" /> Test Kitchen</span>
            <span><Clock3 size={15} aria-hidden="true" /> Dinner service</span>
            <span><UserRound size={15} aria-hidden="true" /> 4 staff online</span>
          </div>
        </div>
      </header>

      <div className={styles.content}>
        <section className={styles.controlBand} aria-label="Mock page controls">
          <label className={styles.searchField}>
            <Search size={17} aria-hidden="true" />
            <span className={styles.srOnly}>Search sample content</span>
            <input type="search" placeholder="Search orders, tables, or guests..." />
          </label>
          <button type="button" className={styles.filterButton}>
            <SlidersHorizontal size={17} aria-hidden="true" />
            Filters
          </button>
          <button type="button" className={styles.primaryButton}>
            <Bell size={17} aria-hidden="true" />
            Notify kitchen
          </button>
        </section>

        <section className={styles.metrics} aria-label="Mock restaurant metrics">
          <article className={styles.metricCard}>
            <span className={styles.metricIcon}><Utensils size={20} /></span>
            <div><strong>18</strong><span>Open orders</span></div>
            <small>3 added this hour</small>
          </article>
          <article className={styles.metricCard}>
            <span className={`${styles.metricIcon} ${styles.metricWarm}`}><Flame size={20} /></span>
            <div><strong>11m</strong><span>Average preparation</span></div>
            <small>Within tonight&apos;s target</small>
          </article>
          <article className={styles.metricCard}>
            <span className={`${styles.metricIcon} ${styles.metricOlive}`}><CheckCircle2 size={20} /></span>
            <div><strong>42</strong><span>Completed today</span></div>
            <small>96% collected on time</small>
          </article>
        </section>

        <section className={styles.section}>
          <div className={styles.sectionHeading}>
            <div><span>Live queue</span><h2>Orders in motion</h2></div>
            <button type="button">View board</button>
          </div>
          <div className={styles.orderGrid}>
            {ORDERS.map((order) => (
              <article className={styles.orderCard} key={order.id}>
                <div className={styles.orderTopline}>
                  <span>{order.id}</span>
                  <span className={`${styles.status} ${styles[order.tone]}`}>{order.status}</span>
                </div>
                <h3>{order.item}</h3>
                <p>{order.table}</p>
                <div className={styles.progressTrack}><span className={styles[`progress_${order.tone}`]} /></div>
                <footer><Clock3 size={14} /> Updated moments ago</footer>
              </article>
            ))}
          </div>
        </section>

        <section className={styles.splitSection}>
          <article className={styles.schedulePanel}>
            <div className={styles.sectionHeading}>
              <div><span>Service rhythm</span><h2>Tonight&apos;s timeline</h2></div>
              <CalendarDays size={20} aria-hidden="true" />
            </div>
            <div className={styles.timeline}>
              {[
                ["5:00", "Doors open", "First seating arrives"],
                ["6:30", "Dinner peak", "Kitchen capacity at 82%"],
                ["8:15", "Late seating", "Patio service winds down"],
                ["10:00", "Close", "Final pickup and cleanup"],
              ].map(([time, title, detail]) => (
                <div className={styles.timelineRow} key={time}>
                  <time>{time}</time><span className={styles.timelineMarker} />
                  <div><strong>{title}</strong><p>{detail}</p></div>
                </div>
              ))}
            </div>
          </article>

          <article className={styles.notePanel}>
            <ChefHat size={28} aria-hidden="true" />
            <span>Chef&apos;s note</span>
            <h2>Keep the pass calm and the plates warm.</h2>
            <p>
              This darker block passes directly beneath the fixed specimen, making edge highlights and semantic tint
              shifts easier to judge while scrolling.
            </p>
            <button type="button">Acknowledge note</button>
          </article>
        </section>

        <section className={styles.section}>
          <div className={styles.sectionHeading}>
            <div><span>Recent signals</span><h2>Kitchen activity</h2></div>
            <span className={styles.liveIndicator}>Live</span>
          </div>
          <div className={styles.activityList}>
            {ACTIVITY.map(({ icon: Icon, title, detail, tone }) => (
              <article className={styles.activityRow} key={title}>
                <span className={`${styles.activityIcon} ${styles[tone]}`}><Icon size={18} /></span>
                <div><strong>{title}</strong><p>{detail}</p></div>
                <button type="button" aria-label={`Open ${title}`}>View</button>
              </article>
            ))}
          </div>
        </section>

        <section className={styles.longRead}>
          <span>Material stress zone</span>
          <h2>Why this page keeps going</h2>
          <p>
            The fixed pill needs to pass over parchment, white cards, semantic colors, dense text, dark espresso, thin
            dividers, icons, and decorative patterns. Scrolling this deliberately varied page provides those conditions
            without changing any production screen.
          </p>
          <div className={styles.sampleStripes} aria-hidden="true">
            <span /><span /><span /><span /><span />
          </div>
          <p>
            Later experiments can change only the pill&apos;s local module: body opacity, backdrop blur, edge reflectance,
            sheen width, semantic tint, and shadow elevation. If an experiment fails, deleting this route removes the
            entire laboratory without leaving selectors behind elsewhere.
          </p>
        </section>

        <footer className={styles.pageFooter}>
          <Sparkles size={18} aria-hidden="true" />
          End of specimen track
        </footer>
      </div>
    </main>
  );
}