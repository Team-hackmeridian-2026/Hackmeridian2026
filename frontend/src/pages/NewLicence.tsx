import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { ACCOUNTS } from "../config";
import { escrow, nft, splitter, type Beneficiary } from "../stellar/contracts";
import { useWallet } from "../stellar/wallet";
import { useToasts } from "../components/toasts";
import { useAsync } from "../lib/useAsync";
import { sha256, toHex } from "../lib/format";
import { Badge, Button, Card, ErrorBox, Field, Input, SectionTitle, TxLink } from "../components/ui";

const WINDOWS = [
  { label: "1 minute (demo)", seconds: 60 },
  { label: "1 day", seconds: 86_400 },
  { label: "7 days", seconds: 604_800 },
];

type Step = { label: string; state: "todo" | "running" | "done" | "error"; hash?: string };

const INITIAL_STEPS: Step[] = [
  { label: "Mint the licence IP-NFT", state: "todo" },
  { label: "Fix the royalty split", state: "todo" },
  { label: "Open the funding round", state: "todo" },
];

/** Splits `total` bps evenly between addresses; the remainder goes to the first one. */
function splitEvenly(addresses: string[], total: number): Beneficiary[] {
  const each = Math.floor(total / addresses.length);
  return addresses.map((addr, i) => ({ addr, bps: each + (i === 0 ? total - each * addresses.length : 0) }));
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
  const [inventors, setInventors] = useState(ACCOUNTS.inventor);
  const [file, setFile] = useState<File | null>(null);
  const [hash, setHash] = useState<Uint8Array | null>(null);
  const [metadataUri, setMetadataUri] = useState("");
  const [universityPct, setUniversityPct] = useState("40");
  const [inventorsPct, setInventorsPct] = useState("30");
  const [investorsPct, setInvestorsPct] = useState("30");
  const [investor, setInvestor] = useState(ACCOUNTS.fund);
  const [arbiter, setArbiter] = useState(ACCOUNTS.arbiter);
  const [milestones, setMilestones] = useState("10, 10, 10");
  const [challengeWindow, setChallengeWindow] = useState(WINDOWS[0].seconds);

  const [steps, setSteps] = useState<Step[]>(INITIAL_STEPS);
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string>();

  const institution = useAsync(
    () => (signer ? nft.isInstitution(signer.address) : Promise.resolve(false)),
    [signer?.address],
  );

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

    const inventorList = inventors.split(/[\s,]+/).filter(Boolean);
    const amounts = milestones.split(/[\s,;]+/).filter(Boolean);
    const pcts = [universityPct, inventorsPct, investorsPct].map(Number);
    if (!hash) return setFormError("Add the scientific dossier: only its SHA-256 fingerprint goes on-chain.");
    if (inventorList.length === 0) return setFormError("Add at least one inventor address.");
    if (pcts.some((p) => !Number.isInteger(p) || p < 0) || pcts[0] + pcts[1] + pcts[2] !== 100)
      return setFormError("The royalty split must be whole percentages that add up to 100 %.");
    if (amounts.length === 0) return setFormError("Add at least one milestone amount.");

    setBusy(true);
    setSteps(INITIAL_STEPS);
    try {
      setStep(0, { state: "running" });
      const minted = await run("Licence minted", () =>
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
        { addr: signer.address, bps: pcts[0] * 100 },
        ...splitEvenly(inventorList, pcts[1] * 100),
      ].filter((b) => b.bps > 0);
      const configured = await run("Royalty split fixed", () =>
        splitter.configure(signer, licenseId, { fixed, investors_bps: pcts[2] * 100 }),
      );
      if (!configured) return setStep(1, { state: "error" });
      setStep(1, { state: "done", hash: configured.hash });

      setStep(2, { state: "running" });
      const created = await run("Funding round opened", () =>
        escrow.create(signer, { licenseId, investor, arbiter, amounts, challengePeriod: challengeWindow }),
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

  return (
    <div className="flex flex-col gap-8">
      <SectionTitle eyebrow="For universities and labs" title="List a patent">
        <p className="max-w-md text-sm text-muted">
          Your university stays the owner: you tokenize a licence, not the patent. Three signatures, about 15 seconds.
        </p>
      </SectionTitle>

      {!signer && <ErrorBox message="Connect the university's wallet to list a patent." />}
      {signer && institution.data === false && (
        <ErrorBox message="This address is not a verified institution yet. Ask the platform admin to verify it on the Admin page." />
      )}

      <form onSubmit={submit} className="grid gap-6 lg:grid-cols-[1fr_340px]">
        <div className="flex flex-col gap-6">
          <Card className="flex flex-col gap-4">
            <h3 className="font-display text-lg font-semibold">1 · The licence</h3>
            <Field label="Title">
              <Input value={title} onChange={(e) => setTitle(e.target.value)} required />
            </Field>
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="Field">
                <Input value={field} onChange={(e) => setField(e.target.value)} required />
              </Field>
              <Field label="Territory">
                <Input value={territory} onChange={(e) => setTerritory(e.target.value)} required />
              </Field>
              <Field label="Duration (years)">
                <Input type="number" min={1} value={years} onChange={(e) => setYears(e.target.value)} required />
              </Field>
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={exclusive} onChange={(e) => setExclusive(e.target.checked)} />
              Exclusive licence
            </label>
            <Field label="Inventors" hint="Stellar addresses, separated by commas. They share the inventors' royalty equally.">
              <Input value={inventors} onChange={(e) => setInventors(e.target.value)} className="font-mono" required />
            </Field>
          </Card>

          <Card className="flex flex-col gap-4">
            <h3 className="font-display text-lg font-semibold">2 · The scientific dossier</h3>
            <Field
              label="Dossier file"
              hint="Hashed in your browser. The file never leaves your computer: only its SHA-256 fingerprint is stored on Stellar."
            >
              <Input type="file" onChange={(e) => onFile(e.target.files?.[0] ?? null)} />
            </Field>
            {hash && (
              <p className="break-all rounded-lg bg-paper px-3 py-2 font-mono text-xs text-muted">
                {file?.name} · sha256 {toHex(hash)}
              </p>
            )}
            <Field label="Encrypted data room link (optional)" hint="Shown only to viewers who signed the NDA on-chain.">
              <Input value={metadataUri} onChange={(e) => setMetadataUri(e.target.value)} placeholder="ipfs://…" />
            </Field>
          </Card>

          <Card className="flex flex-col gap-4">
            <h3 className="font-display text-lg font-semibold">3 · Royalties and funding</h3>
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="University %">
                <Input type="number" min={0} max={100} value={universityPct} onChange={(e) => setUniversityPct(e.target.value)} />
              </Field>
              <Field label="Inventors %">
                <Input type="number" min={0} max={100} value={inventorsPct} onChange={(e) => setInventorsPct(e.target.value)} />
              </Field>
              <Field label="Investors %">
                <Input type="number" min={0} max={100} value={investorsPct} onChange={(e) => setInvestorsPct(e.target.value)} />
              </Field>
            </div>
            <Field label="Investor" hint="Must have passed KYC on the platform.">
              <Input value={investor} onChange={(e) => setInvestor(e.target.value)} className="font-mono" required />
            </Field>
            <Field label="Arbiter" hint="Rules on disputed milestones: a tech transfer office or scientific board.">
              <Input value={arbiter} onChange={(e) => setArbiter(e.target.value)} className="font-mono" required />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Milestones (EURC)" hint="One amount per milestone, released in order.">
                <Input value={milestones} onChange={(e) => setMilestones(e.target.value)} required />
              </Field>
              <Field label="Challenge window" hint="Time the investor has to dispute a milestone.">
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
            </div>
          </Card>
        </div>

        <div className="flex flex-col gap-4 lg:sticky lg:top-6 lg:self-start">
          <Card className="flex flex-col gap-4">
            <h3 className="font-display text-lg font-semibold">On-chain steps</h3>
            <ol className="flex flex-col gap-3">
              {steps.map((s, i) => (
                <li key={s.label} className="flex flex-col gap-1">
                  <div className="flex items-center justify-between gap-2 text-sm">
                    <span>
                      {i + 1}. {s.label}
                    </span>
                    {s.state === "running" && <Badge tone="amber">Signing…</Badge>}
                    {s.state === "done" && <Badge tone="teal">Done</Badge>}
                    {s.state === "error" && <Badge tone="danger">Failed</Badge>}
                  </div>
                  {s.hash && <TxLink hash={s.hash} />}
                </li>
              ))}
            </ol>
            {formError && <ErrorBox message={formError} />}
            <Button type="submit" busy={busy} disabled={!signer || institution.data === false}>
              List the patent
            </Button>
          </Card>
        </div>
      </form>
    </div>
  );
}
