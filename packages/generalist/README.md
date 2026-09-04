# Generalist

Build AI agents in TypeScript with [Effect](https://effect.website). Generalist calls a model, runs its tools, and continues until it has an answer. You choose the model, tools, and deployment.

Use the agent loop on its own, or add the optional durable Runtime for work that must survive a restart.

## Install

This example uses OpenAI. You will need an API key and Bun 1.4+.

```bash
bun add generalist effect@4.0.0-rc.112 @effect/ai-openai@4.0.0-rc.112
export OPENAI_API_KEY="your-api-key"
```

## Run an agent

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

`Agent.make` defines the agent; `Agent.run` returns its answer. Provide a different model Layer to change providers or test without an API key. Use `Agent.stream` when you need events instead of just the final result.

## Next steps

- [Offline quickstart](https://github.com/In-Time-Tec/generalist/blob/main/docs/start/quickstart.md): run a tool-calling agent without credentials.
- [Tools](https://github.com/In-Time-Tec/generalist/blob/main/docs/guides/define-tools.md): give an agent functions it can call.
- [Structured output](https://github.com/In-Time-Tec/generalist/blob/main/docs/guides/structured-output.md): return schema-validated objects.
- [Durable Runtime](https://github.com/In-Time-Tec/generalist/blob/main/docs/features/runtime.md): persist work with SQLite, PostgreSQL, or MySQL.
- [Documentation](https://github.com/In-Time-Tec/generalist/tree/main/docs): guides, examples, and API reference.

## Status

Generalist is pre-1.0: APIs can change between releases. Requires `effect@4.0.0-rc.112` and Node 22+ or Bun 1.4+. Public exports are `@experimental` while Effect AI is unstable. Install optional Effect provider and platform packages at the matching version.

Everything ships in this package. Imports such as `generalist/runtime`, `generalist/pg`, and `generalist/testing/model` are subpaths, not separate installs. You only need the optional dependencies for adapters you use.

[MIT](LICENSE) · [Source](https://github.com/In-Time-Tec/generalist)
