import { useId } from "react";

/**
 * BioLicensing mark, "molecular signature": a handwritten signature stroke (the signed
 * licence) that links four atoms (life sciences), in the DNA palette (indigo, pink,
 * peach, yellow). Fixed colours, so it reads on both themes without changes.
 * Inline SVG so it stays crisp at any size; the same drawing is exported as
 * public/favicon.svg (and the PNG icons).
 */
export function LogoMark({ className = "size-8", title }: { className?: string; title?: string }) {
  const id = useId();
  return (
    <svg viewBox="0 0 48 48" className={className} role={title ? "img" : undefined} aria-hidden={title ? undefined : true}>
      {title && <title>{title}</title>}
      <defs>
        <linearGradient id={id} x1="5" y1="34" x2="44" y2="14" gradientUnits="userSpaceOnUse">
          <stop stopColor="#5a4cf0" />
          <stop offset=".55" stopColor="#f19cc4" />
          <stop offset="1" stopColor="#f6a27d" />
        </linearGradient>
      </defs>
      <path
        d="M6 33c4-9 8-17 11-17s-1 18 3 18 6-20 10-20 2 13 6 13 5-6 7-9"
        fill="none"
        stroke={`url(#${id})`}
        strokeWidth="3.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="17" cy="16" r="4.2" fill="#5a4cf0" />
      <circle cx="20" cy="34" r="4.2" fill="#f19cc4" />
      <circle cx="30" cy="14" r="4.2" fill="#f6a27d" />
      <circle cx="43" cy="18" r="3.2" fill="#f2cd6e" />
    </svg>
  );
}

/** Mark + "BioLicensing" wordmark. The wordmark colour follows the theme (light or dark). */
export function Logo({ className = "", wordmarkClassName = "" }: { className?: string; wordmarkClassName?: string }) {
  return (
    <span className={`inline-flex items-center gap-2.5 ${className}`}>
      <LogoMark className="size-8 shrink-0" />
      <span className={`font-display text-xl font-extrabold tracking-tight text-ink ${wordmarkClassName}`}>BioLicensing</span>
    </span>
  );
}
