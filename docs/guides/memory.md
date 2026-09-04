---
title: "How to add memory"
description: "Recall and remember across runs with Memory.Key, WorkingMemory, and SemanticRecall over a VectorStore, including a pgvector adapter recipe."
---

Memory is an optional recall/remember seam: before turn 0 the loop asks the `Memory` service for items to inject, and after turns it hands back the transcript to remember. You opt in per run with `RunOptions.memory` and a `Memory.Key` of `{ agent, subject }` that you choose. Generalist never derives memory identity from session ids or users.

Injected recall carries structural provenance in the Chat transcript. Before `Memory.remember`, core removes recall-origin entries without comparing text, so recalled context cannot recursively grow working memory while identical user-authored text is retained. Compacted runs project from the lossless Session path rather than remembering a synthetic checkpoint.

## 1. Start with working memory

`WorkingMemory.layer` from `generalist/memory` keeps a rolling window of recent exchanges per key (`maxMessages`, default 20). Provide the layer, pass the same key on both runs, and the second run sees what the first stored:

**working-memory.ts**

```typescript
import { Console, Effect, Layer, ManagedRuntime, Stream } from "effect"
import { Agent, Approvals, Memory, ModelMiddleware, Permissions, ToolExecutor } from "generalist"
import { LanguageModel, Response } from "effect/unstable/ai"
import { WorkingMemory } from "generalist/memory"

const usage = Response.Usage.make({
  inputTokens: { uncached: 0, total: 0, cacheRead: 0, cacheWrite: 0 },
  outputTokens: { total: 0, text: 0, reasoning: 0 },
})

const key: Memory.Key = { agent: "support-agent", subject: "user-ada" }

const agent = Agent.make({ name: "support-agent" })

const modelLayer = Layer.effect(
  LanguageModel.LanguageModel,
  LanguageModel.make({
    generateText: () => Effect.succeed([{ type: "text", text: "unused" }]),
    streamText: (options) => {
      const content = JSON.stringify(options.prompt.content)
      const text = content.includes("Ada prefers dark mode") ? "Ada prefers dark mode." : "Noted."
      return Stream.make(
        Response.makePart("text-delta", { id: "assistant", delta: text }),
        Response.makePart("finish", { reason: "stop", usage, response: undefined }),
      )
    },
  }),
)

const program = Effect.gen(function* () {
  yield* Agent.run(agent, "Ada prefers dark mode.", {
    memory: { key },
  })
  const second = yield* Agent.run(agent, "What do you remember about Ada?", {
    memory: { key },
  })
  yield* Console.log(second)
})

const runtimeLayer = Layer.mergeAll(
  modelLayer,
  ToolExecutor.layerTest({ execute: () => Effect.die("unexpected tool call") }),
  Permissions.layerAllowAll,
  Approvals.layerAutoApprove,
  ModelMiddleware.layerIdentity,
  WorkingMemory.layer({ maxMessages: 8 }),
)

const runtime = ManagedRuntime.make(runtimeLayer)
await runtime.runPromise(program)
```

**Output**

```text
Ada prefers dark mode.
```

<Note title="Summarize the overflow">
Pass `summarize: { model }` to `WorkingMemory.layer` with a closed LanguageModel layer (for example a provider's `layerModel`) to fold messages that fall out of the window into a running summary instead of dropping them. Pass `summarize: {}` to use the LanguageModel provided where the layer is built; the layer then carries that requirement.
</Note>

## 2. Add semantic recall for long-lived subjects

`SemanticRecall.layer` embeds the run's user text, queries a `VectorStore` scoped to the key, and injects the top matches; on terminal turns it embeds and stores the final user–assistant exchange. It needs two services: a `VectorStore` and an `Ai.EmbeddingModel`; `generalist/providers/openai-embedding` supplies the latter:

**semantic-recall.ts**

```typescript
import { Config, Layer } from "effect"
import { Memory } from "generalist"
import { SemanticRecall, VectorStore, WorkingMemory } from "generalist/memory"
import { layer as openAiEmbeddingLayer } from "generalist/providers/openai-embedding"
import { FetchHttpClient } from "effect/unstable/http"

const embeddingLayer = openAiEmbeddingLayer({
  model: "text-embedding-3-small",
  apiKey: Config.redacted("OPENAI_API_KEY"),
})

export const semanticLayer: Layer.Layer<Memory.Memory, Config.ConfigError> = SemanticRecall.layer({
  limit: 5,
  minScore: 0.4,
}).pipe(Layer.provide(Layer.mergeAll(VectorStore.layerMemory, embeddingLayer)), Layer.provide(FetchHttpClient.layer))

export const workingLayer: Layer.Layer<Memory.Memory> = WorkingMemory.layer({ maxMessages: 20 })
```

To run both kinds of memory on one key, use `layer` from `generalist/memory`: recall merges items from both, remember writes to both.

## Recipe: a pgvector VectorStore

`layerPgVector` stores active vectors plus append-only version history and filters on the complete memory key before ranking by cosine distance. It uses the application's existing `effect/unstable/sql` client:

**pgvector-store.ts**

```typescript
import { Layer } from "effect"
import { SqlClient } from "effect/unstable/sql"
import { layerPgVector, VectorStore } from "generalist/memory"

// Provide this layer with the application's existing effect/unstable/sql SqlClient.
export const pgvectorLayer: Layer.Layer<VectorStore.VectorStore, VectorStore.VectorStoreError, SqlClient.SqlClient> =
  layerPgVector({ table: "memory_documents", dimensions: 1_536 })
```

The in-process `VectorStore.layerMemory` remains the offline-safe default; swap layers, not call sites, when you move to Postgres.

## Next steps

- Understand where recalled items land in the prompt: [Sessions, history, and persistence](/learn/sessions-and-history).
- Keep long sessions inside the window once memory grows: [How to stay inside the context window](/guides/compaction).
