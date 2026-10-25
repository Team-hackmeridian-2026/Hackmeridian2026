import { useId } from "react";

/**
 * Decorative ball-and-stick molecules from the Figma, drawn in SVG so they follow
 * the theme palette (--color-dna-*) and stay sharp at any size.
 */
type Atom = { x: number; y: number; r: number; color: "indigo" | "violet" | "pink" | "peach" | "yellow" };
type Shape = { width: number; height: number; atoms: Atom[]; bonds: [number, number][] };

const SHAPES: Record<"chain" | "ring" | "tetra", Shape> = {
  // Short zig-zag chain (hero, top left of the helix).
  chain: {
    width: 70,
    height: 110,
    atoms: [
      { x: 22, y: 12, r: 8, color: "yellow" },
      { x: 40, y: 26, r: 9, color: "peach" },
      { x: 26, y: 44, r: 9, color: "yellow" },
      { x: 46, y: 58, r: 7, color: "indigo" },
      { x: 30, y: 76, r: 9, color: "peach" },
      { x: 42, y: 96, r: 8, color: "yellow" },
    ],
    bonds: [[0, 1], [1, 2], [2, 3], [3, 4], [4, 5]],
  },
  // Benzene-like ring with two side groups ("How funding reaches the lab").
  ring: {
    width: 230,
    height: 140,
    atoms: [
      { x: 72, y: 46, r: 17, color: "yellow" },
      { x: 118, y: 36, r: 17, color: "yellow" },
      { x: 150, y: 74, r: 17, color: "peach" },
      { x: 140, y: 118, r: 16, color: "yellow" },
      { x: 96, y: 120, r: 16, color: "yellow" },
      { x: 64, y: 86, r: 16, color: "peach" },
      { x: 14, y: 30, r: 11, color: "indigo" },
      { x: 202, y: 76, r: 14, color: "pink" },
    ],
    bonds: [[0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [5, 0], [0, 6], [2, 7]],
  },
  // Central atom with three neighbours (hero, bottom right).
  tetra: {
    width: 120,
    height: 100,
    atoms: [
      { x: 58, y: 54, r: 15, color: "indigo" },
      { x: 50, y: 12, r: 8, color: "pink" },
      { x: 12, y: 74, r: 9, color: "pink" },
      { x: 104, y: 76, r: 9, color: "pink" },
    ],
    bonds: [[0, 1], [0, 2], [0, 3]],
  },
};

export function Molecule({ shape, className = "" }: { shape: keyof typeof SHAPES; className?: string }) {
  const id = useId();
  const { width, height, atoms, bonds } = SHAPES[shape];
  const colors = [...new Set(atoms.map((a) => a.color))];
  return (
    <svg viewBox={`0 0 ${width} ${height}`} className={className} aria-hidden>
      <defs>
        {colors.map((c) => (
          <radialGradient key={c} id={`${id}-${c}`} cx="0.35" cy="0.3" r="0.75">
            <stop offset="0" stopColor="#ffffff" stopOpacity="0.95" />
            <stop offset="0.3" style={{ stopColor: `var(--color-dna-${c})` }} />
            <stop offset="1" style={{ stopColor: `color-mix(in oklab, var(--color-dna-${c}) 70%, #2a1d4a)` }} />
          </radialGradient>
        ))}
      </defs>
      <g stroke="currentColor" strokeWidth="4.5" strokeLinecap="round" className="text-line">
        {bonds.map(([a, b]) => (
          <line key={`${a}-${b}`} x1={atoms[a].x} y1={atoms[a].y} x2={atoms[b].x} y2={atoms[b].y} />
        ))}
      </g>
      {atoms.map((a, i) => (
        <circle key={i} cx={a.x} cy={a.y} r={a.r} fill={`url(#${id}-${a.color})`} />
      ))}
    </svg>
  );
}
