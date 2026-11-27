import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { Keypair, TransactionBuilder } from "@stellar/stellar-sdk";
import type { StellarWalletsKit } from "@creit.tech/stellar-wallets-kit/sdk";
import { LocalStorageKeys, Networks } from "@creit.tech/stellar-wallets-kit/types";
import { NETWORK_PASSPHRASE } from "../config";
import { WalletError } from "./errors";

export type SignTransaction = (
  xdr: string,
  opts?: { networkPassphrase?: string; address?: string },
) => Promise<{ signedTxXdr: string; signerAddress?: string }>;

export type Signer = {
  address: string;
  sign: SignTransaction;
  /** "wallet" = Freighter & co. via Stellar Wallets Kit, "demo" = local testnet key. */
  kind: "wallet" | "demo";
  /** Set in demo mode, so the header can show the role in the current language. */
  role?: DemoRole;
};

export const DEMO_ROLES = ["lab", "fund", "pharma", "arbiter", "inventor", "admin"] as const;
export type DemoRole = (typeof DEMO_ROLES)[number];

/**
 * Demo mode: testnet secret keys from frontend/.env.local (written by
 * scripts/sync-frontend-config.sh --demo, never committed), to switch roles quickly
 * on stage. Read by the dev server only: Vite copies VITE_* variables into every
 * build, and the admin's key must never end up in a bundle someone could publish.
 */
const DEMO_SECRETS: Partial<Record<DemoRole, string>> = (() => {
  try {
    return JSON.parse((import.meta.env.DEV && import.meta.env.VITE_DEMO_SECRETS) || "{}");
  } catch {
    return {};
  }
})();
export const DEMO_ENABLED = Object.keys(DEMO_SECRETS).length > 0;

/** Wallet of a session restored after a refresh, selected once the kit has loaded. */
let restoredWallet: string | null = null;
let kitPromise: Promise<typeof StellarWalletsKit> | null = null;

/**
 * Wallets Kit and its wallet modules (about 250 kB, a sixth of the main bundle) load on
 * first use, so visitors who only browse never download them.
 */
function loadKit(): Promise<typeof StellarWalletsKit> {
  if (!kitPromise) {
    kitPromise = Promise.all([
      import("@creit.tech/stellar-wallets-kit/sdk"),
      import("@creit.tech/stellar-wallets-kit/modules/utils"),
    ]).then(([{ StellarWalletsKit: kit }, { defaultModules }]) => {
      kit.init({ modules: defaultModules(), network: Networks.TESTNET });
      try {
        if (restoredWallet) kit.setWallet(restoredWallet);
      } catch {
        // A wallet this kit version no longer has ("freighter" became "varial" in 2.8): the session is dropped.
        restoredWallet = null;
      }
      return kit;
    });
    // A failed download must not stay cached, or connecting fails until the page is reloaded.
    kitPromise.catch(() => (kitPromise = null));
  }
  return kitPromise;
}

/** Catch the usual mistakes up front: extension off or locked, wrong network, other account active. */
async function checkWallet(address: string): Promise<void> {
  const kit = await loadKit();
  let network: { networkPassphrase: string };
  try {
    network = await kit.getNetwork();
  } catch {
    throw new WalletError("notConnected");
  }
  // Check the network before asking for the address: on a network where the site was never
  // approved (Mainnet), Freighter answers that request with a connection popup.
  if (network.networkPassphrase && network.networkPassphrase !== NETWORK_PASSPHRASE) throw new WalletError("network");
  let active: string;
  try {
    active = (await kit.fetchAddress()).address;
  } catch {
    throw new WalletError("notConnected");
  }
  if (active && active !== address) throw new WalletError("account", active);
}

function walletSigner(address: string): Signer {
  return {
    address,
    kind: "wallet",
    sign: async (xdr) => {
      await checkWallet(address);
      return (await loadKit()).signTransaction(xdr, { networkPassphrase: NETWORK_PASSPHRASE, address });
    },
  };
}

function demoSigner(role: DemoRole): Signer | null {
  const secret = DEMO_SECRETS[role];
  if (!secret) return null;
  const keypair = Keypair.fromSecret(secret);
  return {
    address: keypair.publicKey(),
    kind: "demo",
    role,
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
    restoredWallet = walletId;
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

  // A restored wallet session loads the kit at once, to check that its wallet still exists.
  useEffect(() => {
    if (!restoredWallet) return;
    loadKit().then(
      () => {
        if (!restoredWallet) setSigner(null);
      },
      () => {}, // download failed: the next use of the wallet tries again
    );
  }, []);

  const connectWallet = useCallback(async () => {
    setConnecting(true);
    try {
      const { address } = await (await loadKit()).authModal();
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
    if (signer?.kind === "wallet") await (await loadKit()).disconnect();
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
