#!/usr/bin/env bash
# Prepares testnet accounts the jury imports into Freighter to play the whole
# journey without waiting for the admin: each juror is a verified institution,
# on the KYC allowlist, and gets a few EURC; one shared arbiter account is
# enough (the arbiter must differ from the investor).
# Requires: scripts/setup-accounts.sh and scripts/deploy.sh, and EURC on the
# licensee (5 per juror).
#
# Rerunnable: each step checks the account before acting; a juror is only
# topped up again when their EURC balance is zero.
set -euo pipefail
shopt -s inherit_errexit

NETWORK="${NETWORK:-testnet}"
JURORS="${JURORS:-3}"
EURC_EACH=50000000 # 5 EURC in on-chain units (7 decimals)
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
# shellcheck disable=SC1090
source "$ROOT/deployments/$NETWORK.env"

invoke() {
  local id="$1"; shift
  stellar contract invoke --id "$id" --source-account bl-admin --network "$NETWORK" -- "$@" >/dev/null 2>&1
}

HORIZON="https://horizon-testnet.stellar.org"

# EURC balance of the account: "none" without a trustline, "missing" if the account does not exist.
eurc_of() {
  curl -sf "$HORIZON/accounts/$1" | python3 -c '
import sys, json
code, issuer = sys.argv[1].split(":")
lines = [b["balance"] for b in json.load(sys.stdin)["balances"]
         if b.get("asset_code") == code and b.get("asset_issuer") == issuer]
print(lines[0] if lines else "none")' "$EURC_ASSET" 2>/dev/null || echo missing
}

# Key, XLM (Friendbot), trustline: each step is done only once.
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

echo "==> Jury arbiter"
ensure_account bl-jury-arbiter

for i in $(seq 1 "$JURORS"); do
  name="bl-jury-$i"
  echo "==> $name"
  ensure_account "$name"
  addr="$(stellar keys address "$name")"
  if [ "$(eurc_of "$addr")" = "0.0000000" ]; then
    stellar tx new payment --source-account bl-pharma --network "$NETWORK" --quiet \
      --destination "$addr" --asset "$EURC_ASSET" --amount "$EURC_EACH" >/dev/null
    echo "  5 EURC sent"
  fi
  invoke "$NFT_ID" set_institution --institution "$addr" --verified true
  invoke "$SPLITTER_ID" set_allowed --who "$addr" --allowed true
  echo "  institution + KYC ok"
done

echo "==> Accounts (secret keys: stellar keys show <name>)"
for name in $(seq -f "bl-jury-%g" 1 "$JURORS") bl-jury-arbiter; do
  echo "  $name $(stellar keys address "$name")"
done
