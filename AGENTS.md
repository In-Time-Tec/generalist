# BatonFX

## Purpose

BatonFX is a standalone, non-durable, Effect-native agent framework built on `effect/unstable/ai`. It ships focused packages for the agent loop, providers, MCP, skills, memory, transport, FoldKit, and deterministic tests. Baton must never depend on Relay or any durable runtime.

## Repository layout

| Directory         | Purpose                                                                    |
| ----------------- | -------------------------------------------------------------------------- |
| `packages/core`   | `@batonfx/core` — the Effect-native agent loop.                            |
| `packages/test`   | `@batonfx/test` — scripted model fixtures and normalized request capture.  |
| `packages/*`      | Optional provider, MCP, skill, memory, transport, and UI adapter packages. |
| `docs/spec/`      | Specification tree: the agent-loop and package contracts plus ADRs.        |
| `ast-grep/rules/` | Structural lint rules, including the `@relayfx/*` import ban.              |

## Current standards

- Read `CONTEXT.md` for vocabulary and `SPEC.md` → `docs/spec/` for the contract before changing behavior.
- Do not implement a public contract, service, seam, or runtime behavior not described in the spec tree. Update the spec doc (and add/amend an ADR under `docs/spec/decisions/`) before changing code.
- Do not put comments in code. Put rationale in `AGENTS.md`, `CONTEXT.md`, `SPEC.md`, `docs/spec/`, or the package README.
- **Baton depends on `effect` only.** Never import from `@relayfx/*` or any durable-runtime schema/event-log/database package — the `no-relayfx-imports` ast-grep rule enforces this.
- Payload vocabulary is Effect AI `Prompt`/`Response` from `effect/unstable/ai`. Add loop framing only, no second wire format.
- Every exported symbol carries an `@experimental` JSDoc tag while `effect/unstable/ai` is unstable.
- Follow the module shape used throughout the packages: intentional public module namespaces, an exported `Interface`, a `Context.Service`, typed service-boundary errors via `Schema.TaggedErrorClass`, and explicit `Layer` values. Do not add wrapper or re-export files solely to rename imports, avoid a direct import, or work around an alias.
- Every behavior-bearing seam exposes a test or memory layer (`testLayer`) so tests swap implementations through Effect layers.
- Keep runtime code Effect-native: use Effect primitives for concurrency, time, randomness, config, logging, streams, scopes, schemas, and errors. No `Date.now()` or raw platform APIs.
- Do not use namespace imports. Prefer importing exported names directly. Use an alias only for a real local-name collision or provider variant; do not create wrapper or re-export files just to avoid an alias.
- Before using or changing an Effect / Effect AI / Vitest API, inspect the installed package source in `node_modules` with `rg`/`sed`. Prefer the pinned local implementation over memory or stale docs.
- Use Bun as package manager and script runner, `@effect/vitest`/Vitest for tests, Turbo for task orchestration, oxlint + ast-grep for linting, and Prettier for formatting.
- The `effect` version is pinned once in the root `package.json` `catalog`; packages consume `effect: "catalog:"` so they never drift.
- Package tests live under `test/`, mirroring `src/` paths.

## Commands

```bash
bun install
bun run format        # prettier --write .
bun run format:check
bun run lint          # oxlint + ast-grep
bun run typecheck     # turbo tsc --noEmit
bun run test          # turbo vitest
bun run test:coverage
bun run build         # turbo bun build
```

## For AI agents

- Start with `CONTEXT.md` and `SPEC.md` before changing architecture.
- Follow `SPEC.md` into `docs/spec/01-baton-agent-framework.md` for the loop contract.
- Stop and update the spec/ADR first when code would introduce a new public type, service, seam, or runtime invariant not covered by the spec tree.
- For library APIs, grep `node_modules` first for matching declarations and examples.
- Do not create `utils/`, `helpers/`, `common/`, or `lib/` catch-all directories.
