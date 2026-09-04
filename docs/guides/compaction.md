---
title: "How to stay inside the context window"
description: "Provide Compaction.layer to microcompact tool outputs and summarize old history into checkpoints, or truncate with a Tokenizer."
---

Compaction is optional: when a `Compaction` layer is present, the loop consults it before model turns and once more after a context-overflow failure. The default strategy works in two stages: first it microcompacts oversized tool outputs, and only if that is not enough does it summarize older history into a checkpoint while keeping a recent suffix verbatim.

## 1. Provide the layer

Wire `Compaction.layer` with your thresholds. Generalist resolves the active model's window from `ModelCatalog`; set `RunOptions.compaction.contextWindow` only to override it. Set `toolOutputMaxBytes` so stage one has a bound to enforce:

**compaction-layer.ts**

```typescript
import { Effect, Layer } from "effect"
import { Agent, Approvals, Compaction, ModelMiddleware, Permissions, ToolExecutor, ToolOutput } from "generalist"
import { LanguageModel } from "effect/unstable/ai"

const agent = Agent.make({ name: "long-running-assistant" })

const compactionLayer = Compaction.layer({
  contextWindow: 128_000,
  reserveTokens: 16_384,
  strategy: Compaction.strategy([
    Compaction.toolOutputBound({ maxBytes: 16_384 }),
    Compaction.structuredSummary({ objectName: "AgentSummary" }),
    Compaction.keepRecent({ tokens: 20_000 }),
  ]),
})

export const run: Effect.Effect<string, Agent.RunError, LanguageModel.LanguageModel> = Effect.scoped(
  Effect.flatMap(
    Layer.build(
      Layer.mergeAll(
        ToolExecutor.layerTest({ execute: () => Effect.die("no tools in this example") }),
        Permissions.layerAllowAll,
        Approvals.layerAutoApprove,
        ModelMiddleware.layerIdentity,
        compactionLayer,
        ToolOutput.layerMemory,
      ),
    ),
    (services) =>
      Agent.run(agent, "Continue the migration plan.", {
        compaction: { contextWindow: 128_000 },
      }).pipe(Effect.provideContext(services)),
  ),
)
```

| Option             | Default                                   | Meaning                                           |
| ------------------ | ----------------------------------------- | ------------------------------------------------- |
| `contextWindow`    | active model catalog; 32,768 when unknown | Model context size the strategy compacts against  |
| `reserveTokens`    | `16_384`                                  | Headroom kept free for the next model response    |
| `keepRecentTokens` | `20_000`                                  | Recent history kept verbatim past the summary cut |
| `summaryModel`     | the run's model                           | Dedicated model layer for summary calls           |
| `summaryPrompt`    | `summaryTemplate`                         | Prompt for the summary call                       |

## 2. Compose independent strategy parts

`Compaction.strategy` applies parts from left to right. `toolOutputBound` supplies a lossless spill limit, `structuredSummary` validates the fixed `AgentSummary` object and renders it into a deterministic checkpoint string, and `keepRecent` sets the recent token target. Request-level `toolOutputMaxBytes` still overrides the strategy bound.

<Note title="Tokens, not inferred turns">
Session entries do not carry a canonical turn id, so keepRecent is token-denominated. This avoids splitting user, assistant, tool-call, and tool-result cycles based on role guesses.
</Note>

## 3. Know what the summarize stage needs

The summarize stage cuts along session entries, so a run activates it by supplying an explicit `sessionId` with a `SessionDirectory`; the cut never splits a tool call from its result, and the summary lands in history as a `<conversation-checkpoint>` user message while a `Compaction` entry records it in the session log. Without an active session, microcompaction still bounds tool outputs. [Sessions, history, and persistence](/learn/sessions-and-history) covers the entry log.

<Note title="Reactive compaction">
When the selected model registration classifies a model call failure as context overflow, the loop re-consults the service with `overflow: true` and retries the turn once only when compaction changes the prompt projection.
</Note>

## 4. Truncate when summaries are not worth a model call

`Compaction.layerTruncate(maxTokens)` cuts the oldest messages with an `Ai.Tokenizer` instead of summarizing: no extra model call, no session store needed. The layer declares the tokenizer requirement; `layerTruncateEstimated(maxTokens)` is the approximate variant that needs none:

**truncate-only.ts**

```typescript
import { Compaction } from "generalist"

// Exact: declares the Tokenizer requirement on the layer.
export const truncateLayer = Compaction.layerTruncate(100_000)

// Approximate: drops oldest messages by the token estimator, no Tokenizer needed.
export const estimatedLayer = Compaction.layerTruncateEstimated(100_000)
```

## Recipe: context-truncation middleware

For a cheap local bound before the model ever sees the prompt (independent of session history), trim inside a `ModelMiddleware.transformPrompt` hook. Use middleware for per-turn input hygiene and keep `Compaction` for anything that must understand cut points and summaries:

**trim-middleware.ts**

```typescript
import { Effect, Layer, Schema } from "effect"
import { ModelMiddleware } from "generalist"
import { Prompt } from "effect/unstable/ai"

const maxUserChars = 8_000

const trimPart = (part: Prompt.UserMessagePart): Prompt.UserMessagePart =>
  part.type === "text" && part.text.length > maxUserChars
    ? Prompt.makePart("text", { text: `${part.text.slice(0, maxUserChars)}\n[truncated]` })
    : part

const trimUserText: ModelMiddleware.Middleware = {
  transformPrompt: (prompt) =>
    Effect.succeed(
      Prompt.fromMessages(
        prompt.content.map((message) =>
          message.role === "user" && !Schema.is(Schema.String)(message.content)
            ? Prompt.makeMessage("user", { content: message.content.map(trimPart) })
            : message,
        ),
      ),
    ),
}

export const middlewareLayer: Layer.Layer<ModelMiddleware.ModelMiddleware> = ModelMiddleware.layer([trimUserText])
```

The two compose: middleware trims nonessential user text every turn, `Compaction.layer` handles long-running session growth. [How to add guardrails, middleware, and retries](/guides/middleware) covers the middleware chain contract.

## Next steps

- Cap runs that should end rather than compact: [How to control turn budgets](/guides/turn-policy).
- Bound tool outputs at the source: [How to define tools and toolkits](/guides/define-tools).
