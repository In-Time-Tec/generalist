---
title: "How to steer and interrupt a running agent"
description: "Inject prompts into one live Run through its scoped handle, and cancel process-local work with Effect interruption."
---

`Agent.allocateRun` allocates one scoped process-local RunHandle with two finite FIFO lanes: `steer` inputs are seen before the next model turn after tool results, and `followUp` inputs are seen only when the Run would otherwise complete. The handle exposes offers and events; only that Run's loop can dequeue input.

## 1. Make a Run and queue inputs

Create the handle before consuming `run.events`, then offer inputs through `run.steer` and `run.followUp`. The scripted model below calls a tool on turn 0, so the correction lands before turn 1 and the follow-up starts one extra turn at the end.

**steer-and-follow-up.ts**

```typescript
import { Console, Effect, Layer, ManagedRuntime, Option, Schema, Stream } from "effect"
import { Agent, Approvals, ModelMiddleware, Permissions } from "generalist"
import { LanguageModel, Response, Tool, Toolkit } from "effect/unstable/ai"

const statusTool = Tool.make("check_status", {
  description: "Check the deploy status of a service",
  parameters: Schema.Struct({ service: Schema.String }),
  success: Schema.String,
})

const toolkit = Toolkit.make(statusTool)

const agent = Agent.make({
  name: "release-agent",
  instructions: "Report deploy status using tools.",
  toolkit,
})

let calls = 0

const usage = Response.Usage.make({
  inputTokens: { total: 1, uncached: 1 },
  outputTokens: { total: 1, text: 1 },
})

const modelLayer = Layer.effect(
  LanguageModel.LanguageModel,
  LanguageModel.make({
    generateText: () => Effect.succeed([{ type: "text", text: "unused" }]),
    streamText: (options) => {
      calls += 1
      if (calls === 1) {
        return Stream.make(
          Response.makePart("tool-call", {
            id: "status-1",
            name: "check_status",
            params: { service: "api" },
            providerExecuted: false,
          }),
          Response.makePart("finish", { reason: "tool-calls", usage, response: undefined }),
        )
      }
      const promptText = JSON.stringify(options.prompt.content)
      const delta = promptText.includes("worker service")
        ? "Follow-up: the worker deploy is healthy too."
        : "The api deploy is healthy, in one sentence as steered. "
      return Stream.make(
        Response.makePart("text-delta", { id: "assistant", delta }),
        Response.makePart("finish", { reason: "stop", usage, response: undefined }),
      )
    },
  }),
)

const layers = Layer.mergeAll(
  modelLayer,
  toolkit.toLayer({ check_status: ({ service }) => Effect.succeed(`${service} is healthy`) }),
  Permissions.layerAllowAll,
  Approvals.layerAutoApprove,
  ModelMiddleware.layerIdentity,
)

const program = Effect.scoped(
  Effect.gen(function* () {
    const run = yield* Agent.allocateRun(agent, { prompt: "Is the api deploy healthy?" })
    yield* run.steer({ prompt: "Keep the answer to one sentence." })
    yield* run.followUp({ prompt: "Also check the worker service." })
    const last = yield* Stream.runLast(run.events)
    if (Option.isNone(last) || last.value._tag !== "Completed") {
      return yield* Effect.die("expected the Run to complete")
    }
    yield* Console.log(`turns: ${last.value.turns}`)
    yield* Console.log(last.value.text)
  }),
)

const runtime = ManagedRuntime.make(layers)
await runtime.runPromise(program)
```

**Output**

```text
turns: 3
Follow-up: the worker deploy is healthy too.
```

- Turn 0 always runs with the original prompt; steering never rewrites input that is already in flight. The drain points are turn boundaries ([The agent loop](/learn/agent-loop)).
- Checkpointed tool results enter the transcript before steered prompts, so middleware and the model see one ordered composed prompt.
- A non-empty follow-up queue starts another normal turn instead of completing, which is why the run reports three turns.
- Every non-empty drain emits `SteeringDrained` after `TurnCompleted` and before the next `TurnStarted`.
- `Policy` still gates follow-up turns; steering does not bypass the cap ([How to control turn budgets](/guides/turn-policy)).

<Note title="Run identity, not Session identity">
`run.runId` addresses the inbox. Concurrent Runs may share a Session while keeping separate controls. The handle closes admission when its Run completes, fails, is interrupted, or leaves scope.
</Note>

## 2. Choose queue policies

The defaults differ because steering corrections compose, while follow-up tasks usually deserve one turn each. Each lane accepts at most 64 entries by default, and both lanes share a 1 MiB encoded-prompt bound.

| Queue      | Drain point                                    | Default mode                                      |
| ---------- | ---------------------------------------------- | ------------------------------------------------- |
| `steer`    | after tool results, before the next model turn | `"all"`: every buffered input, FIFO               |
| `followUp` | when the run would otherwise complete          | `"one-at-a-time"`: at most one input per boundary |

**queue-modes.ts**

```typescript
import { Console, Effect, Schema } from "effect"
import { Agent, Steering } from "generalist"

const agent = Agent.make({ name: "bounded-inbox" })

const program = Effect.scoped(
  Effect.gen(function* () {
    const run = yield* Agent.allocateRun(agent, {
      prompt: "start",
      steering: { steering: { capacity: 1 } },
    })
    const first = yield* run.steer({ prompt: "First correction." })
    const rejected = yield* run.steer({ prompt: "Second correction." }).pipe(Effect.flip)
    const outcome = Schema.is(Steering.InboxFull)(rejected) ? `${rejected.dimension} full` : "closed"

    yield* Console.log(`first sequence: ${first.sequence}, second: ${outcome}`)
  }),
)

await Effect.runPromise(program)
```

**Output**

```text
first sequence: 0, second: entries full
```

Set policy under `RunOptions.steering`. `onFull: "fail"` is the default and rejects without partial admission as typed `Steering.InboxFull`. `onFull: "backpressure"` waits interruptibly for that lane to drain. Run closure wakes a waiting producer with `Steering.RunClosed`. Capacities and byte limits must be positive safe integers; there is no unbounded or silent-drop mode.

<Note title="Process-local versus durable">
A Core RunHandle does not promise replay after interruption or process loss. Use Runtime.send with an admission policy for a durable idempotency key, restart-safe reads, atomic consume-with-model-operation behavior, and terminal disposition. Runtime targets an exact Run ID and uses the same 64-entry and 1 MiB fail-fast defaults.
</Note>

## 3. Interrupt a run

There is no second abort API: interrupting the event-stream fiber with ordinary Effect interruption cancels the live model stream and scoped tool execution. The Run closes both lanes, discards undrained process-local input, and wakes backpressured producers. No input can leak into another Run.

Use steering for soft in-run guidance. For hard gates on what an agent may do, use [approvals](/guides/approvals) and [permission rules](/guides/permissions).
