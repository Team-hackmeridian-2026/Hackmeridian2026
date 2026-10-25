import { createContext, useCallback, useContext, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { TxLink } from "./ui";
import { isNetworkError } from "../lib/errors";
import type { TxResult } from "../stellar/contracts";

/** Fired on window after every confirmed transaction (any toast that carries a hash). */
export const TX_CONFIRMED_EVENT = "biolicensing:tx-confirmed";

type Toast = { id: number; kind: "success" | "error" | "info"; text: string; hash?: string };

type ToastApi = {
  push: (toast: Omit<Toast, "id">) => void;
  /** Runs a transaction, shows its progress, and returns its result (or null on failure). */
  run: <T>(label: string, action: () => Promise<TxResult<T>>) => Promise<TxResult<T> | null>;
};

const ToastContext = createContext<ToastApi | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  const [toasts, setToasts] = useState<Toast[]>([]);

  const remove = (id: number) => setToasts((all) => all.filter((t) => t.id !== id));

  const push = useCallback((toast: Omit<Toast, "id">) => {
    const id = Date.now() + Math.random();
    setToasts((all) => [...all, { ...toast, id }]);
    // A confirmed transaction may have moved EURC: let the header refresh its balance.
    if (toast.hash) window.dispatchEvent(new Event(TX_CONFIRMED_EVENT));
    setTimeout(() => remove(id), toast.kind === "error" ? 9000 : 12000);
  }, []);

  const run = useCallback(
    async <T,>(label: string, action: () => Promise<TxResult<T>>) => {
      try {
        const res = await action();
        push({ kind: "success", text: t("common.confirmed", { label }), hash: res.hash });
        return res;
      } catch (err) {
        const raw = err instanceof Error ? err.message : String(err);
        const message = isNetworkError(raw) ? t("common.networkError") : raw;
        push({ kind: "error", text: t("common.failed", { label, message }) });
        return null;
      }
    },
    [push, t],
  );

  return (
    <ToastContext.Provider value={{ push, run }}>
      {children}
      <div role="status" aria-live="polite" className="fixed right-4 bottom-4 z-50 flex w-96 max-w-[calc(100vw-2rem)] flex-col gap-2">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={`rounded-xl border px-4 py-3 text-sm shadow-card ${
              toast.kind === "error"
                ? "border-danger/40 bg-elevated text-danger"
                : toast.kind === "success"
                  ? "border-brand/40 bg-elevated text-ink"
                  : "border-line bg-elevated text-ink"
            }`}
          >
            <div className="flex items-start justify-between gap-3">
              <p>{toast.text}</p>
              <button onClick={() => remove(toast.id)} className="text-muted hover:text-ink" aria-label={t("common.close")}>
                ×
              </button>
            </div>
            {toast.hash && <TxLink hash={toast.hash} />}
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
