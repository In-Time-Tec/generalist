# BatonFX Effect v4 Lint Conformance — Final State (wave 22)

Branch: `lint/conformance` (50 commits on top of `main` @ ce1f6e4)

## Headline numbers

| Gate | Baseline (main) | Now |
| --- | --- | --- |
| `bunx oxlint packages apps examples scripts test` | 1,389 errors | **13 errors** |
| `bunx tsc --noEmit` | 0 | **0** |
| `bun --bun vitest run` | 1,168 pass | **1,168 pass / 0 fail** |
| `repository-policy` / `install-preflight` / `repository-graph` / `package` | — | **all PASS** |

## Fixed in wave 22 (this push)
- **Program host `Invocation.execute: Effect<unknown, unknown>` → 0** — introduced a concrete error channel:
  `ProgramInvocationFailure | ProgramSuspended | ProgramCancelled`. The tool/step/agent decoders wrap implementation
  errors into `ProgramInvocationFailure` while passing `ProgramSuspended`/`ProgramCancelled` through unchanged; the
  host and runtime dispatches unwrap the wrapper so the `cause` identity asserted by tests is preserved. The
  `Invocation`/`AgentInvocation` interfaces, `Bindings` (`TypedTool`/`TypedStep`), the runtime dispatch, and the
  core index exports were updated consistently. All 4 program-host flags eliminated.

## The 13 remaining — verified root causes (all `any-unknown-in-error-context`)

1. **The `LanguageModel.generateObject` path (11 hits)** — the effect library's `Schema.Encoder` interface
   hardcodes `readonly "DecodingServices": unknown` (verified in `effect/dist/Schema.d.ts`, beta.98 and beta.104).
   `generateObject`'s requirements are `ExtractServices<Options> | StructuredOutputSchema["DecodingServices"]` —
   always `unknown` for Encoder-shaped schemas. Tested fixes: library patch (`unknown` → `never`) breaks the real
   decode services of user schemas (28 tsc errors); `Codec`-typed schemas fail the library's `Encoder` constraint;
   `NoDecodeEncoder` interfaces fail the middleware options typing. Unfixable from BatonFX code.
2. **`agent.ts:466`** — `RunRequirements`' `OutputRequirement = SchemaOf<O>["DecodingServices"]` — the same
   `DecodingServices` erasure through the `ObjectSchema` constraint.
3. **`tool-executor-routes.ts:58`** — `PlacementSchemaServices<Tools>` derives from `Tool.Any`'s schemas whose
   `DecodingServices`/`EncodingServices` are `unknown`.

## Recommendation
File an upstream issue against `Effect-TS/effect`: `Schema.Encoder` should not hardcode `DecodingServices: unknown`
(an encoder-shaped schema has no decode step; the type erases the real services of every `generateObject` consumer).
The 13 are not fixable without that library change or an API redesign; all other gates are green.
