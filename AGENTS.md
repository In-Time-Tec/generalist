# BatonFX

BatonFX is a standalone, non-durable, Effect-native agent framework over `effect/unstable/ai`. It must never depend on Relay or another durable runtime.

## Contracts and docs

- Baton is pre-1.0. Keep one current contract; update every caller and delete superseded paths instead of adding compatibility versions unless a staged migration is explicitly required.
- `PRODUCT.md` owns product direction, audience, and exclusions. Do not turn it into a feature list.
- `CONTEXT.md` owns vocabulary, ownership, and system boundaries.
- `docs/features/` states current behavior and rules code relies on. `docs/decisions/` records an important choice and its reason. `docs/tradeoffs/` records a meaningful gain, cost, and rejected option only when useful.
- Keep internal docs standalone and minimal. Do not add numbered architecture records, status/date/author metadata, templates, indexes, ledgers, repeated related-doc lists, history, or plans. Do not add Markdown meaning, structure, or snippet validation.
- Public user guides live in the docs app and package READMEs. README files own use and setup.

## Effect TypeScript

- Write Effect-native programs: typed Effects, services, Layers, schemas, streams, scopes, schedules, and structured concurrency. Do not build Promise-first code and wrap it later.
- Before using an Effect API, inspect the pinned source and types in `node_modules`. `repos/effect` is read-only research material; never edit, format, lint, test, build, or import from `repos/*`.
- Keep expected failures typed. Preserve requirements, interruption, resource lifetimes, and bounded concurrency in public signatures.
- Use Effect platform services instead of raw time, randomness, environment, filesystem, process, HTTP, socket, and terminal APIs when Effect owns the concern.
- Runtime execution belongs only at process, test-host, or framework boundaries. Every resource and fiber must have a visible owner.
- Tests use `@effect/vitest`, test Layers, and deterministic Effect services. Tests live under `test/`, mirroring `src/`.

## Code and packages

- Baton depends on `effect` only. Never import `@relayfx/*`; ast-grep enforces this.
- Use Effect AI `Prompt`, `Response`, `Tool`, and `Toolkit` directly. Do not add a second payload or tool format.
- Follow the construction-verb canon: `make` constructs an in-memory value, `register` records it for later lookup, and `start` is reserved for beginning a durable host `Execution`. Do not use `create` as a synonym for `make` or `register`.
- Name Layer constructors `layer` or with a noun after `layer` (`layerMemory`, `layerNoop`, `layerIdentity`, `layerConfig`). Put parameters in `layer(options)`; do not add Layer aliases or flag-in-a-name variants.
- Model boundary failures with `Schema.TaggedErrorClass`, tag them `@<scope>/<package>/<Name>`, and name the class for the failure condition without forcing an `Error` suffix.
- Every exported symbol carries `@experimental` while Effect AI is unstable.
- Public modules use intentional package-root namespaces. Services expose `Interface`, `Context.Service`, explicit Layers, schema-backed boundary errors, and a `layerTest` or `layerMemory` for behavior-bearing seams.
- Prefer direct imports. Do not add wrapper files, catch-all `utils`/`helpers`/`common`/`lib` directories, or namespace imports.
- Keep each package `src` file under 500 lines; `oxlint`'s `max-lines` rule enforces it. A few cohesive engine files are recorded exceptions in `.oxlintrc.json`; split a file rather than adding to that list.
- Do not put rationale in code comments. Put stable behavior in types, tests, `CONTEXT.md`, feature docs, decision docs, tradeoff docs, or package READMEs.

## Commands

Use Bun, Turbo, oxlint, ast-grep, Prettier, and Vitest. Root scripts are supported workflows, not shortcuts for every tool invocation.

```bash
bun install
bun run dev
bun run format
bun run typecheck
bun run test
bun run build
bun run check
bun run package
```

Keep the core command set small and use no colon-named root scripts. Real package, release, migration, and install workflows may have plain names. Do not add aliases for Git, vendored repositories, Docker, status, logs, watch, coverage, or trivial underlying tool commands. Pass arguments to the supported command or invoke the tool directly.

## GREENFIELD PROJECT — BREAKING CHANGES ARE WELCOME!!!

- THIS PROJECT HAS NO USERS!!! IT IS GREENFIELD!!!
- DO NOT ASSUME THAT THE EXISTING FOUNDATION, ARCHITECTURE, OR IMPLEMENTATION IS CORRECT!!! BE SKEPTICAL, INVESTIGATE THE REAL PROBLEM, AND VERIFY THE BEST APPROACH!!!
- CHANGE THE UNDERLYING FOUNDATION OR ARCHITECTURE WHEN EVIDENCE SHOWS THAT A DIFFERENT DESIGN IS BETTER!!! LARGE REFACTORS ARE ENCOURAGED WHEN THEY PRODUCE THE RIGHT LONG-TERM SYSTEM!!!
- IMPLEMENT THE RIGHT FIX THAT WILL SCALE LONG TERM, NOT THE SMALLEST PATCH!!! DO NOT PAPER OVER A DESIGN PROBLEM WITH A LOCAL WORKAROUND!!!
- BREAKING CHANGES ARE WELCOME!!! DO NOT PRESERVE LEGACY CODE OR BACKWARD COMPATIBILITY!!! REMOVE REPLACED CODE, OBSOLETE PATHS, AND TRANSITIONAL SHIMS!!!
