import { useEffect, useState } from "react";
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
import { Badge, Button, Card, ErrorBox, SectionTitle, Spinner, TxLink } from "../components/ui";

const TERMINAL: AnchorStatus[] = ["completed", "refunded", "expired", "error", "no_market", "too_small", "too_large"];

const STATUS_TEXT: Partial<Record<AnchorStatus, string>> = {
  incomplete: "Fill in the form in the anchor's window",
  pending_user_transfer_start: "The anchor is waiting for your payment",
  pending_user_transfer_complete: "Payment received by the anchor",
  pending_anchor: "The anchor is processing the withdrawal",
  pending_stellar: "Waiting for the Stellar network",
  pending_external: "Bank transfer in progress",
  completed: "Completed: the bank transfer has been sent",
  refunded: "Refunded",
  expired: "Expired",
  error: "Error",
};

const STEPS = ["Sign in to the anchor", "Fill in your bank details", "Send the funds", "Bank transfer"];

function currentStep(token: string | null, tx: AnchorTransaction | null): number {
  if (!token) return 0;
  if (!tx || tx.status === "incomplete") return 1;
  if (tx.status === "pending_user_transfer_start") return 2;
  return 3;
}

function assetHint(asset: AnchorAsset) {
  if (asset.code === "USDC")
    return (
      <>
        Get test USDC on{" "}
        <a href={CIRCLE_FAUCET_URL} target="_blank" rel="noreferrer" className="font-semibold text-teal-dark underline">
          faucet.circle.com
        </a>{" "}
        (Stellar testnet).
      </>
    );
  if (asset.code === "native") return "Every testnet account already holds XLM from Friendbot.";
  return `Get ${asset.code} through a deposit on ${ANCHOR_DOMAIN}.`;
}

export function CashOut() {
  const { signer } = useWallet();
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

  async function step<T>(label: string, action: () => Promise<T>): Promise<T | null> {
    setBusy(label);
    try {
      return await action();
    } catch (err) {
      push({ kind: "error", text: `${label}: ${err instanceof Error ? err.message : String(err)}` });
      return null;
    } finally {
      setBusy(null);
    }
  }

  async function signIn() {
    if (!signer) return;
    const t = await step("Sign in", () => authenticate(signer));
    if (t) {
      setToken(t);
      push({ kind: "success", text: `Signed in to ${ANCHOR_DOMAIN} with SEP-10` });
    }
  }

  async function start() {
    if (!signer || !token || !asset) return;
    // Open the window during the click so the browser does not block it.
    const popup = window.open("", "anchor", "width=500,height=750");
    const started = await step("Start withdrawal", () => startWithdrawal(token, asset, signer.address));
    if (!started) return popup?.close();
    if (popup) popup.location.href = started.url;
    else window.open(started.url, "_blank");
    setTx(await getTransaction(token, started.id));
  }

  async function pay() {
    if (!signer || !tx || !asset) return;
    const hash = await step("Send to the anchor", () => payAnchor(signer, asset, tx));
    if (hash) {
      setPaymentHash(hash);
      push({ kind: "success", text: `${tx.amount_in} ${displayCode(asset)} sent to the anchor`, hash });
    }
  }

  async function trust() {
    if (!signer || !asset) return;
    const hash = await step("Add trustline", () => addTrustline(signer, asset));
    if (hash) {
      push({ kind: "success", text: `${displayCode(asset)} enabled on your account`, hash });
      balance.reload();
    }
  }

  const active = currentStep(token, tx);

  return (
    <div className="flex flex-col gap-8">
      <SectionTitle eyebrow="For labs · SEP-10 + SEP-24" title="Cash out to a bank account">
        <p className="max-w-md text-sm text-muted">
          Milestone funds and royalties arrive on Stellar. A regulated anchor turns them into a bank transfer: the lab
          never has to deal with crypto.
        </p>
      </SectionTitle>

      <Card className="border-amber/40 bg-amber/5 text-sm">
        <strong>Testnet:</strong> this demo uses the Stellar reference anchor ({ANCHOR_DOMAIN}). It does not list EURC
        and sends no real money, so the withdrawal runs with one of the assets it supports. In production the same
        SEP-24 flow points at an anchor that converts EURC into a SEPA transfer.
      </Card>

      {!signer && <ErrorBox message="Connect the lab's wallet to cash out." />}
      {config.loading && <Spinner label={`Reading ${ANCHOR_DOMAIN}/.well-known/stellar.toml…`} />}
      {config.error && <ErrorBox message={config.error} />}

      {signer && config.data && asset && (
        <div className="grid gap-6 lg:grid-cols-[280px_1fr]">
          <Card className="flex flex-col gap-4 lg:self-start">
            <ol className="flex flex-col gap-3">
              {STEPS.map((label, i) => (
                <li key={label} className="flex items-center gap-3 text-sm">
                  <span
                    className={`flex size-7 items-center justify-center rounded-full text-xs font-semibold ${
                      i < active || (i === 3 && tx?.status === "completed")
                        ? "bg-teal text-navy"
                        : i === active
                          ? "bg-navy text-paper"
                          : "bg-line text-muted"
                    }`}
                  >
                    {i + 1}
                  </span>
                  <span className={i === active ? "font-semibold" : "text-muted"}>{label}</span>
                </li>
              ))}
            </ol>
          </Card>

          <Card className="flex flex-col gap-5">
            <div className="flex flex-wrap items-end gap-4">
              <label className="flex flex-col gap-1.5 text-sm">
                <span className="font-semibold">Asset to withdraw</span>
                <select
                  className="rounded-lg border border-line bg-white px-3 py-2"
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
                <p className="text-muted">Your balance</p>
                <p className="font-semibold">
                  {balance.data ? `${Number(balance.data.balance).toLocaleString("en-US")} ${displayCode(asset)}` : "—"}
                </p>
              </div>
              <p className="text-xs text-muted">
                Anchor limits: {asset.min} to {asset.max} {displayCode(asset)} per withdrawal.
              </p>
            </div>

            {balance.data && !balance.data.trusted ? (
              <div className="flex flex-col gap-2 text-sm">
                <p>Your account cannot hold {displayCode(asset)} yet.</p>
                <Button variant="secondary" busy={busy === "Add trustline"} onClick={trust} className="self-start">
                  Enable {displayCode(asset)} on my account
                </Button>
              </div>
            ) : (
              balance.data &&
              Number(balance.data.balance) < asset.min && <p className="text-sm text-amber-dark">{assetHint(asset)}</p>
            )}

            <div className="flex flex-col gap-3 border-t border-line pt-5">
              {!token && (
                <Button busy={busy === "Sign in"} onClick={signIn} className="self-start">
                  Sign in to the anchor (SEP-10)
                </Button>
              )}
              {token && !tx && (
                <>
                  <Badge tone="teal">Signed in to {ANCHOR_DOMAIN}</Badge>
                  <Button busy={busy === "Start withdrawal"} onClick={start} className="self-start">
                    Withdraw to my bank account
                  </Button>
                  <p className="text-xs text-muted">The anchor opens a window to collect the amount and bank details.</p>
                </>
              )}
              {tx && (
                <div className="flex flex-col gap-3 text-sm">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge tone={tx.status === "completed" ? "teal" : TERMINAL.includes(tx.status) ? "danger" : "amber"}>
                      {tx.status}
                    </Badge>
                    <span>{STATUS_TEXT[tx.status] ?? tx.message ?? ""}</span>
                    {!TERMINAL.includes(tx.status) && (
                      <span className="size-3 animate-spin rounded-full border-2 border-teal-dark border-t-transparent" />
                    )}
                  </div>
                  {tx.status === "pending_user_transfer_start" && !paymentHash && (
                    <Button busy={busy === "Send to the anchor"} onClick={pay} className="self-start">
                      Send {tx.amount_in} {displayCode(asset)} to the anchor
                    </Button>
                  )}
                  {paymentHash && <TxLink hash={paymentHash} />}
                  {tx.amount_out && (
                    <p>
                      Amount sent to the bank: <strong>{tx.amount_out}</strong>
                      {tx.amount_fee && <span className="text-muted"> (fee {tx.amount_fee})</span>}
                    </p>
                  )}
                  {tx.external_transaction_id && <p className="text-muted">Bank reference: {tx.external_transaction_id}</p>}
                  {tx.more_info_url && (
                    <a href={tx.more_info_url} target="_blank" rel="noreferrer" className="font-semibold text-teal-dark hover:underline">
                      Withdrawal receipt from the anchor ↗
                    </a>
                  )}
                  {TERMINAL.includes(tx.status) && (
                    <Button variant="secondary" onClick={() => (setTx(null), setPaymentHash(""))} className="self-start">
                      New withdrawal
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
