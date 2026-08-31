# Package distribution

Generalist ships as one `generalist` package: compiled ESM and declarations are selected through explicit subpath exports. Host adapters are import subpaths, not separately published packages, and their dependencies are optional peers.

## Usage

```sh
# Core-only consumer
bun add generalist effect

# Add only the peers required by an imported adapter
bun add @effect/sql-pg pg
```

```ts
import { Agent } from "generalist"
import { Runtime } from "generalist/runtime"
import { layer, RuntimeSchema } from "generalist/pg"
```

```sh
# Contributor/release verification; writes into release/
PACKAGE_ARTIFACT_DIR=release bun run package
sha256sum --check release/SHA256SUMS
```

The imports resolve to `dist/*.js` plus `dist/*.d.ts`; the package command builds, packs, installs, imports, bundles, and checks the exact release tarball.

## What runs

```text
bun run package
└── bun scripts/package-smoke.ts
    ├── build packages/generalist once
    ├── pack generalist-0.45.1.tgz
    │   ├── resolve workspace:/catalog: versions
    │   └── validate inventory, MIT license, exports, size
    ├── inspect dist runtime graph and declarations
    ├── install exact tarball in fresh consumers
    │   ├── Bun: isolated minimum-peer profiles
    │   └── npm/Node: isolated minimum-peer profiles
    ├── import every profile subpath
    │   ├── generalist, generalist/runtime
    │   ├── generalist/pg, generalist/mysql
    │   └── generalist/rivet/actors, provider leaves
    ├── verify Worker graphs and emitted modules
    │   ├── Wrangler: no forbidden modules
    │   └── pinned workerd: initialize, no compat flags
    └── write release/
        ├── generalist-0.45.1.tgz
        ├── release-evidence.json
        └── SHA256SUMS
```

## Release flow

```text
commit: package.json = packages/generalist/package.json = 0.45.1
   │ tag v0.45.1 (must be on main and release)
   ▼
.github/workflows/publish.yml
├── validate immutable tag + 40-character commit identity
├── run bun run package once
├── attest and upload the same 3 checksummed assets
├── publish that exact .tgz to npm (no rebuild)
└── verify npm registry integrity
```

A manual workflow run only reconciles an existing immutable tag and its exact commit.

## Invariants

- The only published package is `generalist`; `generalist/pg`, `generalist/mysql`, the three `generalist/cloudflare/*` entries, and `generalist/rivet/actors` are subpath exports.
- The package contains only the allowlisted `dist`, `LICENSE`, and `README.md` payload, with consistent MIT metadata and a compressed size ceiling of 1,200,000 bytes.
- Export maps target built `.js` and `.d.ts` files under `dist/`, with `types` before `import`; repository TypeScript and source maps are not consumer inputs.
- The package is pure ESM, declares `sideEffects: false`, and intentionally does not support CommonJS; smoke verification rejects CommonJS loading of `generalist/rivet/actors`.
- Supported engines are Node `>=22` and Bun `>=1.4.0`.
- Effect and third-party integrations stay external. `effect` is one exact peer; every other integration dependency is an optional peer resolved from the workspace catalog during packing.
- Root and package manifest versions are identical. Packing does not mutate the source manifest and leaves no unresolved `workspace:` or `catalog:` protocols.
- Export verification covers every exact manifest export and resolves wildcard examples as concrete specifiers rather than testing a literal `*` path.
- Package verification rejects unsafe inventory, missing exports, inconsistent dependencies or license metadata, declaration references to unavailable subpaths, runtime import cycles, and oversized output.
- Fresh Bun and npm/Node consumers install the exact tarball and prove one physical installation of the workspace-pinned Effect release candidate.
- Core, generic Runtime, and provider-neutral leaves require only `effect`; `generalist/ai/deterministic` is provider-free.
- Optional provider, MCP, FoldKit, A2A, AG-UI, and test-host profiles install only their declared peer set and reject unrelated peers.
- SQLite is a separate Bun-only profile using `@effect/sql-sqlite-bun`.
- `generalist/pg` and `generalist/mysql` import under Bun and Node with SQL driver peers and expose `layer` and `RuntimeSchema`.
- `generalist/rivet/actors` imports under Bun and Node with `rivetkit` and `@standard-schema/spec`; its declaration dependency and single Effect installation are verified.
- `generalist/cloudflare/workers`, `generalist/cloudflare/durable-objects`, and `generalist/cloudflare/dynamic-workers` bundle and initialize under workerd; `generalist/cloudflare` is deliberately not exported.
- Worker-safe Core, MCP HTTP/OAuth, Runtime, and OpenRouter entrypoints are bundled separately with Wrangler, without Node compatibility flags.
- Worker graph checks reject Node/Bun builtins, stdio, SQL drivers, SQLite, AWS/Bedrock, and provider dependencies from neutral bundles; pinned real `workerd` must also initialize each emitted module.
- A successful Worker bundle alone is insufficient: both the forbidden-module graph gate and workerd initialization must pass.
- Consumer failures identify the profile, runtime, specifier, and missing or unexpected package.
- One package run emits exactly one versioned tarball, `release-evidence.json`, and `SHA256SUMS`.
- A `v<version>` tag publishes those same checksummed assets to GitHub and the unchanged tarball to npm; publication verifies registry integrity and never rebuilds downstream artifacts.

## Related

- Source: `packages/generalist/package.json`, `scripts/package-smoke.ts`, `.github/workflows/publish.yml`
- Site: `/docs/start/installation`
- Decisions/tradeoffs: `../decisions/compiled-packages.md`
