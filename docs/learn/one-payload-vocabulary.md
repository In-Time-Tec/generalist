---
title: "One payload vocabulary"
description: "Generalist has no message type of its own: Ai.Prompt and Ai.Response from effect/unstable/ai are the payload vocabulary end to end."
---

Most agent frameworks define their own message shape and then translate at every boundary: provider messages in, framework messages through the middle, UI messages out. Generalist refuses that translation layer. The payload vocabulary is `Ai.Prompt` and `Ai.Response` from `effect/unstable/ai`, end to end. Generalist adds loop framing only, with no second wire format.

## One vocabulary end to end

Your prompt enters a run as `Ai.Prompt.RawInput`. Providers may produce delta-shaped `Ai.Response.StreamPart` values while a call is live, but the authoritative model outcome is one `ModelResponseCommitted` carrying normalized, complete `Ai.Response` content. Tool results are re-fed to the model via `Ai.Prompt.fromResponseParts(...)`. The transcript on `TurnCompleted` and `Completed` is an ordinary `Ai.Prompt.Prompt`. At no point does a Generalist-specific message type appear between you and the model.

## What makePart is

`Ai.Response.makePart` is the upstream constructor for typed stream parts: `text-delta`, `tool-call`, `tool-result`, and friends. It matters for docs and tests because a scripted model built with `Ai.LanguageModel.make` emits exactly the same parts a real provider does. Every zero-credential example on this site speaks the production vocabulary; there is no test-only dialect to unlearn when you wire a real provider.

## What this buys the host

Because the transcript is a plain `Ai.Prompt.Prompt`, it is portable to any consumer of `effect/unstable/ai`, including a later Generalist run. Here a run's transcript is handed straight back as `history` for a second run, with no conversion step:

**portable-transcript.ts**

```typescript
import { Console, Effect, Layer, ManagedRuntime, Schema, Stream } from "effect"
import { Agent, Approvals, ModelMiddleware, Permissions } from "generalist"
import { Tool, Toolkit } from "effect/unstable/ai"
import { TestModel } from "generalist/testing"

const weatherTool = Tool.make("get_weather", {
  description: "Get local weather for a city",
  parameters: Schema.Struct({ city: Schema.String }),
  success: Schema.String,
})

const toolkit = Toolkit.make(weatherTool)

const agent = Agent.make({
  name: "weather-assistant",
  instructions: "Answer with the weather returned by tools.",
  toolkit,
})

const modelLayer = TestModel.layer([
  TestModel.toolCall("get_weather", { city: "Boise" }, { id: "weather-1" }),
  TestModel.text("Boise is sunny and 72°F."),
  TestModel.text("You asked about Boise."),
])

const layers = Layer.mergeAll(
  modelLayer,
  toolkit.toLayer({ get_weather: () => Effect.succeed("sunny and 72°F") }),
  Permissions.layerAllowAll,
  Approvals.layerAutoApprove,
  ModelMiddleware.layerIdentity,
)

const program = Effect.gen(function* () {
  const events = yield* Agent.stream(agent, "What is the weather in Boise?").pipe(Stream.runCollect)
  const first = Array.from(events).findLast((event) => event._tag === "Completed")
  if (first?._tag !== "Completed") return yield* Effect.die("expected a completed run")
  yield* Console.log(first.output)
  yield* Console.log(first.transcript.content.map((message) => message.role).join(" "))
  const second = yield* Agent.run(agent, "Which city did I ask about?", {
    history: first.transcript,
  })
  yield* Console.log(second)
})

const runtime = ManagedRuntime.make(layers)
await runtime.runPromise(program)
```

**Output**

```text
Boise is sunny and 72°F.
system user assistant tool
You asked about Boise.
```

The printed roles (`system user assistant tool`) are upstream message roles, not Generalist inventions. The same portability holds outward: a durable host stores normalized response content once in Session and persists a compact event reference, transport resolves that reference into a semantic observer event with upstream payload schemas, and an eval harness can assert on normalized response parts, all against types owned by `effect` rather than by this framework.

## The invariant

The rule is blunt: payload vocabulary is `Ai.Prompt`/`Ai.Response`; Generalist adds loop framing only. Even [the wire frames](/guides/serve-transport) that carry a run over SSE or WebSocket wrap canonical Runtime `RunEvent` values rather than re-encoding provider fragments. Successful and interrupted model operations cross that boundary as `ModelResponseCommitted` or `ModelResponseInterrupted`. Generalist's event unions and typed errors are framing about the loop, not a second message format, and they are catalogued in [AgentEvent and errors](/reference/core-events). How that framing drives the loop is the subject of [The agent loop](/learn/agent-loop).
