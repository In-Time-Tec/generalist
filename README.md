# TenetKit

TenetKit is the **Effect-native agent framework**: a standalone model-turn loop over `effect/unstable/ai` plus an optional native durable Runtime, typed tools and suspension, provider layers, memory, skills, transport, and UI adapters that compose as Effect services. `tenetkit` directly re-exports Effect AI primitives such as `Tool`, `Toolkit`, `LanguageModel`, `Prompt`, `Response`, `Chat`, and `Tokenizer`; those exports are the upstream Effect AI values, not TenetKit wrappers.

```ts
import { Effect, Layer, Schema } from "effect"
import { Agent, ModelRegistry, Tool, Toolkit } from "tenetkit"
import { layer as deterministicLayer } from "tenetkit/ai/deterministic"

const searchTool = Tool.make("search_docs", {
  description: "Search local docs",
  parameters: { query: Schema.String },
  success: Schema.Array(Schema.String),
})

const toolkit = Toolkit.make(searchTool)
const agent = Agent.make({ name: "assistant", instructions: "Be concise.", toolkit })

const program = ModelRegistry.withModel(
  { provider: "deterministic", model: "local" },
  Agent.generate(agent, { prompt: "Explain TenetKit in one sentence." }),
).pipe(
  Effect.provide(
    Layer.mergeAll(
      deterministicLayer({ model: "local" }),
      toolkit.toLayer({ search_docs: () => Effect.succeed(["Getting started"]) }),
    ),
  ),
)
```

Use `tenetkit` directly for process-local agents and chat streaming. Add `tenetkit/runtime` when Runs need stable addresses, replayable events, durable waits, cancellation, children, or restart recovery.

## Install

```bash
bun add effect tenetkit
# Add only the peer for the provider you select, for example:
bun add @effect/ai-openrouter
```

GitHub releases and npm contain the same versioned package tarballs with compiled ESM and declarations for Node 22+ and Bun 1.3+.

## Capability matrix

| Capability                                                          | Package                   | Status       |
| ------------------------------------------------------------------- | ------------------------- | ------------ |
| Agent loop, events, typed suspension, turn policy, tools, approvals | `tenetkit`                | experimental |
| Addressable runs, replay, inspection, waits, and durable stores     | `tenetkit/runtime`        | experimental |
| Provider registration, deterministic local model, model catalog     | `tenetkit/ai/*`           | experimental |
| MCP discovery and TenetKit `ToolExecutor` adapter                   | `tenetkit/mcp`            | experimental |
| SKILL.md and instruction-file sources                               | `tenetkit/skills`         | experimental |
| Working memory, vector store, semantic recall                       | `tenetkit/memory`         | experimental |
| Agent guidance entries, refinements, rollback, snapshots            | `tenetkit/agent-guidance` | experimental |
| Persistent TypeScript cell contracts and the Bun kernel             | `tenetkit/repl`           | experimental |
| Scripted models and normalized request capture                      | `tenetkit/test`           | experimental |
| SSE, WebSocket, wire codecs, snapshots, and reconnecting clients    | `tenetkit/transport`      | experimental |
| FoldKit connection, subscription, commands, headless chat model     | `tenetkit/foldkit`        | experimental |
| A2A v1 server projection over Runtime                               | `tenetkit/a2a`            | experimental |
| AG-UI event projection over Runtime                                 | `tenetkit/ag-ui`          | experimental |

## A plugin is a Layer

TenetKit seams are Effect services. You pay only for the seams you provide: a model registry layer, an approvals layer, a memory layer, a transport registry layer, or your own host implementation. The core loop discovers optional seams with `Effect.serviceOption` when the contract says they are optional.

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

A concrete route can opt admitted tool operations into Runtime-owned semantic cancellation. The callback must be idempotent for `operationKey` and return only after the provider has definitively cancelled the operation or reports its terminal outcome:

```ts
const durableTools = ToolExecutor.layerRouter([
  ToolExecutor.route({
    tools: ["run_cell"],
    execute: executeCell,
    cancel: ({ operationKey, execution }) => cancelCell(operationKey, execution.call.id),
  }),
])
```

`Runtime.cancel` returning acknowledges durable request admission and a local interrupt request, not `RunCancelled`. Observe `inspect`, events, or a terminal waiting API for the outcome. TenetKit waits for process-local owned work to exit; a non-cancellable `never` operation whose outcome is ambiguous remains `unknown` with the Run in `needs-resolution`.

## Effect compatibility

| TenetKit release | Tested Effect version                             | Notes                                                                               |
| ---------------- | ------------------------------------------------- | ----------------------------------------------------------------------------------- |
| next release     | `effect@4.0.0-rc.112` from the workspace catalog  | The scheduled canary tests the newest Effect v4 release candidate.                  |
| `0.40.x–0.43.x`  | `effect@4.0.0-rc.111` from the workspace catalog  | Every public export remains `@experimental` while `effect/unstable/ai` is unstable. |
| `0.39.x`         | `effect@4.0.0-rc.111` from the workspace catalog  | Every public export remains `@experimental` while `effect/unstable/ai` is unstable. |
| `0.38.x`         | `effect@4.0.0-rc.111` from the workspace catalog  | Every public export remains `@experimental` while `effect/unstable/ai` is unstable. |
| `0.37.x`         | `effect@4.0.0-rc.111` from the workspace catalog  | Every public export remains `@experimental` while `effect/unstable/ai` is unstable. |
| `0.36.x`         | `effect@4.0.0-rc.111` from the workspace catalog  | Every public export remains `@experimental` while `effect/unstable/ai` is unstable. |
| `0.35.x`         | `effect@4.0.0-rc.109` from the workspace catalog  | Every public export remains `@experimental` while `effect/unstable/ai` is unstable. |
| `0.34.x`         | `effect@4.0.0-rc.109` from the workspace catalog  | Every public export remains `@experimental` while `effect/unstable/ai` is unstable. |
| `0.33.x`         | `effect@4.0.0-rc.109` from the workspace catalog  | Every public export remains `@experimental` while `effect/unstable/ai` is unstable. |
| `0.32.x`         | `effect@4.0.0-rc.109` from the workspace catalog  | Every public export remains `@experimental` while `effect/unstable/ai` is unstable. |
| `0.31.x`         | `effect@4.0.0-rc.109` from the workspace catalog  | Every public export remains `@experimental` while `effect/unstable/ai` is unstable. |
| `0.30.x`         | `effect@4.0.0-rc.109` from the workspace catalog  | Every public export remains `@experimental` while `effect/unstable/ai` is unstable. |
| `0.29.x`         | `effect@4.0.0-beta.98` from the workspace catalog | Every public export remains `@experimental` while `effect/unstable/ai` is unstable. |

## Start here

- Consumer docs: [`docs/site/README.md`](docs/site/README.md)
- 5-minute guide: [Introduction](https://tenetkit-docs.up.railway.app/docs/start/introduction)
- Runnable examples: [`examples/`](examples/)
- Product direction: [`PRODUCT.md`](PRODUCT.md)
- Current behavior: [`docs/features/`](docs/features/)
- Vocabulary: [`CONTEXT.md`](CONTEXT.md)

## License and contributions

TenetKit and its published packages are available under the [MIT License](LICENSE). The npm packages are public, but this repository remains private. Package consumers receive the compiled JavaScript, declarations, README, and license in each package tarball; the package license permits use, modification, and redistribution, but package access does not grant repository or unpublished source access.

External contributors can request repository access through the path in [CONTRIBUTING.md](CONTRIBUTING.md). That policy also records review and contributor-agreement expectations. Report vulnerabilities using the private disclosure path in [SECURITY.md](SECURITY.md), not a public issue.

## Repository layout

| Path                  | Purpose                                                                               |
| --------------------- | ------------------------------------------------------------------------------------- |
| `packages/tenetkit`   | Core agent loop, Runtime, feature entries, and exact `tenetkit/ai/*` provider leaves. |
| `packages/pg`         | `@tenetkit/pg` PostgreSQL durable Runtime adapter.                                    |
| `packages/mysql`      | `@tenetkit/mysql` MySQL durable Runtime adapter.                                      |
| `packages/cloudflare` | `@tenetkit/cloudflare` Durable Object and dynamic Worker adapters.                    |
| `docs/features`       | Current behavior and rules relied on by the code.                                     |
| `docs/decisions`      | Important choices and why they were made.                                             |
| `docs/tradeoffs`      | Useful notes about meaningful gains and costs.                                        |
| `apps/docs`           | Consumer-facing guides, recipes, API stability, and positioning.                      |
| `examples`            | Private Bun workspaces typechecked in CI.                                             |

## Verification

```bash
bun install
bun run check
bun run package
```

`bun run package` builds once, verifies clean Bun and npm consumers, and writes four tarballs plus release evidence and checksums. Tag pushes named exactly `v<committed version>` create draft-first GitHub releases after checksum and provenance verification and publish the same tarballs to npm.

## Provenance

TenetKit was developed by [In Time Tec](https://intimetec.com). Applications compose its process-local agent primitives and optional durable Runtime directly through Effect layers.

## License

TenetKit is available under the [MIT License](LICENSE).
