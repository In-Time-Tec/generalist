# Baton package and GitHub release modernization

## Product-shaped contract

Baton releases eight lockstep, platform-neutral ESM libraries. It has no executable installer, native addon, bundled runtime, or platform-specific build. The release artifact is therefore the exact set of npm-compatible package tarballs consumed by Node 22+ and Bun 1.3+, not a Rika-style OS/architecture archive matrix. npm publication remains out of scope.

The release source of truth is the committed lockstep version in the root and all public package manifests. The modernization prepares the next unreleased version rather than reusing or moving `v0.10.0`. A publishable tag is exactly `v<version>`, must peel to the checked-out commit, and must arrive through a tag-push event. Manual workflow dispatch, including dispatch against a tag ref, may exercise the complete build, package, compatibility, checksum, evidence, and provenance path, but may not create a GitHub release.

## Implementation

1. Replace release-time source-manifest rewriting and repeated build/package steps with one Effect-native package command. It discovers and compares the canonical eight packages against every `packages/*` manifest, builds once, lets pinned Bun resolve `workspace:` and `catalog:` protocols while packing, proves source manifests remain unchanged, validates the exact tarballs and their manifests/exports/regular-file inventory, and emits checksums plus machine-readable release evidence.
2. Use one consumer fixture specification in two clean directories without overrides: a Bun isolated install and an npm local-tarball install for Node. Both consume all eight unchanged tarballs plus explicit peer dependencies, typecheck every public root/subpath under NodeNext, prove one physical Effect package and cross-package identity, clear ambient Node loader paths, and execute runtime imports under Node and Bun. `skipLibCheck` remains enabled only because the pinned Effect AI beta and AWS declaration graphs do not pass an unsuppressed external declaration check; Baton's own declarations are still exercised through representative type assertions. Runtime CI consumes transferred artifacts rather than repacking them.
3. Align committed metadata on the next lockstep version and preserve every existing export. Move `effect` to one exact, catalog-owned peer contract plus development dependency in every Effect-using package so valid consumers cannot install multiple Effect identities. Keep true implementation dependencies direct. Preserve ESM-only output and narrow allowlists; do not add duplicate `main`/`types` metadata, CJS claims, source, or maps. Because the repository has no declared license, do not invent one as part of packaging.
4. Define the release payload as eight versioned tarballs, `release-evidence.json`, and `SHA256SUMS` (ten assets). Evidence has a schema version, source commit, tool versions, and per-package name/version/filename/compressed and unpacked bytes/SHA-256/dependency/export summaries. The sorted checksum file covers the eight tarballs and evidence. Attest the final payload from the producer and verify provenance and checksums after transfer.
5. Replace `publish.yml` with a GitHub-release workflow: immutable verified action commit pins, deny-by-default permissions, frozen install, exact canonical-semver version/tag/peeled-commit identity checks, one package producer invocation, unchanged artifact transfer, SHA-256 verification, producer-scoped provenance, and job-level tag-push gating. The release job has only `contents: write`, creates a draft for the existing tag, verifies the exact names/count/digests, and only then publishes it. Include no npm credentials or npm publication path; reruns fail safely if a published release already exists.
6. Add regression tests for workflow permissions/pins/triggers/build-once/no-npm rules; package set/version/dependency/export/inventory/checksum/evidence rules; malformed release identity; clean Bun and npm-installed Node consumers; lifecycle-hook absence; package-specific size ceilings; and exact artifacts. Update the package-distribution feature document and README release guidance, deleting superseded workflow staging and aliases.

## Verification and release

- Record compressed and unpacked sizes for all eight current `0.10.0` registry tarballs as baseline evidence. The strengthened no-override/no-suppression consumer suite is the fixed capability proof for the new artifacts; the old smoke is not treated as equivalent proof.
- Run focused packaging/workflow tests, package isolation and minimum-runtime smokes, `bun run check`, and all locally executable release aggregation/checksum smokes.
- Ask Oracle first for mandatory P0/P1 cases and again for blockers in the implemented diff; address all high-confidence findings.
- Commit, push, open a PR, wait for required checks, fix genuine failures, merge without bypassing checks, confirm remote `main`, and delete the remote feature branch.

## Explicit non-goals and CI-owned assumptions

- No npm publication, npm token, trusted-publisher setup, product installer, executable archive, CJS build, source publication, Windows-specific artifact, native target, signing, or notarization. npm is used only to install local tarballs for the documented Node consumer path.
- Linux creates the platform-neutral tarballs. Compatibility is behavioral: minimum Node and Bun consumers install, typecheck, and import the exact same bytes.
