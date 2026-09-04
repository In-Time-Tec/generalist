---
title: "How to define tools and toolkits"
description: "Define tools with Tool.make, implement handlers behind your own services, and provide the Effect AI toolkit handler layer."
---

Generalist uses Effect AI tools directly: the model sees the toolkit attached to the agent, and ordinary in-process execution comes from `toolkit.toLayer`. This guide defines a tool, implements its handler behind a service you own, provides the handler layer, and proves the loop calls it. [The agent loop](/learn/agent-loop) explains how tool results feed the next turn.

## 1. Describe the tool for the model

Give `Tool.make` the parameter and success Schemas, and put the real work behind a service so the external call stays swappable in tests. `dependencies` declares that service requirement on the handler; `failureMode: "return"` reports handler failures back to the model as failed tool results instead of failing the run.

**search-tool.ts**

```typescript
import { Context, Effect, Schema } from "effect"
import { Tool, Toolkit } from "effect/unstable/ai"
export interface DocsIndexService {
  readonly search: (query: string) => Effect.Effect<ReadonlyArray<string>>
}

export class DocsIndex extends Context.Service<DocsIndex, DocsIndexService>()(
  "generalist-docs/guides/tools/define-tools/search-tool/DocsIndex",
) {}

export const searchDocsTool = Tool.make("search_docs", {
  description: "Search the documentation index and return matching page titles",
  parameters: Schema.Struct({ query: Schema.String }),
  success: Schema.Struct({ titles: Schema.Array(Schema.String) }),
  failureMode: "return",
  dependencies: [DocsIndex],
})

export const toolkit = Toolkit.make(searchDocsTool)
```

## 2. Build the handler layer

Attach handlers with `toolkit.toLayer` and provide your service layer to it:

**executor.ts**

```typescript
import { Effect, Layer } from "effect"
import { DocsIndex, toolkit } from "./search-tool"

const searchDocsHandler = Effect.fn("Docs.searchDocs")(function* (params: { readonly query: string }) {
  const index = yield* DocsIndex
  const titles = yield* index.search(params.query)
  return { titles }
})

export const toolkitLayer = toolkit.toLayer({ search_docs: searchDocsHandler })

export const docsIndexLayer: Layer.Layer<DocsIndex> = Layer.succeed(
  DocsIndex,
  DocsIndex.of({
    search: (query) => Effect.succeed([`How to define tools and toolkits (matched "${query}")`]),
  }),
)

export const docsToolLayer = toolkitLayer.pipe(Layer.provideMerge(docsIndexLayer))
```

<Note title="Use ToolExecutor only for placement overrides">
Most tools need only the `toolkit.toLayer` handler layer. Provide `ToolExecutor` when a host needs to route a tool call to a client, remote worker, MCP server, sandbox, or durable wait. See [Seams as services](/learn/seams-as-services).
</Note>

## 3. Run the agent against the toolkit

Attach the toolkit to the agent and provide the model plus the handler layer. The scripted model makes this deterministic: it requests `search_docs` on turn 0 and answers from the result on turn 1, with zero credentials:

**run-agent.ts**

```typescript
import { Console, Effect, Layer, ManagedRuntime } from "effect"
import { Agent, Approvals, Permissions } from "generalist"
import { TestModel } from "generalist/testing"
import { docsToolLayer } from "./executor"
import { toolkit } from "./search-tool"

const agent = Agent.make({
  name: "docs-assistant",
  instructions: "Answer using the documentation search tool.",
  toolkit,
})

const modelLayer = TestModel.layer([
  TestModel.toolCall("search_docs", { query: "toolkits" }, { id: "search-1" }),
  TestModel.text("See: How to define tools and toolkits."),
])

const program = Effect.gen(function* () {
  const result = yield* Agent.run(agent, "Where are toolkits documented?")
  yield* Console.log(result)
})

const runtime = ManagedRuntime.make(
  Layer.mergeAll(modelLayer, docsToolLayer, Permissions.layerAllowAll, Approvals.layerAutoApprove),
)
await runtime.runPromise(program)
```

**Output**

```text
See: How to define tools and toolkits.
```

## 4. Report progress and honor cancellation

Inside a handler, resolve `ToolContext.ToolContext` to emit progress updates (they surface as `ToolProgress` events on the run stream), and pass `context.signal` to abortable work so interrupting the run cancels the underlying request:

**progress-handler.ts**

```typescript
import { Effect } from "effect"
import { HttpClient } from "effect/unstable/http"
import { ToolContext } from "generalist"

const _crawlDocsHandler = Effect.fn("Docs.crawlDocs")(function* (params: { readonly startUrl: string }) {
  const context = yield* ToolContext.ToolContext
  const httpClient = yield* HttpClient.HttpClient

  yield* context.emit({ toolCallId: "crawl-1", message: `Fetching ${params.startUrl}` })

  const response = yield* httpClient.get(params.startUrl)

  yield* context.emit({ toolCallId: "crawl-1", data: { status: response.status } })

  return { pages: 1 }
})
```

## 5. Bound large tool outputs

When a tool can return more than you want in context, set `RunOptions.toolOutputMaxBytes` and provide a `Store`. Successful results over the limit are replaced by a bounded `Output` value, `{ inline: { truncated, bytes, maxBytes, preview }, outputPaths }` pointing at the spilled content:

**spill-large-outputs.ts**

```typescript
import { Effect, Layer } from "effect"
import { Agent, Approvals, ModelMiddleware, Permissions, ToolOutput } from "generalist"
import { LanguageModel } from "effect/unstable/ai"
import { docsToolLayer } from "./executor"
import { toolkit } from "./search-tool"

const agent = Agent.make({ name: "docs-assistant", toolkit })

export const run: Effect.Effect<string, Agent.RunError, LanguageModel.LanguageModel> = Effect.scoped(
  Effect.flatMap(
    Layer.build(
      Layer.mergeAll(
        docsToolLayer,
        Permissions.layerAllowAll,
        Approvals.layerAutoApprove,
        ModelMiddleware.layerIdentity,
        ToolOutput.layerMemory,
      ),
    ),
    (services) =>
      Agent.run(agent, "Summarize every page that mentions layers.", {
        toolOutputMaxBytes: 16_384,
      }).pipe(Effect.provideContext(services)),
  ),
)
```

`ToolOutput.layerMemory` keeps spilled outputs in process memory; a host with real storage implements `Store` with one `put` method. Without a store in context, results pass through unchanged.

## Next steps

- Gate a tool behind a human decision: [How to require human approval for a tool](/guides/approvals).
- Allow, deny, or ask by pattern: [How to gate tools with permission rules](/guides/permissions).
- Script executors and models in CI: [How to test agents and run evals in CI](/guides/testing-evals).
