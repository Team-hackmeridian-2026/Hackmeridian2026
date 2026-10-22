# BioLicensing

Decentralized marketplace that turns European biotech patents into programmable
licences on Stellar: funded in EURC, released by milestones, with royalties
shared automatically.

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

## Status

Work in progress. See [docs/PLAN.md](docs/PLAN.md) for the development plan (in French).
