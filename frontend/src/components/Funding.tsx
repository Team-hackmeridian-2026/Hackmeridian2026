import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import { isSettled, paidToLab, type Project } from "../stellar/contracts";
import { eurc } from "../lib/format";

export type FundingTone = "neutral" | "brand" | "amber" | "navy";

/** Where a licence's funding round stands, in one short label. */
export function fundingStatus(t: TFunction, project?: Project): { label: string; tone: FundingTone } {
  if (!project) return { label: t("funding.awaiting"), tone: "neutral" };
  if (!project.funded) return { label: t("funding.open"), tone: "amber" };
  const settled = project.milestones.filter((m) => isSettled(m.status)).length;
  if (settled === project.milestones.length) {
    const allPaid = project.milestones.every((m) => m.status === "Released");
    return { label: t(allPaid ? "funding.full" : "funding.done"), tone: "navy" };
  }
  return { label: t("funding.milestone", { current: settled + 1, total: project.milestones.length }), tone: "brand" };
}

const TONE_TEXT: Record<FundingTone, string> = { neutral: "text-muted", amber: "text-amber-dark", brand: "text-brand-ink", navy: "text-ink" };

/** Small progress ring next to the funding status. */
function StatusRing({ pct, className }: { pct: number; className: string }) {
  const c = 2 * Math.PI * 7;
  return (
    <svg viewBox="0 0 18 18" className={`size-4 shrink-0 -rotate-90 ${className}`} aria-hidden>
      <circle cx="9" cy="9" r="7" fill="none" stroke="currentColor" strokeOpacity="0.25" strokeWidth="2" />
      <circle cx="9" cy="9" r="7" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeDasharray={`${(Math.max(pct, 8) / 100) * c} ${c}`} />
    </svg>
  );
}

/** Status line, progress bar and "x released of y", as in the Figma licence table and cards. */
export function FundingProgress({ project, large = false }: { project?: Project; large?: boolean }) {
  const { t } = useTranslation();
  const total = project?.milestones.reduce((sum, m) => sum + m.amount, 0n) ?? 0n;
  const released = project?.milestones.reduce((s, m) => s + paidToLab(m), 0n) ?? 0n;
  const status = fundingStatus(t, project);
  const pct = total ? Number((released * 100n) / total) : 0;
  return (
    <div className="flex flex-col gap-2">
      <p className={`flex items-center gap-2 font-semibold ${large ? "font-display text-xl" : "text-sm"} ${TONE_TEXT[status.tone]}`}>
        <StatusRing pct={pct} className={`${TONE_TEXT[status.tone]} ${large ? "size-5" : ""}`} />
        {status.label}
      </p>
      <div className="h-1.5 overflow-hidden rounded-full bg-line">
        <div className="h-full rounded-full bg-brand transition-[width] duration-500" style={{ width: `${pct}%` }} />
      </div>
      <p className="text-sm text-muted">
        {project ? t("marketplace.released", { released: eurc(released), total: eurc(total) }) : t("marketplace.noRound")}
      </p>
    </div>
  );
}
