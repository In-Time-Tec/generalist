---
title: "The agent loop"
description: "What a turn is, when follow-up turns run, and why the AgentEvent stream is the whole observable surface of a Generalist run."
---

An `Agent` is a plain value: a name, instructions, a toolkit, and a turn policy. Nothing runs when you call `Agent.make`. The loop starts when you hand that value to `Agent.stream`, the primitive every other run function derives from, together with the four services a run requires. This page explains what happens between the first model call and the terminal `Completed` event.

## What a turn is

A turn is one model call plus the sequential execution of every tool call that model call emits. Turn 0 always runs. When the model responds with tool calls, Generalist executes them in order through the `ToolExecutor` service, collects the results, and feeds them back to the model via `Ai.Prompt.fromResponseParts(...)` as the next turn's input. Under the hood the loop drives an `Ai.Chat` with `disableToolCallResolution: true`, so Generalist, not the model client, owns tool execution, gating, and re-feeding.

Pending tool results are never silently dropped. If the policy stops the loop while results are still waiting to be re-fed, the run fails with `TurnLimitExceeded` only for a configured recurrence cap, or with `PolicyStopped` for another explicit stop reason. Both list the pending calls rather than pretending the conversation ended cleanly.

## Policy gates follow-up turns

`Policy` is a plain value carried by the agent, in the same spirit as an Effect `Schedule`, not a service you provide. It is consulted only when tool results are pending: a turn that produced plain text completes the run regardless of policy. The default is `forever`, which never caps follow-up turns; `recurs(n)` bounds them explicitly, and `untilToolCall` and `both` compose other stopping conditions. [How to control turn budgets](/guides/turn-policy) covers per-turn overrides and a token-budget recipe.

## The event stream is the API

Everything observable about a process-local run arrives through `AgentEvent.Event`: turn, tool, approval, steering, handoff, typed completion, and model telemetry facts share one ordered stream. A successful model operation emits one `ModelResponseCommitted` whose normalized `response.content` is the semantic output for downstream projections. Direct `Agent.stream` observers can also see tentative `ModelPart` provider fragments, but those are deliberately not durable authority. This trace filters that local-only detail so the semantic loop is clear:

**event-trace.ts**

```typescript
import { Console, Effect, Layer, ManagedRuntime, Schema, Stream } from "effect"
import { Agent, Approvals, ModelMiddleware, Permissions, type AgentEvent } from "generalist"
import { LanguageModel, Response, Tool, Toolkit } from "effect/unstable/ai"

const searchTool = Tool.make("search_docs", {
  description: "Search the project docs",
  parameters: Schema.Struct({ query: Schema.String }),
  success: Schema.String,
})

const toolkit = Toolkit.make(searchTool)

const agent = Agent.make({
  name: "docs-assistant",
  instructions: "Answer using the search results.",
  toolkit,
})

let calls = 0

const usage = Response.Usage.make({
  inputTokens: { uncached: 0, total: 0, cacheRead: 0, cacheWrite: 0 },
  outputTokens: { total: 0, text: 0, reasoning: 0 },
})

const modelLayer = Layer.effect(
  LanguageModel.LanguageModel,
  LanguageModel.make({
    generateText: () => Effect.succeed([{ type: "text", text: "unused" }]),
    streamText: () => {
      calls += 1
      return calls === 1
        ? Stream.make(
            Response.makePart("tool-call", {
              id: "search-1",
              name: "search_docs",
              params: { query: "turn policy" },
              providerExecuted: false,
            }),
            Response.makePart("finish", { reason: "tool-calls", usage, response: undefined }),
          )
        : Stream.make(
            Response.makePart("text-delta", { id: "assistant", delta: "Policy caps follow-up turns." }),
            Response.makePart("finish", { reason: "stop", usage, response: undefined }),
          )
    },
  }),
)

const layers = Layer.mergeAll(
  modelLayer,
  toolkit.toLayer({ search_docs: () => Effect.succeed("Policy is a plain value with a default of forever.") }),
  Permissions.layerAllowAll,
  Approvals.layerAutoApprove,
  ModelMiddleware.layerIdentity,
)

const describe = (event: AgentEvent.Event): string =>
  event._tag === "Completed" ? `Completed after ${event.turns} turns` : `turn ${event.turn} ${event._tag}`

const program = Agent.stream(agent, "What does Policy do?").pipe(
  Stream.filter((event) => event._tag !== "ModelPart"),
  Stream.runForEach((event) => Console.log(describe(event))),
)

const runtime = ManagedRuntime.make(layers)
await runtime.runPromise(program)
```

**Output**

```text
turn 0 TurnStarted
turn 0 ModelCallStarted
turn 0 ModelAttemptStarted
turn 0 ModelAttemptFirstOutput
turn 0 ModelAttemptCompleted
turn 0 ModelCallCompleted
turn 0 ModelResponseCommitted
turn 0 ToolExecutionStarted
turn 0 ToolExecutionCompleted
turn 0 TurnCompleted
turn 1 TurnStarted
turn 1 ModelCallStarted
turn 1 ModelAttemptStarted
turn 1 ModelAttemptFirstOutput
turn 1 ModelAttemptCompleted
turn 1 ModelCallCompleted
turn 1 ModelResponseCommitted
turn 1 TurnCompleted
Completed after 2 turns
```

Turn 0 commits a normalized tool-call response, executes the tool, and completes; turn 1 re-feeds the result and commits the text response, so the run ends with `Completed`. Each `TurnCompleted` carries the full transcript so far. A durable Runtime stores normalized response content once in Session and persists a compact semantic event referencing that exact entry; observer transports hydrate the reference. Provider fragments are never durable. The event contracts live in [AgentEvent and errors](/reference/core-events).

## run is a typed fold

`Agent.run` runs the same stream and folds it down to the terminal `Completed` event, returning its schema-decoded `output`. The Agent owns its input and output schemas. `Agent.stream` and `Agent.run` run the identical loop and then one terminal structured-output turn validated against your schema; see [How to get schema-validated output](/guides/structured-output). There is no second loop implementation to learn.

Runs do not always end in `Completed`: a tool that needs a human parks the run on the error channel instead, which is the subject of [Suspension as a typed error](/learn/suspension). To build the loop yourself from an empty directory, start with [the quickstart](/start/quickstart).
