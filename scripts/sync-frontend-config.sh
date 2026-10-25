#!/usr/bin/env bash
# Copie les identifiants publics du déploiement dans le front
# (frontend/src/deployment.json : adresses publiques et IDs de contrats uniquement).
#
#   --demo  écrit aussi frontend/.env.local avec les clés secrètes testnet des
#           comptes de démo (fichier ignoré par git, à n'utiliser qu'en local).
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
