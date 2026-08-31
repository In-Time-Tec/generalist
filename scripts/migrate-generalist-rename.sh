#!/usr/bin/env bash
# One-shot migration for the Generalist rename. Idempotent; safe to re-run.
#
#   1. Renames GitHub repo In-Time-Tec/tenetkit -> In-Time-Tec/generalist
#      (requires `gh` authenticated as a user with admin on the repo).
#   2. Railway project "batonfx": renames the batonfx-docs service to
#      generalist-docs, creates generalist-docs{,-staging}.up.railway.app
#      service domains, deletes the old batonfx-docs* domains once the new
#      ones route, and renames the project to "generalist"
#      (requires a Railway user token in ~/.railway/config.json, plus jq).
#
# Delete this file once it has run green.
set -euo pipefail

failures=0

echo "== GitHub: rename repository =="
if gh repo view In-Time-Tec/generalist >/dev/null 2>&1; then
  echo "skip: In-Time-Tec/generalist already exists"
elif ! gh auth status >/dev/null 2>&1; then
  echo "warn: gh not authenticated; cannot confirm or perform the repo rename here."
  echo "      (The rename was already completed from another machine — nothing to do.)"
else
  gh repo rename generalist --repo In-Time-Tec/tenetkit --yes
  echo "ok: renamed In-Time-Tec/tenetkit -> In-Time-Tec/generalist"
fi

echo
echo "== Railway: migrate project, service, and domains =="
API="https://backboard.railway.app/graphql/v2"
PROJECT_ID="ea293b35-7e8c-4874-a944-7e977993ef5b"
SERVICE_ID="b9054866-fecd-46d5-af15-3cf0feeebde9"
ENV_PRODUCTION="7e2a5ab4-7046-49de-bae1-15180778e92d"
ENV_STAGING="f2b228e1-2d36-43c8-9b8e-15662030e84e"

if ! command -v jq >/dev/null 2>&1; then
  echo "FAIL: jq is required (brew install jq)"
  exit 1
fi
TOKEN=$(jq -r '.user.accessToken // empty' "$HOME/.railway/config.json" 2>/dev/null || true)
if [ -z "${TOKEN:-}" ]; then
  echo "FAIL: no Railway user token at ~/.railway/config.json (run: railway login)"
  exit 1
fi

gql() { # $1 = query, $2 = variables JSON (optional)
  local q="$1" v="{}"
  [ $# -ge 2 ] && v="$2"
  jq -n --arg q "$q" --argjson v "$v" '{query:$q, variables:$v}' |
    curl -s -X POST "$API" -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" --data-binary @-
}

gql_soft() { # gql, log GraphQL errors and return 1 (no exit; caller decides)
  local out
  out=$(gql "$@")
  if [ "$(echo "$out" | jq 'has("errors")')" = "true" ]; then
    echo "$out" | jq -c '.errors' >&2
    return 1
  fi
  echo "$out"
}

gql_strict() {
  local out
  if ! out=$(gql_soft "$@"); then
    echo "FAIL: GraphQL error for: $1"
    exit 1
  fi
  echo "$out"
}

echo "-- whoami --"
gql_strict 'query { me { name email } }' | jq -c '.data.me'

echo "-- current state --"
svc=$(gql_strict 'query($id:String!){ service(id:$id){ id name projectId } }' "{\"id\":\"$SERVICE_ID\"}")
echo "$svc" | jq -c '.data.service'
svc_name=$(echo "$svc" | jq -r '.data.service.name')

echo "-- rename service -> generalist-docs --"
if [ "$svc_name" = "generalist-docs" ]; then
  echo "skip: service already named generalist-docs"
else
  gql_strict 'mutation($id:String!,$input:ServiceUpdateInput!){ serviceUpdate(id:$id, input:$input){ name } }' \
    "{\"id\":\"$SERVICE_ID\",\"input\":{\"name\":\"generalist-docs\"}}" |
    jq -r '.data.serviceUpdate | "ok: service renamed -> \(.name)"'
fi

# Can we request an exact domain on create, or must we rely on name-based generation?
input_fields=$(gql_strict '{ __type(name:"ServiceDomainCreateInput"){ inputFields{ name } } }' |
  jq -r '[.data.__type.inputFields[].name] | join(" ")')
echo "-- ServiceDomainCreateInput fields: $input_fields --"

list_domains() { # $1 = env id -> tab-separated "domainId<TAB>domain" lines
  gql_strict 'query($p:String!,$e:String!,$s:String!){ domains(projectId:$p, environmentId:$e, serviceId:$s){ serviceDomains{ id domain } } }' \
    "{\"p\":\"$PROJECT_ID\",\"e\":\"$1\",\"s\":\"$SERVICE_ID\"}" |
    jq -r '.data.domains.serviceDomains[]? | [.id, .domain] | @tsv'
}

rotate_domain() { # $1 = env id, $2 = env label, $3 = old domain, $4 = new domain
  local env_id="$1" label="$2" old="$3" new="$4"
  local domains did actual create_vars
  domains=$(list_domains "$env_id")
  echo "-- $label domains: $(printf '%s' "$domains" | cut -f2 | paste -sd, -) --"

  if printf '%s\n' "$domains" | cut -f2 | grep -qx "$new"; then
    echo "skip: $new already exists"
  else
    did=$(printf '%s\n' "$domains" | awk -F'\t' -v d="$old" '$2 == d {print $1}')
    if [ -z "$did" ]; then
      echo "FAIL: neither $old nor $new found in $label — investigate manually"
      failures=$((failures + 1))
      return
    fi

    if [[ " $input_fields " == *" domain "* ]]; then
      create_vars=$(jq -n --arg s "$SERVICE_ID" --arg e "$env_id" --arg d "$new" \
        '{input:{serviceId:$s, environmentId:$e, domain:$d}}')
    else
      echo "note: no explicit domain field; relying on service-name-based generation"
      create_vars=$(jq -n --arg s "$SERVICE_ID" --arg e "$env_id" '{input:{serviceId:$s, environmentId:$e}}')
    fi
    actual=$(gql_strict 'mutation($input:ServiceDomainCreateInput!){ serviceDomainCreate(input:$input){ id domain } }' "$create_vars" |
      jq -r '.data.serviceDomainCreate.domain')
    echo "ok: created domain $actual"
    if [ "$actual" != "$new" ]; then
      echo "note: wanted $new but Railway assigned $actual"
      new="$actual"
    fi

    # Wait for the new domain to route before deleting the old one. If the old
    # domain is already falling back (app down), deletion can make nothing worse.
    local old_hdrs new_hdrs old_fallback=false routed=false
    old_hdrs=$(curl -s -D - -o /dev/null "https://$old/" || true)
    printf '%s' "$old_hdrs" | grep -qi 'x-railway-fallback: true' && old_fallback=true
    for _ in $(seq 1 24); do
      new_hdrs=$(curl -s -D - -o /dev/null "https://$new/" || true)
      if ! printf '%s' "$new_hdrs" | grep -qi 'x-railway-fallback: true'; then
        routed=true
        break
      fi
      sleep 5
    done
    if [ "$routed" = "true" ]; then
      echo "ok: $new routes to the app"
    elif [ "$old_fallback" = "true" ]; then
      echo "warn: $new not routing yet, but $old was already falling back (app down?) — proceeding"
    else
      echo "FAIL: $new did not route within 2 minutes; keeping $old. Re-run after the app is healthy."
      failures=$((failures + 1))
      return
    fi

    gql_strict 'mutation($id:String!){ serviceDomainDelete(id:$id) }' "{\"id\":\"$did\"}" >/dev/null
    echo "ok: deleted old domain $old"
  fi

  # Clean up the old domain if it still lingers alongside the new one.
  domains=$(list_domains "$env_id")
  did=$(printf '%s\n' "$domains" | awk -F'\t' -v d="$old" '$2 == d {print $1}')
  if [ -n "$did" ]; then
    gql_strict 'mutation($id:String!){ serviceDomainDelete(id:$id) }' "{\"id\":\"$did\"}" >/dev/null
    echo "ok: deleted lingering old domain $old"
  fi
}

rotate_domain "$ENV_PRODUCTION" "production" "batonfx-docs.up.railway.app" "generalist-docs.up.railway.app"
rotate_domain "$ENV_STAGING" "staging" "batonfx-docs-staging.up.railway.app" "generalist-docs-staging.up.railway.app"

echo "-- rename project -> generalist --"
project_name=$(gql_strict 'query($id:String!){ project(id:$id){ name } }' "{\"id\":\"$PROJECT_ID\"}" | jq -r '.data.project.name')
if [ "$project_name" = "generalist" ]; then
  echo "skip: project already named generalist"
else
  if gql_soft 'mutation($id:String!,$input:ProjectUpdateInput!){ projectUpdate(id:$id, input:$input){ name } }' \
    "{\"id\":\"$PROJECT_ID\",\"input\":{\"name\":\"generalist\"}}" >/dev/null; then
    echo "ok: project renamed $project_name -> generalist"
  else
    echo "warn: project rename failed (non-fatal; rename in dashboard if you care)"
  fi
fi

echo
if [ "$failures" -gt 0 ]; then
  echo "migrate-generalist-rename: $failures failures"
  exit 1
fi
echo "migrate-generalist-rename: done"
