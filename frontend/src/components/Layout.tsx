import { NavLink, Outlet } from "react-router-dom";
import { Trans, useTranslation } from "react-i18next";
import { CIRCLE_FAUCET_URL, CONTRACTS, explorer } from "../config";
import { eurcBalance } from "../stellar/contracts";
import { DEMO_ENABLED, DEMO_ROLES, useWallet, type DemoRole } from "../stellar/wallet";
import { LANGUAGES } from "../i18n";
import { useAsync } from "../lib/useAsync";
import { formatNumber, shortAddress } from "../lib/format";
import { Button } from "./ui";

const NAV = [
  { to: "/", key: "nav.marketplace" },
  { to: "/new", key: "nav.newLicence" },
  { to: "/cash-out", key: "nav.cashOut" },
  { to: "/admin", key: "nav.admin" },
] as const;

function LanguageSwitcher() {
  const { t, i18n } = useTranslation();
  return (
    <div role="group" aria-label={t("language.label")} className="flex rounded-lg border border-white/20 p-0.5 text-xs font-semibold">
      {LANGUAGES.map((lang) => {
        const active = i18n.resolvedLanguage === lang.code;
        return (
          <button
            key={lang.code}
            type="button"
            lang={lang.code}
            title={lang.name}
            aria-pressed={active}
            onClick={() => i18n.changeLanguage(lang.code)}
            className={`rounded-md px-2 py-1 transition ${active ? "bg-teal text-navy" : "text-paper/70 hover:text-paper"}`}
          >
            {lang.label}
          </button>
        );
      })}
    </div>
  );
}

function WalletArea() {
  const { t } = useTranslation();
  const { signer, connecting, connectWallet, useDemoRole, disconnect } = useWallet();
  const balance = useAsync(() => (signer ? eurcBalance(signer.address) : Promise.resolve(null)), [signer?.address]);

  return (
    <div className="flex flex-wrap items-center gap-3">
      {DEMO_ENABLED && (
        <select
          className="rounded-lg border border-white/20 bg-navy-2 px-3 py-2 text-sm text-paper"
          value=""
          onChange={(e) => e.target.value && useDemoRole(e.target.value as DemoRole)}
          aria-label={t("wallet.demoRole")}
        >
          <option value="">{t("wallet.demoActAs")}</option>
          {DEMO_ROLES.map((role) => (
            <option key={role} value={role}>
              {t(`roles.${role}`)}
            </option>
          ))}
        </select>
      )}
      {signer ? (
        <div className="flex items-center gap-3 rounded-lg bg-navy-2 px-3 py-1.5 text-sm text-paper">
          <div className="leading-tight">
            <p className="text-xs text-paper/60">{signer.role ? t(`roles.${signer.role}`) : t("wallet.wallet")}</p>
            <p className="font-mono">{shortAddress(signer.address)}</p>
          </div>
          <div className="border-l border-white/15 pl-3 leading-tight">
            <p className="text-xs text-paper/60">{t("wallet.balance")}</p>
            <p className="font-semibold">{balance.data ? `${formatNumber(balance.data.balance)} EURC` : "—"}</p>
          </div>
          <button onClick={disconnect} className="text-xs text-paper/60 hover:text-paper">
            {t("wallet.disconnect")}
          </button>
        </div>
      ) : (
        <Button variant="secondary" busy={connecting} onClick={connectWallet}>
          {t("wallet.connect")}
        </Button>
      )}
      {signer && balance.data && !balance.data.hasTrustline && (
        <p className="w-full text-xs text-amber">
          <Trans
            i18nKey="wallet.trustlineHint"
            components={{ link: <a href={CIRCLE_FAUCET_URL} target="_blank" rel="noreferrer" className="underline" /> }}
          />
        </p>
      )}
    </div>
  );
}

export function Layout() {
  const { t } = useTranslation();
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
                  {t(item.key)}
                </NavLink>
              ))}
            </nav>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <LanguageSwitcher />
            <WalletArea />
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-6xl flex-1 px-6 py-10">
        <Outlet />
      </main>
      <footer className="border-t border-line">
        <div className="mx-auto flex max-w-6xl flex-wrap justify-between gap-2 px-6 py-6 text-xs text-muted">
          <p>{t("footer.tagline")}</p>
          <p className="flex gap-3">
            {t("footer.contracts")}
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
