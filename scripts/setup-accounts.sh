#!/usr/bin/env bash
# Creates and funds the demo accounts on testnet, then sets up EURC.
#
#   EURC_MODE=mock   (default) test EURC issued by our bl-issuer account:
#                    unlimited supply, ideal for the demo.
#   EURC_MODE=circle Circle's official EURC on testnet. The accounts must then
#                    be funded through https://faucet.circle.com
#
# Keys are stored by the `stellar` CLI (outside the repository).
set -euo pipefail

NETWORK="${NETWORK:-testnet}"
EURC_MODE="${EURC_MODE:-mock}"
CIRCLE_EURC_ISSUER="GB3Q6QDZYTHWT7E5PVS3W7FUT5GVAFC5KSZFFLPU25GO7VTC3NM2ZTVO"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="$ROOT/deployments/$NETWORK.env"

ROLES=(admin lab inventor fund pharma arbiter issuer)
HOLDERS=(admin lab inventor fund pharma)

addr() { stellar keys address "bl-$1"; }

echo "==> Accounts ($NETWORK)"
for role in "${ROLES[@]}"; do
  if stellar keys address "bl-$role" >/dev/null 2>&1; then
    stellar keys fund "bl-$role" --network "$NETWORK" >/dev/null 2>&1 || true
  else
    stellar keys generate "bl-$role" --network "$NETWORK" --fund
  fi
  printf '  %-9s %s\n' "$role" "$(addr "$role")"
done

if [ "$EURC_MODE" = "circle" ]; then
  ISSUER="$CIRCLE_EURC_ISSUER"
else
  ISSUER="$(addr issuer)"
fi
ASSET="EURC:$ISSUER"

echo "==> Trustlines EURC ($EURC_MODE)"
for role in "${HOLDERS[@]}"; do
  stellar tx new change-trust --line "$ASSET" \
    --source-account "bl-$role" --network "$NETWORK" --quiet >/dev/null
  echo "  $role ok"
done

if [ "$EURC_MODE" = "mock" ]; then
  echo "==> Issuing test EURC"
  # Amounts in stroops (7 decimals): 1,000,000 EURC to the fund, 100,000 to the licensee.
  stellar tx new payment --source-account bl-issuer --network "$NETWORK" --quiet \
    --destination "$(addr fund)" --asset "$ASSET" --amount 10000000000000 >/dev/null
  stellar tx new payment --source-account bl-issuer --network "$NETWORK" --quiet \
    --destination "$(addr pharma)" --asset "$ASSET" --amount 1000000000000 >/dev/null
fi

echo "==> EURC SAC contract"
EURC_CONTRACT="$(stellar contract asset deploy --asset "$ASSET" \
  --source-account bl-admin --network "$NETWORK" 2>/dev/null \
  || stellar contract id asset --asset "$ASSET" --network "$NETWORK")"
echo "  $EURC_CONTRACT"

mkdir -p "$ROOT/deployments"
cat > "$OUT" <<EOF
NETWORK=$NETWORK
EURC_MODE=$EURC_MODE
EURC_ASSET=$ASSET
EURC_CONTRACT=$EURC_CONTRACT
ADMIN=$(addr admin)
LAB=$(addr lab)
INVENTOR=$(addr inventor)
FUND=$(addr fund)
PHARMA=$(addr pharma)
ARBITER=$(addr arbiter)
EOF
echo "==> Written to ${OUT#"$ROOT"/}"
