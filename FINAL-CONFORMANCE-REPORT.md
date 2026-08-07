# BatonFX Effect v4 Lint Conformance — Final State

Branch: `lint/conformance` (71 commits on top of `main` @ ce1f6e4)

## Headline numbers

| Gate                                                                       | Baseline (main) | Now                     |
| -------------------------------------------------------------------------- | --------------- | ----------------------- |
| `bunx oxlint packages apps examples scripts test`                          | 1,389 errors    | **0 errors**            |
| `bun tsc --noEmit -p tsconfig.json`                                        | 0               | **0**                   |
| `bun run build`                                                            | fails           | **13/13 tasks**         |
| `bun --bun vitest run`                                                     | 1,168 pass      | **1,168 pass / 0 fail** |
| `repository-policy` / `install-preflight` / `repository-graph` / `package` | —               | **all PASS**            |

Every rule runs at `error`. No rule was disabled, no severity lowered, no suppression comment added, and no cast
was introduced to satisfy a rule. `effecttsgo/prefer-typed-schema-decoder` stays off because the pinned tsgolint
binary crashes on it, which is a tool defect rather than a code exemption.

## The last error class: `any` and `unknown` in requirement channels

The final 1,389th error resisted 8 waves because the reported location was never the defect. The rule fires where
a requirement channel is observed, but the `any` entered several frames earlier through type erasure. Each fix
below removes the erasure at the interface that owns it.

### `AgentTool.asTool` annotated away its own tool type

`asTool` built its tool with `const tool: Tool.Any = Tool.make(...)`. `Tool.Any` has `Config = any`, so
`Tool.HandlerServices<T>` — defined as `_Config["parameters"]["DecodingServices"] | ResultEncodingServices<T> |
_Requirements` — collapsed to `any` for every consumer. That `any` then flowed into `StaticToolServices`, into
`RunRequirements`, and into every `Agent.stream` call site that used an agent tool.

`AgentToolToolkit` now carries `AgentToolTool<Parameters, Success>`, built from the same parameter and success
schemas the toolkit already tracks, so handler services stay concrete end to end.

### `ToolExecutor.layerToolkit` matched the wrong overload

`AgentToolToolkit` structurally satisfies `ClosedToolSet`, whose `R` defaults to `unknown`. Because the
`ClosedToolSet` overload was declared first, every agent-tool layer resolved to `Layer<ToolExecutor, never,
unknown>`. Ordering the `AgentToolToolkit` overload first restores the concrete requirement.

### `Agent.stream` added `LanguageModel` unconditionally

`RunRequirements` unioned `LanguageModel.LanguageModel` on top of `R`, even though `ModelRequirement<O>` already
decides between an ambient model, a `ModelRegistry`, or both from the agent's own options. The unconditional
member forced a `LanguageModel` requirement onto registry-resolved runs. Dropping it makes the channel truthful.

### Hosted tools escaped their closure

`Agent.withTools` and Runtime's `code-mode.withTool` widened their result to `Agent<Record<string, Tool.Any>, R>`.
`Tool.HandlersFor<Record<string, Tool.Any>>` is `Handler<string>`, so a hosted agent's handlers fell outside the
environment `Agent.close` had already closed over. Both now preserve their `Tools` parameter, which matches what
`withTools` always documented: additional host-owned tools that do not change the services the agent requires.

### Tests carried the same erasure

Four `as Agent.Agent<Record<string, Tool.Any>, LanguageModel.LanguageModel>` casts and one
`Layer.Layer<Tool.Handler<any>>` cast hid missing services behind `any`. They are deleted. The affected test
layers now provide the tool handlers the honest types ask for.

## Structural follow-through

Making the types truthful pushed three files past the 500-line cap, so each was split at a real seam rather than
added to the exception list:

- `tool-closed-execution.ts` — closed tool set and closed agent-toolkit execution
- `session-projection.ts` — session entry to prompt projection
- `run-loop-context.ts` — now owns `SchemaServicesD`, `LoopServices`, and `TurnServices`, replacing five
  duplicated copies of the same conditional across `agent.ts`, `agent-run.ts`, and `run-loop.ts`

The core tarball budget moved 168,000 → 169,000 bytes for the two added modules, and the generated repository
graph was regenerated for the new edges.

## Verified against stock `effect`

An earlier stage of this work type-checked inside a worktree whose `node_modules` had hand-edited `effect` `.d.ts`
files, which made `Schema.decodeUnknownEffect`, `Schema.encodeUnknownEffect`, and `LanguageModel.generateObject`
appear to return narrowed requirements. That patch was never committed and does not exist for anyone else, so the
final state was re-derived and re-verified after `rm -rf node_modules && bun install`:

- `ObjectSchema` bounds its service parameters instead of pinning them to `unknown`. A structured-output run now
  reports `LanguageModel` alone, while a schema carrying real decoding services still propagates them — the
  behavior the existing type-level assertions in `agent.test.ts` already pinned.
- The tool result codec reads each schema through one documented codec view rather than the `Schema.Constraint`
  view, whose services are `unknown` by declaration.

Every number in this report comes from an unpatched dependency tree.

## Out of scope

`examples/deep-research-agent/web` fails its own `tsc` on FoldKit `Scene` test-harness types. Those files are
untouched by this branch and fail on `main` as well, where the package cannot even resolve `foldkit`. The
`no-aliased-named-imports` ast-grep advisory reports 884 diagnostics on this branch and 884 on `main`.
