# ADR-0022 — Baton publishes compiled ESM package artifacts

## Status

Accepted.

## Context

Baton packages exported TypeScript source while also packing unused Bun bundles, tests, and Turbo state. Bun consumers could execute the source, but direct Node consumers could not. Bundling every dependency into every entrypoint also made small adapter packages disproportionately large.

## Decision

Every Baton package publishes Node-compatible ESM JavaScript and declarations from `dist/`. TypeScript emits package-owned source without bundling package dependencies; export maps reference only those outputs. Tarballs use explicit file allowlists. Releases are coordinated, manual, dry-run capable, and proven by clean Bun and Node consumers before publication.

## Consequences

Consumers no longer need a TypeScript loader for dependencies. Package artifacts are smaller and their runtime dependency closure remains visible in package manifests. Source relative imports use explicit `.js` specifiers so emitted declarations are valid ESM. Adding a public subpath requires updating its export map, build entrypoints, and package smoke coverage.

## Rejected alternatives

- **Continue publishing TypeScript source:** rejected because Node does not strip TypeScript inside `node_modules` and the runtime contract would remain Bun/bundler-specific.
- **Bundle all dependencies into every entrypoint:** rejected because it duplicates Effect and provider code, obscures dependency identity, and produces multi-megabyte adapter packages.
- **Adopt another unified toolchain for packaging:** rejected because Bun, TypeScript, Turbo, and Vitest already cover the required build and verification responsibilities.

## Related docs

- `docs/spec/14-package-distribution.md`
- `README.md`
