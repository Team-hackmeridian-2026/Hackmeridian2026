import { EURC_CODE, EURC_ISSUER, HORIZON_URL } from "../config";

export const FRIENDBOT_URL = "https://friendbot.stellar.org";

export type AccountSnapshot = {
  /** False when the account has never been funded on testnet. */
  exists: boolean;
  xlm: string;
  hasTrustline: boolean;
  eurc: string;
};

/** Reads an account's XLM and EURC balances from Horizon (read-only, no wallet needed). */
export async function accountSnapshot(address: string): Promise<AccountSnapshot> {
  const res = await fetch(`${HORIZON_URL}/accounts/${address}`);
  if (res.status === 404) return { exists: false, xlm: "0", hasTrustline: false, eurc: "0" };
  if (!res.ok) throw new Error(`Horizon ${res.status}`);
  const account = (await res.json()) as {
    balances: { asset_type: string; asset_code?: string; asset_issuer?: string; balance: string }[];
  };
  const native = account.balances.find((b) => b.asset_type === "native");
  const line = account.balances.find((b) => b.asset_code === EURC_CODE && b.asset_issuer === EURC_ISSUER);
  return { exists: true, xlm: native?.balance ?? "0", hasTrustline: Boolean(line), eurc: line?.balance ?? "0" };
}
