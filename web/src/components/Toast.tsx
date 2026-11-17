"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { IconAlert, IconCheckCircle, IconInfo, IconX } from "./icons";

export type ToastTone = "success" | "error" | "info";
interface ToastItem {
  id: number;
  message: string;
  tone: ToastTone;
}

type ToastFn = (message: string, tone?: ToastTone) => void;

const ToastContext = createContext<ToastFn>(() => {});

/** `const toast = useToast(); toast("Saved")` — shows a small auto-dismissing notification. */
export function useToast(): ToastFn {
  return useContext(ToastContext);
}

const toneStyles: Record<ToastTone, { ring: string; icon: ReactNode }> = {
  success: { ring: "text-sent-fg", icon: <IconCheckCircle /> },
  error: { ring: "text-failed-fg", icon: <IconAlert /> },
  info: { ring: "text-scheduled-fg", icon: <IconInfo /> },
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const nextId = useRef(1);
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>());

  const dismiss = useCallback((id: number) => {
    setItems((list) => list.filter((t) => t.id !== id));
    const timer = timers.current.get(id);
    if (timer) clearTimeout(timer);
    timers.current.delete(id);
  }, []);

  const toast = useCallback<ToastFn>(
    (message, tone = "success") => {
      const id = nextId.current++;
      setItems((list) => [...list.slice(-3), { id, message, tone }]);
      timers.current.set(
        id,
        setTimeout(() => dismiss(id), tone === "error" ? 7000 : 4000),
      );
    },
    [dismiss],
  );

  useEffect(() => {
    const map = timers.current;
    return () => map.forEach((t) => clearTimeout(t));
  }, []);

  return (
    <ToastContext.Provider value={toast}>
      {children}
      <div aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-0 z-[60] flex flex-col items-center gap-2 p-4 sm:items-end sm:p-6">
        {items.map((t) => (
          <div
            key={t.id}
            role={t.tone === "error" ? "alert" : "status"}
            className="toast-in pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-md border border-border bg-surface px-3 py-2.5 text-[13px] text-text shadow-sm"
          >
            <span className={`mt-0.5 shrink-0 ${toneStyles[t.tone].ring}`}>{toneStyles[t.tone].icon}</span>
            <span className="min-w-0 flex-1 break-words">{t.message}</span>
            <button type="button" aria-label="Dismiss" className="shrink-0 rounded-sm text-muted hover:text-text" onClick={() => dismiss(t.id)}>
              <IconX />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
