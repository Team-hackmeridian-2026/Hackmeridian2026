#!/usr/bin/env bash
# Compile et déploie les 3 contrats, puis les relie entre eux.
# Prérequis : scripts/setup-accounts.sh
#
#   FEE_BPS=100  commission de la plateforme (100 = 1 %)
set -euo pipefail

NETWORK="${NETWORK:-testnet}"
FEE_BPS="${FEE_BPS:-100}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ENV_FILE="$ROOT/deployments/$NETWORK.env"
WASM="$ROOT/contracts/target/wasm32v1-none/release"

[ -f "$ENV_FILE" ] || { echo "Lancez d'abord scripts/setup-accounts.sh"; exit 1; }
# shellcheck disable=SC1090
source "$ENV_FILE"

invoke() {
  local id="$1" source="$2"; shift 2
  stellar contract invoke --id "$id" --source-account "$source" --network "$NETWORK" -- "$@"
}

echo "==> Build"
(cd "$ROOT/contracts" && stellar contract build >/dev/null)

echo "==> Déploiement"
NFT_ID="$(stellar contract deploy --wasm "$WASM/ip_license_nft.wasm" \
  --source-account bl-admin --network "$NETWORK" -- --admin "$ADMIN")"
echo "  ip_license_nft    $NFT_ID"

SPLITTER_ID="$(stellar contract deploy --wasm "$WASM/royalty_splitter.wasm" \
  --source-account bl-admin --network "$NETWORK" -- \
  --admin "$ADMIN" --token "$EURC_CONTRACT" --license_nft "$NFT_ID" \
  --treasury "$ADMIN" --fee_bps "$FEE_BPS")"
echo "  royalty_splitter  $SPLITTER_ID"

ESCROW_ID="$(stellar contract deploy --wasm "$WASM/milestone_escrow.wasm" \
  --source-account bl-admin --network "$NETWORK" -- \
  --admin "$ADMIN" --token "$EURC_CONTRACT" --license_nft "$NFT_ID" \
  --splitter "$SPLITTER_ID" --treasury "$ADMIN" --fee_bps "$FEE_BPS")"
echo "  milestone_escrow  $ESCROW_ID"

echo "==> Configuration"
invoke "$SPLITTER_ID" bl-admin set_minter --minter "$ESCROW_ID" >/dev/null
invoke "$NFT_ID" bl-admin set_institution --institution "$LAB" --verified true >/dev/null
invoke "$SPLITTER_ID" bl-admin set_allowed --who "$FUND" --allowed true >/dev/null
echo "  escrow = émetteur de parts, labo = institution vérifiée, fonds = KYC validé"

# Remplace les anciens identifiants s'ils existent.
sed -i '/^\(NFT_ID\|SPLITTER_ID\|ESCROW_ID\|FEE_BPS\)=/d' "$ENV_FILE"
cat >> "$ENV_FILE" <<EOF
FEE_BPS=$FEE_BPS
NFT_ID=$NFT_ID
SPLITTER_ID=$SPLITTER_ID
ESCROW_ID=$ESCROW_ID
EOF
echo "==> Identifiants ajoutés à ${ENV_FILE#"$ROOT"/}"
