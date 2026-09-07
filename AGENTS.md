# Generalist

Generalist is an Effect-native agent framework over `effect/unstable/ai`. The `generalist` package provides the process-local agent loop and optional durable Runtime. `generalist/durability` is the sole production durability engine, with S3 and native R2 transports. Local processes, servers, Cloudflare Durable Objects, and Rivet actors are independent compute hosts, not storage backends. Core stays usable without storage, Relay, or another durable runtime.

## Commands

Use Bun 1.4.0, pinned in `package.json`, and the committed lockfile.

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

Replace the test path as needed; object-engine tests live under `packages/generalist/test/durability`, and compute-host suites under `test/{cloudflare,rivet}`. Local integration uses Docker-backed MinIO and persistent Miniflare/workerd; it needs no external service credentials. A skipped suite is not conformance evidence.

Before review, run the full checks:

```bash
bun run check # build, formatting, repository rules, lint, and typecheck; no tests
bun run test  # build and run the complete Vitest suite
```

For changes to public exports, package manifests, dependencies, or release output, also run:

```bash
PACKAGE_ARTIFACT_DIR=release bun run package
```

This is the downstream compatibility check. It packs the public package, validates every exact manifest export plus concrete wildcard examples, installs the tarball in fresh Bun-isolated, core-only, and npm consumers, typechecks and bundles a consumer, imports public entrypoints under Node and Bun, and verifies one Effect installation. It writes one tarball, `release-evidence.json`, and `SHA256SUMS`.

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
- The clean v1 contract has no Generalist SQL backends, alternate production memory/filesystem Runtime, compatibility readers, aliases, or legacy migration path. Use fresh namespaces; never delete production objects to repair recovery.
- Retained history, immutable command receipts, and incurred costs survive rewind. Exact command retries return the original receipt, including its original `duplicate` field. Preserve caller command identities across ambiguous outcomes.

`PRODUCT.md` owns audience, direction, and exclusions. `CONTEXT.md` owns vocabulary, authority, and system boundaries. `PLAN.md` owns unfinished work, target contracts, dependency order, deletion scope, and release acceptance; it does not describe shipped behavior. `docs/features/` records current behavior and invariants. `docs/decisions/` records durable reasons, and `docs/tradeoffs/` records meaningful gains and costs. Package READMEs and the Mintlify guides in `docs/` own public usage.

Package manifests, `scripts/package-smoke*.ts`, and `.github/workflows/publish.yml` own the release train. Do not introduce another package list, version, or artifact authority.

## Durable Runtime checks

`generalist/testing/runtime-driver` is the authoritative capability-based driver suite. Add shared expectations there and register only capabilities a host implements; do not copy generic conformance tests into each host. `generalist/testing/durability` is a test-only object simulator, not another production Runtime.

```bash
bun --bun vitest run \
  packages/generalist/test/testing/runtime-driver/index.test.ts \
  packages/generalist/test/durability \
  --no-file-parallelism --maxWorkers=1
bun --bun vitest run packages/generalist/test/cloudflare packages/generalist/test/rivet --no-file-parallelism
```

Persistence or replay changes must exercise a close/reopen or fresh-Layer boundary, recovery of interrupted operations, and strict replay from an authoritative cursor without redispatch. Start with:

```bash
bun --bun vitest run \
  packages/generalist/test/runtime/execution/recovery/exclusive.test.ts \
  packages/generalist/test/durability/internal/runtime.test.ts \
  packages/generalist/test/transport/replay.test.ts \
  --no-file-parallelism
```

The object Runtime entrypoint also registers the branch-evidence suite.

Local transport qualification runs `packages/generalist/test/durability/object-store.test.ts` against MinIO and the pinned Miniflare/workerd runtime, including restart and shared-bucket native/S3 gateway cases. The committed Miniflare exact-EOF range patch is part of that local evidence; it does not certify AWS S3 or deployed R2. Do not request cloud credentials or run remote qualification as part of local acceptance. Preserve protocol assumptions, seeds, runtime versions, and workload bounds with verification results; performance and full acceptance require their own evidence.

## Release

The public package is `generalist`; `generalist/durability/s3`, `generalist/durability/r2`, `generalist/unstable/cloudflare/*`, and `generalist/unstable/rivet` are subpath exports of that one package, not separately published packages. Root and package manifest versions match exactly. Do not publish from a workstation.

A release change must:

1. Add the user-visible change to `CHANGELOG.md`.
2. Set one lockstep semantic version in the root manifest and `packages/generalist/package.json`.
3. Pass `bun run check`, `bun run test` with local MinIO and Miniflare/workerd available, and `bun run package`. Report local qualification separately from untested live AWS/R2 behavior.
4. Use the `generalist-release` skill to produce and verify artifacts from one exact detached commit. Local packaging from a dirty worktree is not commit evidence.
5. Land the exact release commit on `main`, require successful main CI at that commit, then create the immutable `v<version>` tag there.
6. Push the tag to start `.github/workflows/publish.yml`. The workflow builds once, passes the same checksummed assets to GitHub and npm, and checks registry integrity. Manual dispatch only reconciles an existing tag and requires the tag plus its full 40-character commit SHA.

Pushing branches or tags, merging, publishing, and deploying change shared state; do them only when the user explicitly asks.

Keep root scripts limited to supported workflows. Pass focused arguments to the underlying tool instead of adding aliases for Git, status, logs, watch, coverage, or other trivial commands.
