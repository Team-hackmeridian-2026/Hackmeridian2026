import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { Keypair, TransactionBuilder } from "@stellar/stellar-sdk";
import { StellarWalletsKit } from "@creit.tech/stellar-wallets-kit/sdk";
import { defaultModules } from "@creit.tech/stellar-wallets-kit/modules/utils";
import { LocalStorageKeys, Networks } from "@creit.tech/stellar-wallets-kit/types";
import { NETWORK_PASSPHRASE } from "../config";

export type SignTransaction = (
  xdr: string,
  opts?: { networkPassphrase?: string; address?: string },
) => Promise<{ signedTxXdr: string; signerAddress?: string }>;

export type Signer = {
  address: string;
  sign: SignTransaction;
  /** "wallet" = Freighter & co. via Stellar Wallets Kit, "demo" = local testnet key. */
  kind: "wallet" | "demo";
  label: string;
};

export const DEMO_ROLES = ["lab", "fund", "pharma", "arbiter", "inventor", "admin"] as const;
export type DemoRole = (typeof DEMO_ROLES)[number];

export const ROLE_LABELS: Record<DemoRole, string> = {
  lab: "University lab",
  fund: "Investment fund",
  pharma: "Industry licensee",
  arbiter: "Arbiter",
  inventor: "Inventor",
  admin: "Platform admin",
};

/**
 * Demo mode: testnet secret keys injected at build time from frontend/.env.local
 * (written by scripts/sync-frontend-config.sh --demo, never committed). Only used
 * on stage to switch roles quickly; the public build has no keys and uses wallets.
 */
const DEMO_SECRETS: Partial<Record<DemoRole, string>> = (() => {
  try {
    return JSON.parse(import.meta.env.VITE_DEMO_SECRETS ?? "{}");
  } catch {
    return {};
  }
})();
export const DEMO_ENABLED = Object.keys(DEMO_SECRETS).length > 0;

let kitReady = false;
function initKit() {
  if (kitReady) return;
  StellarWalletsKit.init({ modules: defaultModules(), network: Networks.TESTNET });
  kitReady = true;
}

function walletSigner(address: string): Signer {
  return {
    address,
    kind: "wallet",
    label: "Wallet",
    sign: (xdr) =>
      StellarWalletsKit.signTransaction(xdr, { networkPassphrase: NETWORK_PASSPHRASE, address }),
  };
}

function demoSigner(role: DemoRole): Signer | null {
  const secret = DEMO_SECRETS[role];
  if (!secret) return null;
  const keypair = Keypair.fromSecret(secret);
  return {
    address: keypair.publicKey(),
    kind: "demo",
    label: ROLE_LABELS[role],
    sign: async (xdr) => {
      const tx = TransactionBuilder.fromXDR(xdr, NETWORK_PASSPHRASE);
      tx.sign(keypair);
      return { signedTxXdr: tx.toXDR(), signerAddress: keypair.publicKey() };
    },
  };
}

/** Demo role kept for the browser tab only, so a refresh on stage keeps the role. */
const DEMO_ROLE_KEY = "biolicensing/demoRole";

function rememberDemoRole(role: DemoRole | null) {
  try {
    if (role) sessionStorage.setItem(DEMO_ROLE_KEY, role);
    else sessionStorage.removeItem(DEMO_ROLE_KEY);
  } catch {
    // Storage unavailable (private mode, blocked cookies): the session just won't persist.
  }
}

/**
 * Restores the session after a page refresh. Stellar Wallets Kit already saves the
 * connected address and the chosen wallet in localStorage; we only read them back, so
 * the user is not asked to reconnect. Signing still goes through the wallet as usual.
 */
function restoreSigner(): Signer | null {
  try {
    const role = sessionStorage.getItem(DEMO_ROLE_KEY) as DemoRole | null;
    if (role && DEMO_ENABLED) {
      const demo = demoSigner(role);
      if (demo) return demo;
    }
    const address = localStorage.getItem(LocalStorageKeys.activeAddress);
    const walletId = localStorage.getItem(LocalStorageKeys.selectedModuleId);
    if (!address || !walletId) return null;
    initKit();
    StellarWalletsKit.setWallet(walletId);
    return walletSigner(address);
  } catch {
    return null;
  }
}

type WalletState = {
  signer: Signer | null;
  connecting: boolean;
  connectWallet: () => Promise<void>;
  useDemoRole: (role: DemoRole) => void;
  disconnect: () => Promise<void>;
};

const WalletContext = createContext<WalletState | null>(null);

export function WalletProvider({ children }: { children: ReactNode }) {
  const [signer, setSigner] = useState<Signer | null>(restoreSigner);
  const [connecting, setConnecting] = useState(false);

  const connectWallet = useCallback(async () => {
    initKit();
    setConnecting(true);
    try {
      const { address } = await StellarWalletsKit.authModal();
      rememberDemoRole(null);
      setSigner(walletSigner(address));
    } finally {
      setConnecting(false);
    }
  }, []);

  const useDemoRole = useCallback((role: DemoRole) => {
    const demo = demoSigner(role);
    if (!demo) return;
    rememberDemoRole(role);
    setSigner(demo);
  }, []);

  const disconnect = useCallback(async () => {
    if (signer?.kind === "wallet") await StellarWalletsKit.disconnect();
    rememberDemoRole(null);
    setSigner(null);
  }, [signer]);

  const value = useMemo(
    () => ({ signer, connecting, connectWallet, useDemoRole, disconnect }),
    [signer, connecting, connectWallet, useDemoRole, disconnect],
  );
  return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>;
}

export function useWallet(): WalletState {
  const ctx = useContext(WalletContext);
  if (!ctx) throw new Error("useWallet must be used inside WalletProvider");
  return ctx;
}
