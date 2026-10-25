import { useEffect, useState } from "react";
import { Trans, useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import { CIRCLE_FAUCET_URL } from "../config";
import {
  addTrustline,
  ANCHOR_DOMAIN,
  anchorConfig,
  authenticate,
  balanceOf,
  displayCode,
  getTransaction,
  payAnchor,
  startWithdrawal,
  type AnchorAsset,
  type AnchorStatus,
  type AnchorTransaction,
} from "../stellar/anchor";
import { useWallet } from "../stellar/wallet";
import { useToasts } from "../components/toasts";
import { useAsync } from "../lib/useAsync";
import { formatNumber } from "../lib/format";
import { Badge, Button, Card, ErrorBox, Notice, SectionTitle, Spinner, TxLink } from "../components/ui";

const TERMINAL: AnchorStatus[] = ["completed", "refunded", "expired", "error", "no_market", "too_small", "too_large"];

/** SEP-24 statuses with a translated explanation in cashOut.status.*; the raw status code stays untranslated. */
const STATUS_TEXT: AnchorStatus[] = [
  "incomplete",
  "pending_user_transfer_start",
  "pending_user_transfer_complete",
  "pending_anchor",
  "pending_stellar",
  "pending_external",
  "completed",
  "refunded",
  "expired",
  "error",
];

const STEPS = ["signIn", "details", "send", "transfer"] as const;

function currentStep(token: string | null, tx: AnchorTransaction | null): number {
  if (!token) return 0;
  if (!tx || tx.status === "incomplete") return 1;
  if (tx.status === "pending_user_transfer_start") return 2;
  return 3;
}

function assetHint(t: TFunction, asset: AnchorAsset) {
  if (asset.code === "USDC")
    return (
      <Trans
        i18nKey="cashOut.hints.usdc"
        components={{
          link: <a href={CIRCLE_FAUCET_URL} target="_blank" rel="noreferrer" className="font-semibold text-brand-ink underline" />,
        }}
      />
    );
  if (asset.code === "native") return t("cashOut.hints.native");
  return t("cashOut.hints.other", { code: asset.code, domain: ANCHOR_DOMAIN });
}

export function CashOut() {
  const { t } = useTranslation();
  const { signer, connecting, connectWallet } = useWallet();
  const { push } = useToasts();
  const config = useAsync(anchorConfig, []);

  const [assetCode, setAssetCode] = useState("USDC");
  const [token, setToken] = useState<string | null>(null);
  const [tx, setTx] = useState<AnchorTransaction | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [paymentHash, setPaymentHash] = useState("");

  const asset = config.data?.assets.find((a) => a.code === assetCode) ?? config.data?.assets[0];
  const balance = useAsync(
    () => (signer && asset ? balanceOf(signer.address, asset) : Promise.resolve(null)),
    [signer?.address, asset?.code, paymentHash],
  );

  // A new account means a new SEP-10 session.
  useEffect(() => {
    setToken(null);
    setTx(null);
    setPaymentHash("");
  }, [signer?.address]);

  // Follow the withdrawal until it reaches a final status.
  useEffect(() => {
    if (!token || !tx || TERMINAL.includes(tx.status)) return;
    const t = setInterval(async () => {
      try {
        setTx(await getTransaction(token, tx.id));
      } catch {
        /* keep polling */
      }
    }, 3000);
    return () => clearInterval(t);
  }, [token, tx]);

  async function step<T>(key: "signIn" | "start" | "send" | "trust", action: () => Promise<T>): Promise<T | null> {
    setBusy(key);
    try {
      return await action();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      push({ kind: "error", text: t("common.failed", { label: t(`cashOut.actions.${key}`), message }) });
      return null;
    } finally {
      setBusy(null);
    }
  }

  async function signIn() {
    if (!signer) return;
    const jwt = await step("signIn", () => authenticate(signer));
    if (jwt) {
      setToken(jwt);
      push({ kind: "success", text: t("cashOut.signedInToast", { domain: ANCHOR_DOMAIN }) });
    }
  }

  async function start() {
    if (!signer || !token || !asset) return;
    // Open the window during the click so the browser does not block it.
    const popup = window.open("", "anchor", "width=500,height=750");
    const started = await step("start", () => startWithdrawal(token, asset, signer.address));
    if (!started) return popup?.close();
    if (popup) popup.location.href = started.url;
    else window.open(started.url, "_blank");
    setTx(await getTransaction(token, started.id));
  }

  async function pay() {
    if (!signer || !tx || !asset) return;
    const hash = await step("send", () => payAnchor(signer, asset, tx));
    if (hash) {
      setPaymentHash(hash);
      push({ kind: "success", text: t("cashOut.sentToast", { amount: tx.amount_in, code: displayCode(asset) }), hash });
    }
  }

  async function trust() {
    if (!signer || !asset) return;
    const hash = await step("trust", () => addTrustline(signer, asset));
    if (hash) {
      push({ kind: "success", text: t("cashOut.trustToast", { code: displayCode(asset) }), hash });
      balance.reload();
    }
  }

  const active = currentStep(token, tx);

  return (
    <div className="flex flex-col gap-8">
      <SectionTitle eyebrow={t("cashOut.eyebrow")} title={t("cashOut.title")}>
        <p>{t("cashOut.intro")}</p>
      </SectionTitle>

      <Card className="border-amber/40 bg-amber/5 text-sm">
        <Trans i18nKey="cashOut.testnetNote" values={{ domain: ANCHOR_DOMAIN }} components={{ strong: <strong /> }} />
      </Card>

      {!signer && (
        <Notice
          action={
            <Button size="sm" busy={connecting} onClick={connectWallet}>
              {t("wallet.connect")}
            </Button>
          }
        >
          {t("cashOut.connect")}
        </Notice>
      )}
      {config.loading && <Spinner label={t("cashOut.reading", { domain: ANCHOR_DOMAIN })} />}
      {config.error && <ErrorBox message={config.error} onRetry={config.reload} />}

      {signer && config.data && asset && (
        <div className="grid gap-6 lg:grid-cols-[280px_1fr]">
          <Card className="flex flex-col gap-4 lg:self-start">
            <ol className="flex flex-col gap-3">
              {STEPS.map((key, i) => (
                <li key={key} className="flex items-center gap-3 text-sm">
                  <span
                    className={`flex size-7 items-center justify-center rounded-full text-xs font-semibold ${
                      i < active || (i === 3 && tx?.status === "completed")
                        ? "bg-brand text-navy"
                        : i === active
                          ? "bg-brand/15 text-brand-ink ring-1 ring-brand"
                          : "bg-line text-muted"
                    }`}
                  >
                    {i + 1}
                  </span>
                  <span className={i === active ? "font-semibold" : "text-muted"}>{t(`cashOut.steps.${key}`)}</span>
                </li>
              ))}
            </ol>
          </Card>

          <Card className="flex flex-col gap-5">
            <div className="flex flex-wrap items-end gap-4">
              <label className="flex flex-col gap-1.5 text-sm">
                <span className="font-semibold">{t("cashOut.asset")}</span>
                <select
                  className="rounded-lg border border-line bg-field px-3 py-2"
                  value={asset.code}
                  disabled={Boolean(tx)}
                  onChange={(e) => setAssetCode(e.target.value)}
                >
                  {config.data.assets.map((a) => (
                    <option key={a.code} value={a.code}>
                      {displayCode(a)}
                    </option>
                  ))}
                </select>
              </label>
              <div className="text-sm">
                <p className="text-muted">{t("cashOut.balance")}</p>
                <p className="font-semibold">
                  {balance.data ? `${formatNumber(balance.data.balance)} ${displayCode(asset)}` : "—"}
                </p>
              </div>
              <p className="text-xs text-muted">
                {t("cashOut.limits", { min: asset.min, max: asset.max, code: displayCode(asset) })}
              </p>
            </div>

            {balance.data && !balance.data.trusted ? (
              <div className="flex flex-col gap-2 text-sm">
                <p>{t("cashOut.cannotHold", { code: displayCode(asset) })}</p>
                <Button variant="secondary" busy={busy === "trust"} onClick={trust} className="self-start">
                  {t("cashOut.enable", { code: displayCode(asset) })}
                </Button>
              </div>
            ) : (
              balance.data &&
              Number(balance.data.balance) < asset.min && <p className="text-sm text-amber-dark">{assetHint(t, asset)}</p>
            )}

            <div className="flex flex-col gap-3 border-t border-line pt-5">
              {!token && (
                <Button busy={busy === "signIn"} onClick={signIn} className="self-start">
                  {t("cashOut.signInButton")}
                </Button>
              )}
              {token && !tx && (
                <>
                  <Badge tone="brand">{t("cashOut.signedIn", { domain: ANCHOR_DOMAIN })}</Badge>
                  <Button busy={busy === "start"} onClick={start} className="self-start">
                    {t("cashOut.withdraw")}
                  </Button>
                  <p className="text-xs text-muted">{t("cashOut.windowHint")}</p>
                </>
              )}
              {tx && (
                <div className="flex flex-col gap-3 text-sm">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge tone={tx.status === "completed" ? "brand" : TERMINAL.includes(tx.status) ? "danger" : "amber"}>
                      {tx.status}
                    </Badge>
                    <span>{STATUS_TEXT.includes(tx.status) ? t(`cashOut.status.${tx.status}`) : (tx.message ?? "")}</span>
                    {!TERMINAL.includes(tx.status) && (
                      <span className="size-3 animate-spin rounded-full border-2 border-brand-ink border-t-transparent" />
                    )}
                  </div>
                  {tx.status === "pending_user_transfer_start" && !paymentHash && (
                    <Button busy={busy === "send"} onClick={pay} className="self-start">
                      {t("cashOut.sendButton", { amount: tx.amount_in, code: displayCode(asset) })}
                    </Button>
                  )}
                  {paymentHash && <TxLink hash={paymentHash} />}
                  {tx.amount_out && (
                    <p>
                      <Trans i18nKey="cashOut.amountOut" values={{ amount: tx.amount_out }} components={{ strong: <strong /> }} />
                      {tx.amount_fee && <span className="text-muted">{t("cashOut.fee", { fee: tx.amount_fee })}</span>}
                    </p>
                  )}
                  {tx.external_transaction_id && <p className="text-muted">{t("cashOut.bankRef", { ref: tx.external_transaction_id })}</p>}
                  {tx.more_info_url && (
                    <a href={tx.more_info_url} target="_blank" rel="noreferrer" className="font-semibold text-brand-ink hover:underline">
                      {t("cashOut.receipt")}
                    </a>
                  )}
                  {TERMINAL.includes(tx.status) && (
                    <Button variant="secondary" onClick={() => (setTx(null), setPaymentHash(""))} className="self-start">
                      {t("cashOut.newWithdrawal")}
                    </Button>
                  )}
                </div>
              )}
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
