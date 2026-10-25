import { useEffect, useRef, useState, type RefObject } from "react";

/**
 * Decorative ball-and-stick molecules from the Figma, made of "0" and "1" digits
 * like the hero DNA. Each atom is a disc of digits shaded like a sphere (larger and
 * more opaque in the middle); bonds are dotted lines of small digits. A few digits
 * flip every second or so; nothing moves with prefers-reduced-motion.
 * Colours follow the theme (--color-mol-*).
 *
 * Interactive like the helix: digits near the pointer grow, light up, move aside
 * and flip faster; a click or tap on a molecule makes it burst and settle back.
 */
type Atom = { x: number; y: number; r: number; color: "indigo" | "violet" | "pink" | "peach" | "yellow" };
type Shape = { width: number; height: number; atoms: Atom[]; bonds: [number, number][] };

const SHAPES: Record<"chain" | "ring" | "tetra", Shape> = {
  // Short zig-zag chain (hero, top left of the helix).
  chain: {
    width: 70,
    height: 110,
    atoms: [
      { x: 22, y: 12, r: 9, color: "yellow" },
      { x: 42, y: 27, r: 10, color: "peach" },
      { x: 25, y: 45, r: 10, color: "yellow" },
      { x: 47, y: 60, r: 8, color: "indigo" },
      { x: 29, y: 78, r: 10, color: "peach" },
      { x: 44, y: 97, r: 9, color: "yellow" },
    ],
    bonds: [[0, 1], [1, 2], [2, 3], [3, 4], [4, 5]],
  },
  // Benzene-like ring with two side groups ("How funding reaches the lab").
  ring: {
    width: 230,
    height: 140,
    atoms: [
      { x: 72, y: 46, r: 18, color: "yellow" },
      { x: 120, y: 34, r: 18, color: "yellow" },
      { x: 154, y: 74, r: 18, color: "peach" },
      { x: 142, y: 118, r: 17, color: "yellow" },
      { x: 96, y: 122, r: 17, color: "yellow" },
      { x: 62, y: 88, r: 17, color: "peach" },
      { x: 14, y: 26, r: 12, color: "indigo" },
      { x: 210, y: 78, r: 14, color: "pink" },
    ],
    bonds: [[0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [5, 0], [0, 6], [2, 7]],
  },
  // Central atom with three neighbours (hero, bottom right; empty states).
  tetra: {
    width: 120,
    height: 100,
    atoms: [
      { x: 58, y: 54, r: 17, color: "indigo" },
      { x: 50, y: 12, r: 10, color: "pink" },
      { x: 13, y: 78, r: 10, color: "pink" },
      { x: 105, y: 78, r: 10, color: "pink" },
    ],
    bonds: [[0, 1], [0, 2], [0, 3]],
  },
};

type Glyph = { x: number; y: number; size: number; opacity: number; color: string; seed: number };

/** Small deterministic hash, so every render draws the same pattern. */
const hash = (n: number) => {
  let h = Math.imul(n ^ 0x9e3779b9, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  return (h ^ (h >>> 16)) >>> 0;
};

function layout(shape: Shape): Glyph[] {
  const glyphs: Glyph[] = [];
  let seed = 1;

  // Bonds first, so atoms are drawn on top.
  for (const [a, b] of shape.bonds) {
    const A = shape.atoms[a];
    const B = shape.atoms[b];
    const len = Math.hypot(B.x - A.x, B.y - A.y);
    const ux = (B.x - A.x) / len;
    const uy = (B.y - A.y) / len;
    const size = 5.5;
    for (let d = A.r + 2; d <= len - B.r - 2; d += size * 0.9) {
      glyphs.push({ x: A.x + ux * d, y: A.y + uy * d, size, opacity: 0.55, color: "var(--color-muted)", seed: seed++ });
    }
  }

  for (const atom of shape.atoms) {
    const size = Math.min(8, Math.max(6, atom.r * 0.5));
    const step = size * 0.95;
    const color = `var(--color-mol-${atom.color})`;
    for (let ring = 0; ring * step <= atom.r - size * 0.2; ring++) {
      const radius = ring * step;
      const count = ring === 0 ? 1 : Math.round((2 * Math.PI * radius) / (size * 0.95));
      const offset = (hash(seed) % 100) / 100; // rotate rings so digits don't line up
      for (let k = 0; k < count; k++) {
        const angle = ((k + offset) / count) * Math.PI * 2;
        const dx = Math.cos(angle) * radius;
        const dy = Math.sin(angle) * radius;
        const depth = Math.sqrt(Math.max(0, 1 - (radius / atom.r) ** 2)); // 1 at the centre, 0 at the rim
        // Light comes from the top left, as on the Figma spheres.
        const light = 0.15 * (-(dx + dy) / (atom.r * 1.4));
        glyphs.push({
          x: atom.x + dx,
          y: atom.y + dy,
          size: size * (0.72 + 0.38 * depth),
          opacity: Math.min(1, 0.35 + 0.6 * depth + light),
          color,
          seed: seed++,
        });
      }
    }
  }
  return glyphs;
}

const LAYOUTS = Object.fromEntries(Object.entries(SHAPES).map(([k, s]) => [k, layout(s)])) as Record<keyof typeof SHAPES, Glyph[]>;

/** A slow tick that flips a few digits; stays at 0 with reduced motion. */
function useFlipTick(): number {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const id = window.setInterval(() => !document.hidden && setTick((t) => t + 1), 1100);
    return () => window.clearInterval(id);
  }, []);
  return tick;
}

const REACH_PX = 120; // how far from the pointer digits react, in screen pixels

/**
 * Pointer interaction, done outside React: one rAF loop per molecule updates the
 * transform and opacity of each digit, and only runs while something is moving.
 */
function useInteraction(svgRef: RefObject<SVGSVGElement | null>, shape: keyof typeof SHAPES) {
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const glyphs = LAYOUTS[shape];
    const els = Array.from(svg.querySelectorAll<SVGTextElement>("text"));
    if (els.length !== glyphs.length) return;
    const { width, atoms } = SHAPES[shape];
    const cx = atoms.reduce((s, a) => s + a.x, 0) / atoms.length;
    const cy = atoms.reduce((s, a) => s + a.y, 0) / atoms.length;

    const cur = glyphs.map(() => ({ x: 0, y: 0, s: 1, o: 0 }));
    const pointer = { x: -1e4, y: -1e4, active: false };
    let burst = 0;
    let frame = 0;

    function step() {
      frame = 0;
      const rect = svg!.getBoundingClientRect();
      if (!rect.width) return;
      const scale = rect.width / width; // screen px per SVG unit
      const px = (pointer.x - rect.left) / scale;
      const py = (pointer.y - rect.top) / scale;
      const reach = REACH_PX / scale;
      let moving = burst > 0.01;

      for (let i = 0; i < glyphs.length; i++) {
        const g = glyphs[i];
        let tx = 0;
        let ty = 0;
        let ts = 1;
        let to = 0;
        if (pointer.active) {
          const dx = g.x - px;
          const dy = g.y - py;
          const d = Math.hypot(dx, dy) || 1;
          if (d < reach) {
            const f = (1 - d / reach) ** 2;
            tx = (dx / d) * f * 9;
            ty = (dy / d) * f * 9;
            ts = 1 + f * 0.9;
            to = f * 0.6;
            // Near the pointer, digits flip much more often.
            if (f > 0.35 && Math.random() < 0.06) {
              const node = els[i].firstChild;
              if (node) node.nodeValue = node.nodeValue === "0" ? "1" : "0";
            }
          }
        }
        if (burst > 0.01) {
          // Burst: every digit flies out from the molecule centre, then settles.
          const bx = g.x - cx;
          const by = g.y - cy;
          const bd = Math.hypot(bx, by) || 1;
          tx += (bx / bd) * burst * 16;
          ty += (by / bd) * burst * 16;
          ts += burst * 0.4;
        }
        const c = cur[i];
        c.x += (tx - c.x) * 0.2;
        c.y += (ty - c.y) * 0.2;
        c.s += (ts - c.s) * 0.2;
        c.o += (to - c.o) * 0.2;
        if (Math.abs(tx - c.x) + Math.abs(ty - c.y) + Math.abs(ts - c.s) + Math.abs(to - c.o) > 0.01) moving = true;
        const el = els[i];
        el.style.transform = `translate(${c.x.toFixed(2)}px, ${c.y.toFixed(2)}px) scale(${c.s.toFixed(3)})`;
        el.style.opacity = Math.min(1, g.opacity + c.o).toFixed(2);
      }
      burst *= 0.88;
      if (moving) frame = requestAnimationFrame(step);
    }
    const kick = () => {
      if (!frame) frame = requestAnimationFrame(step);
    };

    const near = (e: PointerEvent) => {
      const rect = svg.getBoundingClientRect();
      return (
        e.clientX > rect.left - REACH_PX && e.clientX < rect.right + REACH_PX &&
        e.clientY > rect.top - REACH_PX && e.clientY < rect.bottom + REACH_PX
      );
    };
    const onMove = (e: PointerEvent) => {
      const wasActive = pointer.active;
      pointer.x = e.clientX;
      pointer.y = e.clientY;
      pointer.active = near(e);
      if (pointer.active || wasActive) kick();
    };
    const onDown = (e: PointerEvent) => {
      const rect = svg.getBoundingClientRect();
      const inside = e.clientX >= rect.left && e.clientX <= rect.right && e.clientY >= rect.top && e.clientY <= rect.bottom;
      if (!inside) return;
      burst = 1;
      for (const el of els) {
        const node = el.firstChild;
        if (node && Math.random() < 0.5) node.nodeValue = node.nodeValue === "0" ? "1" : "0";
      }
      kick();
    };
    const onLeave = () => {
      pointer.active = false;
      kick();
    };

    // Scale each digit around its own centre.
    for (const el of els) {
      el.style.transformBox = "fill-box";
      el.style.transformOrigin = "center";
    }
    window.addEventListener("pointermove", onMove, { passive: true });
    window.addEventListener("pointerdown", onDown, { passive: true });
    document.addEventListener("pointerleave", onLeave);
    window.addEventListener("blur", onLeave);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerdown", onDown);
      document.removeEventListener("pointerleave", onLeave);
      window.removeEventListener("blur", onLeave);
    };
  }, [svgRef, shape]);
}

export function Molecule({ shape, className = "" }: { shape: keyof typeof SHAPES; className?: string }) {
  const tick = useFlipTick();
  const svgRef = useRef<SVGSVGElement>(null);
  useInteraction(svgRef, shape);
  const { width, height } = SHAPES[shape];
  return (
    <svg ref={svgRef} viewBox={`0 0 ${width} ${height}`} className={`overflow-visible ${className}`} aria-hidden>
      <g style={{ fontFamily: "var(--font-mono)" }} fontWeight="700" textAnchor="middle" dominantBaseline="central">
        {LAYOUTS[shape].map((g) => {
          // About one digit in eight flips on each tick.
          const flipped = tick > 0 && hash(g.seed * 7919 + tick) % 8 === 0 ? 1 : 0;
          const digit = (hash(g.seed) + flipped) % 2;
          return (
            <text key={g.seed} x={g.x.toFixed(1)} y={g.y.toFixed(1)} fontSize={g.size.toFixed(1)} style={{ fill: g.color }} opacity={g.opacity.toFixed(2)}>
              {digit}
            </text>
          );
        })}
      </g>
    </svg>
  );
}
