# BatonFX

BatonFX is the **Effect-native agent framework**: a standalone, non-durable model-turn loop over `effect/unstable/ai` with typed tools, typed suspension, provider layers, memory, skills, transport, and UI adapters that compose as Effect services. `@batonfx/core` directly re-exports Effect AI primitives such as `Tool`, `Toolkit`, `LanguageModel`, `Prompt`, `Response`, `Chat`, and `Tokenizer`; those exports are the upstream Effect AI values, not Baton wrappers.

```ts
import { Effect, Layer, Schema } from "effect"
import { Agent, ModelRegistry, Tool, Toolkit } from "@batonfx/core"
import { Deterministic } from "@batonfx/providers"

const searchTool = Tool.make("search_docs", {
  description: "Search local docs",
  parameters: { query: Schema.String },
  success: Schema.Array(Schema.String),
})

const toolkit = Toolkit.make(searchTool)
const agent = Agent.make("assistant", { instructions: "Be concise.", toolkit })

const program = ModelRegistry.provide(
  { provider: "deterministic", model: "local" },
  Agent.generate(agent, { prompt: "Explain Baton in one sentence." }),
).pipe(
  Effect.provide(
    Layer.mergeAll(
      Deterministic.withDeterministic({ model: "local" }),
      toolkit.toLayer({ search_docs: () => Effect.succeed(["Getting started"]) }),
    ),
  ),
)
```

Baton is the agent; a durable runtime such as [Relay](https://github.com/In-Time-Tec/relayfx) is the durable race it runs in. Use Baton alone for process-local agents and chat streaming. Compose it behind Relay when you need durable, addressable suspend/resume executions.

## Install

```bash
bun add effect @batonfx/core
bun add @batonfx/providers @batonfx/mcp @batonfx/skills @batonfx/memory
bun add @batonfx/transport @batonfx/foldkit
```

## Capability matrix

| Capability                                                          | Package              | Stable tier for 0.1.0                         |
| ------------------------------------------------------------------- | -------------------- | --------------------------------------------- |
| Agent loop, events, typed suspension, turn policy, tools, approvals | `@batonfx/core`      | stable core tags; APIs marked `@experimental` |
| Provider registration, deterministic local model, model catalog     | `@batonfx/providers` | experimental                                  |
| MCP discovery and Baton `ToolExecutor` adapter                      | `@batonfx/mcp`       | experimental                                  |
| SKILL.md and instruction-file sources                               | `@batonfx/skills`    | experimental                                  |
| Working memory, vector store, semantic recall                       | `@batonfx/memory`    | experimental                                  |
| SSE, WebSocket, wire frames, in-memory session registry             | `@batonfx/transport` | experimental                                  |
| FoldKit connection, subscription, commands, headless chat model     | `@batonfx/foldkit`   | experimental                                  |

## A plugin is a Layer

Baton seams are Effect services. You pay only for the seams you provide: a model registry layer, an approvals layer, a memory layer, a transport registry layer, or your own host implementation. The core loop discovers optional seams with `Effect.serviceOption` when the contract says they are optional.

## Tool placement stays on Effect AI tools

Define tools once with `Tool.make` and `Toolkit.make`. Ordinary in-process calls run through `toolkit.toLayer(...)`; hosts that need placement can route the same toolkit with `ToolExecutor.client`, `ToolExecutor.remote`, `ToolExecutor.mcp`, or `ToolExecutor.sandbox` without redefining schemas or wrapping tools.

```ts
const clientTools = ToolExecutor.router([
  ToolExecutor.client({
    toolkit,
    execute: ({ call }) => desktopClient.callTool(call.name, call.params),
  }),
])
```

## Effect beta compatibility

| Baton release | Tested Effect range                               | Notes                                                                               |
| ------------- | ------------------------------------------------- | ----------------------------------------------------------------------------------- |
| `0.3.x`       | `effect@4.0.0-beta.93` from the workspace catalog | Every public export remains `@experimental` while `effect/unstable/ai` is unstable. |

## Start here

- Consumer docs: [`docs/site/README.md`](docs/site/README.md)
- 5-minute guide: [`docs/site/getting-started.md`](docs/site/getting-started.md)
- Runnable examples: [`examples/`](examples/)
- Normative specification: [`SPEC.md`](SPEC.md)
- Vocabulary: [`CONTEXT.md`](CONTEXT.md)

## Repository layout

| Path                 | Purpose                                                                             |
| -------------------- | ----------------------------------------------------------------------------------- |
| `packages/core`      | `@batonfx/core` — the Effect-native agent loop.                                     |
| `packages/providers` | `@batonfx/providers` — provider helpers and deterministic local models.             |
| `packages/mcp`       | `@batonfx/mcp` — MCP client bridge and Baton adapter.                               |
| `packages/skills`    | `@batonfx/skills` — SKILL.md and instruction-file sources.                          |
| `packages/memory`    | `@batonfx/memory` — non-durable memory implementations.                             |
| `packages/transport` | `@batonfx/transport` — wire frames, session registry, SSE, WS, and client adapters. |
| `packages/foldkit`   | `@batonfx/foldkit` — FoldKit adapter and headless chat model.                       |
| `docs/spec`          | Normative specs and ADRs.                                                           |
| `docs/site`          | Consumer-facing guides, recipes, API stability, and positioning.                    |
| `examples`           | Private Bun workspaces typechecked in CI.                                           |

## Verification

```bash
bun install
bun run format:check
bun run lint
bun run typecheck
bun run check:docs
bun run typecheck:examples
bun run check:release
bun run test
bun run build
```

## Provenance

Baton was developed by [In Time Tec](https://intimetec.com) and is composed inside [Relay](https://github.com/In-Time-Tec/relayfx). Relay owns durability, addressability, event logs, and hosted execution. Baton owns the standalone non-durable primitives.
