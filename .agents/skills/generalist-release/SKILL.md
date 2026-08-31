---
name: generalist-release
description: Produces and audits Generalist release assets from one exact detached commit, with checksums and fresh Bun and npm consumers. Use when preparing or recovering a Generalist release.
---

# Generalist release proof

Build local release evidence without changing a branch, tag, remote, registry, release, or deployment. Use the existing package smoke and publication workflow; do not add another release script.

## Guardrails

- Resolve one full commit SHA before doing release work. Do not package a dirty checkout and call it commit evidence.
- Write into a new artifact directory. Never reuse or overwrite a prior candidate.
- `bun run package` is the consumer proof. It creates fresh Bun-isolated, core-only, and npm projects and installs the newly packed tarballs. Do not replace it with workspace imports or a build-directory smoke test.
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

`bun run test` skips PostgreSQL or MySQL tests when `GENERALIST_DATABASE_URL` or `GENERALIST_MYSQL_URL` is absent. Report either missing variable as a gap; do not call that run full driver proof.

Keep the three verified files together and unchanged. If source, tools, or version changes, produce a new candidate in a new empty directory.

## Publication facts

`.github/workflows/publish.yml` is the only publisher. A `v<version>` tag push starts it automatically. Manual dispatch is only recovery for an existing immutable tag and requires both the tag and its full expected commit SHA. The workflow verifies the tag, commit, lockstep versions, ancestry on `origin/main` and `origin/release`, checksums, evidence, GitHub assets, and npm tarball integrity; downstream jobs never rebuild.

When reporting local proof, include the full commit, version, artifact directory, `sha256sum --check` result, package-smoke result, full-check result, and any skipped database suite. After an explicitly requested publication, also report the workflow run and registry integrity verification.
