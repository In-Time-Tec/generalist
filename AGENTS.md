# Generalist

Generalist is an Effect-native agent framework over `effect/unstable/ai`. The `generalist` package provides the process-local agent loop and optional durable Runtime; `generalist/pg`, `generalist/mysql`, `generalist/cloudflare`, and `generalist/rivet` provide host-specific storage and runtime adapters. Core stays usable without Relay or another durable runtime.

## Commands

Use the Bun version pinned in `package.json` and the committed lockfile.

```bash
bun install --frozen-lockfile # install the locked workspace
bun run dev                   # preview the Mintlify docs
bun run build                 # build every workspace
bun run format                # write formatting changes
```

Run the narrowest useful check while editing:

```bash
bun --bun vitest run packages/generalist/test/<path>.test.ts --no-file-parallelism
bun run --cwd packages/generalist typecheck
bun node_modules/prettier/bin/prettier.cjs --check <paths>
```

Replace the test path as needed; adapter suites live under `packages/generalist/test/{pg,mysql,cloudflare,rivet}`. PostgreSQL tests require `GENERALIST_DATABASE_URL` or `DATABASE_URL`; MySQL tests require `GENERALIST_MYSQL_URL` or `MYSQL_URL`. These suites skip when their database is unavailable, and a skipped suite is not conformance evidence.

Before review, run the full checks:

```bash
bun run check # build, formatting, repository rules, lint, and typecheck; no tests
bun run test  # build and run the complete Vitest suite
```

For changes to public exports, package manifests, dependencies, or release output, build and pack the package with Bun and inspect the resulting manifest.

## Boundaries

- Never import `@relayfx/*` from Generalist; repository checks enforce the standalone core boundary.
- Use Effect AI `Prompt`, `Response`, `Tool`, and `Toolkit` directly. Do not add a parallel payload or tool format.
- Keep Effects lazy and run them only at process, framework, or test-host boundaries. Preserve typed failures, requirements, interruption, scopes, and bounded concurrency.
- Use Effect platform services instead of raw filesystem, process, HTTP, time, randomness, socket, or terminal APIs when Effect owns that boundary. Every resource and fiber needs a visible scope owner.
- Use `Schema` at serialized and untrusted boundaries. Boundary failures use `Schema.TaggedErrorClass`; behavior-bearing service seams provide a test or memory Layer.
- Public exports remain `@experimental` while Effect AI is unstable. Prefer direct imports and intentional package-root namespaces; do not add wrapper barrels or generic `utils`, `helpers`, `common`, or `lib` directories.
- `make` constructs an in-memory value, `register` records it for lookup, and `start` begins a hosted Runtime `Execution`. Layer constructors are named `layer` or `layer<Noun>`.
- Tests use `@effect/vitest`, deterministic Effect services, and live under `test/` mirroring `src/`.
- Inspect pinned Effect source and types in `node_modules` before using an unfamiliar API. `repos/effect` is read-only reference material: never edit, import, format, build, or test it.
- This project is pre-1.0 and has no compatibility promise. Keep one current contract, update all callers, and delete replaced paths instead of adding shims.

`PRODUCT.md` owns audience, direction, and exclusions. `CONTEXT.md` owns vocabulary, authority, and system boundaries. `PLAN.md` owns unfinished work, target contracts, dependency order, deletion scope, and release acceptance; it does not describe shipped behavior. `docs/features/` records current behavior and invariants. `docs/decisions/` records durable reasons, and `docs/tradeoffs/` records meaningful gains and costs. Package READMEs and the Mintlify guides in `docs/` own public usage.

Package manifests and `.github/workflows/publish.yml` own the release train. Do not introduce another package list, version, or artifact authority.

## Durable Runtime checks

`generalist/testing/runtime-driver` is the authoritative capability-based driver suite. Add shared expectations there and register only capabilities a driver implements; do not copy generic conformance tests into each driver. Memory and PostgreSQL register the suite directly. MySQL and Cloudflare also have backend-specific package suites.

```bash
bun --bun vitest run \
  packages/generalist/test/testing/runtime-driver/index.test.ts \
  packages/generalist/test/pg/index.test.ts \
  --no-file-parallelism --maxWorkers=1
bun --bun vitest run packages/generalist/test/pg packages/generalist/test/mysql packages/generalist/test/cloudflare --no-file-parallelism
```

Persistence or replay changes must exercise a close/reopen or fresh-Layer boundary, recovery of interrupted operations, and strict replay from an authoritative cursor without redispatch. Start with:

```bash
bun --bun vitest run \
  packages/generalist/test/runtime/execution/recovery/exclusive.test.ts \
  packages/generalist/test/runtime/memory/store/operation/recovery.test.ts \
  packages/generalist/test/runtime/sql/store.test.ts \
  packages/generalist/test/transport/replay.test.ts \
  --no-file-parallelism
```

## Release

The public package is `generalist`; the `generalist/pg`, `generalist/mysql`, `generalist/cloudflare/*`, and `generalist/rivet/actors` adapters are subpath exports of that one package, not separately published packages. Root and package manifest versions match exactly. Do not publish from a workstation.

A release change must:

1. Add the user-visible change to `CHANGELOG.md`.
2. Set one lockstep semantic version in the root manifest and `packages/generalist/package.json`.
3. Pass `bun run check` and `bun run test` with PostgreSQL and MySQL available.
4. Build and pack from one exact detached commit. Local packaging from a dirty worktree is not commit evidence.
5. Land the exact release commit on `main`, then create the immutable `v<version>` tag at that commit.
6. Push the tag to start `.github/workflows/publish.yml`. The workflow builds once, passes the same checksummed assets to GitHub and npm, and checks registry integrity. Manual dispatch only reconciles an existing tag and requires the tag plus its full 40-character commit SHA.

Pushing branches or tags, merging, publishing, and deploying change shared state; do them only when the user explicitly asks.

Keep root scripts limited to supported workflows. Pass focused arguments to the underlying tool instead of adding aliases for Git, status, logs, watch, coverage, or other trivial commands.
