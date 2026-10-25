import { Suspense, lazy } from "react";

const DnaHelix = lazy(() => import("./DnaHelix"));

/** Big DNA helix behind the whole page, corner to corner: fixed (always on screen, so
 *  always moving), faded, never in the way (cards stay opaque on top). */
export function PageHelix() {
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden opacity-35 dark:opacity-45">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_25%_75%,color-mix(in_oklab,var(--color-dna-violet)_45%,transparent),transparent_55%),radial-gradient(ellipse_at_75%_25%,color-mix(in_oklab,var(--color-dna-peach)_40%,transparent),transparent_55%)] opacity-50 blur-3xl" />
      <Suspense fallback={null}>
        <DnaHelix fill />
      </Suspense>
    </div>
  );
}
