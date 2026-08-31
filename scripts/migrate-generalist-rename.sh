#!/usr/bin/env bash
# One-shot migration for the Generalist rename. Idempotent; safe to re-run.
#
#   1. Renames GitHub repo In-Time-Tec/tenetkit -> In-Time-Tec/generalist
#      (requires `gh` authenticated as a user with admin on the repo).
#   2. Renames the Railway docs services tenetkit-docs* -> generalist-docs*,
#      creates the matching generalist-docs*.up.railway.app service domains,
#      and deletes the old tenetkit-docs* domains once the new ones route
#      (requires a Railway user token in ~/.railway/config.json, plus jq).
#
# Delete this file and .github/workflows/migrate-generalist.yml once it has run green.
set -euo pipefail

failures=0

echo "== GitHub: rename repository =="
if ! gh auth status >/dev/null 2>&1; then
  echo "FAIL: gh is not authenticated (run: gh auth login)"
  exit 1
fi
if gh repo view In-Time-Tec/generalist >/dev/null 2>&1; then
  echo "skip: In-Time-Tec/generalist already exists"
else
  gh repo rename generalist --repo In-Time-Tec/tenetkit --yes
  echo "ok: renamed In-Time-Tec/tenetkit -> In-Time-Tec/generalist"
fi

echo
echo "== Railway: migrate services and domains =="
API="https://backboard.railway.app/graphql/v2"
PROJECT_ID="ea293b35-7e8c-4874-a944-7e977993ef5b"

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

gql_strict() { # gql, but exit on GraphQL errors
  local out
  out=$(gql "$@")
  if [ "$(echo "$out" | jq 'has("errors")')" = "true" ]; then
    echo "FAIL: GraphQL error for: $1"
    echo "$out" | jq '.errors'
    exit 1
  fi
  echo "$out"
}

echo "-- whoami --"
gql_strict 'query { me { name email } }' | jq -c '.data.me'

echo "-- project topology --"
topo=$(gql_strict 'query($p:String!){ project(id:$p){ name services{edges{node{id name}}} environments{edges{node{id name}}} } }' "{\"p\":\"$PROJECT_ID\"}")
echo "$topo" | jq -r '.data.project | "project: \(.name)", (.services.edges[].node | "service: \(.name) [\(.id)]"), (.environments.edges[].node | "environment: \(.name) [\(.id)]")'

echo "-- service domains --"
dq='query($p:String!,$e:String!,$s:String!){ domains(projectId:$p, environmentId:$e, serviceId:$s){ serviceDomains{ id domain } } }'
rows=""
while IFS=$'\t' read -r sid sname; do
  while IFS=$'\t' read -r eid ename; do
    d=$(gql_strict "$dq" "{\"p\":\"$PROJECT_ID\",\"e\":\"$eid\",\"s\":\"$sid\"}")
    while IFS=$'\t' read -r did dom; do
      [ -n "${did:-}" ] || continue
      rows="${rows}${sid}	${sname}	${eid}	${ename}	${did}	${dom}
"
      echo "  $dom  (service $sname, env $ename)"
    done < <(echo "$d" | jq -r '.data.domains.serviceDomains[]? | [.id, .domain] | @tsv')
  done < <(echo "$topo" | jq -r '.data.project.environments.edges[].node | [.id, .name] | @tsv')
done < <(echo "$topo" | jq -r '.data.project.services.edges[].node | [.id, .name] | @tsv')

# Can we request an exact domain on create, or must we rely on name-based generation?
input_fields=$(gql_strict '{ __type(name:"ServiceDomainCreateInput"){ inputFields{ name } } }' |
  jq -r '[.data.__type.inputFields[].name] | join(" ")')
echo "-- ServiceDomainCreateInput fields: $input_fields --"

migrate_domain() { # $1 old domain, $2 new domain, $3 target service name
  local old="$1" new="$2" target_name="$3"
  local row sid sname eid ename did dom
  row=$(printf '%s' "$rows" | grep "	${old}\$" || true)

  if [ -z "$row" ]; then
    if printf '%s' "$rows" | grep -q "	${new}\$"; then
      echo "skip: $new already exists (already migrated)"
    else
      echo "FAIL: neither $old nor $new found on project — investigate manually"
      failures=$((failures + 1))
    fi
    return
  fi

  sid=$(printf '%s' "$row" | cut -f1)
  sname=$(printf '%s' "$row" | cut -f2)
  eid=$(printf '%s' "$row" | cut -f3)
  ename=$(printf '%s' "$row" | cut -f4)
  did=$(printf '%s' "$row" | cut -f5)
  echo "-- migrating $old (service $sname, env $ename) --"

  if [ "$sname" != "$target_name" ]; then
    gql_strict 'mutation($id:String!,$input:ServiceUpdateInput!){ serviceUpdate(id:$id, input:$input){ name } }' \
      "{\"id\":\"$sid\",\"input\":{\"name\":\"$target_name\"}}" |
      jq -r '.data.serviceUpdate | "ok: service renamed -> \(.name)"'
  else
    echo "skip: service already named $target_name"
  fi

  local create_vars
  if [[ " $input_fields " == *" domain "* ]]; then
    create_vars=$(jq -n --arg s "$sid" --arg e "$eid" --arg d "$new" \
      '{input:{serviceId:$s, environmentId:$e, domain:$d}}')
  else
    echo "note: no explicit domain field; relying on service-name-based generation"
    create_vars=$(jq -n --arg s "$sid" --arg e "$eid" '{input:{serviceId:$s, environmentId:$e}}')
  fi
  created=$(gql_strict 'mutation($input:ServiceDomainCreateInput!){ serviceDomainCreate(input:$input){ id domain } }' "$create_vars")
  actual=$(echo "$created" | jq -r '.data.serviceDomainCreate.domain')
  echo "ok: created domain $actual"
  if [ "$actual" != "$new" ]; then
    echo "note: requested $new but Railway assigned $actual"
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
}

migrate_domain "tenetkit-docs.up.railway.app" "generalist-docs.up.railway.app" "generalist-docs"
migrate_domain "tenetkit-docs-staging.up.railway.app" "generalist-docs-staging.up.railway.app" "generalist-docs-staging"

echo
if [ "$failures" -gt 0 ]; then
  echo "migrate-generalist-rename: $failures failures"
  exit 1
fi
echo "migrate-generalist-rename: done"
