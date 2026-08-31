# Steering

Steering queues input without interrupting work in flight. `RunHandle` exposes
process-local lanes; Runtime stores a durable FIFO inbox by exact Run ID.

## Usage

```ts
import { Effect, Fiber, Stream } from "effect"
import { Agent } from "generalist"

const program = Effect.scoped(
  Effect.gen(function* () {
    const run = yield* Agent.allocateRun(Agent.make({ name: "reviewer" }), { prompt: "Review pull request 42" })

    const steering = yield* run.steer({ prompt: "Focus on concurrency" })
    yield* run.followUp({ prompt: "Then summarize the risks" })

    const fiber = yield* Effect.forkScoped(Stream.runCollect(run.events))
    yield* Fiber.join(fiber)
    return steering // { runId, queue: "steering", sequence: 0, bytes }
  }),
)
```

## What runs

```text
Agent.allocateRun(...)
├── allocate Run ID and private inbox
├── run.steer("Focus on concurrency")
│   └── admit to steering lane, sequence 0
├── run.followUp("Then summarize the risks")
│   └── admit to followUp lane, sequence 0
└── consume run.events
    ├── model turn 0
    ├── tool batch, if requested
    ├── drain steering → model turn 1
    └── would complete
        └── drain followUp → model turn 2 → complete
```

## Durable admission and consumption

```text
runtime.steer({
  runId: "run_01J...",
  idempotencyKey: "review:concurrency",
  prompt: "Focus on concurrency"
})
├── admit finite FIFO entry → { entryId, sequence: 0 }
├── identical retry → same receipt
├── claim read → entry remains pending
└── record model operation + consumed entry IDs (one transaction)
    └── entry becomes consumed
```

Terminalization records a disposition for every remaining durable entry.

## Invariants

- Each process-local inbox has one Run ID, one loop-owned consumer, and producer-only controls.
- `Agent.stream` and `Agent.generate` use the handle path without exposing its controls.
- Session ID is conversation identity; it never selects an inbox.
- Core has no global Run registry.
- Inline children and fan-out members allocate fresh Run inboxes.
- A same-run handoff keeps the original inbox.
- Each lane defaults to 64 entries.
- Both lanes share a 1 MiB bound over canonically encoded prompts.
- Steering drains all pending entries by default after tool results and before the next model turn.
- Follow-up drains one entry by default only when the Run would otherwise complete.
- At process-local completion, follow-up drains before steering.
- Full admission fails with `Steering.InboxFull` by default.
- Only process-local lanes may select interruptible `backpressure` on full.
- Offers, drains, completion, and close share one transactional lifecycle.
- An offer and terminal close have exactly one winner.
- Completion, failure, interruption, and scope close reject later offers with `Steering.RunClosed`.
- Process-local close discards undrained input and wakes blocked producers.
- Steering never interrupts a model call or tool batch already in flight.
- Process loss discards process-local steering; it is not replayed.
- Durable admission is finite, FIFO, and idempotent per Run.
- Durable claim reads do not remove pending input.
- Durable input stays pending until consumption commits with its model operation or terminalization records its disposition.

## Related

- Source: `packages/generalist/src/core/turn/steering.ts`, `packages/generalist/src/core/turn/steering-inbox.ts`, `packages/generalist/src/runtime/run/steering.ts`, `packages/generalist/src/core/agent/lifecycle/run-handle.ts`
- Site: `/docs/guides/steering`
- Decisions/tradeoffs: [Steering consumption is the message ack](../decisions/steering-consumption-is-the-ack.md)
