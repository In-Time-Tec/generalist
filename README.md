<img src="docs/images/generalist-logo.png" alt="Generalist logo" width="160" height="160" />

# Generalist

An agent handling a support case or waiting for approval shouldn't lose its work when a server restarts. Generalist turns disposable agent sessions into durable workers in TypeScript, built on [Effect](https://effect.website).

The optional Runtime records accepted work in object storage so another host can recover it. One engine supports S3 and native R2; local processes, servers, Cloudflare Durable Objects, and Rivet actors are replaceable compute hosts. Commands serialize within a partition, not across the whole application. If an external action's outcome is uncertain, recovery surfaces it for resolution rather than assuming it is safe to repeat.

Don't need recovery yet? Use the process-local Effect agent loop on its own: call a model, execute tools, and continue to an answer. It needs no storage or Runtime.

## Run your first agent

This process-local example uses OpenAI. You will need an API key and Bun 1.4+; model calls incur provider costs. To run directly from a checkout, use the [repository examples](examples/).

```bash
bun add generalist effect@4.0.0-rc.112 @effect/ai-openai@4.0.0-rc.112
export OPENAI_API_KEY="your-api-key"
```

Save this as `index.ts` and run `bun index.ts`:

```ts
import { Config, Console, Effect, Layer } from "effect"
import { FetchHttpClient } from "effect/unstable/http"
import { Agent } from "generalist"
import { layerConfig, layerModel } from "generalist/providers/openai"

const assistant = Agent.make({
  name: "assistant",
  instructions: "Give short, practical answers.",
})

const model = layerModel({ model: "gpt-4o-mini" }).pipe(
  Layer.provide(layerConfig({ apiKey: Config.redacted("OPENAI_API_KEY") })),
  Layer.provide(FetchHttpClient.layer),
)

await Agent.run(assistant, "When would I use an AI agent instead of a single model call?").pipe(
  Effect.provide(model),
  Effect.flatMap(Console.log),
  Effect.runPromise,
)
```

`Agent.make` defines the agent; `Agent.run` returns its answer. The model is an Effect Layer—a recipe for providing the services the run needs. Swap that Layer to use another provider or a scripted model in tests.

**No API key?** The [documentation site](docs/) has an offline quickstart that runs a tool-calling agent with a scripted model.

## Build from here

| I want to…                            | Read                                                    |
| ------------------------------------- | ------------------------------------------------------- |
| Give an agent functions it can call   | [Tools](docs/features/tools-and-authorization.md)       |
| Return a typed object instead of text | [Structured output](docs/features/structured-output.md) |
| Stream responses and tool events      | [The agent loop](docs/features/agent-loop.md)           |
| Require approval before running tools | [Approvals](docs/features/approvals.md)                 |
| Keep context across conversations     | [Memory](docs/features/memory.md)                       |
| Test without calling a model API      | [Testing](docs/features/testing.md)                     |
| Recover work after a restart          | [Durable Runtime](docs/features/runtime.md)             |

Durable execution uses one object-storage engine through `generalist/durability`, with S3 and native R2 transports. There is no production memory or filesystem durability backend. You do not need storage or Runtime for the process-local agent loop. Start with the [object durability guide](docs/features/durable-stores.md); the [host comparison](docs/features/hosts.md) separates host integration from provider conformance.

## Documentation and examples

- [Documentation site source](docs/) — the code-first docs (Foldkit + StyleX), run `bun run dev` to preview
- [Feature reference](docs/features/) · [Decision records](docs/decisions/) · [Tradeoffs](docs/tradeoffs/)
- [Example projects](examples/)
- [Contributing](CONTRIBUTING.md) · [Security](SECURITY.md) · [Changelog](CHANGELOG.md)

## Status

Generalist is pre-1.0: APIs can change between releases. It currently requires `effect@4.0.0-rc.112` and Node 22+ or Bun 1.4+. Public exports are marked `@experimental` while Effect AI is unstable. Install optional Effect provider and platform packages at the matching version.

Local qualification uses MinIO and Miniflare/workerd, not live AWS S3 or deployed R2. Local performance measurements are not production latency or throughput guarantees. Use fresh object namespaces; there is no compatibility reader or migration fallback.

Everything ships in the `generalist` package. Imports such as `generalist/runtime` and `generalist/durability/s3` are subpaths, not separate packages. The durability contract is intended to be the long-term storage boundary, but remains `@experimental`; that intent is not provider certification or a performance claim.

[MIT](LICENSE) · Built by [In Time Tec](https://intimetec.com).
