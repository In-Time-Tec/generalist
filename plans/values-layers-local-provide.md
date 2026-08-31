# Values, Layers, Local Provide — Model Selection And Feature Uniformity Plan

## Purpose

Make one configuration pattern true for the whole framework: **plain values, capabilities as layers, selection by local `Effect.provide`**. Model selection stops being a string-keyed registry lookup by default and becomes providers-as-layers with models-as-layers over them. Child agents inherit the ambient model or choose their own, explicitly. The ModelRegistry shrinks to its two irreducible uses: runtime-dynamic selection and keyless tests.

## Simple Model

```text
OpenAI = OpenAiClient.layerConfig({ apiKey })   # provider: one client layer
Sol    = OpenAI.layerModel({ model: "gpt-5.6-sol" })  # model: thin layer over the provider
Luna   = OpenAI.layerModel({ model: "gpt-5.6-luna" })

Agent.generate(supervisor, opts).pipe(Effect.provide(Sol))   # choose per run
ToolExecutor.layerToolkit(childToolkit)                       # child inherits the ambient model
ToolExecutor.layerToolkit(childToolkit).pipe(Layer.provide(Luna))  # child chooses Luna
```

Change the model: provide a different model layer. Change the provider for that model: provide a different client layer under the same model layer. Change nothing else.

## The Pattern (target contract)

1. **Values**: agents, tools, toolkits, policies, strategies, options are plain immutable data from `make`/constructors.
2. **Capabilities**: behavior-bearing seams are Context services with layer constructors named `layer` / `layer<Noun>`.
3. **Selection**: per-run, per-agent, or per-child variation is a run option or a local `Effect.provide` at the call site. Two concurrent runs may differ without mutation.
4. **Strings only where identity is genuinely dynamic data**: durable pins, RPC protocol dispatch (REPL host bindings, MCP tool names), runtime-resolved model selection. Not for static application wiring.

## Audit Summary

| Area                              | Status                                                          | Gap                                                                                            |
| --------------------------------- | --------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| Providers (`ai/*`)                | Wrapped model constructors exist but are private                | Export `layerModel` per provider with `ProviderName`/`ModelName` tags                          |
| `Agent.model` (`ModelSelection`)  | Registry-only, hard-fails without registry                      | De-feature; keep for dynamic selection only                                                    |
| `AgentTool.asTool` children       | Inherit executor-construction context; no explicit model option | Add optional child model layer; document inherit/choose                                        |
| Handoff specialists               | Registry selection; silently ignored under ambient roots        | Replace with optional model layer; absence = inherit                                           |
| Durable runtime                   | Compliant — models via `Agent.close`, pins are identity         | Docs clarification only                                                                        |
| Stores (pg/mysql/cf/rivet/sqlite) | Compliant                                                       | None                                                                                           |
| Compaction                        | Compliant layers + strategy values                              | Threshold cache keyed by default `"local"` session — concurrent runs interfere                 |
| Memory                            | Compliant                                                       | Run option secretly requires ambient `Memory`; `SummaryModel` bespoke alias of `LanguageModel` |
| Instructions                      | Compliant                                                       | "Registry" naming for an ordered provider list                                                 |
| Skills                            | Catalog values + layers                                         | String `agent`/`model` metadata fields; name lookup is protocol identity — keep, document      |
| Turn policy, budget, steering     | Compliant values                                                | None                                                                                           |
| Approvals / Permissions           | Layers exist                                                    | Implicit allow-all/pending defaults when no layer provided — silent security policy            |
| ModelMiddleware / Tokenizer       | Layers exist                                                    | Optional ambient — silent identity chain / silent estimator fallback                           |
| MCP / A2A / AG-UI                 | Compliant                                                       | None material                                                                                  |
| Transport / FoldKit               | Serve Runtime only                                              | No agent-value constructors; acceptable, document                                              |
| REPL                              | Layers + values                                                 | Module-global prototype cache; worker globals (process-scoped, defensible)                     |
| SQL observability                 | —                                                               | Module-global mutable `transitionsByFiber` map                                                 |

## Target Contracts

### Providers and models

Every provider module (`openai`, `anthropic`, `openrouter`, `openai-responses`, `openai-chat-completions`, `amazon-bedrock`, `deterministic`) exports:

```ts
layerModel: (options) => Layer<LanguageModel | ProviderName | ModelName, E, ProviderClient>
```

with failure classification, image-source handling, and tool-schema compilation baked in (the private wrapped constructors already do this; `Model.make` adds the telemetry tags). The provider client layer stays separate (`layerConfig`), so the model layer composes over any compatible client.

`ModelRegistry`, `layerMerged`, `layerOrDeterministic`, `ModelRoute`, and `ModelCatalog` remain — documented as dynamic selection, failover routing, and metadata lookup, not the default wiring path.

### Children: inherit or choose

- **Inherit** means: no child model layer → the child run resolves the ambient `LanguageModel` captured where its executor was built.
- **Choose** means: an optional model layer provided around the child run (asTool option) or specialist turn (handoff target).
- Fix the handoff wart: a specialist model option must apply under ambient model sources too, or be rejected loudly — never validated-then-ignored.
- `Agent.model: ModelSelection` remains for registry-backed dynamic selection; verify whether it participates in durable manifests before de-featuring it in docs.

### Core service hygiene

- Approvals/Permissions: absent layer becomes a typed requirement error, or an explicit `layerAllowAll` choice at the edge — never an implicit default.
- Compaction threshold cache: key by run identity, not session id with a shared `"local"` default.
- Tokenizer: exact-token strategies declare the requirement; estimation is a separately named strategy.
- Memory: `RunOptions.memory` types carry the `Memory` requirement; `WorkingMemory` summary model accepts a plain `LanguageModel` layer.
- Skills: drop `agent`/`model` string fields from skill metadata; document name lookup as protocol identity.

### Edges

- SQL observability: replace the module-global fiber map with layer-scoped state.
- REPL: scope the prototype cache; rename internal `registry` to `bindings`; worker globals stay (the worker process is the scope owner).
- Transport/FoldKit: document Runtime-only serving as the contract; no new constructors in this plan.

## Dependency Order

1. **Phase 0 — `layerModel` per provider** (the unlock). Includes per-provider tests for classification behavior and telemetry tags.
2. **Phase 1 — Children inherit/choose**: asTool model option, handoff target model layer, fix the silent-ignore wart. Depends on Phase 0.
3. **Phase 2 — Core hygiene**: security defaults, compaction cache key, tokenizer requirement, memory requirement typing, skill metadata fields. Independent of 0–1; each item is its own shippable commit.
4. **Phase 3 — Edge hygiene**: SQL observability map, REPL cache. Independent.
5. **Phase 4 — Docs**: README hero to layer-first form, providers guide rewrite, feature docs touched by 1–3, decision record in `docs/decisions/`.

## Deletion Scope

- Skill metadata `agent`/`model` string fields.
- Implicit approvals/permissions defaults (replaced by explicit layers — breaking, allowed pre-1.0).
- Nothing in the model registry; it is re-scoped, not removed.

## Verification

- Per phase: focused vitest for the touched suites plus `bun run --cwd packages/generalist typecheck` and prettier.
- Phase 1 additionally: multi-agent snippets typecheck (inherit and choose both demonstrated), handoff runtime tests.
- Phase 2 additionally: full `bun run test` — security-default and compaction-cache changes touch durable replay.
- Phase 4 additionally: `bun run check` and `PACKAGE_ARTIFACT_DIR=release bun run package` (public exports change).

## Release Acceptance

One release after Phase 4: CHANGELOG entry describing the layer-first model pattern, lockstep minor bump, full checks with PostgreSQL and MySQL available, package smoke green.
