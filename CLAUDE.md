# BioLicensing

Turns a university patent into a programmable licence on Stellar (testnet): IP-NFT, EURC funding released by milestones, royalties split on-chain, bank cash-out via SEP-24.
React + Vite front-end with no backend, talking to 3 Soroban contracts in Rust.

Team workflow, protected areas and language rules: @CONTRIBUTING.md

## Commands
Front-end, from `frontend/`, needs Node 22 and **npm 11** (`npm install -g npm@11`; npm 10's `npm ci` rejects this lockfile):
- `npm ci`: install
- `npm run dev`: http://localhost:5173, uses the deployed testnet contracts, no config needed
- `npm run build`: `tsc --noEmit` + `vite build`; this is the type check
- `npm run test:i18n`: EN/FR/PT key and placeholder parity
- There is no lint step and no front-end unit test.

Contracts, from `contracts/`:
- `cargo test --locked`: unit tests
- `stellar contract build`: Wasm build (never `cargo build` for Wasm)

`scripts/*.sh` (setup, deploy, seed) write to testnet: run them only when Antoine asks. Redeploys normally go through `.github/workflows/deploy-testnet.yml` (manual run, Antoine approves); `scripts/ci-load-testnet.sh` prepares the runner.

## Architecture
- `contracts/`: Cargo workspace with `ip_license_nft`, `milestone_escrow` and `royalty_splitter`; tests in `src/test.rs`.
- `frontend/src/stellar/`: the only layer that talks to the chain (`contracts.ts`, `wallet.tsx`, `anchor.ts` for SEP-1/10/24).
- `frontend/src/pages/`: one screen per route (routes are in `main.tsx`).
- `frontend/src/components/`: shared UI; `toasts.tsx` runs transactions.
- `frontend/src/lib/`: `format.ts` (amounts, dates, sha256), `useAsync.ts`, `errors.ts`.
- `frontend/src/i18n/`: `en.json`, `fr.json`, `pt.json`.
- `frontend/src/deployment.json`: contract IDs and public addresses, written by `scripts/sync-frontend-config.sh`.
- `.github/workflows/ci.yml`: contract tests, Wasm build, front-end build and i18n test.

Read when needed (too long to import): `OVERVIEW.md` (architecture and data model), `docs/PLAN.md` (original plan), `frontend/src/i18n/README.md`.

## Conventions
- **Chain access** goes only through `read`/`write` in `stellar/contracts.ts`. Never create a `contract.Client` in a page.
- **Transactions**: use `useToasts().run(label, () => escrow.fund(signer, …))`. Never hand-roll try/catch plus a toast.
- **Data**: use `useAsync(load, deps)` and call `reload()` after a transaction. There is no global store.
- **Amounts**: keep them as `bigint` on-chain units with 7 decimals, converted by `toUnits` / `fromUnits` / `eurc`. Never use `Number`/`parseFloat` on EURC.
- **Contract errors**: add `errors.<nft|escrow|splitter>.<code>` to all 3 language files; `explainError` maps `Error(Contract, #n)` to them.
- **i18n**: every UI string goes through `t()`. Keep the same key and the same `{{placeholders}}` in `en.json`, `fr.json` and `pt.json`. Never translate addresses, contract names, EURC, SEP-24, IP-NFT or user data.
- **Styling**: Tailwind with the tokens from `index.css` (`bg-card`, `text-muted`, `brand`…). Never hard-code hex colours.
- **Themes and motion**: support both dark and light themes (`dark:` follows `data-theme`) and respect `prefers-reduced-motion`.
- **Types**: TS is strict. The types in `contracts.ts` mirror the Rust structs by hand, so change both sides together.
- **Rust**: raise errors with `#[contracterror]` + `panic_with_error!`. Every state change calls `require_auth()` on the right role and gets a test.
- **Comments** are in English and explain *why*, not *what*.

## Do not
- Hand-edit `deployment.json`.
- Assume `main`'s contracts are deployed: testnet runs the contracts of release `3.0.0` (soroban-sdk 29), redeployed on 2026-10-29. Contract changes merged after that wait for the next redeploy, so new contract functions must degrade gracefully in the front-end.
- Add an instance `extend_ttl` in `ip_license_nft`; it cost ~1,059 XLM of rent per licence.
- Bump `soroban-sdk` casually: it means a redeploy.
- Add a dependency with `^`/`~`. Pin exact versions published at least 14 days ago.
- Treat contract tests as proof of who signed: they use `mock_all_auths()`. Assert auths when you touch access control.

### Cloud sandbox only
- Testnet and prod are unreachable by curl; test through Claude in Chrome. Antoine signs every Freighter transaction.
- Before pushing from a shallow clone, run `git fetch origin main` and rebase, otherwise you get a 413.
- Open PRs with `gh api repos/Team-hackmeridian-2026/Hackmeridian2026/pulls --input pr.json` (GraphQL is blocked).
- Tags cannot be pushed from the sandbox (403); Antoine creates releases.

## Definition of Done
- Front-end changed: `npm run build` and `npm run test:i18n` pass.
- Contracts changed: `cargo test --locked` and `stellar contract build` pass.
- New UI text exists in EN, FR and PT.
- Visual change: before/after screenshots in the PR (see CONTRIBUTING.md).
- No secret in the diff, and `deployment.json` changes only with a redeploy.
- CI is green and the Vercel preview has been checked before asking for review.
