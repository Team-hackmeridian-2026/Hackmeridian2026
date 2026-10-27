import { useState } from "react";
import { useTranslation } from "react-i18next";
import { escrow, splitter, type Beneficiary, type License } from "../stellar/contracts";
import type { Signer } from "../stellar/wallet";
import { useToasts } from "./toasts";
import { DIRECTORY, PersonPicker, type PersonKind } from "./people";
import { DEFAULT_PERIOD_DAYS, MilestoneEditor, RoundTimingFields, SplitPreview, WINDOWS, deadlineIn, isAddress, splitEvenly } from "./listing";
import { Button, Card, Field, Input, StatusIcon } from "./ui";

/**
 * Listing a patent takes three transactions (mint, royalty split, funding round). If the
 * lab stops after the first or second one, the licence exists but cannot be funded. This
 * card lets its owner confirm the missing steps from the licence page.
 */
export function FinishSetup({
  license,
  signer,
  configured,
  onDone,
}: {
  license: License;
  signer: Signer;
  /** True once the royalty split is locked; the funding round is the step left. */
  configured: boolean;
  onDone: () => void;
}) {
  const { t } = useTranslation();
  const steps = [
    { key: "mint", done: true },
    { key: "split", done: configured },
    { key: "round", done: false },
  ];

  return (
    <Card className="flex flex-col gap-5">
      <div>
        <h3 className="font-display text-2xl font-bold tracking-tight">{t("licence.setup.title")}</h3>
        <p className="mt-1 text-sm text-muted">{t("licence.setup.text")}</p>
      </div>
      <ol className="flex flex-col gap-2 text-sm">
        {steps.map((s, i) => (
          <li key={s.key} className="flex items-center gap-2.5">
            <span className={s.done ? "text-success" : "text-muted"}>
              <StatusIcon kind={s.done ? "done" : "pending"} className="size-4" />
            </span>
            {i + 1}. {t(`newLicence.steps.${s.key}`)}
          </li>
        ))}
      </ol>
      <div className="border-t border-line pt-5">
        {configured ? <RoundForm license={license} signer={signer} onDone={onDone} /> : <SplitForm license={license} signer={signer} onDone={onDone} />}
      </div>
    </Card>
  );
}

function FormError({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <p role="alert" className="text-sm font-medium text-danger">
      {message}
    </p>
  );
}

function SplitForm({ license, signer, onDone }: { license: License; signer: Signer; onDone: () => void }) {
  const { t } = useTranslation();
  const { run } = useToasts();
  const [universityPct, setUniversityPct] = useState(40);
  const [inventorsPct, setInventorsPct] = useState(30);
  const [investorsPct, setInvestorsPct] = useState(30);
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);

  async function submit() {
    setError(undefined);
    if (universityPct + inventorsPct + investorsPct !== 100) return setError(t("newLicence.errors.split"));
    // Same rule as the listing form: the university first, then the inventors written in the licence.
    const fixed: Beneficiary[] = [
      { addr: license.owner, bps: universityPct * 100 },
      ...splitEvenly(license.inventors, inventorsPct * 100),
    ].filter((b) => b.bps > 0);
    setBusy(true);
    const done = await run(t("newLicence.toasts.split"), () =>
      splitter.configure(signer, license.id, { fixed, investors_bps: investorsPct * 100 }),
    );
    setBusy(false);
    if (done) onDone();
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm font-semibold">{t("newLicence.royaltySplit")}</p>
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label={t("newLicence.university")}>
          <Input type="number" min={0} max={100} value={universityPct} onChange={(e) => setUniversityPct(Number(e.target.value))} />
        </Field>
        <Field label={t("newLicence.inventors")}>
          <Input type="number" min={0} max={100} value={inventorsPct} onChange={(e) => setInventorsPct(Number(e.target.value))} />
        </Field>
        <Field label={t("newLicence.investors")}>
          <Input type="number" min={0} max={100} value={investorsPct} onChange={(e) => setInvestorsPct(Number(e.target.value))} />
        </Field>
      </div>
      <SplitPreview
        parts={[
          { label: t("newLicence.university"), pct: universityPct, color: "bg-brand", text: "text-on-brand" },
          { label: t("newLicence.inventors"), pct: inventorsPct, color: "bg-rose", text: "text-navy" },
          { label: t("newLicence.investors"), pct: investorsPct, color: "bg-amber", text: "text-navy" },
        ]}
      />
      <FormError message={error} />
      <Button busy={busy} onClick={submit} className="self-start">
        {t("newLicence.steps.split")}
      </Button>
    </div>
  );
}

function RoundForm({ license, signer, onDone }: { license: License; signer: Signer; onDone: () => void }) {
  const { t } = useTranslation();
  const { run } = useToasts();
  const [investor, setInvestor] = useState("");
  const [arbiter, setArbiter] = useState("");
  const [milestones, setMilestones] = useState<string[]>([""]);
  // The option labelled "recommended".
  const [challengeWindow, setChallengeWindow] = useState<number>(WINDOWS[2].seconds);
  const [periodDays, setPeriodDays] = useState(DEFAULT_PERIOD_DAYS);
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const people = (kind: PersonKind) => DIRECTORY.filter((p) => p.kind === kind);

  async function submit() {
    setError(undefined);
    if (!isAddress(investor) || !isAddress(arbiter)) return setError(t("newLicence.errors.parties"));
    // The contract refuses it too (InvalidParties): the arbiter settles disputes between them.
    if (arbiter === investor || arbiter === license.owner) return setError(t("newLicence.errors.arbiter"));
    if (milestones.length === 0 || milestones.some((m) => !(Number(m) > 0))) return setError(t("newLicence.errors.milestones"));
    setBusy(true);
    const done = await run(t("newLicence.toasts.round"), () =>
      escrow.create(signer, {
        licenseId: license.id,
        investor,
        arbiter,
        amounts: milestones,
        challengePeriod: challengeWindow,
        deadline: deadlineIn(periodDays),
      }),
    );
    setBusy(false);
    if (done) onDone();
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t("newLicence.investor")} hint={t("newLicence.investorHint")}>
          <PersonPicker value={investor} onChange={setInvestor} suggested={people("investor")} />
        </Field>
        <Field label={t("newLicence.arbiter")} hint={t("newLicence.arbiterHint")}>
          <PersonPicker value={arbiter} onChange={setArbiter} suggested={people("arbiter")} />
        </Field>
      </div>

      <MilestoneEditor milestones={milestones} onChange={setMilestones} />

      <RoundTimingFields
        challengeWindow={challengeWindow}
        onChallengeWindow={setChallengeWindow}
        periodDays={periodDays}
        onPeriodDays={setPeriodDays}
      />

      <FormError message={error} />
      <Button busy={busy} onClick={submit} className="self-start">
        {t("newLicence.steps.round")}
      </Button>
    </div>
  );
}
