# BioLicensing

Decentralized marketplace that turns European research patents (biotech first)
into programmable licences on Stellar: funded in EURC, released by milestones,
with royalties shared automatically.

Built for **HackMeridian** (Lisbon, 25–26 October 2026).

## Team

- FASSINOU Aziz
- CHAFI Marwane
- Antoine

## How it works

1. A lab mints an **IP-NFT** representing a licence (terms + SHA-256 hash of the scientific dossier).
2. An investor locks **EURC** in a **milestone escrow** and receives revenue shares.
3. The lab submits proof of a milestone; after a challenge window with no dispute, funds are released automatically.
4. A licensee pays royalties, which are split between the university, the inventors and the share holders.

## Stack

- Smart contracts: Rust + Soroban (`contracts/`)
- Front-end: React + Vite + TypeScript + Stellar Wallets Kit (`frontend/`)
- Network: Stellar testnet

## Prior work (disclosed)

Prepared before HackMeridian, marked by the
[`pre-hackathon`](../../tree/pre-hackathon) tag:

- Three Soroban contracts with 26 passing tests: `ip_license_nft`,
  `milestone_escrow`, `royalty_splitter` (`contracts/`)
- Testnet setup and deploy scripts (`scripts/`)
- Development plan (`docs/PLAN.md`, in French) and pitch deck

## Built during the event

Everything after the `pre-hackathon` tag
([compare](../../compare/pre-hackathon...main)). Planned:

- Front-end (React + Stellar Wallets Kit) and public deployment
- Anchor integration (SEP-10 + SEP-24) so labs can cash out to a bank account

## Status

Work in progress. See [docs/PLAN.md](docs/PLAN.md) for the development plan
and [CONTRIBUTING.md](CONTRIBUTING.md) for the team workflow.
