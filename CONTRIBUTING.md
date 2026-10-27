# Contributing

How the team works on this repository during HackMeridian.

## Branches

- `main` always builds and is always demo-ready. Nobody pushes to it directly.
- Work happens on short-lived branches cut from an up-to-date `main`:

| Prefix | Use | Example |
| --- | --- | --- |
| `feat/` | New feature | `feat/frontend-marketplace` |
| `fix/` | Bug fix | `fix/escrow-deploy-timeout` |
| `docs/` | README, architecture, pitch material | `docs/architecture` |
| `chore/` | Scripts, config, tooling | `chore/vercel-config` |

```bash
git switch main && git pull
git switch -c feat/my-feature
# ...work, commit...
git push -u origin feat/my-feature
```

Then open a pull request on GitHub.

## Pull requests

- One topic per pull request, small enough to review in a few minutes.
- At least one teammate approves before merging.
- Merge with **Squash and merge** so `main` keeps one commit per change.
- Delete the branch after merging.
- Contracts: `cd contracts && cargo test` must pass before you ask for review.
- CI (`.github/workflows/ci.yml`) runs the contract tests, the Wasm build, the
  front-end build and the translation test on every pull request. Wait for a
  green check before asking for review.
- Visual changes: attach before/after screenshots to the pull request, in the
  dark and light themes and at phone width.

## Protected areas

Ask Antoine before changing these, and say so in the pull request:

- `contracts/`: the deployed contracts and their tests.
- `frontend/src/stellar/*`: contract calls, wallet and anchor integration.

Contract redeploys go through the **Deploy contracts (testnet)** GitHub
workflow, and every run waits for Antoine's approval (see the README). Until
the next one, testnet runs the contracts of release `1.0.1` while `main` is
ahead, so the front-end must keep working with both.

## Language

Write everything in English: code, comments, script output, commit messages
and docs. The only French and Portuguese text lives in
`frontend/src/i18n/fr.json` and `pt.json`.

## Dependency updates

Dependabot (`.github/dependabot.yml`) opens pull requests on its own:

- **Front-end (npm), every Monday:** one grouped PR for minor and patch
  updates, and one PR per major update (React, Vite, TypeScript…), which may
  need code changes. Only versions published at least 14 days earlier.
- **GitHub Actions, monthly:** one grouped PR.

Merge them like any other PR: green CI, then a quick look at the Vercel
preview. Use npm 11 locally too (`npm install -g npm@11`): npm 10 writes and
expects a slightly different `package-lock.json` than Dependabot. Contract dependencies (`soroban-sdk`) are upgraded by hand: their
major versions follow Stellar protocol upgrades and need a redeploy.

## Commit messages

Short imperative summary, in English, under 72 characters:

```
Add milestone timeline to licence page
Fix rounding in royalty split
```

## Secrets

Never commit secret keys, `.env` or `.env.local` files. Testnet identities
live in the local `stellar` CLI config. `deployments/testnet.env` only holds
public addresses and contract IDs.

## Prior work vs. event work

Everything up to the `pre-hackathon` tag was prepared before the event and is
disclosed in the README. Everything after it is built during HackMeridian.
