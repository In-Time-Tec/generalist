#!/usr/bin/env bash
set -uo pipefail

staging_url="https://batonfx-docs-staging.up.railway.app"
production_url="https://batonfx-docs.up.railway.app"
deep_link="/docs/start/quickstart"
failures=0

check() {
  local label="$1" url="$2" expected="$3"
  local code
  code=$(curl -s -o /dev/null -w "%{http_code}" "$url")
  if [ "$code" = "$expected" ]; then
    echo "ok   $label $url -> $code"
  else
    echo "FAIL $label $url -> $code (expected $expected)"
    failures=$((failures + 1))
  fi
}

check "staging root" "$staging_url/" 200
check "staging deep link" "$staging_url$deep_link" 200
check "staging llms" "$staging_url/llms.txt" 200
check "production root" "$production_url/" 200
check "production deep link" "$production_url$deep_link" 200
check "production llms" "$production_url/llms.txt" 200

for env in staging production; do
  url_var="${env}_url"
  title=$(curl -s "${!url_var}/" | grep -o "<title>[^<]*</title>" | head -1)
  if [ "$title" = "<title>Batonfx</title>" ]; then
    echo "ok   $env title $title"
  else
    echo "FAIL $env title $title (expected <title>Batonfx</title>)"
    failures=$((failures + 1))
  fi
done

if command -v jq >/dev/null && [ -f "$HOME/.railway/config.json" ]; then
  token=$(jq -r '.user.accessToken // empty' "$HOME/.railway/config.json")
  if [ -n "$token" ]; then
    release_sha=$(git ls-remote origin refs/heads/release | cut -f1)
    deployed_sha=$(curl -s -X POST https://backboard.railway.app/graphql/v2 \
      -H "Authorization: Bearer $token" -H "Content-Type: application/json" \
      -d '{"query":"query { deployments(first: 5, input: { projectId: \"ea293b35-7e8c-4874-a944-7e977993ef5b\", environmentId: \"7e2a5ab4-7046-49de-bae1-15180778e92d\" }) { edges { node { status meta } } } }"}' |
      jq -r '[.data.deployments.edges[].node | select(.status == "SUCCESS")][0].meta.commitHash // empty')
    if [ -n "$deployed_sha" ] && [ "$deployed_sha" = "$release_sha" ]; then
      echo "ok   production sha matches origin/release ($release_sha)"
    else
      echo "warn production sha $deployed_sha vs origin/release $release_sha"
    fi
  fi
fi

if [ "$failures" -gt 0 ]; then
  echo "verify-docs-deploy: $failures failures"
  exit 1
fi
echo "verify-docs-deploy: all checks passed"
