# Generalist

Generalist is a TypeScript framework for building AI agents on [Effect](https://effect.website). An agent is a plain value — a name, instructions, tools, and a turn policy — and running one produces a typed event stream. Models, approvals, permissions, memory, and every other capability are Effect services you can swap, each with a deterministic test layer, so agents run in CI with no API keys.

Use `generalist` for process-local agents and chat streaming. Add `generalist/runtime` when runs need stable addresses, replayable events, durable waits, cancellation, or restart recovery.

## Install

```bash
bun add generalist @effect/ai-openai # or the provider you use
```

`effect` is a peer dependency — install it only if your project does not have it already. Requires `effect@4.0.0-rc.112`, Node 22+ or Bun 1.4+. Everything ships as this single package: names like `generalist/runtime`, `generalist/pg`, or `generalist/providers/openai` are import subpaths, not separate packages. Each adapter's host dependencies are optional peers, so you install only what you import.

## Example

```ts
import { Config, Effect, Layer, Schema } from "effect"
import { Tool, Toolkit } from "effect/unstable/ai"
import { FetchHttpClient } from "effect/unstable/http"
import { Agent, Approvals, Compaction, Permissions } from "generalist"
import { layerConfig as openAiClient, layerModel as openAiModel } from "generalist/providers/openai"
import { WorkingMemory } from "generalist/memory"

const searchDocs = Tool.make("search_docs", {
  description: "Search the product docs",
  parameters: Schema.Struct({ query: Schema.String }),
  success: Schema.Array(Schema.String),
})
const toolkit = Toolkit.make(searchDocs)

const support = Agent.make({
  name: "support",
  instructions: "Answer from the docs. Be brief.",
  toolkit,
})

// One provider client; models are thin layers over it.
const openAi = openAiClient({ apiKey: Config.redacted("OPENAI_API_KEY") }).pipe(Layer.provide(FetchHttpClient.layer))
const sol = openAiModel({ model: "gpt-5.6-sol" }).pipe(Layer.provide(openAi)) // any OpenAI model id

const program = Agent.run(support, "How do I rotate my API key?", {
  memory: { key: { agent: "support", subject: "user:42" } }, // remembers this user across runs
  compaction: { contextWindow: 200_000 }, // old turns compress, never drop
})

await program.pipe(
  Effect.provide(sol), // choose the model per run — nothing else changes
  Effect.provide(
    Layer.mergeAll(
      toolkit.toLayer({ search_docs: () => Effect.succeed(["Settings → API keys → Rotate"]) }),
      Permissions.layerAllowAll, // explicit tool policy: no implicit defaults
      Approvals.layerAutoApprove,
      WorkingMemory.layer({ maxMessages: 50 }),
      Compaction.layer({
        contextWindow: 200_000,
        reserveTokens: 16_384,
        strategy: Compaction.strategy([
          Compaction.toolOutputBound({ maxBytes: 16_384 }),
          Compaction.structuredSummary({ objectName: "AgentSummary" }),
          Compaction.keepRecent({ tokens: 20_000 }),
        ]),
      }),
    ),
  ),
  Effect.runPromise,
)
```

Tools, per-user memory, and compaction — all layers you can swap for tests. Child agents inherit the ambient model or choose their own via a model layer. Durable runs (`generalist/runtime`) add stop, inspect, and resume across restarts; any agent can also be exposed as a tool another agent calls.

## Documentation

[generalist-docs-production.up.railway.app](https://generalist-docs-production.up.railway.app) has tutorials, how-to guides, explanation, and reference for every public subpath.

## Status

Every export is `@experimental` while `effect/unstable/ai` is unstable. Tested against `effect@4.0.0-rc.112`.

## License

[MIT](LICENSE)
