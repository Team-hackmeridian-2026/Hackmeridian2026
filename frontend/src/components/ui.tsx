import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { explorer } from "../config";
import { shortAddress } from "../lib/format";
import { isNetworkError } from "../lib/errors";
import { BurstHeading } from "./BurstHeading";

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

export type BadgeTone = "neutral" | "brand" | "amber" | "danger" | "navy" | "success";

export function Badge({ children, tone = "neutral", icon }: { children: ReactNode; tone?: BadgeTone; icon?: ReactNode }) {
  const styles = {
    neutral: "bg-subtle text-muted ring-1 ring-inset ring-line",
    brand: "bg-brand/15 text-brand-ink ring-1 ring-inset ring-brand/25",
    amber: "bg-amber/15 text-amber-dark ring-1 ring-inset ring-amber/30",
    danger: "bg-danger/10 text-danger ring-1 ring-inset ring-danger/25",
    navy: "bg-ink text-canvas",
    success: "bg-success/10 text-success ring-1 ring-inset ring-success/25",
  }[tone];
  return (
    <span className={cx("inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold", styles)}>
      {icon}
      {children}
    </span>
  );
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

/** Page header from the Figma: small eyebrow, very large title, intro below. */
export function SectionTitle({ eyebrow, title, children }: { eyebrow?: string; title: string; children?: ReactNode }) {
  return (
    <header className="flex flex-col gap-4">
      <div>
        {eyebrow && <p className="text-sm font-semibold text-muted">{eyebrow}</p>}
        <BurstHeading as="h1" className="mt-2 font-display text-5xl leading-[0.95] font-extrabold tracking-[-0.04em] text-balance sm:text-6xl" text={title} />
      </div>
      {children && <div className="max-w-2xl text-lg leading-relaxed text-muted">{children}</div>}
    </header>
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

/**
 * Neutral information or a prerequisite ("connect your wallet…"): not an error.
 * `warning` is the amber variant used when an action is blocked.
 */
export function Notice({ children, action, tone = "info" }: { children: ReactNode; action?: ReactNode; tone?: "info" | "warning" }) {
  const warning = tone === "warning";
  return (
    <div
      className={cx(
        "flex flex-wrap items-center justify-between gap-3 rounded-2xl border px-4 py-3 text-sm",
        warning ? "border-amber/50 bg-amber/10 text-ink" : "border-line bg-subtle text-ink",
      )}
    >
      <div className="flex items-start gap-2.5">
        {warning ? (
          <svg viewBox="0 0 24 24" className="mt-0.5 size-4 shrink-0 text-amber-dark" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M12 4 2.5 20h19z M12 10v4.5M12 17.5h.01" />
          </svg>
        ) : (
          <svg viewBox="0 0 24 24" className="mt-0.5 size-4 shrink-0 text-muted" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
            <circle cx="12" cy="12" r="9" />
            <path d="M12 7.5V12l3 2" />
          </svg>
        )}
        <div>{children}</div>
      </div>
      {action}
    </div>
  );
}

/** Small status glyphs shared by milestone pills, timelines and checklists. */
export function StatusIcon({ kind, className = "size-3.5" }: { kind: "pending" | "running" | "done" | "error" | "clock" | "refund" | "split"; className?: string }) {
  const common = { viewBox: "0 0 24 24", className, fill: "none", stroke: "currentColor", strokeWidth: 2.2, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, "aria-hidden": true };
  switch (kind) {
    case "running":
      return <svg {...common} className={cx(className, "animate-spin")}><path d="M12 3a9 9 0 1 0 9 9" /></svg>;
    case "done":
      return <svg {...common}><circle cx="12" cy="12" r="9" /><path d="m8 12.5 2.8 2.8L16 10" /></svg>;
    case "error":
      return <svg {...common}><circle cx="12" cy="12" r="9" /><path d="M12 7.5v5M12 16h.01" /></svg>;
    case "clock":
      return <svg {...common}><circle cx="12" cy="12" r="9" /><path d="M12 7.5V12l3 2" /></svg>;
    case "refund":
      return <svg {...common}><path d="M9 14 4 9l5-5" /><path d="M4 9h10a6 6 0 0 1 0 12h-3" /></svg>;
    case "split":
      return <svg {...common}><circle cx="12" cy="12" r="9" /><path d="M12 3v18" /></svg>;
    default:
      return <svg {...common}><circle cx="12" cy="12" r="9" strokeDasharray="3.2 3.2" /></svg>;
  }
}

/** Placeholder block shown while data loads. */
export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden className={cx("animate-pulse rounded-full bg-subtle", className)} />;
}
