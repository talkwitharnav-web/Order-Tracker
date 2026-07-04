"use client";

import {
  createContext,
  FC,
  ReactNode,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { CheckCircle2, XCircle, X } from "lucide-react";

type ToastType = "success" | "error";
interface ToastItem {
  id: number;
  message: string;
  type: ToastType;
  createdAt: number;
  removing?: boolean;
}

const AUTO_DISMISS_MS = 4000;
const REMOVE_ANIMATION_MS = 250;

const ToastContext = createContext<((message: string, type: ToastType) => void) | null>(null);

let nextId = 1;

const ToastCard: FC<{ item: ToastItem; onDismiss: () => void; style?: React.CSSProperties }> = ({
  item,
  onDismiss,
  style,
}) => (
  <div
    style={style}
    className={`flex items-center gap-3 rounded-[var(--radius-sm)] shadow-lg p-4 text-white w-80 max-w-[90vw] ${
      item.type === "success" ? "bg-[var(--color-success)]" : "bg-[var(--color-danger)]"
    } ${item.removing ? "animate-notification-pop-out" : "animate-notification-pop-in"}`}
  >
    {item.type === "success" ? (
      <CheckCircle2 className="w-5 h-5 shrink-0" />
    ) : (
      <XCircle className="w-5 h-5 shrink-0" />
    )}
    <span className="flex-1 text-sm">{item.message}</span>
    <button
      onClick={onDismiss}
      className="shrink-0 opacity-80 hover:opacity-100 transition-opacity"
      aria-label="Dismiss notification"
    >
      <X className="w-4 h-4" />
    </button>
  </div>
);

export const ToastProvider: FC<{ children: ReactNode }> = ({ children }) => {
  const [items, setItems] = useState<ToastItem[]>([]);
  const [expanded, setExpanded] = useState(false);
  const timeoutsRef = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map());

  const removeImmediately = useCallback((id: number) => {
    const t = timeoutsRef.current.get(id);
    if (t) clearTimeout(t);
    timeoutsRef.current.delete(id);
    setItems((prev) => prev.filter((i) => i.id !== id));
  }, []);

  const startAutoDismiss = useCallback(
    (id: number) => {
      const timer = setTimeout(() => {
        // Play the exit animation, then remove from state.
        setItems((prev) => prev.map((i) => (i.id === id ? { ...i, removing: true } : i)));
        setTimeout(() => removeImmediately(id), REMOVE_ANIMATION_MS);
      }, AUTO_DISMISS_MS);
      timeoutsRef.current.set(id, timer);
    },
    [removeImmediately],
  );

  const showToast = useCallback(
    (message: string, type: ToastType) => {
      const id = nextId++;
      setItems((prev) => [...prev, { id, message, type, createdAt: Date.now() }]);
      // Only auto-dismiss while collapsed — if the user has the group open,
      // don't yank things away while they're reading (matches macOS).
      if (!expanded) startAutoDismiss(id);
    },
    [expanded, startAutoDismiss],
  );

  // When collapsing (or on first mount of items while collapsed), make sure
  // every visible item has an active auto-dismiss timer; when expanding,
  // pause all of them.
  useEffect(() => {
    if (expanded) {
      timeoutsRef.current.forEach((t) => clearTimeout(t));
      timeoutsRef.current.clear();
    } else {
      items.forEach((item) => {
        if (!timeoutsRef.current.has(item.id) && !item.removing) {
          startAutoDismiss(item.id);
        }
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expanded]);

  useEffect(() => {
    const timeouts = timeoutsRef.current;
    return () => {
      timeouts.forEach((t) => clearTimeout(t));
    };
  }, []);

  const dismissOne = (id: number) => {
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, removing: true } : i)));
    setTimeout(() => {
      removeImmediately(id);
      setItems((prev) => {
        if (prev.length <= 1) setExpanded(false);
        return prev;
      });
    }, REMOVE_ANIMATION_MS);
  };

  const dismissAll = () => {
    setItems((prev) => prev.map((i) => ({ ...i, removing: true })));
    setTimeout(() => {
      timeoutsRef.current.forEach((t) => clearTimeout(t));
      timeoutsRef.current.clear();
      setItems([]);
      setExpanded(false);
    }, REMOVE_ANIMATION_MS);
  };

  const activeCount = items.length;

  return (
    <ToastContext.Provider value={showToast}>
      {children}
      {activeCount > 0 && (
        <div className="fixed top-4 right-4 z-50 flex flex-col items-end">
          {expanded || activeCount === 1 ? (
            <div className="flex flex-col gap-2">
              {items.map((item) => (
                <ToastCard key={item.id} item={item} onDismiss={() => dismissOne(item.id)} />
              ))}
              {activeCount > 1 && (
                <button
                  onClick={() => setExpanded(false)}
                  className="self-end text-xs text-[var(--color-text-secondary)] hover:text-white transition-colors mt-1"
                >
                  Collapse
                </button>
              )}
            </div>
          ) : (
            <div
              className="relative cursor-pointer"
              style={{ height: 76, width: 320 }}
              onClick={() => setExpanded(true)}
              role="button"
              tabIndex={0}
              aria-label={`${activeCount} notifications, click to expand`}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") setExpanded(true);
              }}
            >
              {items
                .slice(-3)
                .reverse()
                .map((item, depth) => (
                  <ToastCard
                    key={item.id}
                    item={item}
                    // Collapsed stack: "x" clears the whole group, not just this one.
                    onDismiss={dismissAll}
                    style={{
                      position: "absolute",
                      top: depth * 8,
                      right: 0,
                      left: 0,
                      transform: `scale(${1 - depth * 0.05})`,
                      zIndex: 10 - depth,
                      opacity: depth === 0 ? 1 : 0.7 - depth * 0.15,
                    }}
                  />
                ))}
              {activeCount > 1 && (
                <span className="absolute -top-2 -right-2 z-20 bg-[var(--color-brand)] text-white text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center">
                  {activeCount}
                </span>
              )}
            </div>
          )}
        </div>
      )}
    </ToastContext.Provider>
  );
};

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within a ToastProvider");
  return ctx;
}
