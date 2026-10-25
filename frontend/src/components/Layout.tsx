import { useEffect, useState } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import { Trans, useTranslation } from "react-i18next";
import { ACCOUNTS, CIRCLE_FAUCET_URL, CONTRACTS, explorer } from "../config";
import { eurcBalance } from "../stellar/contracts";
import { DEMO_ENABLED, DEMO_ROLES, useWallet, type DemoRole } from "../stellar/wallet";
import { LANGUAGES } from "../i18n";
import { useAsync } from "../lib/useAsync";
import { formatNumber, shortAddress } from "../lib/format";
import { Button } from "./ui";
import { Logo } from "./Logo";
import { useTheme } from "../lib/theme";

const NAV = [
  { to: "/", key: "nav.marketplace" },
  { to: "/new", key: "nav.newLicence" },
  { to: "/cash-out", key: "nav.cashOut" },
  { to: "/admin", key: "nav.admin" },
] as const;

function LanguageSwitcher() {
  const { t, i18n } = useTranslation();
  return (
    <div role="group" aria-label={t("language.label")} className="flex items-center gap-0.5 rounded-full border border-line bg-card p-1 text-xs font-semibold shadow-pill">
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
            className={`flex size-8 items-center justify-center rounded-full transition duration-200 ${active ? "bg-ink text-canvas" : "text-muted hover:text-ink"}`}
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
          className="rounded-full border border-line bg-card px-4 py-2 text-sm text-ink shadow-pill"
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
        <div
          className="flex items-center gap-2.5 rounded-full border border-line bg-card py-1 pr-1 pl-1 text-sm whitespace-nowrap text-ink shadow-pill"
          title={signer.role ? t(`roles.${signer.role}`) : t("wallet.wallet")}
        >
          <span aria-hidden className="size-7 shrink-0 rounded-full bg-[conic-gradient(from_120deg,var(--color-dna-indigo),var(--color-dna-pink),var(--color-dna-yellow),var(--color-dna-indigo))]" />
          <span className="font-mono text-xs">{shortAddress(signer.address)}</span>
          <span className="rounded-full bg-subtle px-2.5 py-1 text-xs font-semibold" aria-label={t("wallet.balance")}>
            {balance.data ? `${formatNumber(balance.data.balance)} EURC` : "—"}
          </span>
          <button
            onClick={disconnect}
            aria-label={t("wallet.disconnect")}
            title={t("wallet.disconnect")}
            className="flex size-7 items-center justify-center rounded-full text-muted transition duration-200 hover:bg-subtle hover:text-ink"
          >
            <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3M10 17l5-5-5-5M15 12H3" />
            </svg>
          </button>
        </div>
      ) : (
        <Button variant="secondary" busy={connecting} onClick={connectWallet}>
          {t("wallet.connect")}
        </Button>
      )}
      {signer && balance.data && !balance.data.hasTrustline && (
        <p className="w-full text-xs text-amber-dark">
          <Trans
            i18nKey="wallet.trustlineHint"
            components={{ link: <a href={CIRCLE_FAUCET_URL} target="_blank" rel="noreferrer" className="underline" /> }}
          />
        </p>
      )}
    </div>
  );
}

function ThemeToggle() {
  const { t } = useTranslation();
  const [theme, setTheme] = useTheme();
  const next = theme === "dark" ? "light" : "dark";
  const label = t(next === "light" ? "theme.toLight" : "theme.toDark");
  return (
    <button
      type="button"
      onClick={() => setTheme(next)}
      aria-label={label}
      title={label}
      className="flex size-10 items-center justify-center rounded-full border border-line bg-card text-ink shadow-pill transition duration-200 hover:border-ink/25"
    >
      {theme === "dark" ? (
        // Sun: switch to light.
        <svg viewBox="0 0 24 24" className="size-4.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
        </svg>
      ) : (
        // Moon: switch to dark.
        <svg viewBox="0 0 24 24" className="size-4.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M20 14.5A8 8 0 0 1 9.5 4 8 8 0 1 0 20 14.5z" />
        </svg>
      )}
    </button>
  );
}

/** True from 1200 px up, where the full header (nav + language + theme + wallet) fits on one line. */
function useIsDesktop(): boolean {
  const query = "(min-width: 1200px)";
  const [desktop, setDesktop] = useState(() => window.matchMedia(query).matches);
  useEffect(() => {
    const media = window.matchMedia(query);
    const onChange = () => setDesktop(media.matches);
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, []);
  return desktop;
}

const linkClass = (stacked: boolean) => ({ isActive }: { isActive: boolean }) =>
  `rounded-full px-4 py-1.5 text-sm font-medium transition duration-200 ${stacked ? "block py-2.5 text-base" : ""} ${
    isActive ? "bg-card text-ink shadow-pill ring-1 ring-inset ring-line" : "text-muted hover:text-ink"
  }`;

/** Reminds every visitor that nothing here moves real money. */
function TestnetBadge() {
  const { t } = useTranslation();
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-dashed border-amber/80 bg-amber/10 px-2.5 py-0.5 text-xs font-semibold text-amber-dark">
      <span aria-hidden className="size-1.5 rounded-full bg-amber" />
      {t("header.testnet")}
    </span>
  );
}

export function Layout() {
  const { t } = useTranslation();
  const { signer, connecting, connectWallet } = useWallet();
  const { pathname } = useLocation();
  const desktop = useIsDesktop();
  const [menuOpen, setMenuOpen] = useState(false);

  // Close the mobile menu on navigation, on Escape, and when the screen widens.
  useEffect(() => setMenuOpen(false), [pathname, desktop]);
  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setMenuOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [menuOpen]);

  // Admin tools only show up for the platform admin wallet; /admin stays reachable by URL.
  const isAdmin = signer?.address === ACCOUNTS.admin;
  const nav = NAV.filter((item) => item.to !== "/admin" || isAdmin);
  const links = (stacked: boolean) =>
    nav.map((item) => (
      <NavLink key={item.to} to={item.to} end className={linkClass(stacked)}>
        {t(item.key)}
      </NavLink>
    ));

  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-40 border-b border-line bg-canvas/85 backdrop-blur-md">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <div className="flex items-center justify-between gap-4 py-3 min-[1200px]:grid min-[1200px]:grid-cols-[auto_1fr_auto] min-[1200px]:py-3.5">
            <div className="flex min-w-0 items-center gap-3">
              <NavLink to="/" aria-label={t("brand.home")} className="shrink-0">
                <Logo />
              </NavLink>
              <span className="hidden sm:inline-flex">
                <TestnetBadge />
              </span>
            </div>
            {desktop && (
              <nav aria-label={t("nav.main")} className="flex gap-1 justify-self-center rounded-full bg-subtle p-1">
                {links(false)}
              </nav>
            )}
            {desktop ? (
              <div className="flex items-center justify-end gap-2">
                <LanguageSwitcher />
                <ThemeToggle />
                <WalletArea />
              </div>
            ) : (
              <div className="flex items-center gap-2">
                {!signer && (
                  <Button variant="secondary" size="sm" busy={connecting} onClick={connectWallet}>
                    {t("wallet.connect")}
                  </Button>
                )}
                <button
                  type="button"
                  onClick={() => setMenuOpen((open) => !open)}
                  aria-expanded={menuOpen}
                  aria-controls="mobile-menu"
                  aria-label={t(menuOpen ? "nav.closeMenu" : "nav.openMenu")}
                  className="flex size-10 items-center justify-center rounded-full border border-line bg-card text-ink shadow-pill transition duration-200 hover:border-ink/25"
                >
                  <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
                    {menuOpen ? <path d="M6 6l12 12M18 6 6 18" /> : <path d="M4 7h16M4 12h16M4 17h16" />}
                  </svg>
                </button>
              </div>
            )}
          </div>
          {!desktop && menuOpen && (
            <div id="mobile-menu" className="flex flex-col gap-4 border-t border-line py-4">
              <nav aria-label={t("nav.main")} className="flex flex-col gap-1 rounded-3xl bg-subtle p-1.5">
                {links(true)}
              </nav>
              <div className="flex items-center gap-2">
                <LanguageSwitcher />
                <ThemeToggle />
                <TestnetBadge />
              </div>
              {signer && <WalletArea />}
            </div>
          )}
        </div>
      </header>
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-6 sm:py-12">
        <Outlet />
      </main>
      <footer className="border-t border-line">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-7 text-sm text-muted sm:px-6">
          <p>{t("footer.tagline")}</p>
          <p className="flex flex-wrap items-center gap-3">
            {t("footer.contracts")}
            {(["nft", "escrow", "splitter"] as const).map((key) => (
              <a key={key} href={explorer.contract(CONTRACTS[key])} target="_blank" rel="noreferrer" className="font-mono text-brand-ink hover:underline">
                {key}
              </a>
            ))}
          </p>
        </div>
      </footer>
    </div>
  );
}
