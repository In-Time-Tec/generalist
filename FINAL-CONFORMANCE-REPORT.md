# BatonFX Effect v4 Lint Conformance — Final State (wave 21.5)

Branch: `lint/conformance` (46 commits on top of `main` @ ce1f6e4)

## Headline numbers

| Gate | Baseline (main) | Now |
| --- | --- | --- |
| `bunx oxlint packages apps examples scripts test` | 1,389 errors | **17 errors** |
| `bunx tsc --noEmit` | 0 | **0** |
| `bun --bun vitest run` | 1,168 pass | **1,168 pass / 0 fail** |
| `repository-policy` / `install-preflight` / `repository-graph` / `package` | — | **all PASS** |

## Fixed in waves 21–21.5 (this session's second push)
- `missing-pipeable-signature` → **0**: `makeTest(name, revision?)` gained a real data-last overload via `Function.dual(2)` (the overload-object + full-first ordering satisfies the rule's type-based matching); 1-arg callers updated to explicit 2-arg; the runtime re-export got the explicit overload annotation.
- `unsafe-effect-type-assertion` → **0**: compaction-runtime (preparePrompt) — removed the cast, the types flow; agent-tool — the handler now calls `interpreter.value.reserveChild/refundChild` directly (dropping the `DriverInterpreter` from the handler's requirements entirely); tool-execution — the suspend branch now emits `Stream.fail(AgentSuspended.make(...))` (AgentSuspended ∈ RunError) instead of the unwrap-of-instance that produced `Stream<Event, unknown, unknown>`, and the `DriverInterpreter | HandoffCatalog` requirements are threaded through the run-loop/model-turn contexts.
- Program bindings: `Invocation<O, E>` generics + `TypedTool`/`TypedStep` types retained in `Bindings`.

## The 17 remaining — verified root causes (all `any-unknown-in-error-context`)

1. **The `LanguageModel.generateObject` path (11 hits)** — the effect library's `Schema.Encoder` interface literally hardcodes `readonly "DecodingServices": unknown` (verified in `effect/dist/Schema.d.ts`, both beta.98 and beta.104). `generateObject`'s requirements are `ExtractServices<Options> | StructuredOutputSchema["DecodingServices"]` — the second member is always `unknown` for Encoder-shaped schemas. A library patch (`unknown` → `never`) was tested: it breaks the real decode services of user output schemas (28 tsc errors; the schema `RD` is genuinely concrete). This is unfixable from BatonFX code without a library change.
2. **The Program host `Invocation.execute: Effect<unknown, unknown>` (4 hits)** — the deliberate erasure at the `AnyTool` boundary. Typed `Invocation<O, E>` + `TypedTool` bindings were implemented, but the host's heterogeneous maps still resolve the execute channel to `unknown`; wrapping would change runtime error shapes (suspended/cancelled pass-through + durable encoding).
3. **`agent.ts:466` + `tool-executor-routes.ts:58`** — the `ObjectSchema`/`Tool.SuccessSchema` decode-services erasures (the same `DecodingServices: unknown` root).

## Recommendation
File upstream issues against `Effect-TS/effect` (Schema.Encoder hardcodes `DecodingServices: unknown`) and `Effect-TS/tsgo` (the rule has no carve-out for library-erased channels). The 17 are not fixable without a library change or an API redesign; merging the branch leaves all gates green except these 17 documented cases.
