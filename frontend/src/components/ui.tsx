import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { explorer } from "../config";
import { shortAddress } from "../lib/format";
import { isNetworkError } from "../lib/errors";

const cx = (...classes: (string | false | undefined)[]) => classes.filter(Boolean).join(" ");

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "danger" | "ghost";
  size?: "sm" | "md";
  busy?: boolean;
};

type ButtonLook = { variant?: ButtonProps["variant"]; size?: ButtonProps["size"]; className?: string };

/** Button styles, also used to make a link look like a button (never nest a button in a link). */
export function buttonClass({ variant = "primary", size = "md", className }: ButtonLook = {}) {
  const styles = {
    primary: "bg-brand text-on-brand shadow-glow hover:brightness-110 active:brightness-95",
    secondary: "bg-card text-ink border border-line shadow-pill hover:border-ink/25",
    danger: "bg-card text-danger border border-danger/40 hover:bg-danger/10",
    ghost: "text-brand-ink hover:underline underline-offset-4",
  }[variant];
  const padding = variant === "ghost" ? "px-1 py-1 text-sm" : size === "sm" ? "px-3.5 py-1.5 text-xs" : "px-5 py-2.5 text-sm";
  return cx(
    "inline-flex items-center justify-center gap-2 rounded-full font-semibold",
    "transition duration-200 ease-out-soft",
    "disabled:cursor-not-allowed disabled:opacity-45 disabled:shadow-none disabled:hover:brightness-100",
    padding,
    styles,
    className,
  );
}

export function Button({ variant, size, busy, disabled, className, children, ...rest }: ButtonProps) {
  return (
    <button {...rest} disabled={disabled || busy} aria-busy={busy || undefined} className={buttonClass({ variant, size, className })}>
      {busy && <span className="size-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" />}
      {children}
    </button>
  );
}

export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cx("rounded-3xl border border-line bg-card p-6 shadow-card", className)}>{children}</div>;
}

export function Badge({ children, tone = "neutral" }: { children: ReactNode; tone?: "neutral" | "brand" | "amber" | "danger" | "navy" }) {
  const styles = {
    neutral: "bg-subtle text-muted ring-1 ring-inset ring-line",
    brand: "bg-brand/15 text-brand-ink ring-1 ring-inset ring-brand/25",
    amber: "bg-amber/15 text-amber-dark ring-1 ring-inset ring-amber/30",
    danger: "bg-danger/10 text-danger ring-1 ring-inset ring-danger/25",
    navy: "bg-ink text-canvas",
  }[tone];
  return <span className={cx("inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold", styles)}>{children}</span>;
}

export function Field({ label, hint, children }: { label: string; hint?: ReactNode; children: ReactNode }) {
  return (
    <label className="flex min-w-0 flex-col gap-1.5">
      <span className="text-sm font-semibold">{label}</span>
      {children}
      {hint && <span className="text-xs text-muted">{hint}</span>}
    </label>
  );
}

export function Input(props: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={cx(
        "rounded-xl border border-line bg-field px-3.5 py-2.5 text-sm text-ink transition duration-200 placeholder:text-muted/70",
        "outline-none focus:border-brand focus:ring-4 focus:ring-brand/15 disabled:opacity-60",
        props.className,
      )}
    />
  );
}

export function Address({ value, label }: { value: string; label?: string }) {
  return (
    <a href={explorer.account(value)} target="_blank" rel="noreferrer" className="font-mono text-sm text-brand-ink hover:underline" title={value}>
      {label ?? shortAddress(value)}
    </a>
  );
}

export function TxLink({ hash }: { hash: string }) {
  const { t } = useTranslation();
  if (!hash) return null;
  return (
    <a href={explorer.tx(hash)} target="_blank" rel="noreferrer" className="text-xs font-semibold text-brand-ink hover:underline">
      {t("common.viewTx")}
    </a>
  );
}

export function SectionTitle({ eyebrow, title, children }: { eyebrow?: string; title: string; children?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div>
        {eyebrow && <p className="text-sm font-semibold text-brand-ink">{eyebrow}</p>}
        <h2 className="mt-1 font-display text-3xl font-extrabold tracking-tight sm:text-4xl">{title}</h2>
      </div>
      {children}
    </div>
  );
}

export function Spinner({ label }: { label?: string }) {
  const { t } = useTranslation();
  return (
    <div role="status" className="flex items-center gap-3 py-10 text-sm text-muted">
      <span aria-hidden className="size-4 animate-spin rounded-full border-2 border-brand-ink border-t-transparent" />
      {label ?? t("common.loading")}
    </div>
  );
}

/** Error message; raw network failures are replaced by a readable sentence, with an optional retry. */
export function ErrorBox({ message, onRetry }: { message: string; onRetry?: () => void }) {
  const { t } = useTranslation();
  const text = isNetworkError(message) ? t("common.networkError") : message;
  return (
    <div
      role="alert"
      className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger"
    >
      <p>{text}</p>
      {onRetry && (
        <Button variant="secondary" size="sm" onClick={onRetry}>
          {t("common.retry")}
        </Button>
      )}
    </div>
  );
}

/** Neutral information or a prerequisite ("connect your wallet…"): not an error. */
export function Notice({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-line bg-card px-4 py-3 text-sm text-ink shadow-card">
      <div className="flex items-start gap-2">
        <svg viewBox="0 0 24 24" className="mt-0.5 size-4 shrink-0 text-brand-ink" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
          <circle cx="12" cy="12" r="9" />
          <path d="M12 11v5M12 8h.01" />
        </svg>
        <div>{children}</div>
      </div>
      {action}
    </div>
  );
}

/** Placeholder block shown while data loads. */
export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden className={cx("animate-pulse rounded-full bg-subtle", className)} />;
}
