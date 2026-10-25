# BioLicensing

**Funding European research, one patent at a time.** BioLicensing turns a
university patent into a programmable licence on Stellar: funded in EURC,
released by milestones, with royalties shared automatically. Biotech first,
then any European research patent.

Built for **HackMeridian** (Lisbon, 25–26 October 2026) · Track: **Genesis** ·
Theme: **Stellar Composed**

| | |
| --- | --- |
| Live demo | [https://biolicensing.vercel.app](https://biolicensing.vercel.app) |
| Demo video | _[link]_ |
| Network | Stellar **testnet** (all amounts are test assets) |

![BioLicensing home page: hero with the binary DNA helix](docs/screenshots/home.png)

| Licences, funded milestone by milestone | Licence page: terms, dossier, royalties |
| --- | --- |
| ![Licence table with funding progress](docs/screenshots/licences.png) | ![Licence page in the light theme](docs/screenshots/licence.png) |

<p align="center"><img src="docs/screenshots/mobile.png" alt="Home page and licence page on a phone" width="560"></p>

<sub>Screenshots taken with sample licences; the live testnet data may differ.
Dark theme by default, light theme available. English, French and Portuguese.</sub>

---

## The problem

Between an academic discovery and the moment industry is willing to pay for it
lies the "valley of death": promising patents find neither funding nor a
licensee to reach proof of concept. Technology transfer today is slow (bilateral
negotiations, intermediaries, legal fees) and opaque for investors, who see
little of how their money is used.

## The solution

1. **A university lists a patent as a licence IP-NFT.** It stays the owner: the
   token carries the licence terms and the SHA-256 fingerprint of the
   scientific dossier, which never leaves the lab.
2. **An investor funds it in EURC**, locked in an escrow split into milestones,
   and receives revenue shares.
3. **The lab proves a milestone.** If the investor does not dispute it within
   the challenge window, anyone can release the funds; a dispute goes to an
   arbiter named upfront (optimistic validation). Research can fail without
   anyone being at fault, so the arbiter can also **split** a milestone: pay
   the lab for the work done and refund the rest, with the investor's shares
   reduced accordingly.
4. **An industrial licensee pays royalties in EURC**, split in one transaction
   between the university, its inventors and the investors (pro rata).
5. **The lab cashes out to its bank account** through a Stellar anchor
   (SEP-24): researchers never have to handle crypto.

| Target user | What they get |
| --- | --- |
| University lab / tech transfer office | Euros to reach proof of concept without selling the patent, paid out to its bank account |
| Investor (VC, specialised fund, industrial) | Direct access to academic deal flow, milestone-based release, automatic royalties |
| Industrial licensee | One EURC payment, split on-chain |
| Inventors | A fixed share of every royalty, locked when the licence is created |

**Compliance by design:** only verified institutions can mint licences, only
KYC-approved investors can hold or trade shares, and the admin can claw back
shares on a court order (the model of Stellar's regulated assets).
**Business model:** a platform fee taken by the contracts themselves on
milestone releases and royalties (1 % on testnet).

---

## Architecture: how Stellar is used

```mermaid
flowchart TB
    U["Lab · Investor · Licensee · Arbiter"] --> F["React front-end<br/>Stellar Wallets Kit (Freighter…)"]
    F -->|"Soroban RPC"| NFT["ip_license_nft"]
    F -->|"Soroban RPC"| ESC["milestone_escrow"]
    F -->|"Soroban RPC"| SPL["royalty_splitter"]
    ESC -->|"mint / burn shares"| SPL
    ESC -->|"owner_of"| NFT
    SPL -->|"owner_of"| NFT
    ESC --> EURC["Circle EURC<br/>(Stellar Asset Contract)"]
    SPL --> EURC
    F -->|"SEP-1 · SEP-10 · SEP-24"| A["Anchor"]
    A --> B["Bank account (SEPA)"]
```

| Building block | What we use | Role |
| --- | --- | --- |
| Smart contracts | 3 Soroban contracts in Rust (`soroban-sdk` 28) | Licences, milestone escrow, shares and royalties |
| Stablecoin | **Circle EURC** on testnet, issuer `GB3Q6QDZYTHWT7E5PVS3W7FUT5GVAFC5KSZFFLPU25GO7VTC3NM2ZTVO`, handled in Soroban through its **Stellar Asset Contract** | Funding and royalties in regulated euros (MiCA) |
| Wallets | **Stellar Wallets Kit** (Freighter, xBull, Lobstr, Albedo…) | Users sign every transaction themselves |
| Anchor | **SEP-1** (stellar.toml), **SEP-10** (web auth), **SEP-24** (interactive withdrawal) against the SDF test anchor `testanchor.stellar.org` | Cash-out from Stellar to a bank account |
| APIs | Soroban RPC `soroban-testnet.stellar.org`, Horizon `horizon-testnet.stellar.org` | Contract calls, balances, classic payments |
| Off-chain data | SHA-256 computed in the browser (Web Crypto) | Proves the dossier without publishing it |

> **Testnet note on the anchor.** The SDF test anchor lists USDC, its SRT test
> token and XLM, not EURC, and moves no real money. The demo therefore runs the
> full SEP-10 + SEP-24 flow with one of those assets. In production the same
> code points at an anchor that converts EURC into SEPA transfers: only the
> anchor domain changes.

### Deployed contracts (testnet)

| Contract | ID |
| --- | --- |
| `ip_license_nft` | [`CDONN5PWL4UWU4H5QUE7LBWC3MPIR3GSVGTQHLKB7LHF2OOWVJBKVK5P`](https://stellar.expert/explorer/testnet/contract/CDONN5PWL4UWU4H5QUE7LBWC3MPIR3GSVGTQHLKB7LHF2OOWVJBKVK5P) |
| `milestone_escrow` | [`CBTTMKLJKBIMOJCLG3KBZFDKEH5OJMAGZR2NCHE2GF7NN5TPFJ5B4FIB`](https://stellar.expert/explorer/testnet/contract/CBTTMKLJKBIMOJCLG3KBZFDKEH5OJMAGZR2NCHE2GF7NN5TPFJ5B4FIB) |
| `royalty_splitter` | [`CA27S6FTSNZVVRYGYPMLSKXXR5LDGSK44ENN6HAEIZDSU5UZRPWGIGEZ`](https://stellar.expert/explorer/testnet/contract/CA27S6FTSNZVVRYGYPMLSKXXR5LDGSK44ENN6HAEIZDSU5UZRPWGIGEZ) |
| Circle EURC (SAC) | [`CCUUDM434BMZMYWYDITHFXHDMIVTGGD6T2I5UKNX5BSLXLW7HVR4MCGZ`](https://stellar.expert/explorer/testnet/contract/CCUUDM434BMZMYWYDITHFXHDMIVTGGD6T2I5UKNX5BSLXLW7HVR4MCGZ) |

The front-end reads these IDs from `frontend/src/deployment.json`.

### On-chain evidence (testnet)

| Step | Transaction |
| --- | --- |
| Licence IP-NFT minted | [`c4092a66…`](https://stellar.expert/explorer/testnet/tx/c4092a66992dcfd8ced93b8e8634ef6e7baff57b9d562724a218c458881e5ee3) |
| Royalty split locked | [`7738f1d5…`](https://stellar.expert/explorer/testnet/tx/7738f1d505ae41de1156b667499aa5f16f16fa2f9e0126df9e25b9f40f1315aa) |
| Funding round opened | [`d73b5043…`](https://stellar.expert/explorer/testnet/tx/d73b5043261bb9d5c8e6373be61e6ae347df213d1c60d76260253bf3da1b6bab) |
| Escrow funded in Circle EURC | [`cd70b413…`](https://stellar.expert/explorer/testnet/tx/cd70b4135acfb565d30f2d9151626c5a060614ee1f2b4e04270fac27b74f4d2b) |
| Milestone proof submitted | [`fcbb5c9d…`](https://stellar.expert/explorer/testnet/tx/fcbb5c9d29993ac26e51a2baf587a716790e19cb4945a6ea049b8c90eff4a8f8) |
| Milestone disputed by the investor | [`b2ccf642…`](https://stellar.expert/explorer/testnet/tx/b2ccf642d1c45c0a5eaa8b69b2c2c0f155110cd04783d9cff34a4ad17f7315ef) |
| Arbiter split: 60 % to the lab, 40 % refunded | [`cfa6207a…`](https://stellar.expert/explorer/testnet/tx/cfa6207a4721380507eedfdafb2f8bca1c79bd25c01b22b9ce966c20d1523a87) |

### The contracts

| Contract | Main functions |
| --- | --- |
| `ip_license_nft` | `mint`, `get_license`, `list_licenses`, `transfer` (institutions only), `sign_nda`, `set_institution` |
| `milestone_escrow` | `create_project`, `fund`, `submit_milestone`, `dispute`, `release` (after the challenge window), `resolve` / `resolve_partial` (arbiter), `cancel` |
| `royalty_splitter` | `configure`, `pay_royalty`, `claim`, `transfer_shares` (KYC only), `clawback`, `set_allowed` |

Royalties use a per-share accumulator: paying out costs the same whatever the
number of holders, and everyone withdraws when they want (pull payments).

---

## Getting started

### Prerequisites

- Node.js 22+
- For the contracts: Rust with the `wasm32v1-none` target and the
  [Stellar CLI](https://developers.stellar.org/docs/tools/cli) 28+
- A Stellar wallet such as [Freighter](https://www.freighter.app/), set to **Testnet**

### Run the front-end (uses the deployed contracts)

```bash
git clone git@github.com:Team-hackmeridian-2026/Hackmeridian2026.git
cd Hackmeridian2026/frontend
npm install
npm run dev          # http://localhost:5173
```

No configuration is needed: the public contract IDs are committed.

### Run the contract tests

```bash
cd contracts
cargo test           # 30 tests, including the full demo scenario
```

### Deploy your own instance (optional)

```bash
EURC_MODE=circle ./scripts/setup-accounts.sh   # testnet accounts, EURC trustlines, SAC
./scripts/deploy.sh                            # build, deploy and wire the 3 contracts
./scripts/sync-frontend-config.sh              # copy the new IDs to the front-end
```

### Environment variables

| Variable | Where | Default | Meaning |
| --- | --- | --- | --- |
| `NETWORK` | scripts | `testnet` | Stellar network |
| `EURC_MODE` | `setup-accounts.sh` | `mock` | `circle` = official Circle EURC (get it on [faucet.circle.com](https://faucet.circle.com)); `mock` = a test EURC issued by our own account |
| `FEE_BPS` | `deploy.sh` | `100` | Platform fee in basis points (100 = 1 %) |
| `VITE_DEMO_SECRETS` | `frontend/.env.local` | none | **Local only, never committed.** Testnet keys of the demo accounts, written by `sync-frontend-config.sh --demo` to switch roles on stage. The public build has none and only uses wallets |

Deployment state lives in `deployments/testnet.env` (gitignored, see
`deployments/testnet.env.example`). Secret keys stay in the Stellar CLI config.

---

## Demo

### With your own wallet (public demo)

1. In Freighter, switch to **Testnet** and fund the account with Friendbot.
2. Add the **EURC** asset (issuer `GB3Q…ZTVO`) and get test EURC on
   [faucet.circle.com](https://faucet.circle.com) (Stellar testnet).
3. Open the app and click **Connect wallet**.
4. To list a patent or to invest, an admin must first verify your address
   (page **Admin**: verified institutions, KYC allowlist). Anyone holding EURC
   can pay royalties.

### Full scenario (about 3 minutes)

| # | Role | Action | On-chain |
| --- | --- | --- | --- |
| 1 | University lab | **List a patent**: fill the 3 sections, confirm 3 times | Licence minted, split locked, funding round opened |
| 2 | Investment fund | Open the licence, **Fund** | EURC locked in escrow, shares minted |
| 3 | University lab | **Submit proof** of milestone 1 | Challenge window opens (1 min in demo mode) |
| 4 | Anyone | **Release the funds** once the window is closed | EURC paid to the lab, minus the platform fee |
| 5 | Industry licensee | **Pay in EURC** in the Royalties panel | Royalty split between university, inventors and investors |
| 6 | Each beneficiary | **Withdraw** | EURC paid out |
| 7 | University lab | **Cash out**: sign in to the anchor, withdraw, send the funds | SEP-10 auth, SEP-24 withdrawal, payment to the anchor |

Every action shows a link to the transaction on stellar.expert. Locally, the
**Demo: act as…** menu switches between the demo accounts without a wallet
(requires `frontend/.env.local`, see above).

---

## Repository layout

```text
contracts/          Soroban contracts (Rust) and their tests
frontend/           React + Vite app
scripts/            Testnet accounts, deployment, front-end config
deployments/        Example of the local deployment state
docs/PLAN.md        Development plan (French)
```

## Prior work (disclosed)

Prepared before HackMeridian, marked by the
[`pre-hackathon`](https://github.com/Team-hackmeridian-2026/Hackmeridian2026/tree/pre-hackathon) tag:

- The three Soroban contracts with their tests (`contracts/`)
- Testnet setup and deploy scripts (`scripts/`)
- Development plan (`docs/PLAN.md`) and pitch deck

## Built during the event

Everything after the `pre-hackathon` tag
([see the diff](https://github.com/Team-hackmeridian-2026/Hackmeridian2026/compare/pre-hackathon...main)):

- **Front-end**: marketplace, patent listing, licence page (milestones,
  disputes, arbitration, royalties, NDA, dossier check), admin page
- **Wallets**: Stellar Wallets Kit integration
- **Circle EURC**: switched from a self-issued test token to Circle's official
  testnet EURC
- **Bank cash-out**: anchor integration (SEP-1, SEP-10, SEP-24)
- **Contract fix**: removed an instance TTL extension that cost about
  1,059 XLM of rent per licence on testnet
- **Partial arbitration**: `resolve_partial` lets the arbiter split a disputed
  milestone between the lab and the investor (4 new contract tests, slider in
  the arbiter's panel)
- **UX**: listing form usable without any crypto knowledge
- **Design**: Figma redesign, dark and light themes, binary DNA helix (Three.js)
  and interactive molecules made of 0s and 1s, mobile layout
- **Collaboration**: team workflow ([CONTRIBUTING.md](CONTRIBUTING.md)), i18n
  (English, French, Portuguese) and public deployment on Vercel

## Team

- **FASSINOU Aziz**: smart contracts, front-end, Stellar integrations
- **CHAFI Marwane**: multilingual site, pitch
- **Antoine**: deployment, pitch
