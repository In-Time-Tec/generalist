# Addressed messaging

Addressed messaging is the name-resolution front end to the unified Run inbox described in [`steering.md`](./steering.md). It is not a second admission or journaling contract.

```ts
import { Effect } from "effect"
import { AgentDirectory, Runtime } from "generalist/runtime"

const send = Effect.gen(function* () {
  const runtime = yield* Runtime.Runtime
  return yield* runtime.sendMessage({
    fromRunId: "run:planner-7",
    to: AgentDirectory.runAddress("run:reviewer-3"),
    idempotencyKey: "review-plan-v1",
    messageId: "msg:review-plan",
    correlationId: "job:42",
    prompt: "Review plan 42 for race conditions.",
    policy: "steer",
    metadata: { priority: "high" },
  })
})
```

`sendMessage` resolves a Run, session, or scoped-name address to one authoritative target Run. It derives the sender from `fromRunId`, checks self/parent/child/sibling relationship plus `MessagingPolicy.allow`, renders sender and message identity into ordinary user content, and calls the same admission used by `Runtime.send`. Denials fail with `NotInFamily`; duplicate conflicts fail with `SteeringConflict`.

`runAddress(runId)` names an exact Run. `sessionAddress(sessionId)` resolves to that session's newest Run at send time. `nameAddress({ scope, name })` resolves a host-assigned name that is unique within its parent or root scope. Parsing an address grants no authority: durable Run records own identity, parentage, and Session membership.

`Runtime.directory(runId)` returns related Runs plus policy-discovered targets that pass the same authorization. `Steering.toolkit()` uses this directory for `send_to_child` and `send_to_parent` and submits through `sendMessage`, so model-callable sends also append `Inbox` before delivery.

See [`steering.md`](./steering.md) for policies, receipts, replay, bounds, acknowledgement, and interruption behavior.

## Related

- Source: `packages/generalist/src/runtime/messaging/`, `packages/generalist/src/runtime/address.ts`, `packages/generalist/src/runtime/execution/agent/directory.ts`
- Site: `/docs/guides/addressed-messaging`
- Decision: [Steering consumption is the message ack](../decisions/steering-consumption-is-the-ack.md)
