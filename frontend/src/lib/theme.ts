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
    .then(() =>
      root.animate(
        { clipPath: [`circle(${radius}px at ${x}px ${y}px)`, `circle(0px at ${x}px ${y}px)`] },
        { duration: 650, easing: "cubic-bezier(0.65, 0, 0.35, 1)", pseudoElement: "::view-transition-old(root)" },
      ).finished,
    )
    .catch(() => {})
    .finally(() => root.classList.remove("theme-transition"));
}

function subscribe(notify: () => void) {
  listeners.add(notify);
  return () => listeners.delete(notify);
}

export function useTheme(): [Theme, (theme: Theme) => void] {
  return [useSyncExternalStore(subscribe, getTheme), setTheme];
}
