"use client";

import {
  createContext,
  FC,
  ReactNode,
  useCallback,
  useContext,
  useRef,
  useState,
} from "react";

type ToastType = "success" | "error";
interface ToastState {
  message: string;
  type: ToastType;
}

const ToastContext = createContext<((message: string, type: ToastType) => void) | null>(null);

export const ToastProvider: FC<{ children: ReactNode }> = ({ children }) => {
  const [toast, setToast] = useState<ToastState | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = useCallback((message: string, type: ToastType) => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    setToast({ message, type });
    timeoutRef.current = setTimeout(() => setToast(null), 3000);
  }, []);

  return (
    <ToastContext.Provider value={showToast}>
      {children}
      {toast && (
        <div className="fixed top-4 right-4 z-50 animate-in slide-in-from-right duration-300 fade-in">
          <div
            className={`flex items-center gap-3 rounded-[var(--radius-sm)] shadow-lg p-4 text-white ${
              toast.type === "success" ? "bg-[var(--color-success)]" : "bg-[var(--color-danger)]"
            }`}
          >
            <span>{toast.message}</span>
            <button
              onClick={() => setToast(null)}
              className="text-xl font-bold leading-none"
              aria-label="Dismiss notification"
            >
              &times;
            </button>
          </div>
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
