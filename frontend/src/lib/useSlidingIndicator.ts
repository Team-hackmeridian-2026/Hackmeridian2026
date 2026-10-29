import { useLayoutEffect, useRef, useState, type CSSProperties } from "react";

type Box = { left: number; top: number; width: number; height: number };

const ACTIVE = '[aria-current="page"], [aria-pressed="true"]';

/**
 * Positions one shared highlight under the active item of a segmented control, so it slides
 * between items instead of jumping. The container must be `relative`; items are found by
 * `aria-current="page"` (NavLink) or `aria-pressed="true"` (toggle buttons).
 * `key` must change whenever the active item or the item list changes.
 */
export function useSlidingIndicator<T extends HTMLElement>(key: unknown) {
  const containerRef = useRef<T>(null);
  const [box, setBox] = useState<Box | null>(null);
  // No transition on the first placement, otherwise the highlight slides in from the corner.
  const [animate, setAnimate] = useState(false);

  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const measure = () => {
      const active = container.querySelector<HTMLElement>(ACTIVE);
      if (!active) return setBox(null);
      const next = { left: active.offsetLeft, top: active.offsetTop, width: active.offsetWidth, height: active.offsetHeight };
      setBox((prev) =>
        prev && prev.left === next.left && prev.top === next.top && prev.width === next.width && prev.height === next.height ? prev : next,
      );
    };
    measure();
    // Item widths change with the language and once web fonts load.
    const observer = new ResizeObserver(measure);
    observer.observe(container);
    for (const child of container.children) observer.observe(child);
    return () => observer.disconnect();
  }, [key]);

  useLayoutEffect(() => {
    if (!box || animate) return;
    const frame = requestAnimationFrame(() => setAnimate(true));
    return () => cancelAnimationFrame(frame);
  }, [box, animate]);

  const style: CSSProperties = box
    ? { transform: `translate(${box.left}px, ${box.top}px)`, width: box.width, height: box.height, opacity: 1 }
    : { opacity: 0 };

  return {
    containerRef,
    indicatorProps: {
      "aria-hidden": true,
      style,
      className: `pointer-events-none absolute top-0 left-0 ${animate ? "transition-[transform,width,height,opacity] duration-300 ease-out" : ""}`,
    },
  };
}
