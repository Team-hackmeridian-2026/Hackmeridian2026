import { createContext, useCallback, useContext, useState, type ReactNode } from "react";
import { TxLink } from "./ui";
import type { TxResult } from "../stellar/contracts";

type Toast = { id: number; kind: "success" | "error" | "info"; text: string; hash?: string };

type ToastApi = {
  push: (toast: Omit<Toast, "id">) => void;
  /** Runs a transaction, shows its progress, and returns its result (or null on failure). */
  run: <T>(label: string, action: () => Promise<TxResult<T>>) => Promise<TxResult<T> | null>;
};

const ToastContext = createContext<ToastApi | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const remove = (id: number) => setToasts((all) => all.filter((t) => t.id !== id));

  const push = useCallback((toast: Omit<Toast, "id">) => {
    const id = Date.now() + Math.random();
    setToasts((all) => [...all, { ...toast, id }]);
    setTimeout(() => remove(id), toast.kind === "error" ? 9000 : 12000);
  }, []);

  const run = useCallback(
    async <T,>(label: string, action: () => Promise<TxResult<T>>) => {
      try {
        const res = await action();
        push({ kind: "success", text: `${label}: confirmed on Stellar`, hash: res.hash });
        return res;
      } catch (err) {
        push({ kind: "error", text: `${label}: ${err instanceof Error ? err.message : String(err)}` });
        return null;
      }
    },
    [push],
  );

  return (
    <ToastContext.Provider value={{ push, run }}>
      {children}
      <div className="fixed right-4 bottom-4 z-50 flex w-96 max-w-[calc(100vw-2rem)] flex-col gap-2">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`rounded-xl border px-4 py-3 text-sm shadow-lg ${
              t.kind === "error"
                ? "border-danger/30 bg-white text-danger"
                : t.kind === "success"
                  ? "border-teal/40 bg-white text-ink"
                  : "border-line bg-white text-ink"
            }`}
          >
            <div className="flex items-start justify-between gap-3">
              <p>{t.text}</p>
              <button onClick={() => remove(t.id)} className="text-muted hover:text-ink" aria-label="Close">
                ×
              </button>
            </div>
            {t.hash && <TxLink hash={t.hash} />}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToasts(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToasts must be used inside ToastProvider");
  return ctx;
}
