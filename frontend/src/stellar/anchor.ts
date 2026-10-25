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
  WebAuth,
} from "@stellar/stellar-sdk";
import { HORIZON_URL, NETWORK_PASSPHRASE } from "../config";
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
      throw new Error(`${ANCHOR_DOMAIN} does not support SEP-10 and SEP-24.`);
    }
    const info = (await (await fetch(`${toml.TRANSFER_SERVER_SEP0024}/info`)).json()) as {
      withdraw: Record<string, { enabled: boolean; min_amount?: number; max_amount?: number }>;
    };
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

const tokens = new Map<string, string>();

/** Proves to the anchor that the user controls `signer.address` by signing its challenge. */
export async function authenticate(signer: Signer): Promise<string> {
  const cached = tokens.get(signer.address);
  if (cached) return cached;

  const cfg = await anchorConfig();
  const res = await fetch(`${cfg.webAuth}?account=${signer.address}`);
  const { transaction } = (await res.json()) as { transaction: string };

  // Reject a challenge that was not issued by this anchor for this account.
  const { clientAccountID } = WebAuth.readChallengeTx(
    transaction,
    cfg.signingKey,
    NETWORK_PASSPHRASE,
    ANCHOR_DOMAIN,
    new URL(cfg.webAuth).host,
  );
  if (clientAccountID !== signer.address) throw new Error("The anchor's challenge is for another account.");

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
  if (!body.token) throw new Error(body.error ?? "The anchor refused the authentication.");
  tokens.set(signer.address, body.token);
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
  if (!body.id || !body.url) throw new Error(body.error ?? "The anchor could not start the withdrawal.");
  return { id: body.id, url: body.url };
}

export async function getTransaction(token: string, id: string): Promise<AnchorTransaction> {
  const cfg = await anchorConfig();
  const res = await fetch(`${cfg.transferServer}/transaction?id=${encodeURIComponent(id)}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const body = (await res.json()) as { transaction?: AnchorTransaction; error?: string };
  if (!body.transaction) throw new Error(body.error ?? "Withdrawal not found.");
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

async function submit(signer: Signer, build: (b: TransactionBuilder) => TransactionBuilder): Promise<string> {
  const account = await horizon.loadAccount(signer.address);
  const tx = build(new TransactionBuilder(account, { fee: BASE_FEE, networkPassphrase: NETWORK_PASSPHRASE }))
    .setTimeout(180)
    .build();
  const { signedTxXdr } = await signer.sign(tx.toXDR(), {
    networkPassphrase: NETWORK_PASSPHRASE,
    address: signer.address,
  });
  const res = await horizon.submitTransaction(TransactionBuilder.fromXDR(signedTxXdr, NETWORK_PASSPHRASE));
  return res.hash;
}

/** Adds a trustline so the account can hold the anchor's asset. */
export function addTrustline(signer: Signer, a: AnchorAsset): Promise<string> {
  return submit(signer, (b) => b.addOperation(Operation.changeTrust({ asset: toAsset(a) })));
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

/** Sends the funds the anchor is waiting for, with the memo it uses to match the payment. */
export function payAnchor(signer: Signer, a: AnchorAsset, tx: AnchorTransaction): Promise<string> {
  if (!tx.withdraw_anchor_account || !tx.amount_in) throw new Error("The anchor has not given payment details yet.");
  return submit(signer, (b) =>
    b
      .addOperation(
        Operation.payment({ destination: tx.withdraw_anchor_account!, asset: toAsset(a), amount: tx.amount_in! }),
      )
      .addMemo(memoOf(tx)),
  );
}
