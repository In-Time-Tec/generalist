---
title: "Offline quickstart"
description: "Run a tool-calling agent without an API key, then connect it to a real model."
---

Build a weather assistant that calls a tool and returns an answer. This example uses scripted model responses and a stub weather function, so you can run it without credentials or network access after installation.

## Install

You will need Bun 1.4+.

```bash
mkdir generalist-quickstart && cd generalist-quickstart
bun init -y
bun add generalist effect@4.0.0-rc.112
```

## Define and run the agent

Save this as `index.ts`:

```ts
import { Console, Effect, Layer, Schema } from "effect"
import { Tool, Toolkit } from "effect/unstable/ai"
import { Agent, Approvals, Permissions } from "generalist"
import { layer as testModel, text, toolCall } from "generalist/testing/model"

const weather = Tool.make("get_weather", {
  description: "Get the weather for a city",
  parameters: Schema.Struct({ city: Schema.String }),
  success: Schema.String,
})
const toolkit = Toolkit.make(weather)

const assistant = Agent.make({
  name: "weather-assistant",
  instructions: "Answer using the weather tool.",
  toolkit,
})

const services = Layer.mergeAll(
  testModel([toolCall("get_weather", { city: "Boise" }), text("Boise is sunny and 72°F; no jacket needed.")]),
  toolkit.toLayer({ get_weather: ({ city }) => Effect.succeed(`Sunny and 72°F in ${city}`) }),
  Permissions.layerAllowAll,
  Approvals.layerAutoApprove,
)

await Agent.run(assistant, "Should I bring a jacket in Boise?").pipe(
  Effect.provide(services),
  Effect.flatMap(Console.log),
  Effect.runPromise,
)
```

```bash
bun index.ts
```

Expected output:

```text
Boise is sunny and 72°F; no jacket needed.
```

## What happened?

1. The model requested `get_weather` with `{ city: "Boise" }`.
2. Generalist validated the arguments and checked the tool policy.
3. Your handler returned the weather, which Generalist sent back to the model.
4. The model returned its final answer, and `Agent.run` returned that text.

The scripted model does not reason about the question: it returns the two responses you supplied, in order. This checks that the agent and tool wiring work; it does not test a real model's judgment or fetch live weather.

The allow-all and auto-approve Layers are appropriate for this harmless example. Before connecting tools that write data, spend money, or run commands, choose a [permission policy](/guides/permissions) and [approval flow](/guides/approvals).

## Connect a real model

Keep the agent and toolkit. Replace `testModel(...)` in the service Layer with a provider model Layer from [Getting started](/getting-started), and replace the weather stub with your weather service. The model can then choose when to call the tool and compose its own answer.

## Next steps

- [Define tools](/guides/define-tools): tool inputs, outputs, and handlers.
- [Understand the loop](/learn/agent-loop): turns and streaming events.
- [Test your agent](/features/testing): scripted responses and assertions.
- [Browse examples](/start/examples): larger applications to build on.
