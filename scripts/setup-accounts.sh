#!/usr/bin/env bash
# Crée et approvisionne les comptes de démo sur le testnet, puis prépare l'EURC.
#
#   EURC_MODE=mock   (défaut) EURC de test émis par notre compte bl-issuer :
#                    quantité illimitée, idéal pour la démo.
#   EURC_MODE=circle EURC officiel de Circle sur testnet. Les comptes doivent
#                    ensuite être approvisionnés via https://faucet.circle.com
#
# Les clés sont stockées par le CLI `stellar` (hors du dépôt).
set -euo pipefail

NETWORK="${NETWORK:-testnet}"
EURC_MODE="${EURC_MODE:-mock}"
CIRCLE_EURC_ISSUER="GB3Q6QDZYTHWT7E5PVS3W7FUT5GVAFC5KSZFFLPU25GO7VTC3NM2ZTVO"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="$ROOT/deployments/$NETWORK.env"

ROLES=(admin lab inventor fund pharma arbiter issuer)
HOLDERS=(admin lab inventor fund pharma)

addr() { stellar keys address "bl-$1"; }

echo "==> Comptes ($NETWORK)"
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
  echo "==> Émission d'EURC de test"
  # Montants en stroops (7 décimales) : 1 000 000 EURC au fonds, 100 000 à l'industriel.
  stellar tx new payment --source-account bl-issuer --network "$NETWORK" --quiet \
    --destination "$(addr fund)" --asset "$ASSET" --amount 10000000000000 >/dev/null
  stellar tx new payment --source-account bl-issuer --network "$NETWORK" --quiet \
    --destination "$(addr pharma)" --asset "$ASSET" --amount 1000000000000 >/dev/null
fi

echo "==> Contrat SAC de l'EURC"
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
echo "==> Écrit dans ${OUT#"$ROOT"/}"
