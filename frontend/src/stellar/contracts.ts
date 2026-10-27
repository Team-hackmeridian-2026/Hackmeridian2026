import { Buffer } from "buffer";
import { contract } from "@stellar/stellar-sdk";
import { CONTRACTS, EURC_CODE, EURC_ISSUER, HORIZON_URL, NETWORK_PASSPHRASE, RPC_URL } from "../config";
import { toUnits } from "../lib/format";
import i18n from "../i18n";
import type { Signer } from "./wallet";
import { WalletError } from "./errors";

// ---------- On-chain types (mirror the Rust contracts) ----------

export type LicenseTerms = {
  exclusive: boolean;
  territory: string;
  field: string;
  duration_years: number;
};

export type License = {
  id: bigint;
  owner: string;
  title: string;
  inventors: string[];
  terms: LicenseTerms;
  dossier_hash: Buffer;
  metadata_uri: string;
  created_at: bigint;
};

export type MilestoneStatus = "Pending" | "Submitted" | "Disputed" | "Released" | "Refunded" | "Split";

export type Milestone = {
  amount: bigint;
  status: MilestoneStatus;
  proof_hash?: Buffer;
  submitted_at: bigint;
  dispute_reason?: Buffer;
  /** Share of the milestone paid to the lab, in basis points (10 000 = all). */
  lab_bps: number;
};

/** A settled milestone no longer blocks the next one. */
export function isSettled(status: MilestoneStatus): boolean {
  return status === "Released" || status === "Refunded" || status === "Split";
}

/** Gross amount of a milestone that went to the lab. */
export function paidToLab(m: Milestone): bigint {
  if (m.status === "Released") return m.amount;
  if (m.status === "Split") return (m.amount * BigInt(m.lab_bps)) / 10_000n;
  return 0n;
}

export type Project = {
  id: bigint;
  license_id: bigint;
  lab: string;
  investor: string;
  arbiter: string;
  challenge_period: bigint;
  /**
   * End of the research period (ledger time, seconds): no submission after it, and
   * Pending milestones can be refunded. Absent on rounds of contracts deployed before 2.0.0.
   */
  deadline?: bigint;
  funded: boolean;
  milestones: Milestone[];
};

/** Time the arbiter has to settle a dispute after the challenge window (ARBITER_PERIOD in milestone_escrow). */
export const ARBITER_PERIOD = 30 * 24 * 60 * 60;

/** Indexes of the milestones `reclaim` would refund now: Pending after the deadline, or a dispute left unsettled. */
export function reclaimable(project: Project, now: number): number[] {
  if (project.deadline === undefined || !project.funded) return [];
  const deadline = Number(project.deadline);
  const window = Number(project.challenge_period);
  return project.milestones.flatMap((m, i) =>
    (m.status === "Pending" && now >= deadline) ||
    (m.status === "Disputed" && now >= Number(m.submitted_at) + window + ARBITER_PERIOD)
      ? [i]
      : [],
  );
}

export type Beneficiary = { addr: string; bps: number };
export type SplitConfig = { fixed: Beneficiary[]; investors_bps: number };

export type TxResult<T = unknown> = { hash: string; result: T };

// ---------- Clients ----------

const specs = new Map<string, Promise<contract.Spec>>();

function spec(contractId: string): Promise<contract.Spec> {
  let s = specs.get(contractId);
  if (!s) {
    s = contract.Client.from({ contractId, networkPassphrase: NETWORK_PASSPHRASE, rpcUrl: RPC_URL }).then(
      (c) => c.spec,
    );
    specs.set(contractId, s);
  }
  return s;
}

// The generated client exposes one method per contract function.
type DynamicClient = Record<string, (args?: object) => Promise<contract.AssembledTransaction<unknown>>>;

async function client(contractId: string, signer?: Signer): Promise<DynamicClient> {
  const c = new contract.Client(await spec(contractId), {
    contractId,
    networkPassphrase: NETWORK_PASSPHRASE,
    rpcUrl: RPC_URL,
    publicKey: signer?.address,
    signTransaction: signer?.sign,
  });
  return c as unknown as DynamicClient;
}

async function read<T>(contractId: string, method: string, args: object = {}): Promise<T> {
  const c = await client(contractId);
  const tx = await c[method](args);
  return tx.result as T;
}

async function write<T>(contractId: string, method: string, args: object, signer: Signer): Promise<TxResult<T>> {
  const c = await client(contractId, signer);
  try {
    const tx = await c[method](args);
    const sent = await tx.signAndSend();
    const hash = sent.sendTransactionResponse?.hash ?? "";
    return { hash, result: sent.result as T };
  } catch (err) {
    throw new Error(explainError(contractId, err));
  }
}

// ---------- Errors ----------

// Messages live in src/i18n/<lang>.json under errors.<contract>.<code>.
const ERRORS: Record<string, string> = {
  [CONTRACTS.nft]: "errors.nft",
  [CONTRACTS.splitter]: "errors.splitter",
  [CONTRACTS.escrow]: "errors.escrow",
};

function explainError(contractId: string, err: unknown): string {
  if (err instanceof WalletError) {
    const short = err.detail ? `${err.detail.slice(0, 4)}…${err.detail.slice(-4)}` : "";
    return i18n.t(`errors.wallet.${err.kind}`, { address: short });
  }
  // Wallets Kit rejects with plain { code, message } objects, not Errors.
  const raw =
    err instanceof Error
      ? err.message
      : typeof err === "object" && err && "message" in err
        ? String((err as { message: unknown }).message)
        : String(err);
  const code = /Error\(Contract, #(\d+)\)/.exec(raw)?.[1];
  if (code) {
    const key = `${ERRORS[contractId]}.${code}`;
    return ERRORS[contractId] && i18n.exists(key) ? i18n.t(key) : i18n.t("errors.contract", { code });
  }
  if (/balance|underfunded|insufficient/i.test(raw)) return i18n.t("errors.balance");
  if (/trustline/i.test(raw)) return i18n.t("errors.trustline");
  // Transactions are built with a 5-minute validity window; signing later makes the network refuse them.
  if (/txTooLate|tx_too_late|expired/i.test(raw)) return i18n.t("errors.expired");
  if (/reject|declin|cancel/i.test(raw)) return i18n.t("errors.cancelled");
  if (/not connected|not installed|not allowed|request access|locked/i.test(raw)) return i18n.t("errors.wallet.notConnected");
  // Only real wallet network mismatches: the SDK's "Sending the transaction to the network failed!" is not one.
  if (/passphrase|wrong network|network mismatch|another network/i.test(raw)) return i18n.t("errors.wallet.network");
  if (/sending the transaction to the network failed/i.test(raw)) return i18n.t("errors.sendFailed");
  return raw.length > 240 ? raw.slice(0, 240) + "…" : raw;
}

// ---------- Reads ----------

function normalizeProject(p: Project): Project {
  return {
    ...p,
    milestones: p.milestones.map((m) => ({
      ...m,
      // Unit enums come back as { tag: "Pending" } from the spec decoder.
      status: (typeof m.status === "string" ? m.status : (m.status as { tag: MilestoneStatus }).tag),
    })),
  };
}

export const nft = {
  total: () => read<bigint>(CONTRACTS.nft, "total"),
  list: (start = 1n, limit = 50) => read<License[]>(CONTRACTS.nft, "list_licenses", { start, limit }),
  get: (id: bigint) => read<License>(CONTRACTS.nft, "get_license", { id }),
  isInstitution: (who: string) => read<boolean>(CONTRACTS.nft, "is_institution", { who }),
  hasSignedNda: (id: bigint, viewer: string) => read<boolean>(CONTRACTS.nft, "has_signed_nda", { id, viewer }),

  mint: (
    signer: Signer,
    input: {
      title: string;
      inventors: string[];
      terms: LicenseTerms;
      dossierHash: Uint8Array;
      metadataUri: string;
    },
  ) =>
    write<bigint>(
      CONTRACTS.nft,
      "mint",
      {
        owner: signer.address,
        title: input.title,
        inventors: input.inventors,
        terms: input.terms,
        dossier_hash: Buffer.from(input.dossierHash),
        metadata_uri: input.metadataUri,
      },
      signer,
    ),
  signNda: (signer: Signer, id: bigint) => write(CONTRACTS.nft, "sign_nda", { id, viewer: signer.address }, signer),
  setInstitution: (signer: Signer, institution: string, verified: boolean) =>
    write(CONTRACTS.nft, "set_institution", { institution, verified }, signer),
};

export const escrow = {
  projectsByLicense: (licenseId: bigint) =>
    read<bigint[]>(CONTRACTS.escrow, "projects_by_license", { license_id: licenseId }),
  get: async (projectId: bigint) =>
    normalizeProject(await read<Project>(CONTRACTS.escrow, "get_project", { project_id: projectId })),

  create: (
    signer: Signer,
    input: {
      licenseId: bigint;
      investor: string;
      arbiter: string;
      amounts: string[];
      challengePeriod: number;
      /** Ledger timestamp (seconds). Contracts deployed before 2.0.0 have no deadline and ignore it. */
      deadline: number;
    },
  ) =>
    write<bigint>(
      CONTRACTS.escrow,
      "create_project",
      {
        license_id: input.licenseId,
        investor: input.investor,
        arbiter: input.arbiter,
        amounts: input.amounts.map(toUnits),
        challenge_period: BigInt(input.challengePeriod),
        deadline: BigInt(input.deadline),
      },
      signer,
    ),
  fund: (signer: Signer, projectId: bigint) => write(CONTRACTS.escrow, "fund", { project_id: projectId }, signer),
  submit: (signer: Signer, projectId: bigint, index: number, proofHash: Uint8Array) =>
    write(
      CONTRACTS.escrow,
      "submit_milestone",
      { project_id: projectId, index, proof_hash: Buffer.from(proofHash) },
      signer,
    ),
  dispute: (signer: Signer, projectId: bigint, index: number, reasonHash: Uint8Array) =>
    write(
      CONTRACTS.escrow,
      "dispute",
      { project_id: projectId, index, reason_hash: Buffer.from(reasonHash) },
      signer,
    ),
  release: (signer: Signer, projectId: bigint, index: number) =>
    write(CONTRACTS.escrow, "release", { project_id: projectId, index }, signer),
  resolve: (signer: Signer, projectId: bigint, index: number, approve: boolean) =>
    write(CONTRACTS.escrow, "resolve", { project_id: projectId, index, approve }, signer),
  /** Anyone can trigger it: refunds the investor for every milestone `reclaimable` lists. */
  reclaim: (signer: Signer, projectId: bigint) => write(CONTRACTS.escrow, "reclaim", { project_id: projectId }, signer),
  /** labPct: share paid to the lab (0–100); the rest is refunded to the investor. */
  resolvePartial: (signer: Signer, projectId: bigint, index: number, labPct: number) =>
    write(CONTRACTS.escrow, "resolve_partial", { project_id: projectId, index, lab_bps: Math.round(labPct * 100) }, signer),
};

export const splitter = {
  config: (licenseId: bigint) => read<SplitConfig>(CONTRACTS.splitter, "get_config", { license_id: licenseId }),
  isConfigured: (licenseId: bigint) => read<boolean>(CONTRACTS.splitter, "is_configured", { license_id: licenseId }),
  claimable: (licenseId: bigint, who: string) =>
    read<bigint>(CONTRACTS.splitter, "claimable", { license_id: licenseId, who }),
  sharesOf: (licenseId: bigint, who: string) =>
    read<bigint>(CONTRACTS.splitter, "shares_of", { license_id: licenseId, who }),
  totalShares: (licenseId: bigint) => read<bigint>(CONTRACTS.splitter, "total_shares", { license_id: licenseId }),
  totalRoyalties: (licenseId: bigint) =>
    read<bigint>(CONTRACTS.splitter, "total_royalties", { license_id: licenseId }),
  isAllowed: (who: string) => read<boolean>(CONTRACTS.splitter, "is_allowed", { who }),

  configure: (signer: Signer, licenseId: bigint, config: SplitConfig) =>
    write(CONTRACTS.splitter, "configure", { license_id: licenseId, config }, signer),
  payRoyalty: (signer: Signer, licenseId: bigint, amount: string) =>
    write(
      CONTRACTS.splitter,
      "pay_royalty",
      { license_id: licenseId, payer: signer.address, amount: toUnits(amount) },
      signer,
    ),
  claim: (signer: Signer, licenseId: bigint) =>
    write<bigint>(CONTRACTS.splitter, "claim", { license_id: licenseId, who: signer.address }, signer),
  setAllowed: (signer: Signer, who: string, allowed: boolean) =>
    write(CONTRACTS.splitter, "set_allowed", { who, allowed }, signer),
};

// ---------- EURC balances (Horizon) ----------

export async function eurcBalance(address: string): Promise<{ balance: string; hasTrustline: boolean } | null> {
  const res = await fetch(`${HORIZON_URL}/accounts/${address}`);
  if (res.status === 404) return null;
  const account = (await res.json()) as {
    balances: { asset_code?: string; asset_issuer?: string; balance: string }[];
  };
  const line = account.balances.find((b) => b.asset_code === EURC_CODE && b.asset_issuer === EURC_ISSUER);
  return { balance: line?.balance ?? "0", hasTrustline: Boolean(line) };
}
