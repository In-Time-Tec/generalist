# TenetKit

TenetKit is an Effect-native agent framework over `effect/unstable/ai`. The `tenetkit` package provides the
process-local agent loop and an optional durable Runtime; `@tenetkit/pg`, `@tenetkit/mysql`, and
`@tenetkit/cloudflare` provide host-specific storage and runtime adapters.

## Commands

Use the Bun version pinned in `package.json`.

```bash
bun install --frozen-lockfile       # install the locked workspace
bun run dev                         # run the docs app
bun run build                       # build every workspace
bun run format                      # format the repository
```

Run the narrowest useful check while editing:

```bash
bun --bun vitest run packages/tenetkit/test/<path>.test.ts --no-file-parallelism
bun --cwd packages/tenetkit run typecheck
bun --cwd packages/pg run test
bun prettier --check <paths>
```

Replace the package directory or test path as needed. PostgreSQL tests require `TENETKIT_DATABASE_URL` (or
`DATABASE_URL`), and MySQL tests require `TENETKIT_MYSQL_URL` (or `MYSQL_URL`); those suites skip when their database
is unavailable.

Before review, run the full checks:

```bash
bun run check                        # build, formatting, repository rules, lint, and typecheck
bun run test                         # build and run the complete Vitest suite
```

For changes to public exports, package manifests, dependencies, or release output, also run:

```bash
bun run package
```

This is the representative downstream compatibility check. It packs all four public packages, validates their
contents and export maps, installs the tarballs into clean isolated Bun and npm consumers, typechecks and bundles a
consumer, imports the public entrypoints under Node and Bun, and verifies that consumers get one Effect installation.

## Boundaries

- Core must stay usable without Relay or another durable runtime. Never import `@relayfx/*` from TenetKit; repository
  checks enforce this.
- Use Effect AI `Prompt`, `Response`, `Tool`, and `Toolkit` directly. Do not add a parallel payload or tool format.
- Keep Effects lazy and run them only at process, framework, or test-host boundaries. Preserve typed failures,
  requirements, interruption, scopes, and bounded concurrency.
- Use Effect platform services instead of raw filesystem, process, HTTP, time, randomness, socket, or terminal APIs
  when Effect owns that boundary. Every resource and fiber needs a visible scope owner.
- Use `Schema` at serialized and untrusted boundaries. Boundary failures use `Schema.TaggedErrorClass`; behavior-bearing
  service seams provide a test or memory Layer.
- Public exports remain `@experimental` while Effect AI is unstable. Prefer direct imports and intentional package-root
  namespaces; do not add wrapper barrels or generic `utils`, `helpers`, `common`, or `lib` directories.
- `make` constructs an in-memory value, `register` records it for lookup, and `start` begins a hosted Runtime
  `Execution`. Layer constructors are named `layer` or `layer<Noun>`.
- Tests use `@effect/vitest`, deterministic Effect services, and live under `test/` mirroring `src/`.
- Inspect the pinned Effect source and types in `node_modules` before using an unfamiliar API. `repos/effect` is
  read-only reference material: never edit, import, format, build, or test it.
- This project is pre-1.0 and has no compatibility promise. Keep one current contract, update all callers, and delete
  replaced paths instead of adding shims.

`PRODUCT.md` owns product direction and exclusions. `CONTEXT.md` owns vocabulary and system boundaries. `PLAN.md` owns
unfinished work and dependency order. `docs/features/` records current behavior; package READMEs and the docs app own
public usage.

## Release

Do not publish from a workstation. A release change must:

1. Add the user-visible change to `CHANGELOG.md`.
2. Set one lockstep semantic version in the root manifest and
   `packages/{tenetkit,pg,mysql,cloudflare}/package.json`.
3. Pass `bun run check`, `bun run test` with PostgreSQL and MySQL available, and `bun run package`.
4. Land the exact release commit on both `main` and `release`, then create the immutable `v<version>` tag at that
   commit.
5. Push the tag to start `.github/workflows/publish.yml`. That workflow rebuilds and verifies the package assets,
   publishes one GitHub release and the four exact tarballs to npm, and checks registry integrity. Its manual dispatch
   is only for reconciling an existing tag and requires the tag plus its full 40-character commit SHA.

Pushing branches or tags, merging, publishing, and deploying change shared state; do them only when the user explicitly
asks.
