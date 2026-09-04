---
title: "How to get schema-validated output"
description: "Declare an Agent output Schema, return its decoded type from run, and observe it on the terminal Completed event."
---

When the caller needs a typed value instead of prose, declare the Agent's `output` Schema and call `Agent.run` or `Agent.stream`. The normal loop runs first, then one terminal turn asks the model for output matching that Schema. Invalid output fails with `InvalidOutput`; untyped data never escapes.

## 1. Define the Agent's output

Pass any Effect `Schema` as `Agent.make({ output })`. `run` returns the decoded value directly, and its Effect type is derived from the schema:

**extract.ts**

```typescript
import { Console, Effect, Layer, ManagedRuntime, Schema } from "effect"
import { Agent, Approvals, ModelMiddleware, Permissions, ToolExecutor } from "generalist"
import { TestModel } from "generalist/testing"

const invoiceSchema = Schema.Struct({ total: Schema.Finite, currency: Schema.String })

const agent = Agent.make({ name: "extractor", instructions: "Extract invoice data.", output: invoiceSchema })

const modelLayer = TestModel.layer([
  TestModel.text("Extracting invoice."),
  TestModel.object({ output: { total: 42, currency: "USD" } }),
])

const program = Effect.gen(function* () {
  const result = yield* Agent.run(agent, "Invoice total is 42 USD.")
  yield* Console.log(`${result.total} ${result.currency}`)
})

const runtimeLayer = Layer.mergeAll(
  modelLayer,
  ToolExecutor.layerTest({ execute: () => Effect.die("unexpected tool call") }),
  Permissions.layerAllowAll,
  Approvals.layerAutoApprove,
  ModelMiddleware.layerIdentity,
)

const runtime = ManagedRuntime.make(runtimeLayer)
await runtime.runPromise(program)
```

**Output**

```text
42 USD
```

<Note title="Two model paths">
The loop turns use `streamText`; the terminal structured turn uses `generateText`. A scripted model for tests must implement both, which is also why this snippet runs with zero credentials.
</Note>

## 2. Stream the run when you need the events

`Agent.stream` exposes the same agent loop as `Agent.run`, including one normalized `ModelResponseCommitted` for each completed model operation. The trailing `Completed` event carries the typed `output`. Use it when a consumer should observe semantic loop progress before the value lands:

**stream-object.ts**

```typescript
import { Console, Effect, Layer, ManagedRuntime, Schema, Stream } from "effect"
import { Agent, Approvals, ModelMiddleware, Permissions, ToolExecutor } from "generalist"
import { LanguageModel, Response } from "effect/unstable/ai"

const invoiceSchema = Schema.Struct({ total: Schema.Finite, currency: Schema.String })

const agent = Agent.make({ name: "extractor", instructions: "Extract invoice data.", output: invoiceSchema })

const usage = Response.Usage.make({
  inputTokens: { uncached: 0, total: 0, cacheRead: 0, cacheWrite: 0 },
  outputTokens: { total: 0, text: 0, reasoning: 0 },
})

const modelLayer = Layer.effect(
  LanguageModel.LanguageModel,
  LanguageModel.make({
    streamText: () =>
      Stream.make(
        Response.makePart("text-delta", { id: "assistant", delta: "Extracting invoice." }),
        Response.makePart("finish", { reason: "stop", usage, response: undefined }),
      ),
    generateText: () => Effect.succeed([{ type: "text", text: '{"output":{"total":42,"currency":"USD"}}' }]),
  }),
)

const program = Agent.stream(agent, "Invoice total is 42 USD.").pipe(
  Stream.filter((event) => event._tag !== "ModelPart"),
  Stream.runForEach((event) =>
    event._tag === "Completed"
      ? Console.log(`${event._tag}: ${JSON.stringify(event.output)}`)
      : Console.log(event._tag),
  ),
)

const runtimeLayer = Layer.mergeAll(
  modelLayer,
  ToolExecutor.layerTest({ execute: () => Effect.die("unexpected tool call") }),
  Permissions.layerAllowAll,
  Approvals.layerAutoApprove,
  ModelMiddleware.layerIdentity,
)

const runtime = ManagedRuntime.make(runtimeLayer)
await runtime.runPromise(program)
```

**Output**

```text
TurnStarted
ModelCallStarted
ModelAttemptStarted
ModelAttemptFirstOutput
ModelAttemptCompleted
ModelCallCompleted
ModelResponseCommitted
TurnCompleted
ModelCallStarted
ModelAttemptStarted
ModelAttemptFirstOutput
ModelCallCompleted
Completed: {"total":42,"currency":"USD"}
```

## 3. Type both sides of the Agent

`input` and `output` both default to `Schema.String`. Declaring an input struct makes the second argument of `run` and `stream` that struct's decoded type; Generalist encodes it before composing the first model prompt.

<Warning title="The terminal turn does not execute tools">
Tool use belongs to the loop turns before it. If the model must gather data, let the loop do that first; the structured turn only formats what the transcript already contains.
</Warning>

## Next steps

- Bound how many loop turns run before the terminal turn: [How to control turn budgets](/guides/turn-policy).
- Assert structured results in CI: [How to test agents and run evals in CI](/guides/testing-evals).
