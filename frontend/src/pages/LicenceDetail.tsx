import { Suspense, lazy, useEffect, useState, type ReactNode } from "react";
import { Link, useParams } from "react-router-dom";
import { Trans, useTranslation } from "react-i18next";
import { escrow, isSettled, nft, splitter, type License, type Milestone, type Project } from "../stellar/contracts";
import { useWallet, type Signer } from "../stellar/wallet";
import { useToasts } from "../components/toasts";
import { useAsync } from "../lib/useAsync";
import { eurc, formatDate, formatDuration, sha256, shortAddress, toHex } from "../lib/format";
import { Address, Badge, Button, Card, ErrorBox, Input, Spinner, StatusIcon, buttonClass, type BadgeTone } from "../components/ui";
import { FundingProgress } from "../components/Funding";
import { BurstHeading } from "../components/BurstHeading";

// Decorative helix next to the title (Three.js is shared with the home page chunk).
const DnaHelix = lazy(() => import("../components/DnaHelix"));

/** Card section with the Figma heading style; `id` is the target of the page sub-navigation. */
function Section({ id, title, children, className = "" }: { id: string; title: string; children: ReactNode; className?: string }) {
  return (
    <Card className={`flex scroll-mt-36 flex-col gap-5 ${className}`}>
      <h2 id={id} className="scroll-mt-36 font-display text-2xl font-bold tracking-tight">
        {title}
      </h2>
      {children}
    </Card>
  );
}

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
  const { t } = useTranslation();
  const [result, setResult] = useState<"match" | "mismatch" | null>(null);
  const expected = toHex(license.dossier_hash);
  return (
    <Section id="dossier" title={t("licence.dossier")}>
      <div className="flex flex-col gap-2">
        <p className="text-sm font-semibold">{t("licence.fingerprint")}</p>
        <p className="rounded-xl bg-subtle px-4 py-3 font-mono text-xs break-all text-muted">{expected}</p>
      </div>
      <div className="flex flex-col gap-2">
        <p className="text-sm font-semibold">{t("licence.verifyFile")}</p>
        <p className="text-sm text-muted">{t("licence.verifyHelp")}</p>
        <div className="flex flex-wrap items-center gap-3">
          <label className={buttonClass({ variant: "secondary", className: "cursor-pointer focus-within:ring-2 focus-within:ring-brand" })}>
            {t("licence.chooseFile")}
            <input
              type="file"
              className="sr-only"
              onChange={async (e) => {
                const f = e.target.files?.[0];
                if (!f) return setResult(null);
                setResult(toHex(await sha256(f)) === expected ? "match" : "mismatch");
              }}
            />
          </label>
          {result === "match" && <Badge tone="success" icon={<StatusIcon kind="done" />}>{t("licence.match")}</Badge>}
          {result === "mismatch" && <Badge tone="danger" icon={<StatusIcon kind="error" />}>{t("licence.mismatch")}</Badge>}
        </div>
      </div>
    </Section>
  );
}

function DataRoom({ license, signer }: { license: License; signer: Signer | null }) {
  const { t } = useTranslation();
  const { run } = useToasts();
  const signed = useAsync(
    () => (signer ? nft.hasSignedNda(license.id, signer.address) : Promise.resolve(false)),
    [license.id, signer?.address],
  );
  const [busy, setBusy] = useState(false);

  return (
    <Section id="dataroom" title={t("licence.dataRoom")} className="gap-3">
      <p className="text-sm leading-relaxed text-muted">{t("licence.dataRoomText")}</p>
      {!signer ? (
        <p className="text-sm text-muted">{t("licence.connectToAccess")}</p>
      ) : signed.data ? (
        <div className="flex flex-col gap-1 text-sm">
          <Badge tone="success" icon={<StatusIcon kind="done" />}>{t("licence.ndaSigned")}</Badge>
          {license.metadata_uri ? (
            <a href={license.metadata_uri} className="break-all text-brand-ink hover:underline">
              {license.metadata_uri}
            </a>
          ) : (
            <p className="text-muted">{t("licence.noDataRoom")}</p>
          )}
        </div>
      ) : (
        <Button
          variant="secondary"
          busy={busy}
          onClick={async () => {
            setBusy(true);
            if (await run(t("licence.toastNda"), () => nft.signNda(signer, license.id))) signed.reload();
            setBusy(false);
          }}
        >
          {t("licence.signNda")}
        </Button>
      )}
    </Section>
  );
}

// ---------- Funding round ----------

const STATUS_LOOK: Record<Milestone["status"], { tone: BadgeTone; icon: Parameters<typeof StatusIcon>[0]["kind"]; dot: string }> = {
  Pending: { tone: "neutral", icon: "pending", dot: "text-muted" },
  Submitted: { tone: "amber", icon: "clock", dot: "text-amber-dark border-amber/50" },
  Disputed: { tone: "danger", icon: "error", dot: "text-danger border-danger/40" },
  Released: { tone: "success", icon: "done", dot: "text-success border-success/40" },
  Refunded: { tone: "neutral", icon: "refund", dot: "text-muted" },
  Split: { tone: "amber", icon: "split", dot: "text-amber-dark border-amber/50" },
};

/** The arbiter's choice: pay the lab in full, refund in full, or share the milestone. */
function ArbiterPanel({
  busy,
  onDecide,
}: {
  busy: string | null;
  onDecide: (labPct: number) => void;
}) {
  const { t } = useTranslation();
  const [labPct, setLabPct] = useState(50);

  return (
    <div className="flex w-full flex-col gap-3 rounded-2xl border border-amber/40 bg-amber/10 p-4">
      <div>
        <p className="text-sm font-semibold">{t("licence.arbiterTitle")}</p>
        <p className="text-xs text-muted">{t("licence.arbiterHelp")}</p>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button busy={busy === "approve"} onClick={() => onDecide(100)}>
          {t("licence.approve")}
        </Button>
        <Button variant="danger" busy={busy === "refund"} onClick={() => onDecide(0)}>
          {t("licence.reject")}
        </Button>
      </div>
      <div className="flex flex-col gap-2 border-t border-line pt-3">
        <input
          type="range"
          min={0}
          max={100}
          step={5}
          value={labPct}
          onChange={(e) => setLabPct(Number(e.target.value))}
          className="accent-brand-ink"
          aria-label={t("licence.labShare", { lab: labPct, refund: 100 - labPct })}
        />
        <div className="flex h-2 overflow-hidden rounded-full">
          <div className="bg-brand-ink" style={{ width: `${labPct}%` }} />
          <div className="bg-navy" style={{ width: `${100 - labPct}%` }} />
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm">{t("licence.labShare", { lab: labPct, refund: 100 - labPct })}</p>
          <Button
            variant="secondary"
            busy={busy === "split"}
            disabled={labPct === 0 || labPct === 100}
            onClick={() => onDecide(labPct)}
          >
            {t("licence.split")}
          </Button>
        </div>
      </div>
    </div>
  );
}

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
  const { t } = useTranslation();
  const { run } = useToasts();
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState("");

  const me = signer?.address;
  const isLab = me === project.lab;
  const isInvestor = me === project.investor;
  const isArbiter = me === project.arbiter;
  const previousSettled = project.milestones
    .slice(0, index)
    .every((m) => isSettled(m.status));
  const deadline = Number(milestone.submitted_at) + Number(project.challenge_period);
  const windowOpen = milestone.status === "Submitted" && now < deadline;
  const look = STATUS_LOOK[milestone.status];

  async function act(
    key: "proof" | "dispute" | "release" | "approve" | "refund" | "split",
    action: () => ReturnType<typeof escrow.release>,
  ) {
    setBusy(key);
    if (await run(t(`licence.toasts.${key}`), action)) onDone();
    setBusy(null);
  }

  return (
    <li className="relative flex gap-4 pb-7 last:pb-0">
      {index < project.milestones.length - 1 && <span aria-hidden className="absolute top-10 bottom-1 left-4 w-px bg-line" />}
      <span className={`relative flex size-8 shrink-0 items-center justify-center rounded-full border border-line bg-card ${look.dot}`}>
        <StatusIcon kind={look.icon} className="size-4" />
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-sm text-muted">{t("licence.milestoneN", { n: index + 1 })}</p>
          <p className="font-display text-2xl font-bold tracking-tight">{eurc(milestone.amount)}</p>
        </div>
        <Badge tone={look.tone} icon={<StatusIcon kind={look.icon} />}>
          {t(`licence.status.${milestone.status}`)}
        </Badge>
      </div>

      {milestone.proof_hash && (
        <p className="break-all font-mono text-xs text-muted">{t("licence.proof", { hash: toHex(milestone.proof_hash) })}</p>
      )}
      {milestone.status === "Split" && (
        <p className="text-sm text-muted">
          {t("licence.splitResult", { lab: milestone.lab_bps / 100, refund: 100 - milestone.lab_bps / 100 })}
        </p>
      )}
      {milestone.status === "Submitted" && (
        <p className="text-sm text-muted">
          {windowOpen
            ? t("licence.windowOpen", { time: formatDuration(deadline - now) })
            : t("licence.windowClosed")}
        </p>
      )}

      {signer && (
        <div className="flex flex-wrap items-center gap-2">
          {isLab && project.funded && milestone.status === "Pending" && previousSettled && (
            <>
              <Input placeholder={t("licence.reportPlaceholder")} value={note} onChange={(e) => setNote(e.target.value)} className="min-w-64 flex-1" />
              <Button
                busy={busy === "proof"}
                disabled={!note}
                onClick={async () => act("proof", async () => escrow.submit(signer, project.id, index, await sha256(note)))}
              >
                {t("licence.submitProof")}
              </Button>
            </>
          )}
          {isInvestor && windowOpen && (
            <>
              <Input placeholder={t("licence.disputePlaceholder")} value={note} onChange={(e) => setNote(e.target.value)} className="min-w-64 flex-1" />
              <Button
                variant="danger"
                busy={busy === "dispute"}
                disabled={!note}
                onClick={async () => act("dispute", async () => escrow.dispute(signer, project.id, index, await sha256(note)))}
              >
                {t("licence.dispute")}
              </Button>
            </>
          )}
          {milestone.status === "Submitted" && !windowOpen && (
            <Button busy={busy === "release"} onClick={() => act("release", () => escrow.release(signer, project.id, index))}>
              {t("licence.release")}
            </Button>
          )}
          {isArbiter && milestone.status === "Disputed" && (
            <ArbiterPanel
              busy={busy}
              onDecide={(labPct) =>
                act(labPct === 100 ? "approve" : labPct === 0 ? "refund" : "split", () =>
                  escrow.resolvePartial(signer, project.id, index, labPct),
                )
              }
            />
          )}
        </div>
      )}
      </div>
    </li>
  );
}

function FundingRound({ projectId, signer, onChange }: { projectId: bigint; signer: Signer | null; onChange: () => void }) {
  const { t } = useTranslation();
  const { run } = useToasts();
  const now = useNow();
  const project = useAsync(() => escrow.get(projectId), [String(projectId)]);
  const [busy, setBusy] = useState(false);

  if (project.loading && !project.data) return <Spinner />;
  if (project.error) return <ErrorBox message={project.error} onRetry={project.reload} />;
  const p = project.data!;
  const total = p.milestones.reduce((s, m) => s + m.amount, 0n);
  const refresh = () => {
    project.reload();
    onChange();
  };

  return (
    <Card className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h3 className="font-display text-2xl font-bold tracking-tight">{t("licence.round", { id: String(p.id) })}</h3>
          <p className="text-sm text-muted">
            {t("licence.roundSummary", {
              amount: eurc(total),
              count: p.milestones.length,
              window: formatDuration(Number(p.challenge_period)),
            })}
          </p>
        </div>
        <div className="w-full sm:w-56">
          <FundingProgress project={p} />
        </div>
      </div>
      <dl className="grid gap-3 rounded-2xl bg-subtle px-4 py-3 text-sm sm:grid-cols-3">
        <div>
          <dt className="text-muted">{t("licence.lab")}</dt>
          <dd><Address value={p.lab} /></dd>
        </div>
        <div>
          <dt className="text-muted">{t("licence.investor")}</dt>
          <dd><Address value={p.investor} /></dd>
        </div>
        <div>
          <dt className="text-muted">{t("licence.arbiter")}</dt>
          <dd><Address value={p.arbiter} /></dd>
        </div>
      </dl>
      {!p.funded && signer?.address === p.investor && (
        <Button
          busy={busy}
          onClick={async () => {
            setBusy(true);
            if (await run(t("licence.toasts.fund"), () => escrow.fund(signer, p.id))) refresh();
            setBusy(false);
          }}
        >
          {t("licence.fund", { amount: eurc(total) })}
        </Button>
      )}
      {!p.funded && signer?.address !== p.investor && (
        <p className="text-sm text-muted">{t("licence.waitingInvestor", { address: shortAddress(p.investor) })}</p>
      )}
      <ol className="flex flex-col">
        {p.milestones.map((m, i) => (
          <MilestoneRow key={i} project={p} milestone={m} index={i} signer={signer} now={now} onDone={refresh} />
        ))}
      </ol>
    </Card>
  );
}

// ---------- Royalties ----------

function Royalties({ license, signer, version }: { license: License; signer: Signer | null; version: number }) {
  const { t } = useTranslation();
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

  if (data.loading && !data.data) return <Section id="royalties" title={t("licence.royalties")}><Spinner /></Section>;
  if (data.error) return <Section id="royalties" title={t("licence.royalties")}><ErrorBox message={data.error} onRetry={data.reload} /></Section>;
  const d = data.data!;
  const name = (addr: string) =>
    addr === license.owner
      ? t("licence.university")
      : license.inventors.includes(addr)
        ? t("licence.inventor", { address: shortAddress(addr) })
        : shortAddress(addr);
  const parts = [
    ...d.config.fixed.map((b, i) => ({
      label: name(b.addr),
      bps: b.bps,
      color: i === 0 ? "bg-brand" : "bg-rose",
      text: i === 0 ? "text-on-brand" : "text-navy",
    })),
    { label: t("licence.investorsProRata"), bps: d.config.investors_bps, color: "bg-amber", text: "text-navy" },
  ].filter((p) => p.bps > 0);

  return (
    <Section id="royalties" title={t("licence.royalties")}>
      <div className="flex h-8 gap-0.5 overflow-hidden rounded-xl">
        {parts.map((p) => (
          <div key={p.label} className={`${p.color} ${p.text} flex items-center px-2.5 text-xs font-semibold`} style={{ width: `${p.bps / 100}%` }}>
            {p.bps / 100}%
          </div>
        ))}
      </div>
      <ul className="flex flex-col gap-2 text-sm">
        {parts.map((p) => (
          <li key={p.label} className="flex items-center justify-between gap-3">
            <span className="flex min-w-0 items-center gap-2.5">
              <span aria-hidden className={`size-3 shrink-0 rounded-[3px] ${p.color}`} />
              <span className="truncate">{p.label}</span>
            </span>
            <span className="font-semibold">{p.bps / 100} %</span>
          </li>
        ))}
      </ul>
      <p className="border-t border-line pt-4 text-sm text-muted">{t("licence.totalRoyalties", { amount: eurc(d.total) })}</p>

      {signer && (
        <div className="flex flex-col gap-3 border-t border-line pt-4">
          <p className="text-sm font-semibold">{t("licence.payRoyalty")}</p>
          <div className="flex gap-2">
            <Input value={amount} onChange={(e) => setAmount(e.target.value)} className="w-28" />
            <Button
              variant="secondary"
              busy={busy === "pay"}
              onClick={async () => {
                setBusy("pay");
                if (await run(t("licence.toasts.pay"), () => splitter.payRoyalty(signer, license.id, amount))) data.reload();
                setBusy(null);
              }}
            >
              {t("licence.payInEurc")}
            </Button>
          </div>
          <div className="flex items-center justify-between gap-3 rounded-2xl bg-subtle px-4 py-3 text-sm">
            <span>
              <Trans i18nKey="licence.yourShare" values={{ amount: eurc(d.claimable) }} components={{ strong: <strong /> }} />
              {d.shares > 0n && d.totalShares > 0n && (
                <span className="text-muted">
                  {t("licence.ofInvestorShares", { pct: Number((d.shares * 10000n) / d.totalShares) / 100 })}
                </span>
              )}
            </span>
            <Button
              busy={busy === "claim"}
              disabled={d.claimable <= 0n}
              onClick={async () => {
                setBusy("claim");
                if (await run(t("licence.toasts.claim"), () => splitter.claim(signer, license.id))) data.reload();
                setBusy(null);
              }}
            >
              {t("licence.withdraw")}
            </Button>
          </div>
        </div>
      )}
    </Section>
  );
}

// ---------- Page ----------

export function LicenceDetail() {
  const { t } = useTranslation();
  const { id } = useParams();
  const licenseId = BigInt(id ?? "0");
  const { signer } = useWallet();
  const [version, setVersion] = useState(0);
  const license = useAsync(() => nft.get(licenseId), [id]);
  const projects = useAsync(() => escrow.projectsByLicense(licenseId), [id]);
  // Latest round, for the funding summary next to the title.
  const latest = useAsync(async () => {
    const ids = await escrow.projectsByLicense(licenseId);
    return ids.length ? escrow.get(ids[ids.length - 1]) : undefined;
  }, [id, version]);

  if (license.loading) return <Spinner />;
  if (license.error) return <ErrorBox message={license.error} onRetry={license.reload} />;
  if (!license.data) return <ErrorBox message={t("licence.notFound")} />;
  const l = license.data;
  const facts = [
    [t("marketplace.table.field"), l.terms.field],
    [t("marketplace.table.territory"), l.terms.territory],
    [t("marketplace.table.term"), t("common.years", { count: l.terms.duration_years })],
    [t("marketplace.table.type"), l.terms.exclusive ? t("common.exclusive") : t("common.nonExclusive")],
  ];
  const sections = [
    ["terms", t("licence.terms")],
    ["dossier", t("licence.dossier")],
    ["funding", t("licence.fundingTitle")],
    ["royalties", t("licence.royalties")],
    ["dataroom", t("licence.dataRoom")],
  ];

  return (
    <div className="flex flex-col gap-8">
      <Link to="/" className="self-start text-sm font-semibold text-brand-ink hover:underline">{t("licence.back")}</Link>

      <section className="grid gap-8 lg:grid-cols-[1fr_360px] lg:items-end">
        <div className="relative min-w-0">
          <div aria-hidden className="pointer-events-none absolute -top-16 right-0 hidden h-60 w-40 opacity-70 lg:block">
            <Suspense fallback={null}>
              <DnaHelix />
            </Suspense>
          </div>
          <div className="relative">
            <p className="text-sm font-semibold text-muted">{t("licence.eyebrow", { id: String(l.id), field: l.terms.field })}</p>
            <BurstHeading
              as="h1"
              className="mt-2 max-w-3xl font-display text-4xl leading-[0.98] font-extrabold tracking-[-0.04em] text-balance sm:text-6xl"
              text={l.title}
            />
            <dl className="mt-8 grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-4">
              {facts.map(([label, value]) => (
                <div key={label} className="border-l-2 border-brand/35 pl-3">
                  <dt className="text-xs text-muted">{label}</dt>
                  <dd className="font-semibold">{value}</dd>
                </div>
              ))}
            </dl>
          </div>
        </div>
        <Card className="flex flex-col gap-4">
          <p className="text-sm font-semibold text-muted">{t("licence.funding")}</p>
          {latest.loading && !latest.data ? <Spinner /> : <FundingProgress project={latest.data} large />}
          <a href="#funding" className={buttonClass({ variant: "secondary", className: "w-full" })}>
            {t("licence.goToMilestones")}
          </a>
        </Card>
      </section>

      <nav aria-label={t("licence.sections")} className="sticky top-[65px] z-30 -mx-4 border-y border-line bg-canvas/90 px-4 backdrop-blur-md sm:-mx-6 sm:px-6 min-[1200px]:top-[71px]">
        <ul className="flex gap-1 overflow-x-auto py-2 text-sm font-medium whitespace-nowrap text-muted">
          {sections.map(([anchor, label]) => (
            <li key={anchor}>
              <a href={`#${anchor}`} className="block rounded-full px-3 py-1.5 transition duration-200 hover:bg-subtle hover:text-ink">
                {label}
              </a>
            </li>
          ))}
        </ul>
      </nav>

      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        <div className="flex min-w-0 flex-col gap-6">
          <Section id="terms" title={t("licence.terms")}>
            <dl className="grid gap-4 text-sm sm:grid-cols-3">
              <div>
                <dt className="text-muted">{t("licence.owner")}</dt>
                <dd><Address value={l.owner} /></dd>
              </div>
              <div>
                <dt className="text-muted">{t("licence.inventors")}</dt>
                <dd className="flex flex-wrap gap-2">{l.inventors.map((a) => <Address key={a} value={a} />)}</dd>
              </div>
              <div>
                <dt className="text-muted">{t("licence.listedOn")}</dt>
                <dd>{formatDate(l.created_at)}</dd>
              </div>
            </dl>
          </Section>
          <DossierCheck license={l} />

          <h2 id="funding" className="mt-4 scroll-mt-36 font-display text-3xl font-bold tracking-tight">{t("licence.fundingTitle")}</h2>
          {projects.data?.length === 0 && <Card className="text-sm text-muted">{t("licence.noRound")}</Card>}
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
