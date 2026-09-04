---
title: "Getting started"
description: "Build your first AI agent with TypeScript and Effect."
---

Generalist runs AI agents inside your TypeScript application. It handles the loop between model calls and tools, while you choose the provider and write the tool functions.

You can start without a database, server, or API key. The [offline quickstart](/start/quickstart) walks through a tool-calling agent with a scripted model. To use a real model, follow the example below.

## Run an agent with OpenAI

You will need Bun 1.4+ and an OpenAI API key. Generalist also supports Node 22+; see [Installation](/start/installation) for other setups.

```bash
mkdir my-agent && cd my-agent
bun init -y
bun add generalist effect@4.0.0-rc.112 @effect/ai-openai@4.0.0-rc.112
export OPENAI_API_KEY="your-api-key"
```

Save this as `index.ts`:

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

```bash
bun index.ts
```

The program prints the model's answer. The wording varies, and the request uses your OpenAI account's API quota.

## What the code does

- `Agent.make` defines a name and instructions. It does not call the model yet.
- `layerConfig` reads your API key; `layerModel` selects the model. `FetchHttpClient.layer` supplies HTTP requests.
- `Agent.run` describes the work and returns an Effect. `Effect.provide` supplies its model, and `Effect.runPromise` executes it.

An Effect describes work, including its result, possible failures, and required services. A Layer supplies those services. If these ideas are new, the [Effect documentation](https://effect.website/docs/getting-started/introduction/) is a useful companion.

## Choose the next step

- [Add tools](/guides/define-tools) so the agent can look up data or take actions. Tool-calling agents need an explicit authorization policy.
- [Return structured output](/guides/structured-output) when your application needs a typed object rather than prose.
- [Choose another provider](/guides/providers) without changing the agent definition.
- [Test agent behavior](/features/testing) without network calls or API keys.
- [Add the durable Runtime](/features/runtime) when accepted work must survive a restart.

Generalist is pre-1.0 and uses unstable Effect AI APIs. Keep Effect and optional Effect provider packages on the documented matching versions; expect breaking changes between Generalist releases.
