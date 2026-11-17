import { useSyncExternalStore } from "react";
import { flushSync } from "react-dom";

/**
 * Colour theme. Dark is the default; the choice is remembered in localStorage.
 * index.html applies the stored theme before the first paint, so there is no flash.
 */
export type Theme = "dark" | "light";

const STORAGE_KEY = "biolicensing.theme";
const listeners = new Set<() => void>();

export function getTheme(): Theme {
  return document.documentElement.dataset.theme === "light" ? "light" : "dark";
}

export function setTheme(theme: Theme) {
  document.documentElement.dataset.theme = theme;
  try {
    localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    /* private mode: the choice just isn't remembered */
  }
  listeners.forEach((notify) => notify());
}

/** Centre of a named element as the running view transition placed it, in snapshot coordinates. */
function snapshotCentre(name: string): { x: number; y: number } | null {
  const group = getComputedStyle(document.documentElement, `::view-transition-group(${name})`);
  const width = parseFloat(group.width);
  const height = parseFloat(group.height);
  if (!width || !height || !group.transform || group.transform === "none") return null;
  try {
    const m = new DOMMatrixReadOnly(group.transform);
    return { x: m.e + width / 2, y: m.f + height / 2 };
  } catch {
    return null; // unreadable transform: the caller falls back to viewport coordinates
  }
}

/**
 * Switches the theme with the old one closing in a circle onto `origin` (the toggle button).
 * Falls back to an instant switch without the View Transitions API or with reduced motion.
 */
export function switchTheme(theme: Theme, origin: HTMLElement) {
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (!document.startViewTransition || reduced) return setTheme(theme);

  const rect = origin.getBoundingClientRect();
  const x = rect.left + rect.width / 2;
  const y = rect.top + rect.height / 2;
  const radius = Math.hypot(Math.max(x, window.innerWidth - x), Math.max(y, window.innerHeight - y));
  const root = document.documentElement;

  root.classList.add("theme-transition");
  // flushSync so the toggle icon is already swapped when the new snapshot is taken.
  const transition = document.startViewTransition(() => flushSync(() => setTheme(theme)));
  transition.ready
    .then(() => {
      // The circle is drawn on the old page's snapshot, which starts at the top of the screen:
      // on a phone with the address bar at the top that is above the viewport, and viewport
      // coordinates would close the circle above the toggle. Use where the browser placed the
      // toggle's icon in that same snapshot (the icon is centred in the toggle).
      const icon = snapshotCentre("theme-toggle-icon") ?? { x, y };
      const r = radius + Math.abs(icon.y - y); // still covers the whole snapshot
      return root.animate(
        { clipPath: [`circle(${r}px at ${icon.x}px ${icon.y}px)`, `circle(0px at ${icon.x}px ${icon.y}px)`] },
        // fill: the old snapshot must stay fully clipped until the pseudo-elements are torn down.
        { duration: 400, easing: "cubic-bezier(0.4, 0, 0.2, 1)", fill: "forwards", pseudoElement: "::view-transition-old(root)" },
      );
    })
    .catch(() => {});
  // Wait for the whole transition: dropping the class earlier brings back the browser's
  // default cross-fade for a frame, which flashes the old theme.
  transition.finished.finally(() => root.classList.remove("theme-transition"));
}

function subscribe(notify: () => void) {
  listeners.add(notify);
  return () => listeners.delete(notify);
}

export function useTheme(): [Theme, (theme: Theme) => void] {
  return [useSyncExternalStore(subscribe, getTheme), setTheme];
}
