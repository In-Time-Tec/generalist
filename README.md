# Generalist

Generalist is the **Effect-native agent framework**: a standalone model-turn loop over `effect/unstable/ai` plus an optional native durable Runtime, typed tools and suspension, provider layers, memory, skills, transport, and UI adapters that compose as Effect services. `generalist` directly re-exports Effect AI primitives such as `Tool`, `Toolkit`, `LanguageModel`, `Prompt`, `Response`, `Chat`, and `Tokenizer`; those exports are the upstream Effect AI values, not Generalist wrappers.

```ts
import { Effect, Layer, Schema } from "effect"
import { Agent, ModelRegistry, Tool, Toolkit } from "generalist"
import { layer as deterministicLayer } from "generalist/ai/deterministic"

const searchTool = Tool.make("search_docs", {
  description: "Search local docs",
  parameters: { query: Schema.String },
  success: Schema.Array(Schema.String),
})

const toolkit = Toolkit.make(searchTool)
const agent = Agent.make({ name: "assistant", instructions: "Be concise.", toolkit })

const program = ModelRegistry.withModel(
  { provider: "deterministic", model: "local" },
  Agent.generate(agent, { prompt: "Explain Generalist in one sentence." }),
).pipe(
  Effect.provide(
    Layer.mergeAll(
      deterministicLayer({ model: "local" }),
      toolkit.toLayer({ search_docs: () => Effect.succeed(["Getting started"]) }),
    ),
  ),
)
```

Use `generalist` directly for process-local agents and chat streaming. Add `generalist/runtime` when Runs need stable addresses, replayable events, durable waits, cancellation, children, or restart recovery.

## Install

```bash
bun add effect@4.0.0-rc.112 generalist@0.45.0
# Add only the peer for the provider you select, for example:
bun add @effect/ai-openrouter@4.0.0-rc.112
```

Everything ships as the single `generalist` package with compiled ESM and declarations; `generalist/pg`, `generalist/mysql`, `generalist/cloudflare/*`, and `generalist/rivet/actors` are import subpaths, not packages to pass to a package manager. Each adapter's host dependencies are optional peers, so you install and bundle only what you import. The supported engines are Node 22+ and Bun 1.4+; Bun SQLite is Bun-only, Cloudflare adapters run in Workers, and the Rivet subpath exposes an ESM-only Actors host.

## Capability matrix

| Capability                                                          | Import                           | Status       |
| ------------------------------------------------------------------- | -------------------------------- | ------------ |
| Agent loop, events, typed suspension, turn policy, tools, approvals | `generalist`                     | experimental |
| Addressable runs, replay, inspection, waits, and durable stores     | `generalist/runtime`             | experimental |
| Provider registration, deterministic local model, model catalog     | `generalist/ai/*`                | experimental |
| MCP discovery and Generalist `ToolExecutor` adapter                 | `generalist/mcp`                 | experimental |
| SKILL.md and instruction-file sources                               | `generalist/instructions/skills` | experimental |
| Working memory, vector store, semantic recall                       | `generalist/memory`              | experimental |
| Versioned instruction entries, refinements, rollback, snapshots     | `generalist/instructions`        | experimental |
| Persistent TypeScript cell contracts and the Bun kernel             | `generalist/repl`                | experimental |
| Scripted models and normalized request capture                      | `generalist/test`                | experimental |
| SSE, WebSocket, wire codecs, snapshots, and reconnecting clients    | `generalist/transport`           | experimental |
| FoldKit connection, subscription, commands, headless chat model     | `generalist/foldkit`             | experimental |
| A2A v1 server projection over Runtime                               | `generalist/a2a`                 | experimental |
| AG-UI event projection over Runtime                                 | `generalist/ag-ui`               | experimental |
| Rivet actor-local SQLite Runtime host                               | `generalist/rivet/actors`        | experimental |

## A plugin is a Layer

Generalist seams are Effect services. You pay only for the seams you provide: a model registry layer, an approvals layer, a memory layer, a transport registry layer, or your own host implementation. The core loop discovers optional seams with `Effect.serviceOption` when the contract says they are optional.

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

`Runtime.cancel` returning acknowledges durable request admission and a local interrupt request, not `RunCancelled`. Observe `inspect`, events, or a terminal waiting API for the outcome. Generalist waits for process-local owned work to exit; a non-cancellable `never` operation whose outcome is ambiguous remains `unknown` with the Run in `needs-resolution`.

## Effect compatibility

| Generalist release | Tested Effect version                            | Notes                                                                               |
| ------------------ | ------------------------------------------------ | ----------------------------------------------------------------------------------- |
| `0.45.0`           | `effect@4.0.0-rc.112` from the workspace catalog | Every public export remains `@experimental` while `effect/unstable/ai` is unstable. |

## Start here

- Consumer docs: [`docs/site/README.md`](docs/site/README.md)
- 5-minute guide: [Introduction](https://generalist-docs-production.up.railway.app/docs/start/introduction)
- Runnable examples: [`examples/`](examples/)
- Product direction: [`PRODUCT.md`](PRODUCT.md)
- Current behavior: [`docs/features/`](docs/features/)
- Vocabulary: [`CONTEXT.md`](CONTEXT.md)

## License and contributions

Generalist and its published packages are available under the [MIT License](LICENSE). The npm packages are public, but this repository remains private. Package consumers receive the compiled JavaScript, declarations, README, and license in each package tarball; the package license permits use, modification, and redistribution, but package access does not grant repository or unpublished source access.

External contributors can request repository access through the path in [CONTRIBUTING.md](CONTRIBUTING.md). That policy also records review and contributor-agreement expectations. Report vulnerabilities using the private disclosure path in [SECURITY.md](SECURITY.md), not a public issue.

## Repository layout

| Path                  | Purpose                                                                                                                                        |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/generalist` | The whole framework: core agent loop, Runtime, feature entries, `generalist/ai/*` provider leaves, and the pg/mysql/cloudflare/rivet adapters. |
| `docs/features`       | Current behavior and rules relied on by the code.                                                                                              |
| `docs/decisions`      | Important choices and why they were made.                                                                                                      |
| `docs/tradeoffs`      | Useful notes about meaningful gains and costs.                                                                                                 |
| `apps/docs`           | Consumer-facing guides, recipes, API stability, and positioning.                                                                               |
| `examples`            | Private Bun workspaces typechecked in CI.                                                                                                      |

## Verification

```bash
bun install
bun run check
bun run package
```

`bun run package` builds once, verifies clean Bun and npm consumers, and writes one tarball plus release evidence and checksums. Tag pushes named exactly `v<committed version>` create draft-first GitHub releases after checksum and provenance verification and publish the same tarball to npm.

## Provenance

Generalist was developed by [In Time Tec](https://intimetec.com). Applications compose its process-local agent primitives and optional durable Runtime directly through Effect layers.

## License

Generalist is available under the [MIT License](LICENSE).
