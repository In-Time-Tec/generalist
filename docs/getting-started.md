---
title: "Run an agent in your application"
description: "Run the Effect agent loop locally, then give accepted work a recovery path with the optional object-backed Runtime."
---

When an agent is working through a support case or waiting for approval, a server restart shouldn't mean starting over. Generalist turns disposable agent sessions into durable workers: its optional object-backed Runtime records accepted work for recovery on another compute host.

Start here with the process-local Effect agent loop. You own the model, tools, and service Layers; no Runtime or storage is required. This first program makes a model call, not a durable worker. Use Effect AI directly if a single generation is all your application needs.

You can start without a database, server, or API key. The [offline quickstart](/start/quickstart) walks through a tool-calling agent with a scripted model. To use a real model, follow the example below.

## Run an agent with OpenAI

<Warning>
These instructions target Generalist 0.65.2. Use matching Effect packages and do not substitute an older Generalist release expecting the same APIs. To run directly from a checkout, use the [repository examples](/start/examples).
</Warning>

You will need Bun 1.4+ and an OpenAI API key. Generalist also supports Node 22+; see [Installation](/start/installation) for other setups.

```bash
mkdir my-agent && cd my-agent
bun init -y
bun add generalist@0.65.2 effect@4.0.0-rc.112 @effect/ai-openai@4.0.0-rc.112
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

If configuration fails, check that `OPENAI_API_KEY` is set in the shell running Bun. If the provider rejects the request, check model access and account quota. To check the wiring without a provider, run the [offline quickstart](/start/quickstart).

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

Want to see the difference first? [Five minutes: local and object recovery](/start/examples#local-and-object-recovery-in-five-minutes) runs the same scripted agent both ways. Its durable half needs a configured object service; the local acceptance suite provisions MinIO and Miniflare without cloud credentials. Before exposing a server, read [Operate an agent service](/guides/production).

Generalist is pre-1.0 and uses unstable Effect AI APIs. Keep Effect and optional Effect provider packages on the documented matching versions; expect breaking changes between Generalist releases.
