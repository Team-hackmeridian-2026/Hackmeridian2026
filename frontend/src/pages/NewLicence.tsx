import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { ACCOUNTS } from "../config";
import { escrow, nft, splitter, type Beneficiary } from "../stellar/contracts";
import { useWallet } from "../stellar/wallet";
import { useToasts } from "../components/toasts";
import { DIRECTORY, PersonPicker } from "../components/people";
import { useAsync } from "../lib/useAsync";
import { sha256, toHex } from "../lib/format";
import { Badge, Button, Card, ErrorBox, Field, Input, SectionTitle, TxLink } from "../components/ui";

const WINDOWS = [
  { label: "1 minute (live demo)", seconds: 60 },
  { label: "1 day", seconds: 86_400 },
  { label: "7 days (recommended)", seconds: 604_800 },
];

type Step = { label: string; state: "todo" | "running" | "done" | "error"; hash?: string };

const INITIAL_STEPS: Step[] = [
  { label: "Create the licence", state: "todo" },
  { label: "Lock the royalty split", state: "todo" },
  { label: "Open the funding round", state: "todo" },
];

const isAddress = (a: string) => /^G[A-Z2-7]{55}$/.test(a);

/** Splits `total` bps evenly between addresses; the remainder goes to the first one. */
function splitEvenly(addresses: string[], total: number): Beneficiary[] {
  const each = Math.floor(total / addresses.length);
  return addresses.map((addr, i) => ({ addr, bps: each + (i === 0 ? total - each * addresses.length : 0) }));
}

function CardTitle({ n, title, subtitle }: { n: number; title: string; subtitle: string }) {
  return (
    <div className="flex items-start gap-3">
      <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-navy font-display text-sm font-semibold text-paper">
        {n}
      </span>
      <div>
        <h3 className="font-display text-lg font-semibold">{title}</h3>
        <p className="text-sm text-muted">{subtitle}</p>
      </div>
    </div>
  );
}

function SplitPreview({ parts }: { parts: { label: string; pct: number; color: string }[] }) {
  const total = parts.reduce((s, p) => s + (Number.isFinite(p.pct) ? p.pct : 0), 0);
  return (
    <div className="flex flex-col items-start gap-2">
      <div className="flex h-7 w-full overflow-hidden rounded-lg bg-line">
        {parts.map((p) =>
          p.pct > 0 ? (
            <div key={p.label} className={`${p.color} flex items-center justify-center text-xs font-semibold text-white`} style={{ width: `${Math.min(p.pct, 100)}%` }}>
              {p.pct}%
            </div>
          ) : null,
        )}
      </div>
      {total === 100 ? (
        <Badge tone="teal">Total 100 %: every royalty is fully shared</Badge>
      ) : (
        <Badge tone="danger">Total {total} %: it must be exactly 100 %</Badge>
      )}
    </div>
  );
}

export function NewLicence() {
  const { signer } = useWallet();
  const { run } = useToasts();
  const navigate = useNavigate();

  const [title, setTitle] = useState("Anti-inflammatory antibody for rheumatoid arthritis");
  const [field, setField] = useState("Biotech");
  const [territory, setTerritory] = useState("European Union");
  const [years, setYears] = useState("10");
  const [exclusive, setExclusive] = useState(true);
  const [inventors, setInventors] = useState<string[]>([ACCOUNTS.inventor]);
  const [file, setFile] = useState<File | null>(null);
  const [hash, setHash] = useState<Uint8Array | null>(null);
  const [metadataUri, setMetadataUri] = useState("");
  const [universityPct, setUniversityPct] = useState(40);
  const [inventorsPct, setInventorsPct] = useState(30);
  const [investorsPct, setInvestorsPct] = useState(30);
  const [investor, setInvestor] = useState(ACCOUNTS.fund);
  const [arbiter, setArbiter] = useState(ACCOUNTS.arbiter);
  const [milestones, setMilestones] = useState<string[]>(["2", "2", "2"]);
  const [challengeWindow, setChallengeWindow] = useState(WINDOWS[0].seconds);

  const [steps, setSteps] = useState<Step[]>(INITIAL_STEPS);
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string>();

  const institution = useAsync(
    () => (signer ? nft.isInstitution(signer.address) : Promise.resolve(false)),
    [signer?.address],
  );

  const total = milestones.reduce((s, m) => s + (Number(m) || 0), 0);
  const blocker = !signer
    ? "Connect the university's wallet first."
    : institution.data === false
      ? "This account is not a verified institution yet (see Admin)."
      : null;

  const setStep = (i: number, patch: Partial<Step>) =>
    setSteps((all) => all.map((s, j) => (j === i ? { ...s, ...patch } : s)));

  async function onFile(f: File | null) {
    setFile(f);
    setHash(f ? await sha256(f) : null);
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!signer) return;
    setFormError(undefined);

    const inventorList = inventors.filter(Boolean);
    if (!hash) return setFormError("Add the scientific dossier: only its fingerprint goes on-chain.");
    if (inventorList.length === 0 || !inventorList.every(isAddress)) return setFormError("Check the inventors' addresses.");
    if (!isAddress(investor) || !isAddress(arbiter)) return setFormError("Choose an investor and an arbiter.");
    if (universityPct + inventorsPct + investorsPct !== 100) return setFormError("The royalty split must add up to 100 %.");
    if (milestones.length === 0 || milestones.some((m) => !(Number(m) > 0)))
      return setFormError("Every milestone needs a positive amount.");

    setBusy(true);
    setSteps(INITIAL_STEPS);
    try {
      setStep(0, { state: "running" });
      const minted = await run("Licence created", () =>
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
      const configured = await run("Royalty split locked", () =>
        splitter.configure(signer, licenseId, { fixed, investors_bps: investorsPct * 100 }),
      );
      if (!configured) return setStep(1, { state: "error" });
      setStep(1, { state: "done", hash: configured.hash });

      setStep(2, { state: "running" });
      const created = await run("Funding round opened", () =>
        escrow.create(signer, { licenseId, investor, arbiter, amounts: milestones, challengePeriod: challengeWindow }),
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

  const people = (role: string) => DIRECTORY.filter((p) => p.role.startsWith(role));

  return (
    <div className="flex flex-col gap-8">
      <SectionTitle eyebrow="For universities and labs" title="List a patent">
        <p className="max-w-md text-sm text-muted">
          Your university stays the owner: you publish a licence, not the patent. Fill in 3 short sections, then confirm
          3 times in your wallet.
        </p>
      </SectionTitle>

      <form onSubmit={submit} className="grid gap-6 lg:grid-cols-[1fr_340px]">
        <div className="flex flex-col gap-6">
          <Card className="flex flex-col gap-5">
            <CardTitle n={1} title="What are you licensing?" subtitle="The terms an industrial partner will see." />
            <Field label="Patent title">
              <Input value={title} onChange={(e) => setTitle(e.target.value)} required />
            </Field>
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="Research field">
                <Input value={field} onChange={(e) => setField(e.target.value)} required />
              </Field>
              <Field label="Territory">
                <Input value={territory} onChange={(e) => setTerritory(e.target.value)} required />
              </Field>
              <Field label="Licence length (years)">
                <Input type="number" min={1} value={years} onChange={(e) => setYears(e.target.value)} required />
              </Field>
            </div>
            <div className="flex flex-col gap-2">
              <span className="text-sm font-semibold">Licence type</span>
              <div className="grid gap-3 sm:grid-cols-2">
                {[
                  { value: true, title: "Exclusive", text: "A single industrial partner can use the patent." },
                  { value: false, title: "Non-exclusive", text: "Several partners can license it in parallel." },
                ].map((o) => (
                  <button
                    key={o.title}
                    type="button"
                    onClick={() => setExclusive(o.value)}
                    className={`rounded-xl border p-3 text-left text-sm transition ${
                      exclusive === o.value ? "border-teal-dark bg-teal/10" : "border-line bg-white hover:border-teal-dark"
                    }`}
                  >
                    <p className="font-semibold">{o.title}</p>
                    <p className="text-muted">{o.text}</p>
                  </button>
                ))}
              </div>
            </div>
            <div className="flex flex-col gap-2">
              <span className="text-sm font-semibold">Inventors</span>
              {inventors.map((addr, i) => (
                <div key={i} className="flex items-start gap-2">
                  <div className="flex-1">
                    <PersonPicker
                      value={addr}
                      suggested={people("Inventor")}
                      onChange={(a) => setInventors((all) => all.map((x, j) => (j === i ? a : x)))}
                    />
                  </div>
                  {inventors.length > 1 && (
                    <Button type="button" variant="ghost" onClick={() => setInventors((all) => all.filter((_, j) => j !== i))}>
                      Remove
                    </Button>
                  )}
                </div>
              ))}
              <Button type="button" variant="ghost" className="self-start" onClick={() => setInventors((all) => [...all, ""])}>
                + Add an inventor
              </Button>
            </div>
          </Card>

          <Card className="flex flex-col gap-5">
            <CardTitle n={2} title="Prove the research exists" subtitle="Your dossier stays private; only its fingerprint is public." />
            <label
              className={`flex cursor-pointer flex-col items-center gap-2 rounded-xl border-2 border-dashed px-6 py-8 text-center transition ${
                hash ? "border-teal-dark bg-teal/5" : "border-line bg-white hover:border-teal-dark"
              }`}
            >
              <input type="file" className="hidden" onChange={(e) => onFile(e.target.files?.[0] ?? null)} />
              {hash ? (
                <>
                  <Badge tone="teal">Fingerprint ready</Badge>
                  <p className="font-semibold">{file?.name}</p>
                  <p className="break-all font-mono text-xs text-muted">SHA-256 {toHex(hash)}</p>
                  <p className="text-xs text-teal-dark">Click to choose another file</p>
                </>
              ) : (
                <>
                  <p className="font-semibold">Choose the scientific dossier (PDF, any file)</p>
                  <p className="text-sm text-muted">
                    It is fingerprinted in your browser and never uploaded. Anyone can later check a copy against the
                    fingerprint stored on Stellar.
                  </p>
                </>
              )}
            </label>
            <Field label="Private data room link (optional)" hint="Revealed only to people who sign the NDA on-chain.">
              <Input value={metadataUri} onChange={(e) => setMetadataUri(e.target.value)} placeholder="https://… or ipfs://…" />
            </Field>
          </Card>

          <Card className="flex flex-col gap-5">
            <CardTitle n={3} title="How is it funded and who earns what?" subtitle="Funds are released step by step; royalties are shared automatically." />

            <div className="flex flex-col gap-3">
              <span className="text-sm font-semibold">Royalty split</span>
              <div className="grid gap-4 sm:grid-cols-3">
                <Field label="University">
                  <Input type="number" min={0} max={100} value={universityPct} onChange={(e) => setUniversityPct(Number(e.target.value))} />
                </Field>
                <Field label="Inventors">
                  <Input type="number" min={0} max={100} value={inventorsPct} onChange={(e) => setInventorsPct(Number(e.target.value))} />
                </Field>
                <Field label="Investors">
                  <Input type="number" min={0} max={100} value={investorsPct} onChange={(e) => setInvestorsPct(Number(e.target.value))} />
                </Field>
              </div>
              <SplitPreview
                parts={[
                  { label: "University", pct: universityPct, color: "bg-teal-dark" },
                  { label: "Inventors", pct: inventorsPct, color: "bg-amber-dark" },
                  { label: "Investors", pct: investorsPct, color: "bg-navy" },
                ]}
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Investor" hint="Must have passed KYC on the platform.">
                <PersonPicker value={investor} onChange={setInvestor} suggested={people("Investor")} />
              </Field>
              <Field label="Arbiter" hint="Decides if the investor disputes a milestone.">
                <PersonPicker value={arbiter} onChange={setArbiter} suggested={people("Arbiter")} />
              </Field>
            </div>

            <div className="flex flex-col gap-2">
              <span className="text-sm font-semibold">Funding milestones</span>
              <p className="text-xs text-muted">Each amount is paid to the lab once you prove that milestone, in order.</p>
              {milestones.map((m, i) => (
                <div key={i} className="flex items-center gap-3">
                  <span className="w-24 text-sm text-muted">Milestone {i + 1}</span>
                  <Input
                    type="number"
                    min={0}
                    step="any"
                    value={m}
                    onChange={(e) => setMilestones((all) => all.map((x, j) => (j === i ? e.target.value : x)))}
                    className="w-32"
                  />
                  <span className="text-sm">EURC</span>
                  {milestones.length > 1 && (
                    <Button type="button" variant="ghost" onClick={() => setMilestones((all) => all.filter((_, j) => j !== i))}>
                      Remove
                    </Button>
                  )}
                </div>
              ))}
              <div className="flex items-center justify-between">
                <Button type="button" variant="ghost" onClick={() => setMilestones((all) => [...all, "1"])}>
                  + Add a milestone
                </Button>
                <p className="text-sm">
                  Total raised: <strong>{total.toLocaleString("en-US")} EURC</strong>
                </p>
              </div>
            </div>

            <Field label="Time the investor has to dispute a milestone">
              <select
                className="rounded-lg border border-line bg-white px-3 py-2 text-sm"
                value={challengeWindow}
                onChange={(e) => setChallengeWindow(Number(e.target.value))}
              >
                {WINDOWS.map((w) => (
                  <option key={w.seconds} value={w.seconds}>
                    {w.label}
                  </option>
                ))}
              </select>
            </Field>
          </Card>
        </div>

        <div className="flex flex-col gap-4 lg:sticky lg:top-6 lg:self-start">
          <Card className="flex flex-col gap-4">
            <h3 className="font-display text-lg font-semibold">Summary</h3>
            <dl className="flex flex-col gap-1 text-sm">
              <div className="flex justify-between gap-3"><dt className="text-muted">Licence</dt><dd className="text-right">{exclusive ? "Exclusive" : "Non-exclusive"}, {years} years</dd></div>
              <div className="flex justify-between gap-3"><dt className="text-muted">Funding</dt><dd>{total.toLocaleString("en-US")} EURC in {milestones.length} steps</dd></div>
              <div className="flex justify-between gap-3"><dt className="text-muted">Royalties</dt><dd>{universityPct} / {inventorsPct} / {investorsPct} %</dd></div>
              <div className="flex justify-between gap-3"><dt className="text-muted">Dossier</dt><dd>{hash ? "Fingerprinted" : "Missing"}</dd></div>
            </dl>
            <div className="border-t border-line pt-4">
              <p className="mb-3 text-sm font-semibold">Your wallet will ask you to confirm:</p>
              <ol className="flex flex-col gap-3">
                {steps.map((s, i) => (
                  <li key={s.label} className="flex flex-col gap-1">
                    <div className="flex items-center justify-between gap-2 text-sm">
                      <span>{i + 1}. {s.label}</span>
                      {s.state === "running" && <Badge tone="amber">Confirm in wallet…</Badge>}
                      {s.state === "done" && <Badge tone="teal">Done</Badge>}
                      {s.state === "error" && <Badge tone="danger">Failed</Badge>}
                    </div>
                    {s.hash && <TxLink hash={s.hash} />}
                  </li>
                ))}
              </ol>
            </div>
            {formError && <ErrorBox message={formError} />}
            <Button type="submit" busy={busy} disabled={Boolean(blocker)}>
              List the patent
            </Button>
            {blocker && <p className="text-xs text-muted">{blocker}</p>}
          </Card>
        </div>
      </form>
    </div>
  );
}
