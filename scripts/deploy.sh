#!/usr/bin/env bash
# Builds and deploys the 3 contracts, then wires them together.
# Requires: scripts/setup-accounts.sh
#
#   FEE_BPS=100  platform fee (100 = 1 %)
set -euo pipefail

NETWORK="${NETWORK:-testnet}"
FEE_BPS="${FEE_BPS:-100}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ENV_FILE="$ROOT/deployments/$NETWORK.env"
WASM="$ROOT/contracts/target/wasm32v1-none/release"

[ -f "$ENV_FILE" ] || { echo "Run scripts/setup-accounts.sh first"; exit 1; }
# shellcheck disable=SC1090
source "$ENV_FILE"

# The testnet RPC sometimes times out: retry up to 3 times.
retry() {
  local n
  for n in 1 2 3; do
    "$@" && return 0
    echo "  (attempt $n failed, retrying)" >&2
    sleep 5
  done
  return 1
}

invoke() {
  local id="$1" source="$2"; shift 2
  retry stellar contract invoke --id "$id" --source-account "$source" --network "$NETWORK" -- "$@"
}

deploy() {
  local wasm="$1"; shift
  retry stellar contract deploy --wasm "$WASM/$wasm.wasm" \
    --source-account bl-admin --network "$NETWORK" -- "$@"
}

echo "==> Build"
(cd "$ROOT/contracts" && stellar contract build >/dev/null)

echo "==> Deploy"
NFT_ID="$(deploy ip_license_nft --admin "$ADMIN")"
echo "  ip_license_nft    $NFT_ID"

SPLITTER_ID="$(deploy royalty_splitter \
  --admin "$ADMIN" --token "$EURC_CONTRACT" --license_nft "$NFT_ID" \
  --treasury "$ADMIN" --fee_bps "$FEE_BPS")"
echo "  royalty_splitter  $SPLITTER_ID"

ESCROW_ID="$(deploy milestone_escrow \
  --admin "$ADMIN" --token "$EURC_CONTRACT" --license_nft "$NFT_ID" \
  --splitter "$SPLITTER_ID" --treasury "$ADMIN" --fee_bps "$FEE_BPS")"
echo "  milestone_escrow  $ESCROW_ID"

echo "==> Configuration"
invoke "$SPLITTER_ID" bl-admin set_minter --minter "$ESCROW_ID" >/dev/null
invoke "$NFT_ID" bl-admin set_institution --institution "$LAB" --verified true >/dev/null
invoke "$SPLITTER_ID" bl-admin set_allowed --who "$FUND" --allowed true >/dev/null
echo "  escrow = share minter, lab = verified institution, fund = KYC approved"

# Replace the previous IDs if there are any.
sed -i '/^\(NFT_ID\|SPLITTER_ID\|ESCROW_ID\|FEE_BPS\)=/d' "$ENV_FILE"
cat >> "$ENV_FILE" <<EOF
FEE_BPS=$FEE_BPS
NFT_ID=$NFT_ID
SPLITTER_ID=$SPLITTER_ID
ESCROW_ID=$ESCROW_ID
EOF
echo "==> IDs added to ${ENV_FILE#"$ROOT"/}"
