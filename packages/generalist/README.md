# Generalist

An agent handling a support case or waiting for approval shouldn't lose its work when a server restarts. Generalist turns disposable agent sessions into durable workers in TypeScript, built on [Effect](https://effect.website).

The optional Runtime records accepted work in object storage so another host can recover it. S3-compatible storage and a local directory use one engine; application-owned processes and the generic server are replaceable compute hosts. Commands serialize within a partition. Uncertain external outcomes require resolution, not blind retries.

For scripts and request-local work, use the Effect agent loop without storage or Runtime. It calls a model, runs its tools, and continues to an answer.

## Install

This process-local example uses OpenAI. You will need an API key and Bun 1.4+; model calls incur provider costs.

```bash
bun add generalist effect@4.0.0-rc.112 @effect/ai-openai@4.0.0-rc.112
export OPENAI_API_KEY="your-api-key"
```

## Run an agent

Save this as `index.ts` and run `bun index.ts`:

```ts
import { Config, Console, Effect, Layer } from "effect"
import { FetchHttpClient } from "effect/unstable/http"
import { OpenAiClient, OpenAiLanguageModel } from "@effect/ai-openai"
import { Agent } from "generalist"

const assistant = Agent.make({
  name: "assistant",
  instructions: "Give short, practical answers.",
})

const client = OpenAiClient.layerConfig({ apiKey: Config.redacted("OPENAI_API_KEY") }).pipe(
  Layer.provide(FetchHttpClient.layer),
)
const model = OpenAiLanguageModel.model("gpt-4o-mini").pipe(Layer.provide(client))

await Agent.run(assistant, "When would I use an AI agent instead of a single model call?").pipe(
  Effect.provide(model),
  Effect.flatMap(Console.log),
  Effect.runPromise,
)
```

`Agent.make` defines the agent; `Agent.run` returns its answer. Provide a different model Layer to change providers or test without an API key. Use `Agent.stream` when you need events instead of just the final result.

## Next steps

- [Architecture](https://github.com/In-Time-Tec/generalist/blob/main/docs/decisions/object-native-state-model.md): system boundaries, object commits, and recovery from the top down.
- [Tools](https://github.com/In-Time-Tec/generalist/blob/main/docs/features/tools-and-authorization.md): give an agent functions it can call.
- [Structured output](https://github.com/In-Time-Tec/generalist/blob/main/docs/features/structured-output.md): return schema-validated objects.
- [Object durability](https://github.com/In-Time-Tec/generalist/blob/main/docs/features/durable-stores.md): recover work with the shared object-storage engine and S3-compatible or local-directory transport.
- [Documentation](https://github.com/In-Time-Tec/generalist/tree/main/docs): the documentation site source plus feature, decision, and tradeoff references.

## Status

Generalist is pre-1.0: APIs can change between releases. Requires `effect@4.0.0-rc.112` and Node 22+ or Bun 1.4+. Public exports are `@experimental` while Effect AI is unstable. Install optional Effect provider and platform packages at the matching version.

Local qualification uses MinIO, not live AWS or another S3-compatible provider. Local performance measurements are not production latency or throughput guarantees. Use fresh object namespaces; there is no compatibility reader or migration fallback.

Everything ships in this package. Imports such as `generalist/runtime`, `generalist/durability/s3`, and `generalist/testing/model` are subpaths, not separate installs. You only need the optional dependencies for adapters you use. Object storage is the only production execution authority; ordinary process-local agents need no persistence. The durability contract's long-term intent is not provider certification or a verified performance claim.

[MIT](LICENSE) · [Source](https://github.com/In-Time-Tec/generalist)
