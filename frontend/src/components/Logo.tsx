import { useId } from "react";

/**
 * BioLicensing mark: a shield (licence, trust) holding a DNA double helix (life sciences).
 * Inline SVG so it inherits nothing and stays crisp at any size; the same drawing is
 * exported as public/favicon.svg.
 */
export function LogoMark({ className = "size-8", title }: { className?: string; title?: string }) {
  const id = useId();
  return (
    <svg viewBox="0 0 48 48" className={className} role={title ? "img" : undefined} aria-hidden={title ? undefined : true}>
      {title && <title>{title}</title>}
      <defs>
        <linearGradient id={id} x1="6" y1="4" x2="42" y2="46" gradientUnits="userSpaceOnUse">
          <stop stopColor="#059669" />
          <stop offset="1" stopColor="#6ee7b7" />
        </linearGradient>
      </defs>
      <path d="M24 3 41 9v13c0 11-7.5 19.5-17 23C14.5 41.5 7 33 7 22V9z" fill={`url(#${id})`} />
      <g fill="none" stroke="#fff" strokeLinecap="round">
        <path d="M17 12c0 6 14 6 14 12s-14 6-14 12M31 12c0 6-14 6-14 12s14 6 14 12" strokeWidth="2.8" />
        <path d="M19 13.2h10M18.5 24h11M19 34.8h10" strokeWidth="1.8" opacity=".75" />
      </g>
    </svg>
  );
}

/** Mark + "BioLicensing" wordmark. Colours follow the theme (light or dark). */
export function Logo({ className = "" }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2.5 ${className}`}>
      <LogoMark className="size-8 shrink-0" />
      <span className="font-display text-xl font-bold tracking-tight text-paper">
        <span className="text-teal">Bio</span>Licensing
      </span>
    </span>
  );
}
