import { NavLink, Outlet } from "react-router-dom";
import { CIRCLE_FAUCET_URL, CONTRACTS, explorer } from "../config";
import { eurcBalance } from "../stellar/contracts";
import { DEMO_ENABLED, DEMO_ROLES, ROLE_LABELS, useWallet, type DemoRole } from "../stellar/wallet";
import { useAsync } from "../lib/useAsync";
import { shortAddress } from "../lib/format";
import { Button } from "./ui";

const NAV = [
  { to: "/", label: "Marketplace" },
  { to: "/new", label: "List a patent" },
  { to: "/cash-out", label: "Cash out" },
  { to: "/admin", label: "Admin" },
];

function WalletArea() {
  const { signer, connecting, connectWallet, useDemoRole, disconnect } = useWallet();
  const balance = useAsync(() => (signer ? eurcBalance(signer.address) : Promise.resolve(null)), [signer?.address]);

  return (
    <div className="flex flex-wrap items-center gap-3">
      {DEMO_ENABLED && (
        <select
          className="rounded-lg border border-white/20 bg-navy-2 px-3 py-2 text-sm text-paper"
          value=""
          onChange={(e) => e.target.value && useDemoRole(e.target.value as DemoRole)}
          aria-label="Demo role"
        >
          <option value="">Demo: act as…</option>
          {DEMO_ROLES.map((role) => (
            <option key={role} value={role}>
              {ROLE_LABELS[role]}
            </option>
          ))}
        </select>
      )}
      {signer ? (
        <div className="flex items-center gap-3 rounded-lg bg-navy-2 px-3 py-1.5 text-sm text-paper">
          <div className="leading-tight">
            <p className="text-xs text-paper/60">{signer.label}</p>
            <p className="font-mono">{shortAddress(signer.address)}</p>
          </div>
          <div className="border-l border-white/15 pl-3 leading-tight">
            <p className="text-xs text-paper/60">Balance</p>
            <p className="font-semibold">
              {balance.data ? `${Number(balance.data.balance).toLocaleString("en-US")} EURC` : "—"}
            </p>
          </div>
          <button onClick={disconnect} className="text-xs text-paper/60 hover:text-paper">
            Disconnect
          </button>
        </div>
      ) : (
        <Button variant="secondary" busy={connecting} onClick={connectWallet}>
          Connect wallet
        </Button>
      )}
      {signer && balance.data && !balance.data.hasTrustline && (
        <p className="w-full text-xs text-amber">
          Add a trustline to Circle EURC in your wallet, then get test EURC on{" "}
          <a href={CIRCLE_FAUCET_URL} target="_blank" rel="noreferrer" className="underline">
            faucet.circle.com
          </a>
          .
        </p>
      )}
    </div>
  );
}

export function Layout() {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="bg-navy text-paper">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-6 py-4">
          <div className="flex items-center gap-8">
            <NavLink to="/" className="flex items-center gap-2 font-display text-xl font-bold">
              <span className="inline-block size-3 rounded-full bg-teal" />
              BioLicensing
            </NavLink>
            <nav className="flex gap-1">
              {NAV.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end
                  className={({ isActive }) =>
                    `rounded-lg px-3 py-2 text-sm font-medium ${isActive ? "bg-white/10 text-paper" : "text-paper/70 hover:text-paper"}`
                  }
                >
                  {item.label}
                </NavLink>
              ))}
            </nav>
          </div>
          <WalletArea />
        </div>
      </header>
      <main className="mx-auto w-full max-w-6xl flex-1 px-6 py-10">
        <Outlet />
      </main>
      <footer className="border-t border-line">
        <div className="mx-auto flex max-w-6xl flex-wrap justify-between gap-2 px-6 py-6 text-xs text-muted">
          <p>BioLicensing · HackMeridian 2026 · Stellar testnet · amounts are test EURC</p>
          <p className="flex gap-3">
            Contracts on stellar.expert:
            {(["nft", "escrow", "splitter"] as const).map((key) => (
              <a key={key} href={explorer.contract(CONTRACTS[key])} target="_blank" rel="noreferrer" className="text-teal-dark hover:underline">
                {key}
              </a>
            ))}
          </p>
        </div>
      </footer>
    </div>
  );
}
