import { useSyncExternalStore } from "react";

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

function subscribe(notify: () => void) {
  listeners.add(notify);
  return () => listeners.delete(notify);
}

export function useTheme(): [Theme, (theme: Theme) => void] {
  return [useSyncExternalStore(subscribe, getTheme), setTheme];
}
