#!/usr/bin/env bash
# Prépare des comptes testnet que le jury importe dans Freighter pour jouer
# tout le parcours sans attendre l'admin : chaque juré est institution vérifiée,
# autorisé au KYC et reçoit quelques EURC ; un compte arbitre commun suffit
# (l'arbitre doit être différent de l'investisseur).
# Prérequis : scripts/setup-accounts.sh et scripts/deploy.sh, des EURC sur
# l'industriel (5 par juré).
#
# Relançable : chaque étape vérifie l'état du compte avant d'agir ; un juré
# n'est recrédité que si son solde EURC est à zéro.
set -euo pipefail
shopt -s inherit_errexit

NETWORK="${NETWORK:-testnet}"
JURORS="${JURORS:-3}"
EURC_EACH=50000000 # 5 EURC en unités on-chain (7 décimales)
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
# shellcheck disable=SC1090
source "$ROOT/deployments/$NETWORK.env"

invoke() {
  local id="$1"; shift
  stellar contract invoke --id "$id" --source-account bl-admin --network "$NETWORK" -- "$@" >/dev/null 2>&1
}

HORIZON="https://horizon-testnet.stellar.org"

# Solde EURC du compte : "none" sans trustline, "missing" si le compte n'existe pas.
eurc_of() {
  curl -sf "$HORIZON/accounts/$1" | python3 -c '
import sys, json
code, issuer = sys.argv[1].split(":")
lines = [b["balance"] for b in json.load(sys.stdin)["balances"]
         if b.get("asset_code") == code and b.get("asset_issuer") == issuer]
print(lines[0] if lines else "none")' "$EURC_ASSET" 2>/dev/null || echo missing
}

# Clé, XLM (Friendbot), trustline : chaque étape n'est faite qu'une fois.
ensure_account() {
  local name="$1" addr
  stellar keys address "$name" >/dev/null 2>&1 || stellar keys generate "$name" --network "$NETWORK" >/dev/null
  addr="$(stellar keys address "$name")"
  if [ "$(eurc_of "$addr")" = missing ]; then
    stellar keys fund "$name" --network "$NETWORK" >/dev/null
  fi
  if [ "$(eurc_of "$addr")" = none ]; then
    stellar tx new change-trust --line "$EURC_ASSET" \
      --source-account "$name" --network "$NETWORK" --quiet >/dev/null
  fi
}

echo "==> Arbitre du jury"
ensure_account bl-jury-arbiter

for i in $(seq 1 "$JURORS"); do
  name="bl-jury-$i"
  echo "==> $name"
  ensure_account "$name"
  addr="$(stellar keys address "$name")"
  if [ "$(eurc_of "$addr")" = "0.0000000" ]; then
    stellar tx new payment --source-account bl-pharma --network "$NETWORK" --quiet \
      --destination "$addr" --asset "$EURC_ASSET" --amount "$EURC_EACH" >/dev/null
    echo "  5 EURC envoyés"
  fi
  invoke "$NFT_ID" set_institution --institution "$addr" --verified true
  invoke "$SPLITTER_ID" set_allowed --who "$addr" --allowed true
  echo "  institution + KYC ok"
done

echo "==> Comptes (clés secrètes : stellar keys show <nom>)"
for name in $(seq -f "bl-jury-%g" 1 "$JURORS") bl-jury-arbiter; do
  echo "  $name $(stellar keys address "$name")"
done
