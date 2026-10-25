import { Suspense, lazy } from "react";
import { Molecule } from "./Molecule";

// Three.js is only downloaded for the home page, after the rest of the page.
const DnaHelix = lazy(() => import("./DnaHelix"));

/**
 * Home hero visual: soft colour glows, the binary DNA and two molecules.
 * Purely decorative (aria-hidden).
 *
 * From lg it is the right-hand column of the hero. Below lg it becomes a faded
 * background layer behind the hero text (full bleed, helix pushed to the right), so it
 * takes no height on phones and tablets. The parent section must be `relative isolate`.
 * Pointer effects still work there: the helix and molecules listen on window.
 */
export function HeroVisual() {
  return (
    <div
      aria-hidden
      className="pointer-events-none relative mx-auto aspect-[4/5] w-full max-w-[520px] select-none max-lg:absolute max-lg:-inset-x-4 max-lg:-top-4 max-lg:bottom-0 max-lg:-z-10 max-lg:mx-0 max-lg:aspect-auto max-lg:w-auto max-lg:max-w-none max-lg:overflow-hidden max-lg:opacity-30 max-sm:[mask-image:linear-gradient(to_bottom,black_70%,transparent)] sm:max-lg:-inset-x-6 max-lg:dark:opacity-45"
    >
      <div className="absolute inset-0 max-lg:right-[-14%] max-lg:left-[40%] sm:max-lg:right-[-4%] sm:max-lg:left-[52%]">
        {/* Glows behind the helix, as in the Figma. */}
        <div className="absolute inset-[8%_4%_10%_10%] rounded-full bg-[radial-gradient(circle_at_30%_45%,color-mix(in_oklab,var(--color-dna-violet)_55%,transparent),transparent_60%),radial-gradient(circle_at_70%_35%,color-mix(in_oklab,var(--color-dna-pink)_55%,transparent),transparent_55%),radial-gradient(circle_at_75%_75%,color-mix(in_oklab,var(--color-dna-peach)_60%,transparent),transparent_50%)] opacity-45 blur-3xl dark:opacity-70" />
        <div className="absolute inset-x-[22%] bottom-[3%] h-6 rounded-[50%] bg-ink/15 blur-xl max-lg:hidden" />
        <div className="absolute inset-0">
          <Suspense fallback={null}>
            <DnaHelix />
          </Suspense>
        </div>
        <Molecule shape="chain" className="absolute top-[4%] left-[8%] w-[19%] animate-[float_7s_ease-in-out_infinite] max-lg:hidden" />
        <Molecule
          shape="tetra"
          className="absolute right-[0%] bottom-[12%] w-[28%] animate-[float_9s_ease-in-out_infinite_-3s] max-lg:right-[20%] max-lg:bottom-[8%] max-lg:w-[30%]"
        />
      </div>
    </div>
  );
}
