# Generalist

Generalist is a TypeScript framework for building AI agents on [Effect](https://effect.website). An agent is a plain value — a name, instructions, tools, and a turn policy — and running one produces a typed event stream. Models, approvals, permissions, memory, skills, and every other capability are Effect layers you provide at the call site, each with a deterministic test layer, so agents run in CI with no API keys.

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

One agent, typed tools, per-user memory, and compaction against the context window — all layers you can swap for tests. Change the model by providing a different model layer; change the provider by providing a different client layer under it. [Anthropic](https://generalist-docs-production.up.railway.app/docs/guides/runtime/providers), [OpenRouter](https://generalist-docs-production.up.railway.app/docs/guides/runtime/providers), [Bedrock](https://generalist-docs-production.up.railway.app/docs/guides/runtime/providers), and a deterministic model all work the same way.

Agents compose, and each child inherits the ambient model or chooses its own:

```ts
import { Handoff } from "generalist"

const luna = openAiModel({ model: "gpt-5.6-luna" }).pipe(Layer.provide(openAi), Layer.orDie) // closed layer: config resolves at startup

const billing = Agent.make({ name: "billing", instructions: "Resolve billing requests." })

const frontDesk = Handoff.supervisor({
  name: "front-desk",
  instructions: "Route each request to the right specialist.",
  specialists: [
    Handoff.target(billing, { model: luna }), // this specialist runs on Luna; omit to inherit Sol
  ],
})
```

The same agent runs durably. Pin it once (the [durable runtime guide](https://generalist-docs-production.up.railway.app/docs/guides/runtime/serve-transport) shows how), then runs survive restarts, and you can stop, inspect, and resume them from any process:

```ts
import { Effect } from "effect"
import { Runtime } from "generalist/runtime"

const program = Effect.gen(function* () {
  const runtime = yield* Runtime.Runtime
  const receipt = yield* runtime.start({
    executable,
    registrations,
    sessionId: "user:42",
    idempotencyKey: "q:1",
    prompt: "…",
  })
  yield* runtime.cancel({ runId: receipt.runId }) // stop
  yield* runtime.inspect(receipt.runId) // authoritative status + journal cursor
  yield* runtime.respond({ runId: receipt.runId, waitId, resolution: { _tag: "Approved" } }) // approve a suspended run
})
```

See the [multi-agent guide](https://generalist-docs-production.up.railway.app/docs/guides/agent/multi-agent) for supervisors, handoffs, and fan-out.

## Install

```bash
bun add generalist @effect/ai-openai # or the provider you use
```

`effect` is a peer dependency — install it only if your project does not have it already. Requires `effect@4.0.0-rc.112`, Node 22+ or Bun 1.4+. Everything ships as the single `generalist` package: names like `generalist/runtime` or `generalist/pg` are import subpaths, not separate packages, and each adapter's host dependencies are optional peers, so you install only what you import. Every export is `@experimental` while `effect/unstable/ai` is unstable.

## Documentation

Full documentation lives at [generalist-docs-production.up.railway.app](https://generalist-docs-production.up.railway.app), organized in [Diátaxis](https://diataxis.fr) style:

- **Tutorials** ([Start](https://generalist-docs-production.up.railway.app/docs/start/introduction)) — introduction, a five-minute quickstart, and two full app walkthroughs.
- **How-to guides** ([Guides](https://generalist-docs-production.up.railway.app/docs/guides/define-tools)) — tools, providers, approvals, memory, MCP, transport, testing, and more.
- **Explanation** ([Learn](https://generalist-docs-production.up.railway.app/docs/learn/agent-loop)) — how the agent loop, sessions, suspension, and the durable Runtime work, and why.
- **Reference** ([Reference](https://generalist-docs-production.up.railway.app/docs/reference/core-agent)) — every public entrypoint and its contract.

Runnable examples live in [`examples/`](examples/), one README each.

## Capabilities at a glance

| Area                                          | Import                                                                                               |
| --------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| Agent loop, typed tools, approvals, steering  | `generalist`                                                                                         |
| Durable, addressable, replayable runs         | `generalist/runtime`                                                                                 |
| Model providers and a deterministic model     | `generalist/providers/*`                                                                             |
| Memory, skills, versioned instructions        | `generalist/memory`, `generalist/instructions`                                                       |
| MCP, A2A, and AG-UI integrations              | `generalist/unstable/mcp`, `generalist/unstable/a2a`, `generalist/unstable/ag-ui`                    |
| SSE/WebSocket transport and FoldKit chat      | `generalist/unstable/transport`, `generalist/unstable/foldkit`                                       |
| Durable stores                                | `generalist/pg`, `generalist/mysql`, `generalist/unstable/cloudflare/*`, `generalist/unstable/rivet` |
| Scripted models and public conformance suites | `generalist/testing`                                                                                 |

## Repository layout

| Path                                         | Purpose                                                             |
| -------------------------------------------- | ------------------------------------------------------------------- |
| [`packages/generalist`](packages/generalist) | The framework: core agent loop, Runtime, feature entries, adapters. |
| [`apps/docs`](apps/docs)                     | The documentation site.                                             |
| [`docs/`](docs/README.md)                    | Contributor-facing behavior records, decisions, and tradeoffs.      |
| [`examples/`](examples)                      | Runnable Bun examples, typechecked in CI.                           |

## Verification

```bash
bun install
bun run check
bun run test
```

`bun run package` additionally builds the published tarball and verifies it in fresh Bun and npm consumers. Tag pushes named `v<version>` publish to npm after checksum and provenance verification.

## License and contributions

Generalist is available under the [MIT License](LICENSE) and was developed by [In Time Tec](https://intimetec.com). The npm package is public; this repository is private. See [CONTRIBUTING.md](CONTRIBUTING.md) for access and review expectations, and [SECURITY.md](SECURITY.md) for private vulnerability disclosure.
