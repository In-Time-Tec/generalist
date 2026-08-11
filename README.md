# BatonFX

BatonFX is the **Effect-native agent framework**: a standalone model-turn loop over `effect/unstable/ai` plus an optional native durable Runtime, typed tools and suspension, provider layers, memory, skills, transport, and UI adapters that compose as Effect services. `@batonfx/core` directly re-exports Effect AI primitives such as `Tool`, `Toolkit`, `LanguageModel`, `Prompt`, `Response`, `Chat`, and `Tokenizer`; those exports are the upstream Effect AI values, not Baton wrappers.

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
const agent = Agent.make({ name: "assistant", instructions: "Be concise.", toolkit })

const program = ModelRegistry.operate(
  { provider: "deterministic", model: "local" },
  Agent.generate(agent, { prompt: "Explain Baton in one sentence." }),
).pipe(
  Effect.provide(
    Layer.mergeAll(
      Deterministic.layer({ model: "local" }),
      toolkit.toLayer({ search_docs: () => Effect.succeed(["Getting started"]) }),
    ),
  ),
)
```

Use `@batonfx/core` directly for process-local agents and chat streaming. Add `@batonfx/runtime` when Runs need stable addresses, replayable events, durable waits, cancellation, children, or restart recovery.

## Install

```bash
bun add effect @batonfx/core
bun add @batonfx/providers @batonfx/mcp @batonfx/skills @batonfx/memory @batonfx/harness @batonfx/repl
bun add @batonfx/runtime @batonfx/transport @batonfx/foldkit @batonfx/test
bun add @batonfx/a2a @batonfx/ag-ui
```

GitHub releases and npm contain the same versioned package tarballs with compiled ESM and declarations for Node 22+ and Bun 1.3+.

## Capability matrix

| Capability                                                          | Package              | Status       |
| ------------------------------------------------------------------- | -------------------- | ------------ |
| Agent loop, events, typed suspension, turn policy, tools, approvals | `@batonfx/core`      | experimental |
| Addressable runs, replay, inspection, waits, and durable stores     | `@batonfx/runtime`   | experimental |
| Provider registration, deterministic local model, model catalog     | `@batonfx/providers` | experimental |
| MCP discovery and Baton `ToolExecutor` adapter                      | `@batonfx/mcp`       | experimental |
| SKILL.md and instruction-file sources                               | `@batonfx/skills`    | experimental |
| Working memory, vector store, semantic recall                       | `@batonfx/memory`    | experimental |
| Continual harness entries, refinements, rollback, snapshots         | `@batonfx/harness`   | experimental |
| Persistent TypeScript cell contracts and the Bun kernel             | `@batonfx/repl`      | experimental |
| Scripted models and normalized request capture                      | `@batonfx/test`      | experimental |
| SSE, WebSocket, wire codecs, snapshots, and reconnecting clients    | `@batonfx/transport` | experimental |
| FoldKit connection, subscription, commands, headless chat model     | `@batonfx/foldkit`   | experimental |
| A2A v1 server projection over Runtime                               | `@batonfx/a2a`       | experimental |
| AG-UI event projection over Runtime                                 | `@batonfx/ag-ui`     | experimental |

## A plugin is a Layer

Baton seams are Effect services. You pay only for the seams you provide: a model registry layer, an approvals layer, a memory layer, a transport registry layer, or your own host implementation. The core loop discovers optional seams with `Effect.serviceOption` when the contract says they are optional.

## Tool placement stays on Effect AI tools

Define tools once with `Tool.make` and `Toolkit.make`. Ordinary in-process calls run through `toolkit.toLayer(...)`; hosts that need placement can route the same toolkit with `ToolExecutor.client`, `ToolExecutor.remote`, `ToolExecutor.mcp`, or `ToolExecutor.sandbox` without redefining schemas or wrapping tools.

```ts
const clientTools = ToolExecutor.layerRouter([
  ToolExecutor.client({
    toolkit,
    execute: ({ call }) => desktopClient.callTool(call.name, call.params),
  }),
])
```

## Effect beta compatibility

| Baton release | Tested Effect range                               | Notes                                                                               |
| ------------- | ------------------------------------------------- | ----------------------------------------------------------------------------------- |
| `0.14.x`      | `effect@4.0.0-beta.98` from the workspace catalog | Every public export remains `@experimental` while `effect/unstable/ai` is unstable. |

## Start here

- Consumer docs: [`docs/site/README.md`](docs/site/README.md)
- 5-minute guide: [Introduction](https://batonfx-docs.up.railway.app/docs/start/introduction)
- Runnable examples: [`examples/`](examples/)
- Product direction: [`PRODUCT.md`](PRODUCT.md)
- Current behavior: [`docs/features/`](docs/features/)
- Vocabulary: [`CONTEXT.md`](CONTEXT.md)

## Repository layout

| Path                 | Purpose                                                                      |
| -------------------- | ---------------------------------------------------------------------------- |
| `packages/core`      | `@batonfx/core` — the Effect-native agent loop.                              |
| `packages/runtime`   | `@batonfx/runtime` — addressable Run lifecycle, stores, and workers.         |
| `packages/providers` | `@batonfx/providers` — provider helpers and deterministic local models.      |
| `packages/mcp`       | `@batonfx/mcp` — MCP client bridge and Baton adapter.                        |
| `packages/skills`    | `@batonfx/skills` — SKILL.md and instruction-file sources.                   |
| `packages/memory`    | `@batonfx/memory` — non-durable memory implementations.                      |
| `packages/repl`      | `@batonfx/repl` — persistent TypeScript cell contracts and the Bun kernel.   |
| `packages/test`      | `@batonfx/test` — scripted model fixtures and normalized request capture.    |
| `packages/transport` | `@batonfx/transport` — Runtime wire codecs, SSE, WS, snapshots, and clients. |
| `packages/foldkit`   | `@batonfx/foldkit` — FoldKit adapter and headless chat model.                |
| `packages/a2a`       | `@batonfx/a2a` — A2A v1 server projection over Runtime.                      |
| `packages/ag-ui`     | `@batonfx/ag-ui` — AG-UI projection over Runtime.                            |
| `docs/features`      | Current behavior and rules relied on by the code.                            |
| `docs/decisions`     | Important choices and why they were made.                                    |
| `docs/tradeoffs`     | Useful notes about meaningful gains and costs.                               |
| `docs/site`          | Consumer-facing guides, recipes, API stability, and positioning.             |
| `examples`           | Private Bun workspaces typechecked in CI.                                    |

## Verification

```bash
bun install
bun run check
bun run package
```

`bun run package` builds once, verifies clean Bun and npm consumers, and writes thirteen tarballs plus release evidence and checksums. Tag pushes named exactly `v<committed version>` create draft-first GitHub releases after checksum and provenance verification and publish the same tarballs to npm.

The npm smoke uses `--legacy-peer-deps` only because the currently pinned external `foldkit@0.122.0` declares `effect@4.0.0-beta.88` while Baton uses beta.98. The installed graph is still checked for one physical Effect package; Bun installation and both runtimes use beta.98.

## Provenance

Baton was developed by [In Time Tec](https://intimetec.com). Applications compose its process-local agent primitives and optional durable Runtime directly through Effect layers.
