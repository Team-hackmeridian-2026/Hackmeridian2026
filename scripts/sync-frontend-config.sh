#!/usr/bin/env bash
# Copies the public IDs of the deployment into the front-end
# (frontend/src/deployment.json: public addresses and contract IDs only).
#
#   --demo  also writes frontend/.env.local with the testnet secret keys of the
#           demo accounts (gitignored, for local use only).
set -euo pipefail

NETWORK="${NETWORK:-testnet}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
# shellcheck disable=SC1090
source "$ROOT/deployments/$NETWORK.env"

cat > "$ROOT/frontend/src/deployment.json" <<EOF
{
  "network": "$NETWORK",
  "eurcAsset": "$EURC_ASSET",
  "contracts": {
    "eurc": "$EURC_CONTRACT",
    "nft": "$NFT_ID",
    "splitter": "$SPLITTER_ID",
    "escrow": "$ESCROW_ID"
  },
  "accounts": {
    "admin": "$ADMIN",
    "lab": "$LAB",
    "inventor": "$INVENTOR",
    "fund": "$FUND",
    "pharma": "$PHARMA",
    "arbiter": "$ARBITER"
  }
}
EOF
echo "==> frontend/src/deployment.json"

if [ "${1:-}" = "--demo" ]; then
  secrets="{"
  for role in admin lab inventor fund pharma arbiter; do
    secrets+="\"$role\":\"$(stellar keys secret "bl-$role")\","
  done
  secrets="${secrets%,}}"
  echo "VITE_DEMO_SECRETS=$secrets" > "$ROOT/frontend/.env.local"
  echo "==> frontend/.env.local (local only, never commit)"
fi
