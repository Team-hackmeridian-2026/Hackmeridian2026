/**
 * Cash-out through a Stellar anchor: SEP-1 (stellar.toml), SEP-10 (web auth)
 * and SEP-24 (interactive withdrawal).
 *
 * On testnet we use the SDF reference anchor. It does not list EURC, so the
 * withdrawal runs with one of the assets it supports (Circle USDC, its SRT
 * test token or XLM). In production the same code points at an anchor that
 * turns EURC into a SEPA transfer: only ANCHOR_DOMAIN changes.
 */
import { Buffer } from "buffer";
import {
  Asset,
  BASE_FEE,
  Horizon,
  Memo,
  Operation,
  StellarToml,
  TransactionBuilder,
  TransactionFailedError,
  WebAuth,
} from "@stellar/stellar-sdk";
import { HORIZON_URL, NETWORK_PASSPHRASE } from "../config";
import i18n from "../i18n";
import type { Signer } from "./wallet";

export const ANCHOR_DOMAIN = "testanchor.stellar.org";

const horizon = new Horizon.Server(HORIZON_URL);

export type AnchorAsset = { code: string; issuer?: string; min: number; max: number };

export type AnchorConfig = {
  webAuth: string;
  transferServer: string;
  signingKey: string;
  assets: AnchorAsset[];
};

/** Statuses defined by SEP-24, in the order a withdrawal goes through them. */
export type AnchorStatus =
  | "incomplete"
  | "pending_user_transfer_start"
  | "pending_user_transfer_complete"
  | "pending_anchor"
  | "pending_stellar"
  | "pending_external"
  | "pending_trust"
  | "pending_user"
  | "completed"
  | "refunded"
  | "expired"
  | "error"
  | "no_market"
  | "too_small"
  | "too_large";

export type AnchorTransaction = {
  id: string;
  status: AnchorStatus;
  amount_in?: string;
  amount_out?: string;
  amount_fee?: string;
  withdraw_anchor_account?: string;
  withdraw_memo?: string;
  withdraw_memo_type?: "text" | "id" | "hash";
  stellar_transaction_id?: string;
  external_transaction_id?: string;
  more_info_url?: string;
  message?: string;
};

// ---------- SEP-1 ----------

let configPromise: Promise<AnchorConfig> | null = null;

export function anchorConfig(): Promise<AnchorConfig> {
  configPromise ??= (async () => {
    const toml = await StellarToml.Resolver.resolve(ANCHOR_DOMAIN);
    if (!toml.WEB_AUTH_ENDPOINT || !toml.TRANSFER_SERVER_SEP0024 || !toml.SIGNING_KEY) {
      throw new Error(i18n.t("errors.anchor.unsupported", { domain: ANCHOR_DOMAIN }));
    }
    const info = (await (await fetch(`${toml.TRANSFER_SERVER_SEP0024}/info`)).json()) as {
      withdraw?: Record<string, { enabled: boolean; min_amount?: number; max_amount?: number }>;
    };
    if (!info.withdraw) throw new Error(i18n.t("errors.anchor.unsupported", { domain: ANCHOR_DOMAIN }));
    const issuers = new Map((toml.CURRENCIES ?? []).map((c) => [c.code, c.issuer]));
    const assets = Object.entries(info.withdraw)
      .filter(([, w]) => w.enabled)
      .map(([code, w]) => ({
        code,
        issuer: code === "native" ? undefined : issuers.get(code),
        min: w.min_amount ?? 0,
        max: w.max_amount ?? Infinity,
      }));
    return {
      webAuth: toml.WEB_AUTH_ENDPOINT,
      transferServer: toml.TRANSFER_SERVER_SEP0024,
      signingKey: toml.SIGNING_KEY,
      assets,
    };
  })();
  configPromise.catch(() => (configPromise = null));
  return configPromise;
}

// ---------- SEP-10 ----------

/**
 * Proves to the anchor that the user controls `signer.address` by signing its challenge.
 * Not cached: the cash-out page keeps the token while it is open, so leaving the page
 * drops an expired one instead of reusing it for every later withdrawal.
 */
export async function authenticate(signer: Signer): Promise<string> {
  const cfg = await anchorConfig();
  const res = await fetch(`${cfg.webAuth}?account=${signer.address}`);
  const { transaction, error } = (await res.json()) as { transaction?: string; error?: string };
  if (!transaction) throw new Error(error ?? i18n.t("errors.anchor.noChallenge"));

  // Reject a challenge that was not issued by this anchor for this account.
  const { clientAccountID } = WebAuth.readChallengeTx(
    transaction,
    cfg.signingKey,
    NETWORK_PASSPHRASE,
    ANCHOR_DOMAIN,
    new URL(cfg.webAuth).host,
  );
  if (clientAccountID !== signer.address) throw new Error(i18n.t("errors.anchor.otherAccount"));

  const { signedTxXdr } = await signer.sign(transaction, {
    networkPassphrase: NETWORK_PASSPHRASE,
    address: signer.address,
  });
  const tokenRes = await fetch(cfg.webAuth, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ transaction: signedTxXdr }),
  });
  const body = (await tokenRes.json()) as { token?: string; error?: string };
  if (!body.token) throw new Error(body.error ?? i18n.t("errors.anchor.authRefused"));
  return body.token;
}

// ---------- SEP-24 ----------

export async function startWithdrawal(
  token: string,
  asset: AnchorAsset,
  account: string,
): Promise<{ id: string; url: string }> {
  const cfg = await anchorConfig();
  const res = await fetch(`${cfg.transferServer}/transactions/withdraw/interactive`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ asset_code: asset.code, ...(asset.issuer && { asset_issuer: asset.issuer }), account, lang: "en" }),
  });
  const body = (await res.json()) as { id?: string; url?: string; error?: string };
  if (!body.id || !body.url) throw new Error(body.error ?? i18n.t("errors.anchor.startFailed"));
  return { id: body.id, url: body.url };
}

export async function getTransaction(token: string, id: string): Promise<AnchorTransaction> {
  const cfg = await anchorConfig();
  const res = await fetch(`${cfg.transferServer}/transaction?id=${encodeURIComponent(id)}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const body = (await res.json()) as { transaction?: AnchorTransaction; error?: string };
  if (!body.transaction) throw new Error(body.error ?? i18n.t("errors.anchor.notFound"));
  return body.transaction;
}

// ---------- Classic Stellar operations ----------

export function toAsset(a: AnchorAsset): Asset {
  return a.code === "native" ? Asset.native() : new Asset(a.code, a.issuer!);
}

export function displayCode(a: AnchorAsset): string {
  return a.code === "native" ? "XLM" : a.code;
}

export async function balanceOf(account: string, a: AnchorAsset): Promise<{ balance: string; trusted: boolean }> {
  const acc = await horizon.loadAccount(account);
  const line = acc.balances.find((b) =>
    a.code === "native"
      ? b.asset_type === "native"
      : "asset_code" in b && b.asset_code === a.code && b.asset_issuer === a.issuer,
  );
  return { balance: line?.balance ?? "0", trusted: Boolean(line) };
}

/** Builds a transaction and has the user sign it; returns the signed XDR. */
async function sign(signer: Signer, build: (b: TransactionBuilder) => TransactionBuilder): Promise<string> {
  const account = await horizon.loadAccount(signer.address);
  const tx = build(new TransactionBuilder(account, { fee: BASE_FEE, networkPassphrase: NETWORK_PASSPHRASE }))
    .setTimeout(180)
    .build();
  const { signedTxXdr } = await signer.sign(tx.toXDR(), {
    networkPassphrase: NETWORK_PASSPHRASE,
    address: signer.address,
  });
  return signedTxXdr;
}

async function send(signedTxXdr: string): Promise<string> {
  const res = await horizon.submitTransaction(TransactionBuilder.fromXDR(signedTxXdr, NETWORK_PASSPHRASE));
  return res.hash;
}

/** Adds a trustline so the account can hold the anchor's asset. */
export async function addTrustline(signer: Signer, a: AnchorAsset): Promise<string> {
  return send(await sign(signer, (b) => b.addOperation(Operation.changeTrust({ asset: toAsset(a) }))));
}

function memoOf(tx: AnchorTransaction): Memo {
  const value = tx.withdraw_memo;
  if (!value) return Memo.none();
  switch (tx.withdraw_memo_type) {
    case "id":
      return Memo.id(value);
    case "hash":
      return Memo.hash(Buffer.from(value, "base64"));
    default:
      return Memo.text(value);
  }
}

/**
 * The signed payment of each withdrawal, by anchor transaction id. A retry resends that same
 * transaction: if the first send landed although Horizon timed out or the connection dropped,
 * Horizon answers with its result instead of a second payment going out.
 */
const payments = new Map<string, string>();

/** Sends the funds the anchor is waiting for, with the memo it uses to match the payment. */
export async function payAnchor(signer: Signer, a: AnchorAsset, tx: AnchorTransaction): Promise<string> {
  const { withdraw_anchor_account: destination, amount_in: amount } = tx;
  if (!destination || !amount) throw new Error(i18n.t("errors.anchor.noPaymentDetails"));
  const signed =
    payments.get(tx.id) ??
    (await sign(signer, (b) => b.addOperation(Operation.payment({ destination, asset: toAsset(a), amount })).addMemo(memoOf(tx))));
  payments.set(tx.id, signed);
  try {
    return await send(signed);
  } catch (err) {
    // Refused with result codes (expired, underfunded…): nothing was paid, so the next try signs a new one.
    if (err instanceof TransactionFailedError) payments.delete(tx.id);
    throw err;
  }
}
