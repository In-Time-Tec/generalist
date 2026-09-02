# Steering and Run messaging

`Runtime.send` is the durable admission primitive for user steering and Run-to-Run messages. Every accepted message is appended to the target Run journal as `Inbox { message, policy, from }` before it can be delivered.

## Durable usage

```ts
import { Effect } from "effect"
import { Runtime } from "generalist/runtime"

const program = Effect.gen(function* () {
  const runtime = yield* Runtime.Runtime

  return yield* runtime.send("run:reviewer", "Focus on the race in the worker", {
    policy: "steer",
    from: { user: "alice" },
    idempotencyKey: "review:worker-race",
  })
})
```

The default policy is `steer`; the default source is `{ system: true }`. A caller may instead use `{ user }` or `{ runId }`. Host-authorized user and system sources bypass Run-family checks. A Run source is resolved from durable records and may send only to itself, its parent, a direct child, or a sibling unless `MessagingPolicy.allow` explicitly widens access. Denial fails with `NotInFamily`.

| Policy      | Admission behavior                                                                                                                  |
| ----------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `steer`     | Deliver at the next safe model boundary, after all current tool results are journaled.                                              |
| `enqueue`   | Deliver only after the current turn would otherwise complete.                                                                       |
| `interrupt` | Journal first, interrupt active work, and leave ambiguous in-flight tools as `Unknown` operator obligations before the Run resumes. |
| `rollback`  | Rewind to the last completed-turn boundary, activate the Run, then deliver as the first input of the replacement turn.              |
| `reject`    | Fail with `RunBusy` and append no `Inbox` event while an execution owns the Run.                                                    |

An accepted call returns `{ entryId, sequence }`. A retry with the same Run, `idempotencyKey`, prompt, policy, source, and addressed metadata returns the same receipt. Different content under the same key fails with `SteeringConflict`.

```text
runtime.send(runId, message, options)
├── resolve target and authoritative source
├── enforce Run-family policy when source is { runId }
├── apply reject or rollback admission policy
├── append Inbox and the pending inbox row atomically
└── deliver by policy
    ├── steer/interrupt/rollback → next safe model boundary
    └── enqueue                  → completion boundary
        └── commit SteeringConsumed with the model operation
```

Safe-boundary consumption is the acknowledgement. Reading the inbox does not remove entries. A close/reopen reconstructs policy, source, addressed metadata, and FIFO sequence from the journal; committed entries are not redispatched.

## Addressed Run messaging

`runtime.sendMessage({ fromRunId, to, prompt, idempotencyKey, policy? })` retains Run, session, and scoped-name address resolution. It resolves the target and authoritative sender, then delegates to the same `Runtime.send` admission and `Inbox` journal path. Addressed content carries sender address and message ID as ordinary user prompt metadata; there is no second delivery journal.

## Process-local usage

Process-local handles keep the explicit lanes for simple producers and add the policy API:

```ts
const run = yield * Agent.allocateRun(agent, { prompt: "Review pull request 42" })

yield * run.steer({ prompt: "Focus on concurrency" })
yield * run.followUp({ prompt: "Then summarize the risks" })
yield * Agent.send(run, "Stop the active tool", "interrupt")
```

`Agent.send` maps `steer`, `enqueue`, `interrupt`, and `reject` onto the same private inbox. Process-local interrupt stops active tool fibers and reports an interrupted tool result before the next model call. `rollback` fails with `RollbackRequiresRuntime` because a process-local Run has no durable journal to rewind.

Each process-local lane defaults to 64 entries and both share a 1 MiB prompt bound. Process loss discards these lanes. Durable Runtime inboxes use the same finite defaults and retain entries until atomic model-operation consumption or terminal disposition.

## Model-callable tools

`Steering.toolkit()` returns Effect AI tools named `send_to_child`, `send_to_parent`, and `list_inbox`. Include `Steering.layer` with the Agent's tool handlers. Runtime supplies authoritative current-Run identity and messaging; child and parent sends still pass through family authorization and the unified inbox.

## Invariants

- The durable journal and pending inbox row commit together before delivery.
- `onSteer` runs when any accepted message drains, including addressed messages.
- Steering never cuts ahead of unjournaled tool results.
- Interruptions do not turn unknown external outcomes into silent failures.
- `enqueue` and immediate policies retain independent pending prefixes while sharing one FIFO sequence.
- Terminalization records a disposition for every remaining durable entry.
- Session identity does not replace exact Run identity for direct `Runtime.send`.
- A same-Run handoff keeps the original process-local inbox.

## Related

- Address resolution details: [`addressed-messaging.md`](./addressed-messaging.md)
- Source: `packages/generalist/src/core/turn/steering.ts`, `packages/generalist/src/core/turn/steering-inbox.ts`, `packages/generalist/src/runtime/steering.ts`, `packages/generalist/src/runtime/run/steering.ts`, `packages/generalist/src/runtime/messaging/`
- Site: `/docs/guides/steering`
- Decision: [Steering consumption is the message ack](../decisions/steering-consumption-is-the-ack.md)
