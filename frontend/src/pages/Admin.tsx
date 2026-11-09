import { useRef, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { ACCOUNTS, CIRCLE_FAUCET_URL, CONTRACTS, explorer } from "../config";
import { nft, splitter, type TxResult } from "../stellar/contracts";
import { useWallet } from "../stellar/wallet";
import { useToasts } from "../components/toasts";
import { Badge, Button, Card, Field, Input, Notice, SectionTitle, Spinner, StatusIcon } from "../components/ui";
import { useDocumentTitle } from "../lib/useDocumentTitle";
import { accountSnapshot, FRIENDBOT_URL, type AccountSnapshot } from "../lib/account";
import { formatNumber } from "../lib/format";
import { isAddress } from "../components/listing";

function ExternalLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noreferrer" className="text-sm font-semibold text-brand-ink hover:underline">
      {children}
    </a>
  );
}

function Check({ ok, label, detail, hint }: { ok: boolean; label: string; detail?: string; hint?: ReactNode }) {
  const { t } = useTranslation();
  return (
    <li className="flex flex-col gap-1 border-t border-line py-3 first:border-t-0">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="font-medium">{label}</span>
        <Badge tone={ok ? "success" : "neutral"} icon={<StatusIcon kind={ok ? "done" : "pending"} />}>
          {detail ?? (ok ? t("admin.checker.yes") : t("admin.checker.no"))}
        </Badge>
      </div>
      {!ok && hint && <p className="text-sm text-muted">{hint}</p>}
    </li>
  );
}

type Report = AccountSnapshot & { institution: boolean | null; kyc: boolean | null };

/** Read-only status of any address: everything a demo account needs, no wallet required. */
function AccountChecker() {
  const { t } = useTranslation();
  const [who, setWho] = useState("");
  const [report, setReport] = useState<Report | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  // Each keystroke starts a check: only the one for the address in the box may show its answer.
  const latest = useRef("");

  async function check(address: string) {
    latest.current = address;
    setReport(null);
    setError("");
    setLoading(isAddress(address));
    if (!isAddress(address)) return;
    try {
      const [snapshot, institution, kyc] = await Promise.all([
        accountSnapshot(address),
        nft.isInstitution(address).catch(() => null),
        splitter.isAllowed(address).catch(() => null),
      ]);
      if (latest.current === address) setReport({ ...snapshot, institution, kyc });
    } catch (err) {
      if (latest.current === address) setError(err instanceof Error ? err.message : String(err));
    }
    if (latest.current === address) setLoading(false);
  }

  const yesNo = (value: boolean | null) => (value === null ? t("admin.checker.unknown") : undefined);

  return (
    <Card className="flex flex-col gap-5">
      <div>
        <h2 className="font-display text-2xl font-bold tracking-tight">{t("admin.checker.title")}</h2>
        <p className="mt-1 text-sm text-muted">{t("admin.checker.text")}</p>
      </div>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="flex-1">
          <Field label={t("admin.address")}>
            <Input
              value={who}
              onChange={(e) => {
                const value = e.target.value.trim();
                setWho(value);
                check(value);
              }}
              placeholder="G…"
              className="font-mono"
            />
          </Field>
        </div>
        <Button variant="secondary" disabled={!isAddress(who)} busy={loading} onClick={() => check(who)}>
          {t("admin.checker.refresh")}
        </Button>
      </div>
      {who && !isAddress(who) && <p className="text-sm text-muted">{t("admin.checker.invalid")}</p>}
      {loading && !report && <Spinner />}
      {error && <Notice tone="warning">{error}</Notice>}
      {report && (
        <>
          <ul className="flex flex-col">
            <Check
              ok={report.exists}
              label={t("admin.checker.funded")}
              detail={report.exists ? `${formatNumber(report.xlm)} XLM` : undefined}
              hint={<ExternalLink href={`${FRIENDBOT_URL}/?addr=${who}`}>{t("admin.checker.friendbot")}</ExternalLink>}
            />
            <Check
              ok={report.hasTrustline}
              label={t("admin.checker.trustline")}
              detail={report.hasTrustline ? `${formatNumber(report.eurc)} EURC` : undefined}
              hint={t("admin.checker.trustlineHint")}
            />
            <Check
              ok={report.institution === true}
              label={t("admin.institutionsTitle")}
              detail={yesNo(report.institution)}
              hint={t("admin.checker.institutionHint")}
            />
            <Check
              ok={report.kyc === true}
              label={t("admin.kycTitle")}
              detail={yesNo(report.kyc)}
              hint={t("admin.checker.kycHint")}
            />
          </ul>
          <div className="flex flex-wrap gap-x-5 gap-y-2 border-t border-line pt-4">
            <ExternalLink href={explorer.account(who)}>{t("admin.checker.history")}</ExternalLink>
            {report.hasTrustline && <ExternalLink href={CIRCLE_FAUCET_URL}>{t("admin.checker.faucet")}</ExternalLink>}
          </div>
        </>
      )}
    </Card>
  );
}

function Registry({
  title,
  description,
  check,
  grant,
  canWrite,
  yes,
  no,
}: {
  title: string;
  description: string;
  check: (who: string) => Promise<boolean>;
  grant: ((who: string, value: boolean) => Promise<TxResult>) | null;
  canWrite: boolean;
  yes: string;
  no: string;
}) {
  const { t } = useTranslation();
  const { run } = useToasts();
  const [who, setWho] = useState("");
  const [status, setStatus] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  // Same as AccountChecker: an older lookup must not overwrite the status of the address now typed.
  const latest = useRef("");

  async function lookup(address = who) {
    latest.current = address;
    setStatus(null);
    if (!isAddress(address)) return;
    const value = await check(address).catch(() => null);
    if (latest.current === address) setStatus(value);
  }

  async function set(value: boolean) {
    if (!grant) return;
    setBusy(true);
    const done = await run(value ? yes : no, () => grant(who, value));
    // Refresh the status only if the box still shows the address that was just changed.
    if (done && latest.current === who) await lookup(who);
    setBusy(false);
  }

  return (
    <Card className="flex flex-col gap-5">
      <div>
        <h2 className="font-display text-2xl font-bold tracking-tight">{title}</h2>
        <p className="mt-1 text-sm text-muted">{description}</p>
      </div>
      <Field label={t("admin.address")}>
        <Input
          value={who}
          onChange={(e) => {
            setWho(e.target.value.trim());
            lookup(e.target.value.trim());
          }}
          placeholder="G…"
          className="font-mono"
        />
      </Field>
      {status !== null && (
        <span className="self-start">
          <Badge tone={status ? "success" : "neutral"} icon={<StatusIcon kind={status ? "done" : "pending"} />}>
            {status ? t("admin.verified") : t("admin.notVerified")}
          </Badge>
        </span>
      )}
      <div className="mt-auto flex justify-between gap-2 border-t border-line pt-5">
        <Button busy={busy} disabled={!canWrite || !isAddress(who)} onClick={() => set(true)}>
          {t("admin.verify")}
        </Button>
        <Button variant="danger" busy={busy} disabled={!canWrite || !isAddress(who)} onClick={() => set(false)}>
          {t("admin.revoke")}
        </Button>
      </div>
    </Card>
  );
}

export function Admin() {
  const { t } = useTranslation();
  useDocumentTitle(t("nav.admin"));
  const { signer } = useWallet();
  const isAdmin = signer?.address === ACCOUNTS.admin;
  const canWrite = Boolean(signer) && isAdmin;

  return (
    <div className="flex flex-col gap-8">
      <SectionTitle eyebrow={t("admin.eyebrow")} title={t("admin.title")}>
        <p>{t("admin.intro")}</p>
      </SectionTitle>
      {!isAdmin && <Notice>{t("admin.notAdmin")}</Notice>}
      <AccountChecker />
      <div className="grid gap-6 md:grid-cols-2">
        <Registry
          title={t("admin.institutionsTitle")}
          description={t("admin.institutionsText")}
          check={nft.isInstitution}
          grant={signer ? (who, value) => nft.setInstitution(signer, who, value) : null}
          canWrite={canWrite}
          yes={t("admin.institutionVerified")}
          no={t("admin.institutionRevoked")}
        />
        <Registry
          title={t("admin.kycTitle")}
          description={t("admin.kycText")}
          check={splitter.isAllowed}
          grant={signer ? (who, value) => splitter.setAllowed(signer, who, value) : null}
          canWrite={canWrite}
          yes={t("admin.investorVerified")}
          no={t("admin.investorRevoked")}
        />
      </div>
      <Card className="flex flex-col gap-3">
        <h2 className="font-display text-2xl font-bold tracking-tight">{t("admin.log.title")}</h2>
        <p className="text-sm text-muted">{t("admin.log.text")}</p>
        <div className="flex flex-wrap gap-x-5 gap-y-2">
          <ExternalLink href={explorer.account(ACCOUNTS.admin)}>{t("admin.log.adminAccount")}</ExternalLink>
          <ExternalLink href={explorer.contract(CONTRACTS.nft)}>{t("admin.log.nft")}</ExternalLink>
          <ExternalLink href={explorer.contract(CONTRACTS.splitter)}>{t("admin.log.splitter")}</ExternalLink>
        </div>
      </Card>
    </div>
  );
}
