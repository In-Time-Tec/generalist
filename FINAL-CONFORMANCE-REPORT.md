# BatonFX Effect v4 Lint Conformance — Final State

Branch: `lint/conformance` (42 commits on top of `main` @ ce1f6e4)
Worktree: `/Users/dallen.pyrah/projects/.worktrees/batonfx-lint-conformance`

## Headline numbers

| Gate | Before (main baseline) | Now |
| --- | --- | --- |
| `bunx oxlint packages apps examples scripts test` | 1,389 errors | **23 errors** |
| `bunx tsc --noEmit` | 0 | **0** |
| `bun --bun vitest run` | 1,168 pass | **1,168 pass / 0 fail** |
| `repository-policy` / `install-preflight` / `repository-graph` / `package` | — | **all PASS** |

## What was fixed (wave summary)

- **W17** — Runnable scripts: `repository-graph` split into entry + core (bun 1.3.14 tsgo parser bug workaround — 8+ named imports from `"effect"` including `ManagedRuntime`, or trailing calls after large generators, crash the parser; split files avoid it); `package-smoke` dangling-comma syntax errors fixed; `Effect.scoped` restored.
- **W18** — `missing-pipeable-signature` (383 hits): all fixed via the Effect canonical `Function.dual` + overload-object pattern (7 parallel subagents, 122 files, ~370 functions). Skipped: `makeTest(name, revision?)` ×2 (both params are `string` — no sound runtime dispatch exists for the data-last overload).
- **W18.5** — Sound `DriverInterpreter` requirements threading through `intercept` chain (agent-run, run-loop-context, compaction-runtime, model-turn-context, handoff-runtime); pipeable overloads for test helpers `openWait`/`suspension` (predicate dispatch on the reason literal union); `no-unused-vars`/`no-shadow` cleanups.
- **W19** — `strict-effect-provide` (397 hits): src composition roots (examples + docs snippets) converted to `ManagedRuntime`; tests restructured to the `@effect/vitest layer()` host or the repo's `provideScoped` helper. `execute-program` uses `scopedWith` + `buildWithScope` to preserve the layer finalization order the tests assert.
- **W20** — `any-unknown-in-error-context` (107 → 17): concrete error channels for test contracts (48 hits), registration/layer channels in providers (cast-free, `unsafe-effect-type-assertion` there also removed), scripts' recursive walkers made iterative; `unsafe-effect-type-assertion` casts removed where the types genuinely infer (driver-run, agent-run, model-turn-driver, tool-execution, openai, deterministic).
- **W20.6** — `failure()` dual predicate inversion fixed (the mp-misc agent's `!AiError.isAiError` predicate returned the curried function instead of the step — 2 tests were failing); max-lines trims (main.ts, sidebar.ts); package-size limits updated for the conformance growth; repository graph regenerated.

## The 23 remaining errors — root cause analysis

All 23 are the same three families, where `any`/`unknown` is the *only legal supertype at a deliberate erasure boundary* (verified by a dedicated subagent with per-hit analysis):

1. **`any-unknown-in-error-context` (17)** — `unknown` in error/requirements channels that cannot be replaced without changing the public API or the `effect` library:
   - `LanguageModel.generateObject` path (11 hits: model-service 88/243/244, model-resilience 184, model-instrumentation 317, model-attempt-instrumentation 404, image-source 78, model-failure 45, model-route 65/133) — `Schema.Encoder` hardcodes `DecodingServices: unknown`; the library's overloads force Encoder-shaped schemas, so the schema type cannot be re-typed.
   - `Program host` invocation (4 hits: core + runtime program-host) — `Invocation.execute: Effect<unknown, unknown>` is the deliberate erasure at the `AnyTool` boundary; wrapping would change runtime error shapes.
   - `agent.ts:466` — `RunRequirements` output resolves to `unknown` through the `ObjectSchema` erasure (`Codec<unknown, ...>`).
   - `tool-executor-routes.ts:58` — `Tool.SuccessSchema<Tools[keyof Tools]>` services resolve to `unknown` via `Schema.Top`.
2. **`unsafe-effect-type-assertion` (4)** — load-bearing casts whose removal requires threading `DriverInterpreter`/`HandoffCatalog` through the `AgentToolToolkit` public API (agent-tool 195, tool-execution 333/360, compaction-runtime 383) — attempted; cascades unbounded across ~30 signatures.
3. **`missing-pipeable-signature` (2)** — `makeTest(name, revision?)` — both params are `string`; the data-last overload is indistinguishable at runtime (and the rule requires mirroring optionality, so arity dispatch cannot help).

## Recommended next steps (user decision)

1. **File upstream issues**: (a) bun 1.3.14 tsgo parser — 8+-import + trailing-call crash; (b) Effect-TS/tsgo — `prefer-typed-schema-decoder` Go panic (already known, rule disabled); (c) Effect — `Schema.Encoder` hardcoded `DecodingServices: unknown` makes the conformance rules unsatisfiable for `generateObject`.
2. **For the 23**: either (a) accept them with per-file `// oxlint-disable` + a documented reason (the rule set is deliberately over-strict at these erasure boundaries), (b) invest in the architectural changes (thread the `DriverInterpreter`/schema generics through the public APIs — large, cross-package refactor), or (c) wait for the upstream `effect` fixes.
3. **Merge**: the branch is green on all gates except the 23 documented errors; merge to `main` when the user decides on (2).
