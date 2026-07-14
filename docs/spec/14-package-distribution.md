# 14 — Package Distribution

Baton publishes eight public npm libraries. A release is complete only when consumers can install and execute the packed artifacts without relying on repository source, workspace protocols, or Bun's TypeScript loader.

## Responsibility

Baton owns compiled package artifacts, package metadata, export maps, coordinated versions, and release verification. Baton does not own consumer bundler configuration, application deployment, or an npm-compatible registry.

## Invariants

- Every public package ships ESM JavaScript and TypeScript declarations under `dist/`.
- Public `exports` map only to files under `dist/` and declare `types` before `import`.
- Package roots expose canonical module namespaces; intentional and compatibility subpaths resolve to the same public module surfaces under ADR-0024.
- Relative imports emitted in declarations and JavaScript are Node ESM compatible.
- Third-party and sibling Baton dependencies remain external package imports; package builds do not duplicate them in every entrypoint.
- Tarballs use an allowlist and exclude source, tests, Turbo state, coverage, and repository-only configuration.
- All Baton packages in one release use one exact version, and sibling runtime dependencies resolve to that version.
- Release preparation happens before builds so embedded package version metadata cannot remain `0.0.0`.
- Publishing is manual. Every release supports a dry run and publishes only after building, packing, and verifying the candidate artifacts.

## Artifact flow

```text
source + version
      |
      v
compiled ESM + declarations
      |
      v
packed tarballs
      |
      v
clean Bun and Node consumers
      |
      v
publish + tag
```

TypeScript emits ESM JavaScript and declarations without bundling package dependencies. Bun remains the package manager and script runner. Turbo orders package builds from workspace dependency edges.

## Verification

`bun run package:smoke` must:

- pack every public package;
- reject undeclared workspace/catalog protocols in the packed manifests;
- reject files outside the package allowlist;
- install all tarballs together in a clean consumer;
- import every public export under Bun and supported Node;
- typecheck public imports from the packed artifacts, including canonical namespace imports, compatibility aliases and subpaths, and exact public Layer output, error, and requirement types; and
- verify package sizes remain bounded.

CI runs the same package smoke command before reporting a releasable build. The publish workflow runs it again against the release version, retains the verified tarballs as workflow artifacts, and passes those exact files to `npm publish`.

## Failure modes

Missing build output, stale exports, unresolved sibling versions, source-only exports, unexpected tarball files, failed Node/Bun imports, failed declaration resolution, or an oversized artifact fail the release before publication.

## Decision

The durable distribution decision is recorded in `docs/spec/decisions/ADR-0022-compiled-esm-package-artifacts.md`.
Public import and Layer compatibility policy is recorded in `docs/spec/decisions/ADR-0024-public-api-import-and-layer-conventions.md`.
