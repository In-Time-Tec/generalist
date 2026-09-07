---
name: generalist-release
description: Produces and audits Generalist release assets from one exact detached commit, with checksums and fresh Bun and npm consumers. Use when preparing or recovering a Generalist release.
---

# Generalist release proof

Build local release evidence without changing a branch, tag, remote, registry, release, or deployment. Use the existing package smoke and publication workflow; do not add another release script.

## Guardrails

- Resolve one full commit SHA before doing release work. Do not package a dirty checkout and call it commit evidence.
- Use the pinned Bun 1.4.0 and `bun install --frozen-lockfile`. Local acceptance uses Docker-backed MinIO and persistent Miniflare/workerd, not SQL services or cloud credentials. Never delete production objects; use fresh test namespaces.
- Write into a new artifact directory. Never reuse or overwrite a prior candidate.
- `bun run package` is the consumer proof. It creates fresh Bun-isolated, core-only, and npm projects and installs the newly packed tarballs. Do not replace it with workspace imports or a build-directory smoke test.
- The npm consumer needs npm 11.19.0 or newer on `PATH`. Older npm (10.9.8 and 11.5.1 confirmed) crashes in Arborist with `Cannot read properties of null (reading 'edgesOut')` while resolving the optional `vitest` peer chain; that is an npm bug, not package evidence. `.github/workflows/publish.yml` pins a Node release whose bundled npm passes.
- Stop after local proof unless the user explicitly asks to create or push a tag, dispatch the release workflow, publish, or deploy. Never run `npm publish` locally.

## Build from the exact commit

Set `GENERALIST_RELEASE_COMMIT` to the requested ref or full SHA. Set `GENERALIST_RELEASE_ARTIFACT_DIR` when `release` is not the desired output directory. Run from any checkout of this repository:

```bash
set -euo pipefail

repository="$(git rev-parse --show-toplevel)"
commit="$(git rev-parse --verify "${GENERALIST_RELEASE_COMMIT:-HEAD}^{commit}")"
artifacts="${GENERALIST_RELEASE_ARTIFACT_DIR:-$repository/release}"
if [[ "$artifacts" != /* ]]; then artifacts="$repository/$artifacts"; fi
test ! -e "$artifacts" || {
  echo "artifact directory already exists: $artifacts" >&2
  exit 1
}

scratch="$(mktemp -d)"
worktree="$scratch/source"
cleanup() {
  git -C "$repository" worktree remove --force "$worktree" >/dev/null 2>&1 || true
  rm -rf "$scratch"
}
trap cleanup EXIT

git -C "$repository" worktree add --detach "$worktree" "$commit"
git -C "$worktree" submodule update --init --recursive
test "$(git -C "$worktree" rev-parse HEAD)" = "$commit"
test -z "$(git -C "$worktree" status --porcelain --untracked-files=no)"
version="$(jq -er '.version | select(test("^(0|[1-9][0-9]*)\\.(0|[1-9][0-9]*)\\.(0|[1-9][0-9]*)$"))' "$worktree/package.json")"

(
  cd "$worktree"
  bun install --frozen-lockfile
  bun run check
  bun run test
  PACKAGE_ARTIFACT_DIR="$artifacts" bun run package
)

test "$(git -C "$worktree" rev-parse HEAD)" = "$commit"
test -z "$(git -C "$worktree" status --porcelain --untracked-files=no)"

diff -u \
  <(printf '%s\n' \
    SHA256SUMS \
    release-evidence.json \
    "generalist-${version}.tgz" | sort) \
  <(find "$artifacts" -maxdepth 1 -type f -printf '%f\n' | sort)

(
  cd "$artifacts"
  sha256sum --check SHA256SUMS
)

jq -e --arg commit "$commit" --arg version "$version" '
  .schemaVersion == 1 and
  .sourceCommit == $commit and
  ([.packages[].name] | sort) == [
    "generalist"
  ] and
  all(.packages[]; .version == $version)
' "$artifacts/release-evidence.json" >/dev/null

while IFS=$'\t' read -r filename digest; do
  grep -Fxq "$digest  $filename" "$artifacts/SHA256SUMS"
done < <(jq -r '.packages[] | [.filename, .sha256] | @tsv' "$artifacts/release-evidence.json")

printf 'commit=%s\nversion=%s\ntag=v%s\nartifacts=%s\n' "$commit" "$version" "$version" "$artifacts"
```

The local object-service gate is `bun --bun vitest run packages/generalist/test/durability/object-store.test.ts --no-file-parallelism`. It exercises the production S3 client against MinIO and native R2 against persistent Miniflare/workerd, including the emulator's shared-bucket S3 gateway. Run it with Docker available as part of the full test proof; missing or skipped local services are unmet gates. Record exact pinned service/emulator versions and the committed Miniflare exact-EOF range patch. Patched-emulator results do not certify AWS S3 or deployed R2, and live-provider qualification is not part of this local-only acceptance. Do not request cloud credentials or run the remote provider runner.

Keep the three verified files together and unchanged. If source, tools, or version changes, produce a new candidate in a new empty directory.

## Publication facts

`.github/workflows/publish.yml` is the only publisher. A `v<version>` tag push starts it automatically. Manual dispatch is only recovery for an existing immutable tag and requires both the tag and its full expected commit SHA. The exact verified release commit must land on `main` and pass main CI before tagging. The workflow verifies the tag, commit, lockstep versions, ancestry on `origin/main`, checksums, evidence, GitHub assets, and npm tarball integrity; downstream jobs never rebuild.

When reporting local proof, include the full commit, version, artifact directory, `sha256sum --check` result, package-smoke result, full-check result, local-service results, and every skipped or unmet gate. Separate implementation, local tests, performance evidence, and full release acceptance; none substitutes for another. After an explicitly requested publication, also report the workflow run and registry integrity verification.
