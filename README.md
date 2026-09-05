<img src="docs/images/generalist-logo.png" alt="Generalist logo" width="160" height="160" />

# Generalist

Build AI agents in TypeScript with [Effect](https://effect.website). Generalist runs the conversation loop: call a model, execute its tools, and continue until it has an answer. You choose the model, tools, and where the agent runs.

Start with a normal function call. Add streaming, typed output, approvals, or memory when you need them. For work that must survive a restart, run the same agent with the optional durable Runtime.

## Run your first agent

This example uses OpenAI. You will need an API key and Bun 1.4+.

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

**No API key?** The [offline quickstart](docs/start/quickstart.md) runs a tool-calling agent with a scripted model.

## Build from here

| I want to…                            | Read                                                  |
| ------------------------------------- | ----------------------------------------------------- |
| Give an agent functions it can call   | [Tools](docs/guides/define-tools.md)                  |
| Return a typed object instead of text | [Structured output](docs/guides/structured-output.md) |
| Stream responses and tool events      | [The agent loop](docs/learn/agent-loop.md)            |
| Require approval before running tools | [Approvals](docs/guides/approvals.md)                 |
| Keep context across conversations     | [Memory](docs/guides/memory.md)                       |
| Test without calling a model API      | [Testing](docs/features/testing.md)                   |
| Recover work after a restart          | [Durable Runtime](docs/features/runtime.md)           |

The durable Runtime supports Bun SQLite, PostgreSQL, and MySQL; Cloudflare and Rivet adapters are experimental. You do not need a database or Runtime to use the agent loop. See the [host comparison](docs/features/hosts.md) for capabilities and limitations.

## Documentation and examples

- [Getting started](docs/getting-started.md)
- [Example projects](docs/start/examples.md)
- [API reference](docs/api/index.md)
- [Contributing](CONTRIBUTING.md) · [Security](SECURITY.md) · [Changelog](CHANGELOG.md)

## Status

Generalist is pre-1.0: APIs can change between releases. It currently requires `effect@4.0.0-rc.112` and Node 22+ or Bun 1.4+. Public exports are marked `@experimental` while Effect AI is unstable. Install optional Effect provider and platform packages at the matching version.

Everything ships in the `generalist` package. Imports such as `generalist/runtime` and `generalist/pg` are subpaths, not separate packages.

[MIT](LICENSE) · Built by [In Time Tec](https://intimetec.com).
