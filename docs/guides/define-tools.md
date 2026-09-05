---
title: "Define a tool"
description: "Give an agent a typed function and verify that the loop calls it."
---

Add a documentation lookup tool to an agent. You need the packages from the [offline quickstart](/start/quickstart) and basic Effect and Schema knowledge. This example runs without credentials; both the index and model are scripted.

## Define, provide, run

Save as `index.ts` and run `bun index.ts`:

```ts
import { Console, Effect, Layer, Schema } from "effect"
import { Tool, Toolkit } from "effect/unstable/ai"
import { Agent, Approvals, Permissions } from "generalist"
import { layer, text, toolCall } from "generalist/testing/model"

const search = Tool.make("search_docs", {
  description: "Find documentation titles containing a query",
  parameters: Schema.Struct({ query: Schema.String }),
  success: Schema.Array(Schema.String),
})
const toolkit = Toolkit.make(search)
const agent = Agent.make({ name: "docs-assistant", toolkit })
const services = Layer.mergeAll(
  toolkit.toLayer({
    search_docs: ({ query }) => Console.log(`search_docs: ${query}`).pipe(Effect.as(["Define a tool"])),
  }),
  layer([toolCall("search_docs", { query: "tools" }), text("See: Define a tool.")]),
  Permissions.layerAllowAll,
  Approvals.layerAutoApprove,
)

await Agent.run(agent, "Where are tools documented?").pipe(
  Effect.provide(services),
  Effect.flatMap(Console.log),
  Effect.runPromise,
)
```

Expected output:

```text
search_docs: tools
See: Define a tool.
```

The first line proves the handler ran. The final answer is scripted; it does not prove search quality or a live model's judgment.

## Replace the stub

`Tool.make` describes the input and success schemas. `Toolkit.make` collects tools, and `toolkit.toLayer` supplies handlers. Generalist uses these Effect AI types directly; there is no second tool format.

Replace the handler with your application service. Declare the service in the tool's `dependencies` and provide its Layer. Use a declared failure schema and `failureMode: "return"` when the model should receive a tool failure and decide what to do next. See [typed tool boundaries](/decisions/typed-tool-boundaries).

Ordinary in-process tools do not need a custom `ToolExecutor`. Use it only when the host must route execution elsewhere, such as MCP or a remote worker. [Seams as services](/learn/seams-as-services) explains that boundary.

## If it fails

If a handler service is missing, ensure its Layer is provided to the run, not only attached to the agent. If input decoding fails, compare the call with the parameter Schema; do not bypass validation. If permission is denied, inspect your permission rules rather than switching production tools to allow-all.

The allow-all and auto-approve Layers above are for this harmless demo. For tools that write data or spend money, define [permissions](/guides/permissions) and [human approvals](/guides/approvals). Inside long-running handlers, use Effect's interruptible APIs; `ToolContext` exposes progress reporting and an abort signal for abortable integrations.

Next: [require approval](/guides/approvals), then review [operating an agent service](/guides/production) before exposing it to users. Exact tool and output-spill contracts live in [Core tools](/reference/core-tools).
