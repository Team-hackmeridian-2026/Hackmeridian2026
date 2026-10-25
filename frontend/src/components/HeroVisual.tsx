import { Suspense, lazy } from "react";
import { Molecule } from "./Molecule";

// Three.js is only downloaded for the home page, after the rest of the page.
const DnaHelix = lazy(() => import("./DnaHelix"));

/**
 * Right-hand side of the home hero: soft colour glows, the binary DNA and two molecules.
 * Purely decorative (aria-hidden).
 */
export function HeroVisual() {
  return (
    <div aria-hidden className="pointer-events-none relative mx-auto aspect-[4/5] w-full max-w-[520px] select-none">
      {/* Glows behind the helix, as in the Figma. */}
      <div className="absolute inset-[8%_4%_10%_10%] rounded-full bg-[radial-gradient(circle_at_30%_45%,color-mix(in_oklab,var(--color-dna-violet)_55%,transparent),transparent_60%),radial-gradient(circle_at_70%_35%,color-mix(in_oklab,var(--color-dna-pink)_55%,transparent),transparent_55%),radial-gradient(circle_at_75%_75%,color-mix(in_oklab,var(--color-dna-peach)_60%,transparent),transparent_50%)] opacity-45 blur-3xl dark:opacity-70" />
      <div className="absolute inset-x-[22%] bottom-[3%] h-6 rounded-[50%] bg-ink/15 blur-xl" />
      <div className="absolute inset-0">
        <Suspense fallback={null}>
          <DnaHelix />
        </Suspense>
      </div>
      <Molecule shape="chain" className="absolute top-[4%] left-[8%] w-[19%] animate-[float_7s_ease-in-out_infinite]" />
      <Molecule shape="tetra" className="absolute right-[0%] bottom-[12%] w-[28%] animate-[float_9s_ease-in-out_infinite_-3s]" />
    </div>
  );
}
