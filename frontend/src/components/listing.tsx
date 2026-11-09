import { Trans, useTranslation } from "react-i18next";
import type { Beneficiary, SplitConfig } from "../stellar/contracts";
import { formatDate, formatNumber } from "../lib/format";
import { Badge, Button, Field, Input, StatusIcon } from "./ui";

/** Pieces shared by the listing form and the "finish setup" card of a licence. */

/** Challenge windows offered to the lab; labels live in newLicence.windows.<key>. */
export const WINDOWS = [
  { key: "minute", seconds: 60 },
  { key: "day", seconds: 86_400 },
  { key: "week", seconds: 604_800 },
] as const;

/**
 * Research periods offered to the lab, in days: milestones must be proven before the
 * end (`deadline` in milestone_escrow). Labels live in newLicence.periods.<key>.
 */
export const PERIODS = [
  { key: "sixMonths", days: 182 },
  { key: "oneYear", days: 365 },
  { key: "twoYears", days: 730 },
  { key: "threeYears", days: 1095 },
] as const;

export const DEFAULT_PERIOD_DAYS = 365;

/** Ledger timestamp (seconds) `days` from now. */
export function deadlineIn(days: number): number {
  return Math.floor(Date.now() / 1000) + days * 86_400;
}

export const isAddress = (a: string) => /^G[A-Z2-7]{55}$/.test(a);

/** Royalty split as typed in the form, in percent. */
export type SplitPercents = { university: number; inventors: number; investors: number };

export const DEFAULT_SPLIT: SplitPercents = { university: 40, inventors: 30, investors: 30 };

/** A form rule that failed: the section it is about and the i18n key of its message. */
export type FormProblem = { field: "split" | "parties" | "milestones"; message: string };

export function splitProblem(split: SplitPercents): FormProblem | null {
  if (split.university + split.inventors + split.investors !== 100) return { field: "split", message: "newLicence.errors.split" };
  // The splitter needs a fixed beneficiary (it receives the rounding remainders); without one,
  // `configure` fails, and when listing that happens after the licence is minted.
  if (split.university + split.inventors === 0) return { field: "split", message: "newLicence.errors.splitFixed" };
  return null;
}

/** The parties and milestones of a funding round opened by the licence `owner`. */
export function roundProblem(owner: string, investor: string, arbiter: string, milestones: string[]): FormProblem | null {
  if (!isAddress(investor) || !isAddress(arbiter)) return { field: "parties", message: "newLicence.errors.parties" };
  // The contract refuses it too (InvalidParties): the arbiter settles disputes between them.
  if (arbiter === investor || arbiter === owner) return { field: "parties", message: "newLicence.errors.arbiter" };
  // The contracts of release 3.0.0 accept it, so the forms are the only guard until the next redeploy.
  if (investor === owner) return { field: "parties", message: "newLicence.errors.selfInvestor" };
  if (milestones.length === 0 || milestones.some((m) => !(Number(m) > 0)))
    return { field: "milestones", message: "newLicence.errors.milestones" };
  return null;
}

/** Splits `total` bps evenly between addresses; the remainder goes to the first one. */
function splitEvenly(addresses: string[], total: number): Beneficiary[] {
  const each = Math.floor(total / addresses.length);
  return addresses.map((addr, i) => ({ addr, bps: each + (i === 0 ? total - each * addresses.length : 0) }));
}

/** The university first (it receives the rounding remainders), then the inventors written in the licence. */
export function splitConfig(owner: string, inventors: string[], split: SplitPercents): SplitConfig {
  const fixed = [{ addr: owner, bps: split.university * 100 }, ...splitEvenly(inventors, split.inventors * 100)];
  return { fixed: fixed.filter((b) => b.bps > 0), investors_bps: split.investors * 100 };
}

function SplitPreview({ parts }: { parts: { label: string; pct: number; color: string; text: string }[] }) {
  const { t } = useTranslation();
  const total = parts.reduce((s, p) => s + (Number.isFinite(p.pct) ? p.pct : 0), 0);
  return (
    <div className="flex flex-col items-start gap-2">
      <div className="flex h-8 w-full gap-0.5 overflow-hidden rounded-xl bg-line">
        {parts.map((p) =>
          p.pct > 0 ? (
            <div key={p.label} className={`${p.color} ${p.text} flex items-center justify-center text-xs font-semibold`} style={{ width: `${Math.min(p.pct, 100)}%` }}>
              {p.pct}%
            </div>
          ) : null,
        )}
      </div>
      {total === 100 ? (
        <Badge tone="success" icon={<StatusIcon kind="done" />}>{t("newLicence.splitOk")}</Badge>
      ) : (
        <Badge tone="danger" icon={<StatusIcon kind="error" />}>{t("newLicence.splitBad", { total })}</Badge>
      )}
    </div>
  );
}

/** The three percentage inputs of the royalty split, with their preview bar. */
export function SplitFields({ split, onChange }: { split: SplitPercents; onChange: (split: SplitPercents) => void }) {
  const { t } = useTranslation();
  const parts = [
    { key: "university", color: "bg-brand", text: "text-on-brand" },
    { key: "inventors", color: "bg-rose", text: "text-navy" },
    { key: "investors", color: "bg-amber", text: "text-navy" },
  ] as const;
  return (
    <>
      <div className="grid gap-4 sm:grid-cols-3">
        {parts.map((p) => (
          <Field key={p.key} label={t(`newLicence.${p.key}`)}>
            <Input
              type="number"
              min={0}
              max={100}
              value={split[p.key]}
              onChange={(e) => onChange({ ...split, [p.key]: Number(e.target.value) })}
            />
          </Field>
        ))}
      </div>
      <SplitPreview parts={parts.map((p) => ({ label: t(`newLicence.${p.key}`), pct: split[p.key], color: p.color, text: p.text }))} />
    </>
  );
}

/**
 * Milestone amounts in EURC, as typed by the user. An empty amount is not flagged
 * until the user types something; the form still rejects it on submit.
 */
export function MilestoneEditor({ milestones, onChange }: { milestones: string[]; onChange: (milestones: string[]) => void }) {
  const { t } = useTranslation();
  const total = milestones.reduce((s, m) => s + (Number(m) || 0), 0);
  return (
    <div className="flex flex-col gap-2">
      <span className="text-sm font-semibold">{t("newLicence.milestones")}</span>
      <p className="text-xs text-muted">{t("newLicence.milestonesHint")}</p>
      {milestones.map((m, i) => {
        const invalid = m !== "" && !(Number(m) > 0);
        return (
          <div key={i} className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-2xl bg-subtle px-4 py-2.5">
            <span className="w-24 text-sm text-muted">{t("newLicence.milestone", { n: i + 1 })}</span>
            <div className="relative">
              <Input
                type="number"
                min={0}
                step="any"
                value={m}
                placeholder="0"
                onChange={(e) => onChange(milestones.map((x, j) => (j === i ? e.target.value : x)))}
                aria-invalid={invalid}
                aria-label={t("newLicence.milestone", { n: i + 1 })}
                className={`w-36 pr-14 ${invalid ? "border-danger/60" : ""}`}
              />
              <span aria-hidden className="pointer-events-none absolute top-1/2 right-3.5 -translate-y-1/2 text-xs font-semibold text-muted">
                EURC
              </span>
            </div>
            {milestones.length > 1 && (
              <Button type="button" variant="ghost" onClick={() => onChange(milestones.filter((_, j) => j !== i))}>
                {t("common.remove")}
              </Button>
            )}
          </div>
        );
      })}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Button type="button" variant="ghost" onClick={() => onChange([...milestones, ""])}>
          {t("newLicence.addMilestone")}
        </Button>
        <p className="text-sm">
          <Trans i18nKey="newLicence.totalRaised" values={{ amount: formatNumber(total) }} components={{ strong: <strong /> }} />
        </p>
      </div>
    </div>
  );
}

/** Challenge window and research period of a funding round. */
export function RoundTimingFields({
  challengeWindow,
  onChallengeWindow,
  periodDays,
  onPeriodDays,
}: {
  challengeWindow: number;
  onChallengeWindow: (seconds: number) => void;
  periodDays: number;
  onPeriodDays: (days: number) => void;
}) {
  const { t } = useTranslation();
  const select = "rounded-lg border border-line bg-field px-3 py-2 text-sm";
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Field label={t("newLicence.window")}>
        <select className={select} value={challengeWindow} onChange={(e) => onChallengeWindow(Number(e.target.value))}>
          {WINDOWS.map((w) => (
            <option key={w.seconds} value={w.seconds}>
              {t(`newLicence.windows.${w.key}`)}
            </option>
          ))}
        </select>
      </Field>
      <Field label={t("newLicence.period")} hint={t("newLicence.periodHint", { date: formatDate(deadlineIn(periodDays)) })}>
        <select className={select} value={periodDays} onChange={(e) => onPeriodDays(Number(e.target.value))}>
          {PERIODS.map((p) => (
            <option key={p.days} value={p.days}>
              {t(`newLicence.periods.${p.key}`)}
            </option>
          ))}
        </select>
      </Field>
    </div>
  );
}
