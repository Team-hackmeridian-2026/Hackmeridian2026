import { useEffect, useState, type DragEvent, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ACCOUNTS } from "../config";
import { escrow, nft, splitter, type Beneficiary } from "../stellar/contracts";
import { DEMO_ENABLED, useWallet } from "../stellar/wallet";
import { useToasts } from "../components/toasts";
import { DIRECTORY, PersonPicker, type PersonKind } from "../components/people";
import { useAsync } from "../lib/useAsync";
import { formatDate, formatNumber, sha256, toHex } from "../lib/format";
import { Badge, Button, Card, ErrorBox, Field, Input, Notice, SectionTitle, StatusIcon, TxLink } from "../components/ui";
import { useDocumentTitle } from "../lib/useDocumentTitle";
import {
  DEFAULT_PERIOD_DAYS,
  MilestoneEditor,
  RoundTimingFields,
  SplitPreview,
  WINDOWS,
  deadlineIn,
  isAddress,
  splitEvenly,
} from "../components/listing";

type Step = { key: "mint" | "split" | "round"; state: "todo" | "running" | "done" | "error"; hash?: string };

const INITIAL_STEPS: Step[] = [
  { key: "mint", state: "todo" },
  { key: "split", state: "todo" },
  { key: "round", state: "todo" },
];

/**
 * Starting values of the form. The stage demo (local build with demo keys, see
 * scripts/sync-frontend-config.sh --demo) gets a ready-to-submit sample; the public
 * site starts empty, so a real lab never names the demo fund or arbiter by accident.
 */
const DEFAULTS = DEMO_ENABLED
  ? {
      title: "Anti-inflammatory antibody for rheumatoid arthritis",
      field: "Biotech",
      territory: "European Union",
      inventors: [ACCOUNTS.inventor],
      investor: ACCOUNTS.fund,
      arbiter: ACCOUNTS.arbiter,
      milestones: ["2", "2", "2"],
      challengeWindow: WINDOWS[0].seconds,
    }
  : {
      title: "",
      field: "",
      territory: "",
      inventors: [""],
      investor: "",
      arbiter: "",
      milestones: [""],
      // The option labelled "recommended".
      challengeWindow: WINDOWS[2].seconds,
    };

type FieldKey = "dossier" | "inventors" | "parties" | "split" | "milestones";

/** Error shown right under the section it is about. */
function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <p role="alert" className="text-sm font-medium text-danger">
      {message}
    </p>
  );
}

// Step badges from the Figma: lavender, pink, peach.
const STEP_COLORS = ["bg-dna-violet/25", "bg-dna-pink/30", "bg-dna-peach/30"];

function CardTitle({ n, title, subtitle }: { n: number; title: string; subtitle: string }) {
  return (
    <div className="flex items-start gap-4">
      <span className={`flex size-11 shrink-0 items-center justify-center rounded-xl font-display text-lg font-bold text-ink ${STEP_COLORS[(n - 1) % 3]}`}>
        {n}
      </span>
      <div>
        <h3 className="font-display text-2xl font-bold tracking-tight">{title}</h3>
        <p className="text-sm text-muted">{subtitle}</p>
      </div>
    </div>
  );
}

export function NewLicence() {
  const { t } = useTranslation();
  useDocumentTitle(t("nav.newLicence"));
  const { signer } = useWallet();
  const { run } = useToasts();
  const navigate = useNavigate();

  const [title, setTitle] = useState(DEFAULTS.title);
  const [field, setField] = useState(DEFAULTS.field);
  const [territory, setTerritory] = useState(DEFAULTS.territory);
  const [years, setYears] = useState("10");
  const [exclusive, setExclusive] = useState(true);
  const [inventors, setInventors] = useState<string[]>(DEFAULTS.inventors);
  const [file, setFile] = useState<File | null>(null);
  const [hash, setHash] = useState<Uint8Array | null>(null);
  const [metadataUri, setMetadataUri] = useState("");
  const [universityPct, setUniversityPct] = useState(40);
  const [inventorsPct, setInventorsPct] = useState(30);
  const [investorsPct, setInvestorsPct] = useState(30);
  const [investor, setInvestor] = useState(DEFAULTS.investor);
  const [arbiter, setArbiter] = useState(DEFAULTS.arbiter);
  const [milestones, setMilestones] = useState<string[]>(DEFAULTS.milestones);
  const [challengeWindow, setChallengeWindow] = useState<number>(DEFAULTS.challengeWindow);
  const [periodDays, setPeriodDays] = useState(DEFAULT_PERIOD_DAYS);

  const [steps, setSteps] = useState<Step[]>(INITIAL_STEPS);
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string>();
  const [errorField, setErrorField] = useState<FieldKey | null>(null);
  const [dragging, setDragging] = useState(false);
  const fieldError = (key: FieldKey) => (errorField === key ? formError : undefined);

  // Live re-validation: once the user edits the faulty part, the message goes away.
  useEffect(() => {
    setErrorField(null);
    setFormError(undefined);
  }, [hash, inventors, investor, arbiter, universityPct, inventorsPct, investorsPct, milestones]);

  /** Shows a validation message next to its section and brings that section into view. */
  function fail(key: FieldKey, message: string) {
    setFormError(message);
    setErrorField(key);
    document.getElementById(`section-${key}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  const institution = useAsync(
    () => (signer ? nft.isInstitution(signer.address) : Promise.resolve(false)),
    [signer?.address],
  );

  const total = milestones.reduce((s, m) => s + (Number(m) || 0), 0);
  const blocker = !signer
    ? t("newLicence.blockers.connect")
    : institution.data === false
      ? t("newLicence.blockers.notInstitution")
      : null;

  const setStep = (i: number, patch: Partial<Step>) =>
    setSteps((all) => all.map((s, j) => (j === i ? { ...s, ...patch } : s)));

  function onDrop(e: DragEvent<HTMLLabelElement>) {
    e.preventDefault();
    setDragging(false);
    const dropped = e.dataTransfer.files?.[0];
    if (dropped) onFile(dropped);
  }

  async function onFile(f: File | null) {
    setFile(f);
    setHash(f ? await sha256(f) : null);
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!signer) return;
    setFormError(undefined);
    setErrorField(null);

    const inventorList = inventors.filter(Boolean);
    if (!hash) return fail("dossier", t("newLicence.errors.dossier"));
    if (inventorList.length === 0 || !inventorList.every(isAddress)) return fail("inventors", t("newLicence.errors.inventors"));
    if (!isAddress(investor) || !isAddress(arbiter)) return fail("parties", t("newLicence.errors.parties"));
    // The contract refuses it too (InvalidParties): the arbiter settles disputes between them.
    if (arbiter === investor || arbiter === signer.address) return fail("parties", t("newLicence.errors.arbiter"));
    if (universityPct + inventorsPct + investorsPct !== 100) return fail("split", t("newLicence.errors.split"));
    if (milestones.length === 0 || milestones.some((m) => !(Number(m) > 0)))
      return fail("milestones", t("newLicence.errors.milestones"));

    setBusy(true);
    setSteps(INITIAL_STEPS);
    try {
      setStep(0, { state: "running" });
      const minted = await run(t("newLicence.toasts.mint"), () =>
        nft.mint(signer, {
          title,
          inventors: inventorList,
          terms: { exclusive, territory, field, duration_years: Number(years) },
          dossierHash: hash,
          metadataUri,
        }),
      );
      if (!minted) return setStep(0, { state: "error" });
      const licenseId = minted.result as bigint;
      setStep(0, { state: "done", hash: minted.hash });

      setStep(1, { state: "running" });
      const fixed: Beneficiary[] = [
        { addr: signer.address, bps: universityPct * 100 },
        ...splitEvenly(inventorList, inventorsPct * 100),
      ].filter((b) => b.bps > 0);
      const configured = await run(t("newLicence.toasts.split"), () =>
        splitter.configure(signer, licenseId, { fixed, investors_bps: investorsPct * 100 }),
      );
      if (!configured) return setStep(1, { state: "error" });
      setStep(1, { state: "done", hash: configured.hash });

      setStep(2, { state: "running" });
      const created = await run(t("newLicence.toasts.round"), () =>
        escrow.create(signer, {
          licenseId,
          investor,
          arbiter,
          amounts: milestones,
          challengePeriod: challengeWindow,
          deadline: deadlineIn(periodDays),
        }),
      );
      if (!created) return setStep(2, { state: "error" });
      setStep(2, { state: "done", hash: created.hash });

      navigate(`/licence/${licenseId}`);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  const people = (kind: PersonKind) => DIRECTORY.filter((p) => p.kind === kind);

  return (
    <div className="flex flex-col gap-8">
      <SectionTitle eyebrow={t("newLicence.eyebrow")} title={t("newLicence.title")}>
        <p>{t("newLicence.intro")}</p>
      </SectionTitle>

      <form onSubmit={submit} className="grid gap-6 lg:grid-cols-[1fr_340px]">
        <div className="flex min-w-0 flex-col gap-6">
          <Card className="flex flex-col gap-5">
            <CardTitle n={1} title={t("newLicence.card1Title")} subtitle={t("newLicence.card1Subtitle")} />
            <Field label={t("newLicence.patentTitle")}>
              <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={t("newLicence.patentTitlePlaceholder")} required />
            </Field>
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label={t("newLicence.field")}>
                <Input value={field} onChange={(e) => setField(e.target.value)} placeholder={t("newLicence.fieldPlaceholder")} required />
              </Field>
              <Field label={t("newLicence.territory")}>
                <Input value={territory} onChange={(e) => setTerritory(e.target.value)} placeholder={t("newLicence.territoryPlaceholder")} required />
              </Field>
              <Field label={t("newLicence.years")}>
                <Input type="number" min={1} value={years} onChange={(e) => setYears(e.target.value)} required />
              </Field>
            </div>
            <div className="flex flex-col gap-2">
              <span className="text-sm font-semibold">{t("newLicence.licenceType")}</span>
              <div role="radiogroup" aria-label={t("newLicence.licenceType")} className="grid gap-3 sm:grid-cols-2">
                {[
                  { value: true, title: t("common.exclusive"), text: t("newLicence.exclusiveText") },
                  { value: false, title: t("common.nonExclusive"), text: t("newLicence.nonExclusiveText") },
                ].map((o) => (
                  <button
                    key={o.title}
                    type="button"
                    onClick={() => setExclusive(o.value)}
                    role="radio"
                    aria-checked={exclusive === o.value}
                    className={`flex items-start gap-3 rounded-2xl border p-4 text-left text-sm transition duration-200 ${
                      exclusive === o.value ? "border-brand bg-brand/5 ring-1 ring-brand" : "border-line bg-field hover:border-ink/25"
                    }`}
                  >
                    <span
                      aria-hidden
                      className={`mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full border-2 ${exclusive === o.value ? "border-brand" : "border-line"}`}
                    >
                      {exclusive === o.value && <span className="size-2 rounded-full bg-brand" />}
                    </span>
                    <span>
                      <span className="block font-semibold">{o.title}</span>
                      <span className="block text-muted">{o.text}</span>
                    </span>
                  </button>
                ))}
              </div>
            </div>
            <div id="section-inventors" className="flex flex-col gap-2">
              <span className="text-sm font-semibold">{t("newLicence.inventors")}</span>
              {inventors.map((addr, i) => (
                <div key={i} className="flex items-start gap-2">
                  <div className="flex-1">
                    <PersonPicker
                      value={addr}
                      suggested={people("inventor")}
                      onChange={(a) => setInventors((all) => all.map((x, j) => (j === i ? a : x)))}
                    />
                  </div>
                  {inventors.length > 1 && (
                    <Button type="button" variant="ghost" onClick={() => setInventors((all) => all.filter((_, j) => j !== i))}>
                      {t("common.remove")}
                    </Button>
                  )}
                </div>
              ))}
              <Button type="button" variant="ghost" className="self-start" onClick={() => setInventors((all) => [...all, ""])}>
                {t("newLicence.addInventor")}
              </Button>
              <FieldError message={fieldError("inventors")} />
            </div>
          </Card>

          <Card className="flex flex-col gap-5">
            <CardTitle n={2} title={t("newLicence.card2Title")} subtitle={t("newLicence.card2Subtitle")} />
            <label
              id="section-dossier"
              onDragOver={(e) => {
                e.preventDefault();
                setDragging(true);
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={onDrop}
              className={`flex cursor-pointer flex-col items-center gap-2 rounded-xl border-2 border-dashed px-6 py-8 text-center transition duration-200 focus-within:ring-2 focus-within:ring-brand ${
                dragging
                  ? "border-brand bg-brand/10"
                  : fieldError("dossier")
                    ? "border-danger/60 bg-danger/5"
                    : hash
                      ? "border-brand-ink bg-brand/5"
                      : "border-line bg-field hover:border-brand-ink"
              }`}
            >
              {/* sr-only rather than hidden, so the file picker stays reachable with the keyboard. */}
              <input type="file" className="sr-only" onChange={(e) => onFile(e.target.files?.[0] ?? null)} />
              {hash ? (
                <>
                  <Badge tone="brand">{t("newLicence.fingerprintReady")}</Badge>
                  <p className="font-semibold">{file?.name}</p>
                  <p className="break-all font-mono text-xs text-muted">SHA-256 {toHex(hash)}</p>
                  <p className="text-xs text-brand-ink">{t("newLicence.chooseAnother")}</p>
                </>
              ) : (
                <>
                  <p className="font-semibold">{t("newLicence.chooseDossier")}</p>
                  <p className="text-sm text-muted">{t("newLicence.dossierText")}</p>
                </>
              )}
            </label>
            <FieldError message={fieldError("dossier")} />
            <Field label={t("newLicence.dataRoom")} hint={t("newLicence.dataRoomHint")}>
              <Input value={metadataUri} onChange={(e) => setMetadataUri(e.target.value)} placeholder={t("newLicence.dataRoomPlaceholder")} />
            </Field>
          </Card>

          <Card className="flex flex-col gap-5">
            <CardTitle n={3} title={t("newLicence.card3Title")} subtitle={t("newLicence.card3Subtitle")} />

            <div id="section-split" className="flex flex-col gap-3">
              <span className="text-sm font-semibold">{t("newLicence.royaltySplit")}</span>
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
              <FieldError message={fieldError("split")} />
            </div>

            <div id="section-parties" className="grid gap-4 sm:grid-cols-2">
              <Field label={t("newLicence.investor")} hint={t("newLicence.investorHint")}>
                <PersonPicker value={investor} onChange={setInvestor} suggested={people("investor")} />
              </Field>
              <Field label={t("newLicence.arbiter")} hint={t("newLicence.arbiterHint")}>
                <PersonPicker value={arbiter} onChange={setArbiter} suggested={people("arbiter")} />
              </Field>
              <div className="sm:col-span-2">
                <FieldError message={fieldError("parties")} />
              </div>
            </div>

            <div id="section-milestones" className="flex flex-col gap-2">
              <MilestoneEditor milestones={milestones} onChange={setMilestones} />
              <FieldError message={fieldError("milestones")} />
            </div>

            <RoundTimingFields
              challengeWindow={challengeWindow}
              onChallengeWindow={setChallengeWindow}
              periodDays={periodDays}
              onPeriodDays={setPeriodDays}
            />
          </Card>
        </div>

        <div className="flex flex-col gap-4 lg:sticky lg:top-6 lg:self-start">
          <Card className="flex flex-col gap-4">
            <h3 className="font-display text-2xl font-bold tracking-tight">{t("newLicence.summary")}</h3>
            <dl className="flex flex-col text-sm [&>div]:border-b [&>div]:border-line [&>div]:py-2.5 [&>div:first-child]:pt-0">
              <div className="flex justify-between gap-3"><dt className="text-muted">{t("newLicence.summaryLicence")}</dt><dd className="text-right">{exclusive ? t("common.exclusive") : t("common.nonExclusive")}, {t("common.years", { count: Number(years) })}</dd></div>
              <div className="flex justify-between gap-3"><dt className="text-muted">{t("newLicence.summaryFunding")}</dt><dd>{t("newLicence.summaryFundingValue", { amount: formatNumber(total), count: milestones.length })}</dd></div>
              <div className="flex justify-between gap-3"><dt className="text-muted">{t("newLicence.summaryRoyalties")}</dt><dd>{universityPct} / {inventorsPct} / {investorsPct} %</dd></div>
              <div className="flex justify-between gap-3"><dt className="text-muted">{t("newLicence.summaryDeadline")}</dt><dd className="text-right">{formatDate(deadlineIn(periodDays))}</dd></div>
              <div className="flex justify-between gap-3"><dt className="text-muted">{t("newLicence.summaryDossier")}</dt><dd>{hash ? t("newLicence.fingerprinted") : t("newLicence.missing")}</dd></div>
            </dl>
            <div>
              <p className="mb-3 text-sm font-semibold">{t("newLicence.walletWillAsk")}</p>
              <ol className="flex flex-col gap-3">
                {steps.map((s, i) => (
                  <li key={s.key} className="flex flex-col gap-1">
                    <div className="flex items-center justify-between gap-2 text-sm">
                      <span className="flex items-center gap-2.5">
                        <span className={s.state === "done" ? "text-success" : s.state === "error" ? "text-danger" : s.state === "running" ? "text-amber-dark" : "text-muted"}>
                          <StatusIcon kind={s.state === "todo" ? "pending" : s.state} className="size-4" />
                        </span>
                        {i + 1}. {t(`newLicence.steps.${s.key}`)}
                      </span>
                      {s.state === "running" && <Badge tone="amber">{t("newLicence.confirmInWallet")}</Badge>}
                      {s.state === "done" && <Badge tone="success">{t("newLicence.done")}</Badge>}
                      {s.state === "error" && <Badge tone="danger">{t("newLicence.failed")}</Badge>}
                    </div>
                    {s.hash && <TxLink hash={s.hash} />}
                  </li>
                ))}
              </ol>
            </div>
            {formError && !errorField && <ErrorBox message={formError} />}
            {blocker && <Notice tone="warning">{blocker}</Notice>}
            <Button type="submit" busy={busy} disabled={Boolean(blocker)} className="w-full">
              {t("newLicence.submit")}
            </Button>
          </Card>
        </div>
      </form>
    </div>
  );
}
