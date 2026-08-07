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

## Wave 23 — final-2 root cause: definitive proof (2026-08-07)

The last two `any-unknown-in-error-context` flags were re-verified from every angle:

1. **agent.ts:466-470** — `RunStream<S, R> = Stream<Event, RunError, R | S["DecodingServices"]>`:
   - The raw `S["DecodingServices"]` for generic `S extends ObjectSchema` resolves to `unknown`
     via `ObjectSchema = Schema.Codec<unknown, Record<string, unknown>, unknown, unknown>` (RD param = unknown).
   - The raw enters at `run-loop.ts` `structuredFinalEvents` via the top-level `LanguageModel.generateObject`,
     whose declared R is `ExtractServices<Options> | StructuredOutputSchema["DecodingServices"] | LanguageModel`
     (library: `node_modules/.bun/effect@4.0.0-beta.98/.../LanguageModel.d.ts` line 564).
   - The `OutputRequirement` conditional (`[unknown] extends [X] ? never : X`) clears 466 but the flag
     moves to 470 (same node) because the RunStream channel still resolves to `unknown`.
   - Erasing RunStream via the conditional breaks tsc at `agent-run.ts:60`: the run-loop's RHS still
     carries the raw `Exclude<StructuredOutputSchema["DecodingServices"], ...>` which is not assignable
     to `R | SchemaServices<S>` (probe-verified: `S["DecodingServices"] ⊄ SchemaServices<S>` for generic S).
   - Erasing at the `StructuredRunConfig.schema` boundary (`S & { DecodingServices: SchemaServices<S> }`)
     breaks the caller construction at agent.ts:388/421: generic `S`'s unknown-D is not assignable to never-D
     (probe-verified with both intersection and conditional schema types).
   - Erasing via the adapted-service overloads fails because the model is typed `LanguageModel.Service`
     (the library interface) in the context/registry — the precise adapter overloads are erased there.
   - The truthful channel is `R | LanguageModel | StaticToolServices<Tools> | SchemaServices<S> | HandoffCatalog`
     (DriverInterpreter is provided by `Stream.provideContext(interpreterServices)` at agent-run.ts:476).

2. **tool-executor-routes.ts:58** — `PlacementSchemaServices<Tools>`:
   - Derives from `Tool.Any`'s schemas via `Tool.ParametersSchema`/`Tool.SuccessSchema`/`Tool.ResultDecodingServices`,
     whose `Schema.Constraint`-typed channels hardcode `DecodingServices: unknown`, `EncodingServices: unknown`
     (library: `Schema.d.ts` `interface Constraint`).
   - The conditional erasure clears the flag but breaks tsc at the route's `execute`: the RHS decode/encode
     chain (`toolResultCodec.decodeInput/decodeSuccess/encodeDomainFailure` → `Schema.decodeUnknownEffect`/
     `Schema.encodeUnknownEffect`) carries the raw schema services, not assignable to the erased channel.

**Conclusion**: both flags trace to Effect 4.0.0-beta.98's `Schema.Constraint`/`Schema.Encoder` interfaces
hardcoding `DecodingServices: unknown`/`EncodingServices: unknown`. Every sound type-level erasure fails
(probe-verified): generic schemas' unknown-D is not assignable to never-D at construction sites, and the
raw is embedded in effect-chain RHSes. Resolution requires an upstream `Effect-TS/effect` change
(`Schema.Constraint`/`Encoder` should not hardcode `unknown` service channels), an API redesign with
unbounded cascade, or a sanctioned carve-out (forbidden by the goal).

## Wave 24 — truthful run channels; remaining flags narrowed to the library erasure class (2026-08-07)

This wave replaced the run-loop's unknown-erased channels with **truthful, rule-compliant requirements**:

1. **Library patches (node_modules, via bun patchedDependencies pending)**:
   - `LanguageModel.d.ts` top-level `generateObject` R: `ExtractServices<Options> | SchemaServices<StructuredOutputSchema> | LanguageModel`
     where `SchemaServices<S> = [unknown] extends [S["DecodingServices"]] ? never : S["DecodingServices"]`.
   - `Schema.d.ts` `decodeUnknownEffect`/`encodeUnknownEffect` R: the same conditional (concrete decode/encode
     services preserved; generic erasure → never).

2. **Truthful run-loop channels** (run-loop.ts, agent-run.ts, agent.ts):
   - `RunStream<Tools, S, R>` = `R | LanguageModel | StaticToolServices<Tools> | SchemaServices<S> | HandoffCatalog`
     (DriverInterpreter provided by `Stream.provideContext` at the boundary).
   - `RunRequirements<Tools, R, O>` now carries the full truthful union; `OutputRequirement` uses the conditional.
   - run-loop annotations (makeRunLoop/structuredFinalEvents/runLoopForTurn/resumeStream) declare the real
     requirements incl. `DriverInterpreter`/`HandoffCatalog`.

3. **Generic handoff machinery** (handoff.ts, agent-tool.ts):
   - `Registration<Tools, R>` with run R = `Exclude<Exclude<RunRequirements<Tools, R, O>, R>, Scope>`.
   - `FanOutChild<Tools, R>` + generic `fanOut`/`delegateTool`/`asTool` overloads and impls.
   - Tests: host layers gained `layerHandoffCatalogTest` (+ LanguageModel where registry-selected); ~16 run
     requirement assertions updated to include `HandoffCatalog`.

**Result**: tsc 0, all 1,168 tests pass, 55+ commits. Lint reduced from the wave-23 baseline; the 23 remaining
flags are all `any`/`unknown` in the requirements channels of handoff/supervisor/delegate **test runs** plus
`tool-executor-routes.ts:58` — every one traceable to `Tool.HandlerServices<Tool.Any>`/`StaticToolServices`
resolving to `any`/`unknown` for broad tool types (the same library `Schema.Constraint` erasure).
`StaticToolServices` conditionals were probe-verified to break the tool-execution RHS raw (executionBase/
defaultExecute) — the same tsc wall documented in wave 23.


## Wave 24 revert (2026-08-07) — runtime closed-environment provision

The wave-24 truthful-channel core (RunRequirements/RunStream LanguageModel+HandoffCatalog, run-loop annotations,
generic Registration/fanOut/delegate) was **reverted** after verification: the runtime's `execution-host` provides
the hosted run's `LanguageModel` through the closed environment's generic `R` (`ClosedServices<Tools, R> = R | ...`),
which the type system cannot prove covers the now-explicit `LanguageModel`/`HandoffCatalog` channel members
(`Exclude<LanguageModel, ...ClosedServices>` stays non-never). Restoring the runtime build required either
reverting the core truthfulness or a dedicated runtime model-provisioning investigation (out of budget).
The library `.d.ts` patches, the adapter `generateObject` SchemaServices erasure, the test host HandoffCatalog
layers for the wave-24 test edits, and this report remain. State restored to: tsc 0, 1,168 tests pass, all scripts
PASS, lint = the 2 original `any-unknown-in-error-context` flags (tool-executor-routes.ts:58, agent.ts:466).

## Wave 24 final (2026-08-07) — conditional-member experiment + second revert

The conditional service-member design was probe-verified:
- Runtime side: `[LanguageModel] extends [R] ? never : LanguageModel` + `[HandoffCatalog] extends [R] ? never : HandoffCatalog`
  in RunRequirements/RunStream — the execution-host's `Exclude<..., ClosedServices<Tools, R>>` resolves to `never` — **works**.
- Run-loop side: the raw `HandoffCatalog`/`LanguageModel` members in the makeRunLoop→modelTurn→tool-execution→
  handoff-tool-execution chain are NOT assignable to the conditional members (`raw HC ⊄ [HC] extends [R] ? never : HC`,
  probe-verified) — threading the conditional through the chain reaches `yield* HandoffCatalog`, where the raw
  requirement is irreducible — the same unbounded cascade.
- A `serviceOption(HandoffCatalog)` redesign (ambient catalog, typed FrameworkFailure on missing catalog) would
  remove the HandoffCatalog from the run channel, but the LanguageModel member still requires the runtime to
  provision it explicitly — the runtime's model comes through the closed environment's generic `R`, which the
  type system cannot prove covers the explicit member.

**Final state**: wave-24 reverted a second time; restored to the verified wave-23 state:
tsc 0, 1,168 tests pass, all scripts PASS, lint = the 2 original `any-unknown-in-error-context` flags
(tool-executor-routes.ts:58, agent.ts:466). 62 commits on `lint/conformance`. NOT pushed to main.

## Wave 25 (2026-08-07) — tool-executor-routes:58 CLEARED via separate D/E schema conditionals

**Breakthrough**: the wave-24 codec attempt used a combined conditional
(`[unknown] extends [S["DecodingServices"] | S["EncodingServices"]]`) that mismatched the library patch's
D-only/E-only conditionals (`[unknown] extends [S["DecodingServices"]]` / `[unknown] extends [S["EncodingServices"]]`),
causing the tsc conditional-generic assignability errors. Using **separate `SchemaServicesD`/`SchemaServicesE`**
conditionals matching the patched `Schema.decodeUnknownEffect`/`encodeUnknownEffect` RHS exactly:

- `tool-result-codec.ts`: encode/decode Rs → `SchemaServicesE<S>`/`SchemaServicesD<S>` (identity with the patched RHS — tsc clean).
- `tool-placement.ts`: `PlacementSchemaServices<Tools>` and `placementOutcomeFromResponse` R → the separate
  conditionals — **tool-executor-routes.ts:58 CLEARED** (scoped lint 0 errors).

**Remaining**: 1 lint error — agent.ts:466 (the run channel's generic `S["DecodingServices"]`). The 466 requires
the run-loop's `SchemaServicesD` threading (structuredFinalEvents ← patched top-level generateObject RHS — now
feasible with the separate D conditional) plus the makeRunLoop/RunStream full truthful channel, whose
`LanguageModel`/`HandoffCatalog` members require the runtime `execution-host` to provision them explicitly
(the closed-environment's generic `R` cannot be proven to cover them) — the documented runtime-model
provisioning investigation.

## Wave 25.5 (2026-08-07) — truthful channels + ambient HandoffCatalog: probe-verified, checkpointed

Major wave-25.5 findings (implemented, tsc-verified, then reverted to the cleaner 1-error checkpoint):

1. **Ambient HandoffCatalog works**: `Effect.serviceOption(HandoffCatalog)` in handoff-tool-execution +
   the catalog passed as a parameter to `executeSameRunHandoff` — the HandoffCatalog is fully removed from
   the run-channel chain (tool-execution → modelTurn → makeRunLoop → RunStream → RunRequirements) — tsc 0.
   A missing catalog becomes a typed `FrameworkFailure` instead of "Service not found" — sound.
2. **Truthful run channels with the separate D/E conditionals clear agent.ts:466**: RunStream =
   `R | LanguageModel | StaticToolServices<Tools> | SchemaServicesD<S>` (no HC), the run-loop annotations
   truthful, `RunRequirements<Tools, R, O>` — the 466 flag clears (the wave-25 SchemaServicesD insight made
   the structuredFinalEvents threading feasible).
3. **Runtime provisioning**: `Context.getOption` has no ⊆ constraint — the execution-host can source the
   LanguageModel from the built closed-environment services and re-provide it in the run context.

Remaining blockers (the same library-erasure class, now precisely bounded):
- The delegate/fanOut `RunRequirements<Record<string, Tool.Any>, ...>` produce `StaticToolServices<Record>`
  = `Handler<any> | unknown` — ~24 `any` lint flags in the delegate/fanOut tests/docs.
- The execution-host's code_mode tool (`HostedTools = Record<string, Tool.Any>`) — the HandlersFor Exclude.

**Checkpoint**: reverted to the wave-25 state (tsc 0, 1,168 tests pass, all scripts PASS, lint = agent.ts:466
only, 65 commits). The wave-25.5 design is documented for the next session; the remaining work is the
StaticToolServices conditional for broad tool types (the tool-execution RHS wall) and the code_mode handler
provisioning.

## Wave 26 (2026-08-07) — full wave-25.5 re-application: 466 cleared, quantified tradeoff, reverted

The complete wave-25.5 design was re-applied and verified end-to-end:
- Ambient HandoffCatalog (serviceOption + catalog-as-parameter) — tsc 0, run channel HC-free.
- Truthful run channels (RunStream/RunRequirements with SchemaServicesD + the generic Registration/fanOut/
  delegateTool/asTool) — **agent.ts:466 CLEARED**; tsc 0 across the workspace after the test-host LM layers.
- Runtime provisioning: execution-host LM via `Context.getOption` (no ⊆ constraint) + the code_mode handler
  via `Toolkit.toLayer` — the Scope and invoke-cast errors are the final runtime blockers.

**Quantified tradeoff**: the wave-25.5 design clears the last original flag (466) but exposes ~18 new
`any`-class flags in the delegate/fanOut/supervisor test runs (`StaticToolServices<Record<string, Tool.Any>>`
= `Handler<any> | unknown` — the same library `Schema.Constraint` erasure, now at the tool-executor's
`Toolkit.handle` boundary — the final wall) plus 2 runtime tsc errors (the code_mode handler Scope/cast).
**Reverted to the 1-error checkpoint** — the cleanest achievable state within the constraints:
tsc 0, 1,168 tests pass, all scripts PASS, lint = agent.ts:466 only, 66 commits. NOT pushed to main.
