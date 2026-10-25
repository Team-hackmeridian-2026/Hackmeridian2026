import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { explorer } from "../config";
import { shortAddress } from "../lib/format";

const cx = (...classes: (string | false | undefined)[]) => classes.filter(Boolean).join(" ");

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "danger" | "ghost";
  size?: "sm" | "md";
  busy?: boolean;
};

export function Button({ variant = "primary", size = "md", busy, disabled, className, children, ...rest }: ButtonProps) {
  const styles = {
    primary: "bg-teal text-navy shadow-glow hover:brightness-110 active:brightness-95",
    secondary: "bg-card text-ink border border-line hover:border-teal-dark hover:bg-teal/5",
    danger: "bg-card text-danger border border-danger/40 hover:bg-danger/10",
    ghost: "text-teal-dark hover:underline underline-offset-4",
  }[variant];
  const padding = variant === "ghost" ? "px-1 py-1 text-sm" : size === "sm" ? "px-3 py-1.5 text-xs" : "px-4 py-2 text-sm";
  return (
    <button
      {...rest}
      disabled={disabled || busy}
      className={cx(
        "inline-flex items-center justify-center gap-2 rounded-lg font-semibold",
        "transition duration-200 ease-out-soft",
        "disabled:cursor-not-allowed disabled:opacity-45 disabled:shadow-none disabled:hover:brightness-100",
        padding,
        styles,
        className,
      )}
    >
      {busy && <span className="size-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" />}
      {children}
    </button>
  );
}

export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cx("rounded-2xl border border-line bg-card p-6 shadow-card backdrop-blur-md", className)}>{children}</div>;
}

export function Badge({ children, tone = "neutral" }: { children: ReactNode; tone?: "neutral" | "teal" | "amber" | "danger" | "navy" }) {
  const styles = {
    neutral: "bg-line/60 text-muted",
    teal: "bg-teal/15 text-teal-dark ring-1 ring-inset ring-teal/25",
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
        "rounded-lg border border-line bg-field px-3 py-2 text-sm text-ink transition duration-200 placeholder:text-muted/70",
        "outline-none focus:border-teal-dark focus:ring-2 focus:ring-teal/30 disabled:opacity-60",
        props.className,
      )}
    />
  );
}

export function Address({ value, label }: { value: string; label?: string }) {
  return (
    <a href={explorer.account(value)} target="_blank" rel="noreferrer" className="font-mono text-sm text-teal-dark hover:underline" title={value}>
      {label ?? shortAddress(value)}
    </a>
  );
}

export function TxLink({ hash }: { hash: string }) {
  const { t } = useTranslation();
  if (!hash) return null;
  return (
    <a href={explorer.tx(hash)} target="_blank" rel="noreferrer" className="text-xs font-semibold text-teal-dark hover:underline">
      {t("common.viewTx")}
    </a>
  );
}

export function SectionTitle({ eyebrow, title, children }: { eyebrow?: string; title: string; children?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div>
        {eyebrow && <p className="text-xs font-semibold uppercase tracking-widest text-teal-dark">{eyebrow}</p>}
        <h2 className="font-display text-2xl font-semibold">{title}</h2>
      </div>
      {children}
    </div>
  );
}

export function Spinner({ label }: { label?: string }) {
  const { t } = useTranslation();
  return (
    <div role="status" className="flex items-center gap-3 py-10 text-sm text-muted">
      <span aria-hidden className="size-4 animate-spin rounded-full border-2 border-teal-dark border-t-transparent" />
      {label ?? t("common.loading")}
    </div>
  );
}

export function ErrorBox({ message }: { message: string }) {
  return (
    <div role="alert" className="rounded-lg border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger">
      {message}
    </div>
  );
}
