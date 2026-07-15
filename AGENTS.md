# BatonFX

## Purpose

BatonFX is a standalone, non-durable, Effect-native agent framework built on `effect/unstable/ai`. It ships focused packages for the agent loop, providers, MCP, skills, memory, transport, FoldKit, and deterministic tests. Baton must never depend on Relay or any durable runtime.

## Effect is non-negotiable

- **All code in this repository MUST be Effect-native and Effect-idiomatic. This is the primary engineering constraint, not a preference.** It applies to production code, tests, scripts, CLIs, adapters, and examples—not only services. A change that works but is not idiomatic Effect is not complete.
- **Effect research is a required stop gate before coding.** Before designing or implementing a capability, search the pinned `effect` source, types, tests, and package exports in `node_modules` for an existing module, service, data type, combinator, platform integration, or test utility. Do not rely on memory, generic TypeScript habits, or stale examples. If Effect ships the capability, use it.
- **Do not write typical Promise-based TypeScript.** No `async`/`await`, raw `Promise` construction, Promise-returning internal APIs, `Promise.all`/`race`/`allSettled`, or chains of `.then()`/`.catch()` as the program model. Do not use a Promise implementation as an intermediate step and wrap it in `Effect` afterward.
- Model programs as typed values. Use `Effect` for sequencing and failures; `Context` and `Layer` for dependencies; `Schema` for validation; `Stream`/`Sink`/`Channel` for streaming; `Scope` and `Effect.acquireRelease` for lifecycles; `Schedule` for retry and repetition; `Fiber`, `Queue`, `PubSub`, `Deferred`, `Ref`, and other Effect concurrency primitives for coordination.
- Use typed errors in the `Effect` error channel. Do not throw for expected failures, erase errors to `unknown`, or catch broadly and convert failures to generic exceptions. Keep requirements and failure types visible in public and internal signatures.
- Use Effect platform services instead of raw globals and runtime APIs whenever an Effect API exists. This includes time, sleep, randomness, environment/config, logging, tracing, metrics, filesystem, paths, terminal, processes, HTTP, sockets, signals, and cancellation. Calls such as `Date.now`, `setTimeout`, `Math.random`, direct `process.env`, raw `fetch`, and direct filesystem APIs are forbidden when Effect provides the concern.
- A Promise, callback, or raw platform API is allowed only at the outermost integration boundary when no Effect-native module exists. Prove that absence by searching Effect first. Keep the interop in one adapter, convert it immediately with the appropriate Effect constructor, map defects and rejection values into typed errors, preserve cancellation and resource safety, and expose only an Effect-native interface.
- Do not recreate Effect APIs with local helpers, weaken Effect types for convenience, hide non-Effect code behind an Effect-shaped wrapper, or build parallel abstractions for capabilities Effect already owns. Using Effect only at the final call site is not Effect-native.
- When touching existing Promise-based or raw-platform code, do not copy or extend that pattern. Migrate the affected path to Effect as part of the change unless it is a documented unavoidable outer boundary.
- Treat Effect violations as review blockers. Before reporting completion, inspect the changed code for `async`, `await`, `Promise`, `.then`, `.catch`, raw timers, thrown expected errors, and direct platform APIs; justify every unavoidable boundary in the final report.
- Prefer the full source and tests for the repository's exact pinned Effect version over generated declarations, human-oriented documentation, blogs, or remembered patterns. Read Effect's `LLMS.md` when an exact-version source checkout provides it. Never use source from a different Effect version as API truth.
- Keep pure computations pure; Effect-native does not mean wrapping deterministic data transformations in `Effect.sync`. Introduce `Effect` where there is failure, a requirement, asynchrony, resource ownership, observability, or another real effect.
- Effects must remain lazy and composable. Do not execute Effects during module initialization or inside library code. Calls to `Effect.runSync`, `Effect.runPromise`, `Effect.runFork`, and related runners belong only at explicit application, process, test-host, or external-framework boundaries.
- Preserve structured concurrency and resource safety. Do not create detached work, unscoped resources, unbounded concurrency, or unbounded queues. Every forked fiber has an owner, every acquired resource has a scoped release, and concurrency and buffering limits come from an explicit policy.
- Retries and repetition must use `Schedule`, be finite or otherwise deliberately bounded, and be safe for the operation being repeated. Do not retry non-idempotent side effects without an explicit idempotency design.
- Tests must use Effect's test integrations and deterministic services when the behavior is Effectful. Prefer `@effect/vitest`, test layers, `TestClock`, and Effect coordination primitives over running Effects through Promises, real sleeps, or timing guesses.
- Do not silence Effect diagnostics with casts, `any`, `unknown` error channels, broad catch handlers, diagnostic suppression comments, or premature `Effect.run*` calls. Fix the model so success, failure, requirements, lifetime, and concurrency remain visible in the types.
- Completion reports for Effect changes must name the Effect source modules or local examples consulted and confirm that errors, requirements, runtime boundaries, resource lifetimes, and concurrency were reviewed—not merely that tests passed.

## Repository layout

| Directory         | Purpose                                                                    |
| ----------------- | -------------------------------------------------------------------------- |
| `packages/core`   | `@batonfx/core` — the Effect-native agent loop.                            |
| `packages/test`   | `@batonfx/test` — scripted model fixtures and normalized request capture.  |
| `packages/*`      | Optional provider, MCP, skill, memory, transport, and UI adapter packages. |
| `docs/spec/`      | Specification tree: the agent-loop and package contracts plus ADRs.        |
| `ast-grep/rules/` | Structural lint rules, including the `@relayfx/*` import ban.              |
| `repos/effect/`   | Read-only latest Effect `main` source for API and pattern research.        |

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
- `repos/effect` tracks the latest upstream `main` as a read-only research submodule. Never edit, format, lint, build, test, or import application code from this directory. Use it to discover current Effect capabilities and patterns. The installed pinned package source and types remain the compile-time API truth. If latest source has an API the pinned package does not, upgrade the dependencies before using it. After a pull, the installed Git hook discovers and updates every direct submodule declared in `.gitmodules`; future submodules require no hook changes. Run `bun run vendor:setup` once after cloning, or `bun run vendor:update` when a manual refresh is needed.
- Use Bun as package manager and script runner, `@effect/vitest`/Vitest for tests, Turbo for task orchestration, oxlint + ast-grep for linting, and Prettier for formatting.
- The `effect` version is pinned once in the root `package.json` `catalog`; packages consume `effect: "catalog:"` so they never drift.
- Package tests live under `test/`, mirroring `src/` paths.

## Commands

```bash
bun install
bun run format        # prettier --write .
bun run format:check
bun run lint          # oxlint + ast-grep
bun run check         # all required repository gates except coverage
bun run typecheck     # strict Effect diagnostics + turbo tsc --noEmit
bun run test          # turbo vitest
bun run test:coverage
bun run build         # turbo package and app builds
bun run package:smoke # packed Node and Bun consumers
```

## For AI agents

- Start with `CONTEXT.md` and `SPEC.md` before changing architecture.
- Follow `SPEC.md` into `docs/spec/01-baton-agent-framework.md` for the loop contract.
- Stop and update the spec/ADR first when code would introduce a new public type, service, seam, or runtime invariant not covered by the spec tree.
- For library APIs, grep `node_modules` first for matching declarations and examples.
- Do not create `utils/`, `helpers/`, `common/`, or `lib/` catch-all directories.

## Greenfield changes

- Baton is a greenfield project used only by repositories we control. Do not preserve legacy code, APIs, signatures, schemas, configuration shapes, protocols, or behavior for compatibility.
- No public or internal API signature is protected. Change or remove any contract when the better design requires it, then update every caller, test, fixture, spec, and example in the same change.
- Do not add deprecation periods, compatibility layers, version negotiation, fallbacks, shims, dual read/write paths, or parallel old/new implementations unless the task explicitly requires them.
- Prefer one current contract and a clean break. Replace or reset obsolete local state instead of teaching runtime code to support multiple generations.
