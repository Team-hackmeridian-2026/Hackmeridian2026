#!/usr/bin/env bash
# Remplit le testnet avec des licences de démo dans différents états, pour que
# la marketplace ne soit jamais vide (site public, vidéo, essais du jury).
# Prérequis : scripts/setup-accounts.sh puis scripts/deploy.sh, et des EURC sur
# le fonds (~8) et l'industriel (~3).
#
# Relançable : un brevet dont le titre existe déjà est ignoré. Les fenêtres de
# contestation durent 1 minute ; le script attend deux fois, ~3 minutes au total.
set -euo pipefail
# Une erreur dans $( … ) doit aussi arrêter le script.
shopt -s inherit_errexit

NETWORK="${NETWORK:-testnet}"
WINDOW=60
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
# shellcheck disable=SC1090
source "$ROOT/deployments/$NETWORK.env"

EURC=10000000 # 1 EURC en unités on-chain (7 décimales)

# Le RPC testnet renvoie parfois des timeouts : on réessaie jusqu'à 3 fois.
invoke() {
  local id="$1" source="$2" n out; shift 2
  for n in 1 2 3; do
    if out="$(stellar contract invoke --id "$id" --source-account "$source" --network "$NETWORK" -- "$@" 2>/dev/null)"; then
      printf '%s' "$out" | tail -1 | tr -d '"'
      return 0
    fi
    echo "  (tentative $n échouée, nouvel essai)" >&2
    sleep 5
  done
  echo "  échec : $*" >&2
  return 1
}

read_only() {
  stellar contract invoke --id "$1" --source-account bl-admin --network "$NETWORK" --send=no -- "${@:2}" 2>/dev/null
}

hash_of() { printf '%s' "$1" | sha256sum | cut -d' ' -f1; }

EXISTING="$(read_only "$NFT_ID" list_licenses --start 1 --limit 50 \
  | python3 -c 'import sys, json; print("\n".join(l["title"] for l in json.load(sys.stdin)))')"

# Crée licence + répartition + tour de financement ; affiche l'id du projet,
# ou rien si le brevet existe déjà.
create() {
  local title="$1" field="$2" exclusive="$3" amounts="$4"
  if grep -qxF "$title" <<<"$EXISTING"; then
    echo "  = $title (déjà présent)" >&2
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
    --arbiter "$ARBITER" --amounts "$amounts" --challenge_period "$WINDOW")"
  echo "  + #$license $title" >&2
  echo "$project:$license"
}

fund()    { invoke "$ESCROW_ID" bl-fund fund --project_id "$1" >/dev/null; }
submit()  { invoke "$ESCROW_ID" bl-lab submit_milestone --project_id "$1" --index "$2" --proof_hash "$(hash_of "report $1-$2")" >/dev/null; }
release() { invoke "$ESCROW_ID" bl-admin release --project_id "$1" --index "$2" >/dev/null; }
royalty() { invoke "$SPLITTER_ID" bl-pharma pay_royalty --license_id "$1" --payer "$PHARMA" --amount "$2" >/dev/null; }
wait_window() { echo "==> Fenêtre de contestation ($((WINDOW + 5)) s)"; sleep $((WINDOW + 5)); }

echo "==> Licences"
ANTIBODY="$(create "Anti-inflammatory antibody for rheumatoid arthritis" Biotech true "[\"$EURC\",\"$EURC\"]")"
GLUCOSE="$(create "Implantable glucose sensor with 2-year lifetime" Medtech true "[\"$((EURC * 3 / 2))\",\"$((EURC * 3 / 2))\"]")"
BATTERY="$(create "Solid-state electrolyte for safer EV batteries" Energy false "[\"$EURC\",\"$EURC\",\"$EURC\"]")"
AI="$(create "AI early detection of lung nodules in CT scans" "Artificial intelligence" true "[\"$((EURC * 2))\",\"$((EURC * 2))\"]")"
: "${AI}" # ouvert au financement : aucun investisseur pour l'instant

echo "==> Financement et premiers jalons"
if [ -n "$ANTIBODY" ]; then
  p="${ANTIBODY%%:*}"
  fund "$p"; submit "$p" 0
  # Échec scientifique de bonne foi : l'arbitre partage la tranche 60/40.
  invoke "$ESCROW_ID" bl-fund dispute --project_id "$p" --index 0 --reason_hash "$(hash_of "dispute $p")" >/dev/null
  invoke "$ESCROW_ID" bl-arbiter resolve_partial --project_id "$p" --index 0 --lab_bps 6000 >/dev/null
  submit "$p" 1
fi
for v in "$GLUCOSE" "$BATTERY"; do
  if [ -n "$v" ]; then fund "${v%%:*}"; submit "${v%%:*}" 0; fi
done

if [ -n "$ANTIBODY$GLUCOSE$BATTERY" ]; then
  wait_window
  echo "==> Libérations"
  if [ -n "$ANTIBODY" ]; then release "${ANTIBODY%%:*}" 1; fi
  for v in "$GLUCOSE" "$BATTERY"; do
    if [ -n "$v" ]; then release "${v%%:*}" 0; submit "${v%%:*}" 1; fi
  done
fi

if [ -n "$GLUCOSE" ]; then
  wait_window
  release "${GLUCOSE%%:*}" 1
fi

echo "==> Redevances et NDA"
if [ -n "$ANTIBODY" ]; then
  royalty "${ANTIBODY#*:}" $((EURC * 2))
  invoke "$NFT_ID" bl-fund sign_nda --id "${ANTIBODY#*:}" --viewer "$FUND" >/dev/null
fi
if [ -n "$GLUCOSE" ]; then royalty "${GLUCOSE#*:}" "$EURC"; fi

echo "==> Terminé"
read_only "$NFT_ID" list_licenses --start 1 --limit 50 \
  | python3 -c 'import sys, json
for l in json.load(sys.stdin):
    print("  #%s %-24s %s" % (l["id"], l["terms"]["field"], l["title"]))'
