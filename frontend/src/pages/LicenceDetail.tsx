import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { escrow, nft, splitter, type License, type Milestone, type Project } from "../stellar/contracts";
import { useWallet, type Signer } from "../stellar/wallet";
import { useToasts } from "../components/toasts";
import { useAsync } from "../lib/useAsync";
import { eurc, formatDate, formatDuration, sha256, shortAddress, toHex } from "../lib/format";
import { Address, Badge, Button, Card, ErrorBox, Input, SectionTitle, Spinner } from "../components/ui";
import { fundingStatus } from "./Marketplace";

function useNow(): number {
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));
  useEffect(() => {
    const t = setInterval(() => setNow(Math.floor(Date.now() / 1000)), 1000);
    return () => clearInterval(t);
  }, []);
  return now;
}

// ---------- Licence header ----------

function DossierCheck({ license }: { license: License }) {
  const [result, setResult] = useState<"match" | "mismatch" | null>(null);
  const expected = toHex(license.dossier_hash);
  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs font-semibold uppercase tracking-widest text-muted">Dossier fingerprint (SHA-256)</p>
      <p className="break-all font-mono text-xs">{expected}</p>
      <label className="flex flex-wrap items-center gap-3 text-sm">
        <span className="font-semibold">Verify a file:</span>
        <input
          type="file"
          className="text-xs"
          onChange={async (e) => {
            const f = e.target.files?.[0];
            if (!f) return setResult(null);
            setResult(toHex(await sha256(f)) === expected ? "match" : "mismatch");
          }}
        />
        {result === "match" && <Badge tone="teal">Matches the on-chain fingerprint</Badge>}
        {result === "mismatch" && <Badge tone="danger">Does not match</Badge>}
      </label>
    </div>
  );
}

function DataRoom({ license, signer }: { license: License; signer: Signer | null }) {
  const { run } = useToasts();
  const signed = useAsync(
    () => (signer ? nft.hasSignedNda(license.id, signer.address) : Promise.resolve(false)),
    [license.id, signer?.address],
  );
  const [busy, setBusy] = useState(false);

  return (
    <Card className="flex flex-col gap-3">
      <h3 className="font-display text-lg font-semibold">Data room</h3>
      <p className="text-sm text-muted">
        The full dossier stays encrypted off-chain. Signing the confidentiality agreement is recorded on Stellar before
        access is granted.
      </p>
      {!signer ? (
        <p className="text-sm text-muted">Connect a wallet to request access.</p>
      ) : signed.data ? (
        <div className="flex flex-col gap-1 text-sm">
          <Badge tone="teal">NDA signed on-chain</Badge>
          {license.metadata_uri ? (
            <a href={license.metadata_uri} className="break-all text-teal-dark hover:underline">
              {license.metadata_uri}
            </a>
          ) : (
            <p className="text-muted">No data room link provided by the university.</p>
          )}
        </div>
      ) : (
        <Button
          variant="secondary"
          busy={busy}
          onClick={async () => {
            setBusy(true);
            if (await run("NDA signed", () => nft.signNda(signer, license.id))) signed.reload();
            setBusy(false);
          }}
        >
          Sign the NDA on-chain
        </Button>
      )}
    </Card>
  );
}

// ---------- Funding round ----------

const STATUS_TONE = {
  Pending: "neutral",
  Submitted: "amber",
  Disputed: "danger",
  Released: "teal",
  Refunded: "navy",
} as const;

const STATUS_LABEL = {
  Pending: "Pending",
  Submitted: "Proof submitted",
  Disputed: "Disputed",
  Released: "Funds released",
  Refunded: "Refunded",
} as const;

function MilestoneRow({
  project,
  milestone,
  index,
  signer,
  now,
  onDone,
}: {
  project: Project;
  milestone: Milestone;
  index: number;
  signer: Signer | null;
  now: number;
  onDone: () => void;
}) {
  const { run } = useToasts();
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState("");

  const me = signer?.address;
  const isLab = me === project.lab;
  const isInvestor = me === project.investor;
  const isArbiter = me === project.arbiter;
  const previousSettled = project.milestones
    .slice(0, index)
    .every((m) => m.status === "Released" || m.status === "Refunded");
  const deadline = Number(milestone.submitted_at) + Number(project.challenge_period);
  const windowOpen = milestone.status === "Submitted" && now < deadline;

  async function act(label: string, action: () => ReturnType<typeof escrow.release>) {
    setBusy(label);
    if (await run(label, action)) onDone();
    setBusy(null);
  }

  return (
    <li className="flex flex-col gap-3 rounded-xl border border-line bg-white p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-3">
          <span className="flex size-8 items-center justify-center rounded-full bg-paper font-display font-semibold">
            {index + 1}
          </span>
          <span className="font-semibold">{eurc(milestone.amount)}</span>
        </div>
        <Badge tone={STATUS_TONE[milestone.status]}>{STATUS_LABEL[milestone.status]}</Badge>
      </div>

      {milestone.proof_hash && (
        <p className="break-all font-mono text-xs text-muted">proof sha256 {toHex(milestone.proof_hash)}</p>
      )}
      {milestone.status === "Submitted" && (
        <p className="text-sm text-muted">
          {windowOpen
            ? `Challenge window: ${formatDuration(deadline - now)} left for the investor to dispute.`
            : "Challenge window closed with no dispute: anyone can release the funds."}
        </p>
      )}

      {signer && (
        <div className="flex flex-wrap items-center gap-2">
          {isLab && project.funded && milestone.status === "Pending" && previousSettled && (
            <>
              <Input placeholder="Milestone report (text or link)" value={note} onChange={(e) => setNote(e.target.value)} className="min-w-64 flex-1" />
              <Button
                busy={busy === "Proof submitted"}
                disabled={!note}
                onClick={async () => act("Proof submitted", async () => escrow.submit(signer, project.id, index, await sha256(note)))}
              >
                Submit proof
              </Button>
            </>
          )}
          {isInvestor && windowOpen && (
            <>
              <Input placeholder="Reason for the dispute" value={note} onChange={(e) => setNote(e.target.value)} className="min-w-64 flex-1" />
              <Button
                variant="danger"
                busy={busy === "Dispute filed"}
                disabled={!note}
                onClick={async () => act("Dispute filed", async () => escrow.dispute(signer, project.id, index, await sha256(note)))}
              >
                Dispute
              </Button>
            </>
          )}
          {milestone.status === "Submitted" && !windowOpen && (
            <Button busy={busy === "Funds released"} onClick={() => act("Funds released", () => escrow.release(signer, project.id, index))}>
              Release the funds
            </Button>
          )}
          {isArbiter && milestone.status === "Disputed" && (
            <>
              <Button busy={busy === "Milestone approved"} onClick={() => act("Milestone approved", () => escrow.resolve(signer, project.id, index, true))}>
                Approve: pay the lab
              </Button>
              <Button
                variant="danger"
                busy={busy === "Milestone refunded"}
                onClick={() => act("Milestone refunded", () => escrow.resolve(signer, project.id, index, false))}
              >
                Reject: refund the investor
              </Button>
            </>
          )}
        </div>
      )}
    </li>
  );
}

function FundingRound({ projectId, signer, onChange }: { projectId: bigint; signer: Signer | null; onChange: () => void }) {
  const { run } = useToasts();
  const now = useNow();
  const project = useAsync(() => escrow.get(projectId), [String(projectId)]);
  const [busy, setBusy] = useState(false);

  if (project.loading && !project.data) return <Spinner />;
  if (project.error) return <ErrorBox message={project.error} />;
  const p = project.data!;
  const total = p.milestones.reduce((s, m) => s + m.amount, 0n);
  const status = fundingStatus(p);
  const refresh = () => {
    project.reload();
    onChange();
  };

  return (
    <Card className="flex flex-col gap-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="font-display text-lg font-semibold">Funding round #{String(p.id)}</h3>
          <p className="text-sm text-muted">
            {eurc(total)} in {p.milestones.length} milestones · challenge window {formatDuration(Number(p.challenge_period))}
          </p>
        </div>
        <Badge tone={status.tone}>{status.label}</Badge>
      </div>
      <dl className="grid gap-3 text-sm sm:grid-cols-3">
        <div>
          <dt className="text-muted">Lab</dt>
          <dd><Address value={p.lab} /></dd>
        </div>
        <div>
          <dt className="text-muted">Investor</dt>
          <dd><Address value={p.investor} /></dd>
        </div>
        <div>
          <dt className="text-muted">Arbiter</dt>
          <dd><Address value={p.arbiter} /></dd>
        </div>
      </dl>
      {!p.funded && signer?.address === p.investor && (
        <Button
          busy={busy}
          onClick={async () => {
            setBusy(true);
            if (await run("Funds locked in escrow", () => escrow.fund(signer, p.id))) refresh();
            setBusy(false);
          }}
        >
          Fund {eurc(total)}: lock in escrow and receive shares
        </Button>
      )}
      {!p.funded && signer?.address !== p.investor && (
        <p className="text-sm text-muted">Waiting for the investor {shortAddress(p.investor)} to lock the funds.</p>
      )}
      <ol className="flex flex-col gap-3">
        {p.milestones.map((m, i) => (
          <MilestoneRow key={i} project={p} milestone={m} index={i} signer={signer} now={now} onDone={refresh} />
        ))}
      </ol>
    </Card>
  );
}

// ---------- Royalties ----------

function Royalties({ license, signer, version }: { license: License; signer: Signer | null; version: number }) {
  const { run } = useToasts();
  const [amount, setAmount] = useState("5");
  const [busy, setBusy] = useState<string | null>(null);
  const data = useAsync(async () => {
    const [config, total, totalShares] = await Promise.all([
      splitter.config(license.id),
      splitter.totalRoyalties(license.id),
      splitter.totalShares(license.id),
    ]);
    const mine = signer
      ? await Promise.all([splitter.claimable(license.id, signer.address), splitter.sharesOf(license.id, signer.address)])
      : null;
    return { config, total, totalShares, claimable: mine?.[0] ?? 0n, shares: mine?.[1] ?? 0n };
  }, [license.id, signer?.address, version]);

  if (data.loading && !data.data) return <Card><Spinner /></Card>;
  if (data.error) return <Card><ErrorBox message={data.error} /></Card>;
  const d = data.data!;
  const name = (addr: string) =>
    addr === license.owner ? "University" : license.inventors.includes(addr) ? `Inventor ${shortAddress(addr)}` : shortAddress(addr);
  const parts = [
    ...d.config.fixed.map((b, i) => ({ label: name(b.addr), bps: b.bps, color: i === 0 ? "bg-teal" : "bg-amber" })),
    { label: "Investors (pro rata)", bps: d.config.investors_bps, color: "bg-navy" },
  ].filter((p) => p.bps > 0);

  return (
    <Card className="flex flex-col gap-5">
      <h3 className="font-display text-lg font-semibold">Royalties</h3>
      <div className="flex h-8 overflow-hidden rounded-lg">
        {parts.map((p) => (
          <div key={p.label} className={`${p.color} flex items-center px-2 text-xs font-semibold text-white`} style={{ width: `${p.bps / 100}%` }}>
            {p.bps / 100}%
          </div>
        ))}
      </div>
      <ul className="flex flex-col gap-1 text-sm">
        {parts.map((p) => (
          <li key={p.label} className="flex items-center gap-2">
            <span className={`size-2.5 rounded-full ${p.color}`} />
            {p.label}: {p.bps / 100} %
          </li>
        ))}
      </ul>
      <p className="text-sm text-muted">Total royalties paid: {eurc(d.total)}</p>

      {signer && (
        <div className="flex flex-col gap-3 border-t border-line pt-4">
          <p className="text-sm font-semibold">Pay a royalty (licensee)</p>
          <div className="flex gap-2">
            <Input value={amount} onChange={(e) => setAmount(e.target.value)} className="w-28" />
            <Button
              variant="secondary"
              busy={busy === "pay"}
              onClick={async () => {
                setBusy("pay");
                if (await run("Royalty paid and split", () => splitter.payRoyalty(signer, license.id, amount))) data.reload();
                setBusy(null);
              }}
            >
              Pay in EURC
            </Button>
          </div>
          <div className="flex items-center justify-between gap-3 rounded-lg bg-paper px-3 py-2 text-sm">
            <span>
              Your share: <strong>{eurc(d.claimable)}</strong>
              {d.shares > 0n && d.totalShares > 0n && (
                <span className="text-muted"> · {Number((d.shares * 10000n) / d.totalShares) / 100} % of investor shares</span>
              )}
            </span>
            <Button
              busy={busy === "claim"}
              disabled={d.claimable <= 0n}
              onClick={async () => {
                setBusy("claim");
                if (await run("Royalties withdrawn", () => splitter.claim(signer, license.id))) data.reload();
                setBusy(null);
              }}
            >
              Withdraw
            </Button>
          </div>
        </div>
      )}
    </Card>
  );
}

// ---------- Page ----------

export function LicenceDetail() {
  const { id } = useParams();
  const licenseId = BigInt(id ?? "0");
  const { signer } = useWallet();
  const [version, setVersion] = useState(0);
  const license = useAsync(() => nft.get(licenseId), [id]);
  const projects = useAsync(() => escrow.projectsByLicense(licenseId), [id]);

  if (license.loading) return <Spinner />;
  if (license.error || !license.data) return <ErrorBox message={license.error ?? "Licence not found"} />;
  const l = license.data;

  return (
    <div className="flex flex-col gap-8">
      <Link to="/" className="text-sm font-semibold text-teal-dark hover:underline">← Marketplace</Link>
      <SectionTitle eyebrow={`Licence #${String(l.id)} · ${l.terms.field}`} title={l.title}>
        <div className="flex flex-wrap gap-2">
          <Badge tone="navy">{l.terms.exclusive ? "Exclusive" : "Non-exclusive"}</Badge>
          <Badge>{l.terms.territory}</Badge>
          <Badge>{l.terms.duration_years} years</Badge>
        </div>
      </SectionTitle>

      <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
        <div className="flex flex-col gap-6">
          <Card className="flex flex-col gap-4">
            <dl className="grid gap-3 text-sm sm:grid-cols-3">
              <div>
                <dt className="text-muted">Owner (university)</dt>
                <dd><Address value={l.owner} /></dd>
              </div>
              <div>
                <dt className="text-muted">Inventors</dt>
                <dd className="flex flex-wrap gap-2">{l.inventors.map((a) => <Address key={a} value={a} />)}</dd>
              </div>
              <div>
                <dt className="text-muted">Listed on</dt>
                <dd>{formatDate(l.created_at)}</dd>
              </div>
            </dl>
            <DossierCheck license={l} />
          </Card>

          {projects.data?.length === 0 && <Card className="text-sm text-muted">No funding round yet.</Card>}
          {projects.data?.map((pid) => (
            <FundingRound key={String(pid)} projectId={pid} signer={signer} onChange={() => setVersion((v) => v + 1)} />
          ))}
        </div>

        <div className="flex flex-col gap-6">
          <Royalties license={l} signer={signer} version={version} />
          <DataRoom license={l} signer={signer} />
        </div>
      </div>
    </div>
  );
}
