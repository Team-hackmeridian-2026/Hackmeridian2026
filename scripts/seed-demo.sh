#!/usr/bin/env bash
# Fills testnet with demo licences in different states, so that the marketplace
# is never empty (public site, video, jury trials).
# Requires: scripts/setup-accounts.sh then scripts/deploy.sh, and EURC on the
# lab: it tops up the fund (8) and the licensee (3) before seeding.
#
# Rerunnable: a patent whose title already exists is skipped. Challenge windows
# last 1 minute; the script waits twice, ~3 minutes in total.
set -euo pipefail
# An error inside $( … ) must stop the script too.
shopt -s inherit_errexit

NETWORK="${NETWORK:-testnet}"
WINDOW=60
# Deadline of the demo projects: one year (see milestone_escrow::reclaim).
DEADLINE=$(( $(date +%s) + 365 * 24 * 3600 ))
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
# shellcheck disable=SC1090
source "$ROOT/deployments/$NETWORK.env"

EURC=10000000 # 1 EURC in on-chain units (7 decimals)

ERR="$(mktemp)"
trap 'rm -f "$ERR"' EXIT

# The testnet RPC sometimes times out: retry up to 3 times.
invoke() {
  local id="$1" source="$2" n out; shift 2
  for n in 1 2 3; do
    if out="$(stellar contract invoke --id "$id" --source-account "$source" --network "$NETWORK" -- "$@" 2>"$ERR")"; then
      printf '%s' "$out" | tail -1 | tr -d '"'
      return 0
    fi
    echo "  (attempt $n failed, retrying)" >&2
    sleep 5
  done
  # Without the CLI's own error, an empty balance looked like a flaky RPC.
  echo "  failed: $*" >&2
  tail -1 "$ERR" >&2
  return 1
}

read_only() {
  stellar contract invoke --id "$1" --source-account bl-admin --network "$NETWORK" --send=no -- "${@:2}" 2>/dev/null
}

hash_of() { printf '%s' "$1" | sha256sum | cut -d' ' -f1; }

# Each run moves the funded EURC to the lab (milestone payouts) and the royalties into
# the splitter, so the fund and the licensee run dry: refill them from the lab.
top_up() {
  local name="$1" addr="$2" need="$3" have
  have="$(read_only "$EURC_CONTRACT" balance --id "$addr" | tr -d '"')" ||
    { echo "  cannot read the EURC balance of $name (trustline?)" >&2; return 1; }
  if [ "$have" -lt "$need" ]; then
    stellar tx new payment --source-account bl-lab --network "$NETWORK" --quiet \
      --destination "$addr" --asset "$EURC_ASSET" --amount $((need - have)) >/dev/null
    echo "  $name topped up to $((need / EURC)) EURC from bl-lab" >&2
  fi
}

EXISTING="$(read_only "$NFT_ID" list_licenses --start 1 --limit 50 \
  | python3 -c 'import sys, json; print("\n".join(l["title"] for l in json.load(sys.stdin)))')"

# Creates licence + split + funding round; prints the project ID,
# or nothing if the patent already exists.
create() {
  local title="$1" field="$2" exclusive="$3" amounts="$4"
  if grep -qxF "$title" <<<"$EXISTING"; then
    echo "  = $title (already there)" >&2
    return 0
  fi
  local terms license project
  terms="{\"exclusive\":$exclusive,\"territory\":\"European Union\",\"field\":\"$field\",\"duration_years\":10}"
  license="$(invoke "$NFT_ID" bl-lab mint --owner "$LAB" --title "$title" \
    --inventors "[\"$INVENTOR\"]" --terms "$terms" \
    --dossier_hash "$(hash_of "$title dossier")" --metadata_uri '""')"
  invoke "$SPLITTER_ID" bl-lab configure --license_id "$license" --config \
    "{\"fixed\":[{\"addr\":\"$LAB\",\"bps\":4000},{\"addr\":\"$INVENTOR\",\"bps\":3000}],\"investors_bps\":3000}" >/dev/null
  project="$(invoke "$ESCROW_ID" bl-lab create_project --license_id "$license" --investor "$FUND" \
    --arbiter "$ARBITER" --amounts "$amounts" --challenge_period "$WINDOW" --deadline "$DEADLINE")"
  echo "  + #$license $title" >&2
  echo "$project:$license"
}

fund()    { invoke "$ESCROW_ID" bl-fund fund --project_id "$1" >/dev/null; }
submit()  { invoke "$ESCROW_ID" bl-lab submit_milestone --project_id "$1" --index "$2" --proof_hash "$(hash_of "report $1-$2")" >/dev/null; }
release() { invoke "$ESCROW_ID" bl-admin release --project_id "$1" --index "$2" >/dev/null; }
royalty() { invoke "$SPLITTER_ID" bl-pharma pay_royalty --license_id "$1" --payer "$PHARMA" --amount "$2" >/dev/null; }
wait_window() { echo "==> Challenge window ($((WINDOW + 5)) s)"; sleep $((WINDOW + 5)); }

echo "==> Licences"
ANTIBODY="$(create "Anti-inflammatory antibody for rheumatoid arthritis" Biotech true "[\"$EURC\",\"$EURC\"]")"
GLUCOSE="$(create "Implantable glucose sensor with 2-year lifetime" Medtech true "[\"$((EURC * 3 / 2))\",\"$((EURC * 3 / 2))\"]")"
BATTERY="$(create "Solid-state electrolyte for safer EV batteries" Energy false "[\"$EURC\",\"$EURC\",\"$EURC\"]")"
AI="$(create "AI early detection of lung nodules in CT scans" "Artificial intelligence" true "[\"$((EURC * 2))\",\"$((EURC * 2))\"]")"
: "${AI}" # open for funding: no investor yet

if [ -n "$ANTIBODY$GLUCOSE$BATTERY" ]; then
  echo "==> EURC for the fund and the licensee"
  top_up bl-fund "$FUND" $((EURC * 8))      # the three rounds funded below: 2 + 3 + 3
  top_up bl-pharma "$PHARMA" $((EURC * 3))  # the royalties paid at the end: 2 + 1
fi

echo "==> Funding and first milestones"
if [ -n "$ANTIBODY" ]; then
  p="${ANTIBODY%%:*}"
  fund "$p"; submit "$p" 0
  # Good-faith scientific failure: the arbiter splits the milestone 60/40.
  invoke "$ESCROW_ID" bl-fund dispute --project_id "$p" --index 0 --reason_hash "$(hash_of "dispute $p")" >/dev/null
  invoke "$ESCROW_ID" bl-arbiter resolve_partial --project_id "$p" --index 0 --lab_bps 6000 >/dev/null
  submit "$p" 1
fi
for v in "$GLUCOSE" "$BATTERY"; do
  if [ -n "$v" ]; then fund "${v%%:*}"; submit "${v%%:*}" 0; fi
done

if [ -n "$ANTIBODY$GLUCOSE$BATTERY" ]; then
  wait_window
  echo "==> Releases"
  if [ -n "$ANTIBODY" ]; then release "${ANTIBODY%%:*}" 1; fi
  for v in "$GLUCOSE" "$BATTERY"; do
    if [ -n "$v" ]; then release "${v%%:*}" 0; submit "${v%%:*}" 1; fi
  done
fi

if [ -n "$GLUCOSE" ]; then
  wait_window
  release "${GLUCOSE%%:*}" 1
fi

echo "==> Royalties and NDA"
if [ -n "$ANTIBODY" ]; then
  royalty "${ANTIBODY#*:}" $((EURC * 2))
  invoke "$NFT_ID" bl-fund sign_nda --id "${ANTIBODY#*:}" --viewer "$FUND" >/dev/null
fi
if [ -n "$GLUCOSE" ]; then royalty "${GLUCOSE#*:}" "$EURC"; fi

echo "==> Done"
read_only "$NFT_ID" list_licenses --start 1 --limit 50 \
  | python3 -c 'import sys, json
for l in json.load(sys.stdin):
    print("  #%s %-24s %s" % (l["id"], l["terms"]["field"], l["title"]))'
