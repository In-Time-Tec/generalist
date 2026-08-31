# Generalist

Generalist is a TypeScript framework for building AI agents on [Effect](https://effect.website). An agent is a plain value — a name, instructions, tools, and a turn policy — and running one produces a typed event stream. Models, approvals, permissions, memory, and every other capability are Effect services you can swap, each with a deterministic test layer, so agents run in CI with no API keys.

Use `generalist` for process-local agents and chat streaming. Add `generalist/runtime` when runs need stable addresses, replayable events, durable waits, cancellation, or restart recovery.

## Install

```bash
bun add effect@4.0.0-rc.112 generalist@0.45.1
# plus the peer for the provider you select, for example:
bun add @effect/ai-openrouter@4.0.0-rc.112
```

Requires Node 22+ or Bun 1.4+. Everything ships as this single package: names like `generalist/runtime`, `generalist/pg`, or `generalist/ai/openrouter` are import subpaths, not separate packages. Each adapter's host dependencies are optional peers, so you install only what you import.

## Example

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

## Documentation

[generalist-docs-production.up.railway.app](https://generalist-docs-production.up.railway.app) has tutorials, how-to guides, explanation, and reference for every public subpath.

## Status

Every export is `@experimental` while `effect/unstable/ai` is unstable. Tested against `effect@4.0.0-rc.112`.

## License

[MIT](LICENSE)
