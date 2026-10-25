import { useEffect, useRef, type ElementType } from "react";

/**
 * Interactive title text, like the 0/1 molecules: letters near the pointer grow, move
 * aside and light up in the molecule palette; a click or tap on the title makes the letters
 * burst outwards and spring back.
 *
 * Renders the heading itself: <BurstHeading as="h1" className="…" text={title} />.
 * The heading carries the text as aria-label and the split letters are aria-hidden,
 * so screen readers, copy and paste and search engines all see the plain text once.
 * Words stay unbreakable so the heading wraps exactly as before. Nothing moves with
 * prefers-reduced-motion, and touch scrolling never triggers the hover effect.
 */
const REACH_PX = 150; // how far from the pointer letters react
const PUSH_PX = 12; // how far a letter moves aside at full effect
const GROW = 0.38; // extra scale at full effect
// Same tokens as the molecules: saturated on the light theme, pastel on the dark one.
const COLORS = ["--color-mol-indigo", "--color-mol-violet", "--color-mol-pink", "--color-mol-peach", "--color-mol-yellow"];

type Letter = { el: HTMLSpanElement; bx: number; by: number; ox: number; oy: number; vx: number; vy: number; r: number; vr: number; h: number; color: string };

export function BurstHeading({
  as: Tag = "h2",
  text,
  className,
  id,
}: {
  as?: ElementType;
  text: string;
  className?: string;
  id?: string;
}) {
  const rootRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
    const letters: Letter[] = Array.from(root.querySelectorAll<HTMLSpanElement>("[data-ch]"), (el, i) => ({
      el, bx: 0, by: 0, ox: 0, oy: 0, vx: 0, vy: 0, r: 0, vr: 0, h: 0,
      color: `var(${COLORS[i % COLORS.length]})`,
    }));
    const pointer = { x: -1e4, y: -1e4, active: false };
    let frame = 0;

    // Letter centres relative to the root, measured without any transform.
    function measure() {
      for (const l of letters) l.el.style.transform = "";
      const base = root!.getBoundingClientRect();
      for (const l of letters) {
        const r = l.el.getBoundingClientRect();
        l.bx = r.left + r.width / 2 - base.left;
        l.by = r.top + r.height / 2 - base.top;
      }
      paint();
    }

    function paint() {
      const base = root!.getBoundingClientRect();
      let moving = false;
      for (const l of letters) {
        // Hover: ease towards the pointer influence.
        let target = 0;
        let ux = 0;
        let uy = 0;
        if (pointer.active) {
          const dx = base.left + l.bx - pointer.x;
          const dy = base.top + l.by - pointer.y;
          const d = Math.hypot(dx, dy) || 1;
          target = Math.max(0, 1 - d / REACH_PX) ** 1.4;
          ux = dx / d;
          uy = dy / d;
        }
        l.h += (target - l.h) * 0.22;

        // Burst: damped spring back to rest.
        l.vx = (l.vx - l.ox * 0.09) * 0.84;
        l.vy = (l.vy - l.oy * 0.09) * 0.84;
        l.vr = (l.vr - l.r * 0.09) * 0.84;
        l.ox += l.vx;
        l.oy += l.vy;
        l.r += l.vr;

        const settled = l.h < 0.002 && Math.abs(l.ox) + Math.abs(l.oy) + Math.abs(l.r) < 0.05 && Math.abs(l.vx) + Math.abs(l.vy) + Math.abs(l.vr) < 0.05;
        if (settled) {
          l.h = l.ox = l.oy = l.r = l.vx = l.vy = l.vr = 0;
          l.el.style.transform = "";
          l.el.style.color = "";
          continue;
        }
        moving = true;
        const tx = l.ox + ux * l.h * PUSH_PX;
        const ty = l.oy + uy * l.h * PUSH_PX;
        l.el.style.transform = `translate(${tx.toFixed(2)}px, ${ty.toFixed(2)}px) rotate(${l.r.toFixed(2)}deg) scale(${(1 + l.h * GROW).toFixed(3)})`;
        // Light up in the molecule palette, stronger while bursting.
        const glow = Math.min(1, l.h + Math.min(1, (Math.abs(l.ox) + Math.abs(l.oy)) / 30));
        l.el.style.color = glow > 0.02 ? `color-mix(in oklab, ${l.color} ${Math.round(Math.min(1, glow * 1.6) * 100)}%, currentColor)` : "";
      }
      return moving;
    }

    function tick() {
      frame = paint() || pointer.active ? requestAnimationFrame(tick) : 0;
    }
    const kick = () => {
      if (!frame) frame = requestAnimationFrame(tick);
    };

    const near = (x: number, y: number, margin: number) => {
      const r = root.getBoundingClientRect();
      return x > r.left - margin && x < r.right + margin && y > r.top - margin && y < r.bottom + margin;
    };
    const onMove = (e: PointerEvent) => {
      if (reduced.matches || e.pointerType === "touch") return;
      const was = pointer.active;
      pointer.x = e.clientX;
      pointer.y = e.clientY;
      pointer.active = near(e.clientX, e.clientY, REACH_PX);
      if (pointer.active || was) kick();
    };
    const onDown = (e: PointerEvent) => {
      if (reduced.matches || !near(e.clientX, e.clientY, 8)) return;
      const base = root.getBoundingClientRect();
      for (const l of letters) {
        const dx = base.left + l.bx - e.clientX;
        const dy = base.top + l.by - e.clientY;
        const d = Math.hypot(dx, dy) || 1;
        const power = 22 * Math.max(0.25, 1 - d / 700) * (0.7 + Math.random() * 0.6);
        l.vx += (dx / d) * power;
        l.vy += (dy / d) * power - 3;
        l.vr += (Math.random() - 0.5) * 36;
      }
      kick();
    };
    const onLeave = () => {
      pointer.active = false;
      kick();
    };

    measure();
    const resize = new ResizeObserver(measure);
    resize.observe(root.parentElement ?? root);
    document.fonts?.ready.then(measure).catch(() => {});
    window.addEventListener("pointermove", onMove, { passive: true });
    window.addEventListener("pointerdown", onDown, { passive: true });
    document.addEventListener("pointerleave", onLeave);
    window.addEventListener("blur", onLeave);
    return () => {
      cancelAnimationFrame(frame);
      resize.disconnect();
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerdown", onDown);
      document.removeEventListener("pointerleave", onLeave);
      window.removeEventListener("blur", onLeave);
    };
  }, [text]);

  const words = text.split(" ");
  return (
    <Tag id={id} className={className} aria-label={text}>
      <span ref={rootRef} aria-hidden>
        {words.map((word, w) => (
          <span key={w}>
            {w > 0 && " "}
            <span className="inline-block whitespace-nowrap">
              {Array.from(word).map((ch, c) => (
                <span key={c} data-ch className="inline-block origin-center">
                  {ch}
                </span>
              ))}
            </span>
          </span>
        ))}
      </span>
    </Tag>
  );
}
