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
