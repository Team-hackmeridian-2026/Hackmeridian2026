#!/usr/bin/env bash
# Prepares a fresh machine (the "Deploy contracts" GitHub workflow) to run the
# other scripts against the current testnet deployment:
#
#   1. Imports the testnet identities from $STELLAR_TESTNET_KEYS into the
#      `stellar` CLI. One `bl-<name>=S...` line per identity, as written by:
#        for n in admin lab inventor fund pharma arbiter jury-1 jury-2 jury-3 jury-arbiter; do
#          echo "bl-$n=$(stellar keys secret "bl-$n")"; done
#   2. Checks that every identity named on the command line is there, and that
#      the demo roles match the addresses in frontend/src/deployment.json, so a
#      wrong key never deploys contracts with the wrong admin.
#      NEW_ACCOUNTS=true switches to a new set of demo accounts instead: all six
#      roles are then required, and their addresses replace the committed ones.
#   3. Rebuilds deployments/testnet.env: addresses from the loaded keys, the
#      EURC asset and contract from frontend/src/deployment.json.
#
#   ci-load-testnet.sh admin lab fund   # identities that must be present
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
NETWORK="${NETWORK:-testnet}"
DEPLOYMENT="$ROOT/frontend/src/deployment.json"
IDENTITIES="${XDG_CONFIG_HOME:-$HOME/.config}/stellar/identity"

[ -n "${STELLAR_TESTNET_KEYS:-}" ] || { echo "STELLAR_TESTNET_KEYS is empty: add the secret first (see README)" >&2; exit 1; }

# `stellar keys add --secret-key` only reads from a terminal, so write the
# identity files the CLI reads (format checked with stellar-cli 28.1.0).
mkdir -p "$IDENTITIES"
umask 077
loaded=()
while IFS= read -r line || [ -n "$line" ]; do
  line="${line%$'\r'}"
  [[ -z "$line" || "$line" == \#* ]] && continue
  name="${line%%=*}"
  secret="${line#*=}"
  if [[ ! "$name" =~ ^bl-[a-z0-9-]+$ || ! "$secret" =~ ^S[A-Z2-7]{55}$ ]]; then
    echo "Ignoring a malformed line (expected bl-<name>=S...)" >&2
    continue
  fi
  # Keep the key out of the logs before anything can print it.
  [ -n "${GITHUB_ACTIONS:-}" ] && echo "::add-mask::$secret"
  printf 'secret_key = "%s"\n' "$secret" > "$IDENTITIES/$name.toml"
  loaded+=("$name")
done <<<"$STELLAR_TESTNET_KEYS"
echo "==> ${#loaded[@]} identities loaded"

ROLES=(admin lab inventor fund pharma arbiter)
required=("$@")
if [ "${NEW_ACCOUNTS:-false}" = true ]; then required+=("${ROLES[@]}"); fi

missing=()
for role in "${required[@]}"; do
  stellar keys address "bl-$role" >/dev/null 2>&1 || missing+=("bl-$role")
done
if [ "${#missing[@]}" -gt 0 ]; then
  echo "Missing identities: ${missing[*]}" >&2
  exit 1
fi

# read_json accounts admin -> deployment.json["accounts"]["admin"]
read_json() {
  python3 -c 'import json, sys
d = json.load(open(sys.argv[1]))
for key in sys.argv[2:]:
    d = d[key]
print(d)' "$DEPLOYMENT" "$@"
}

# Address of a demo role: its loaded key, else the committed address.
declare -A ADDRESS
echo "==> Checking the demo roles against deployment.json"
for role in "${ROLES[@]}"; do
  expected="$(read_json accounts "$role")"
  if ! actual="$(stellar keys address "bl-$role" 2>/dev/null)"; then
    ADDRESS[$role]="$expected"
    continue
  fi
  ADDRESS[$role]="$actual"
  if [ "$expected" = "$actual" ]; then
    echo "  bl-$role ok"
  elif [ "${NEW_ACCOUNTS:-false}" = true ]; then
    echo "  bl-$role new address $actual (was $expected)"
  else
    echo "bl-$role is $actual but deployment.json expects $expected" >&2
    echo "To switch to new demo accounts, run with new_accounts ticked." >&2
    exit 1
  fi
done

EURC_ASSET="$(read_json eurcAsset)"
CIRCLE_EURC_ISSUER="GB3Q6QDZYTHWT7E5PVS3W7FUT5GVAFC5KSZFFLPU25GO7VTC3NM2ZTVO"
mkdir -p "$ROOT/deployments"
cat > "$ROOT/deployments/$NETWORK.env" <<EOF
NETWORK=$NETWORK
EURC_MODE=$([ "${EURC_ASSET#*:}" = "$CIRCLE_EURC_ISSUER" ] && echo circle || echo mock)
EURC_ASSET=$EURC_ASSET
EURC_CONTRACT=$(read_json contracts eurc)
ADMIN=${ADDRESS[admin]}
LAB=${ADDRESS[lab]}
INVENTOR=${ADDRESS[inventor]}
FUND=${ADDRESS[fund]}
PHARMA=${ADDRESS[pharma]}
ARBITER=${ADDRESS[arbiter]}
EOF
echo "==> deployments/$NETWORK.env rebuilt"
