"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { fetchJson } from "@/lib/api-client";

export interface Order {
  id: number;
  restaurant_name: string;
  order_number: string;
  status: string;
  created_at: string;
  received_at: string | null;
  preparing_at: string | null;
  complete_at: string | null;
  acknowledged_at: string | null;
  deleted_at: string | null;
}

export interface Restaurant {
  id: number;
  name: string;
  password?: string;
  raw_password?: string;
  complete_cap_hours?: number;
}

export type SortDirection = "asc" | "desc";
export type OrderSortKey = "id" | "created_at";

export interface OrderQueryParams {
  includeDeleted: boolean;
  orderSearch: string;
  restaurantNames: string[];
  statusFilter: string[];
  sort: { key: OrderSortKey; direction: SortDirection } | null;
}

/**
 * Rows this far past the loaded end trigger fetching the next page; rows
 * this close to the loaded start (once some have been evicted) trigger
 * fetching the previous page. Kept well under PAGE_SIZE (150, server-side)
 * so a fetch always lands well before the user can actually scroll past the
 * edge of what's loaded.
 */
export const PREFETCH_ROWS = 40;
/**
 * Hard cap on rows kept in memory at once. Once a fetch would push past
 * this, the opposite end is evicted by the same amount -- this is what keeps
 * a scroll through 100k+ orders from ever growing the DOM/React state
 * without bound, matching how Gmail/Discord/iMessage keep only a sliding
 * window of a huge list mounted rather than all of it.
 */
const MAX_LOADED_ROWS = 450;

type CursorState = {
  rows: Order[];
  topCursor: string | null;
  bottomCursor: string | null;
  hasMoreTop: boolean;
  hasMoreBottom: boolean;
};

const EMPTY_CURSOR_STATE: CursorState = {
  rows: [],
  topCursor: null,
  bottomCursor: null,
  hasMoreTop: false,
  hasMoreBottom: false,
};

function cursorValue(row: Order, sortKey: OrderSortKey): string {
  return sortKey === "id" ? String(row.id) : row.created_at;
}

interface PageResponse {
  rows: Order[];
  hasMore: boolean;
  restaurants?: Restaurant[];
  deletedCount?: number;
}

/**
 * Drives admin/db's windowed Orders table: fetches pages from the
 * server-paginated /api/dev/db, keeps only a bounded sliding window of rows
 * in React state, and reloads from scratch whenever the active
 * search/filter/sort/includeDeleted actually changes. All filtering and
 * sorting happens in Postgres (via the query params sent on every request),
 * never client-side over a partial in-memory array -- otherwise a search
 * could only ever "find" whatever happened to already be loaded, and a
 * search term could go blind to anything scrolled/evicted out of memory.
 */
export function useWindowedOrders(
  params: OrderQueryParams,
  onFirstLoad?: (data: { restaurants?: Restaurant[]; deletedCount?: number }) => void,
  enabled = true,
) {
  const [state, setState] = useState<CursorState>(EMPTY_CURSOR_STATE);
  const [isLoadingTop, setIsLoadingTop] = useState(false);
  const [isLoadingBottom, setIsLoadingBottom] = useState(false);
  const [isInitialLoading, setIsInitialLoading] = useState(true);
  const requestIdRef = useRef(0);
  const stateRef = useRef(state);
  const paramsRef = useRef(params);
  const onFirstLoadRef = useRef(onFirstLoad);
  // Synchronous in-flight guards for loadMoreTop/loadMoreBottom -- a plain
  // ref, NOT the isLoadingTop/isLoadingBottom state above. A fast fling-
  // scroll can fire many scroll events before React commits the state
  // update from setIsLoadingBottom(true), and each of those events would
  // otherwise still see the STALE isLoadingBottom=false closure (state
  // updates aren't synchronous), letting multiple redundant page fetches
  // race off in parallel against /api/dev/db. Refs update synchronously the
  // instant they're written, so this closes that race outright. The state
  // versions stay purely for driving the loading-spinner UI.
  const loadingTopRef = useRef(false);
  const loadingBottomRef = useRef(false);
  // stateRef itself is NOT synced here -- reload/loadMoreTop/loadMoreBottom
  // each write stateRef.current synchronously at the exact moment they
  // compute a new state (see their own comments), which must happen before
  // this effect's next run to stay race-free under rapid repeated calls.
  useEffect(() => {
    paramsRef.current = params;
    onFirstLoadRef.current = onFirstLoad;
  });

  const buildUrl = useCallback(
    (opts: { cursor: string | null; direction: "forward" | "backward"; wantCounts?: boolean }) => {
      const q = new URLSearchParams();
      q.set("includeDeleted", paramsRef.current.includeDeleted ? "1" : "0");
      if (paramsRef.current.orderSearch) q.set("orderSearch", paramsRef.current.orderSearch);
      if (paramsRef.current.restaurantNames.length > 0) {
        q.set("restaurantNames", paramsRef.current.restaurantNames.join(","));
      }
      if (paramsRef.current.statusFilter.length > 0) {
        q.set("statusFilter", paramsRef.current.statusFilter.join(","));
      }
      if (paramsRef.current.sort) {
        q.set("sortKey", paramsRef.current.sort.key);
        q.set("sortDirection", paramsRef.current.sort.direction);
      }
      if (opts.cursor !== null) q.set("cursor", opts.cursor);
      q.set("direction", opts.direction);
      if (opts.wantCounts) q.set("wantCounts", "1");
      return `/api/dev/db?${q.toString()}`;
    },
    [],
  );

  // Full reset: throws away the current window and loads page one fresh --
  // used on mount and whenever search/filter/sort/includeDeleted actually
  // change, since evicted/loaded rows from the PREVIOUS query aren't valid
  // matches under a new one.
  const reload = useCallback(async () => {
    const myRequestId = ++requestIdRef.current;
    setIsInitialLoading(true);
    try {
      const sortKey = paramsRef.current.sort?.key ?? "id";
      const data = await fetchJson<PageResponse>(
        buildUrl({ cursor: null, direction: "forward", wantCounts: true }),
      );
      if (myRequestId !== requestIdRef.current) return; // superseded by a newer reload
      const rows = data.rows;
      const nextState: CursorState = {
        rows,
        topCursor: rows.length > 0 ? cursorValue(rows[0], sortKey) : null,
        bottomCursor: rows.length > 0 ? cursorValue(rows[rows.length - 1], sortKey) : null,
        hasMoreTop: false,
        hasMoreBottom: data.hasMore,
      };
      // Written synchronously here, not left to the effect below -- that
      // effect only runs after this render commits, which lags behind a
      // rapid-fire sequence of loadMoreTop/loadMoreBottom calls (see their
      // own comments). stateRef must be immediately authoritative the
      // instant new data arrives, not one commit late.
      stateRef.current = nextState;
      setState(nextState);
      onFirstLoadRef.current?.(data);
    } finally {
      if (myRequestId === requestIdRef.current) setIsInitialLoading(false);
    }
  }, [buildUrl]);

  // Arrays are joined into plain strings so a same-content-different-
  // reference filter array doesn't trigger a needless reload -- only the
  // *identity* of the query (what it actually asks the server for) should.
  const restaurantNamesKey = params.restaurantNames.join(",");
  const statusFilterKey = params.statusFilter.join(",");
  const sortKey = params.sort?.key;
  const sortDirectionKey = params.sort?.direction;

  useEffect(() => {
    // reload() already reads the latest params via paramsRef; this effect's
    // job is purely to trigger it when the query identity above changes.
    if (!enabled) return;
    void reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reload is intentionally omitted: it's stable via useCallback and reads params fresh via paramsRef, not via closure.
  }, [enabled, params.includeDeleted, params.orderSearch, restaurantNamesKey, statusFilterKey, sortKey, sortDirectionKey]);

  const loadMoreBottom = useCallback(async () => {
    const current = stateRef.current;
    if (!current.hasMoreBottom || loadingBottomRef.current) return;
    loadingBottomRef.current = true;
    const myRequestId = requestIdRef.current;
    setIsLoadingBottom(true);
    try {
      const sortKey = paramsRef.current.sort?.key ?? "id";
      const data = await fetchJson<PageResponse>(
        buildUrl({ cursor: current.bottomCursor, direction: "forward" }),
      );
      if (myRequestId !== requestIdRef.current) return; // a reload superseded this in-flight page
      // Computed from stateRef.current (this hook's own always-current source
      // of truth), not a setState functional updater's `prev` -- prev is
      // guaranteed current for REACT's own purposes, but loadMoreTop/
      // loadMoreBottom read stateRef.current directly to decide the next
      // cursor to fetch, so stateRef itself must be updated synchronously
      // here, in the same tick the new page arrives, not deferred to an
      // effect that runs a commit later (see the mount effect's comment).
      const prev = stateRef.current;
      let rows = [...prev.rows, ...data.rows];
      let hasMoreTop = prev.hasMoreTop;
      if (rows.length > MAX_LOADED_ROWS) {
        const evictCount = rows.length - MAX_LOADED_ROWS;
        rows = rows.slice(evictCount);
        hasMoreTop = true;
      }
      const nextState: CursorState = {
        rows,
        topCursor: rows.length > 0 ? cursorValue(rows[0], sortKey) : prev.topCursor,
        bottomCursor: data.rows.length > 0
          ? cursorValue(data.rows[data.rows.length - 1], sortKey)
          : prev.bottomCursor,
        hasMoreTop,
        hasMoreBottom: data.hasMore,
      };
      stateRef.current = nextState;
      setState(nextState);
    } finally {
      loadingBottomRef.current = false;
      if (myRequestId === requestIdRef.current) setIsLoadingBottom(false);
    }
  }, [buildUrl]);

  const loadMoreTop = useCallback(async () => {
    const current = stateRef.current;
    if (!current.hasMoreTop || loadingTopRef.current) return;
    loadingTopRef.current = true;
    const myRequestId = requestIdRef.current;
    setIsLoadingTop(true);
    try {
      const sortKey = paramsRef.current.sort?.key ?? "id";
      const data = await fetchJson<PageResponse>(
        buildUrl({ cursor: current.topCursor, direction: "backward" }),
      );
      if (myRequestId !== requestIdRef.current) return;
      // See loadMoreBottom's own comment: computed from stateRef.current and
      // written back to it synchronously, not via a setState functional
      // updater's `prev` -- this hook's OWN cursor logic reads stateRef
      // directly before firing the next fetch, so stateRef must be
      // immediately authoritative, not one commit/effect behind.
      const prev = stateRef.current;
      let rows = [...data.rows, ...prev.rows];
      let hasMoreBottom = prev.hasMoreBottom;
      if (rows.length > MAX_LOADED_ROWS) {
        const evictCount = rows.length - MAX_LOADED_ROWS;
        rows = rows.slice(0, rows.length - evictCount);
        hasMoreBottom = true;
      }
      const nextState: CursorState = {
        rows,
        topCursor: data.rows.length > 0 ? cursorValue(data.rows[0], sortKey) : prev.topCursor,
        bottomCursor: rows.length > 0 ? cursorValue(rows[rows.length - 1], sortKey) : prev.bottomCursor,
        hasMoreTop: data.hasMore,
        hasMoreBottom,
      };
      stateRef.current = nextState;
      setState(nextState);
    } finally {
      loadingTopRef.current = false;
      if (myRequestId === requestIdRef.current) setIsLoadingTop(false);
    }
  }, [buildUrl]);

  return {
    rows: state.rows,
    hasMoreTop: state.hasMoreTop,
    hasMoreBottom: state.hasMoreBottom,
    isLoadingTop,
    isLoadingBottom,
    isInitialLoading,
    loadMoreTop,
    loadMoreBottom,
    reload,
  };
}
