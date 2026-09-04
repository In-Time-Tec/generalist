---
title: "How to send durable messages between agents"
description: "Resolve a Run, Session, or scoped name and submit through the unified durable Run inbox."
---

`Runtime.sendMessage` resolves an address and submits through the same durable Run inbox as `Runtime.send`. Addressing adds name resolution and family authorization, not another admission or journal contract.

## 1. Choose an address

| Address                                       | Names                                     | Resolves to                                 |
| --------------------------------------------- | ----------------------------------------- | ------------------------------------------- |
| `AgentDirectory.runAddress(runId)`            | One exact execution                       | That Run                                    |
| `AgentDirectory.sessionAddress(sessionId)`    | One agent identity across successive Runs | That session's `newest` Run at send time    |
| `AgentDirectory.nameAddress({ scope, name })` | A host-assigned friendly name             | The Run bound to that name inside its scope |

Two session-addressed sends can resolve to different Runs if a new Run starts between them. Use `runAddress` when the exact execution matters. Parsing an address never grants authority; durable records own identity and parentage.

## 2. Authorize the pair

Generalist always allows a Run to message itself, its parent, direct children, and siblings. Everything else fails with `NotInFamily` unless the host's directional `MessagingPolicy.allow` permits that exact pair.

**policy-and-send.ts**

```typescript
import { Effect, Layer } from "effect"
import { Prompt } from "effect/unstable/ai"
import { Address, AgentDirectory, ExecutableResolver, Mailbox, Messaging, Runtime } from "generalist/runtime"

/**
 * Cross-session addressing is off by default. Generalist always allows self, parent, direct child, and
 * sibling-under-one-parent from durable parentage; everything else is this one host decision.
 */
const linkedThreads = new Map<string, ReadonlySet<string>>([["session:planner", new Set(["session:reviewer"])]])

const messagingPolicy = Messaging.Policy.make({
  // Directional: allowing planner -> reviewer does not allow reviewer -> planner.
  allow: (input) => Effect.succeed(linkedThreads.get(input.sender.sessionId)?.has(input.target.sessionId) === true),
  // Each announced address is still put through `allow` before it is listed.
  discover: (sender) =>
    Effect.succeed(
      [...(linkedThreads.get(sender.sessionId) ?? [])].map((sessionId) =>
        Address.make(`session:${encodeURIComponent(sessionId)}`),
      ),
    ),
})

export const runtimeLayer = (resolver: ExecutableResolver.Service): Layer.Layer<Runtime.Runtime> =>
  Runtime.layerMemory({
    addresses: [],
    messagingPolicy,
  }).pipe(Layer.provide(Layer.succeed(ExecutableResolver.ExecutableResolver, resolver)))

const text = (value: string) =>
  Prompt.fromMessages([Prompt.makeMessage("user", { content: [Prompt.makePart("text", { text: value })] })])

/** `fromRunId`, not a sender Address: Generalist resolves the sender from its Run record. */
export const ping = (input: {
  readonly fromRunId: string
  readonly targetSessionId: string
}): Effect.Effect<Mailbox.MessageReceipt, Runtime.SendMessageError, Runtime.Runtime> =>
  Runtime.Runtime.use((runtime) =>
    runtime.sendMessage({
      fromRunId: input.fromRunId,
      to: Address.make(`session:${encodeURIComponent(input.targetSessionId)}`),
      idempotencyKey: `ping:${input.targetSessionId}`,
      prompt: text("status?"),
    }),
  )

/** Every address this Run may reach: durable relations plus policy-announced, authorized peers. */
export const reachable = (
  runId: string,
): Effect.Effect<ReadonlyArray<AgentDirectory.DirectoryEntry>, Runtime.DirectoryError, Runtime.Runtime> =>
  Runtime.Runtime.use((runtime) => runtime.directory(runId))
```

- Policy only widens the built-in family relationships.
- The sender and target passed to policy come from durable Run records.
- Policy-discovered addresses are authorized again before appearing in the directory.

## 3. Send through one inbox

`Runtime.sendMessage` takes `fromRunId`, not a sender address, so callers cannot forge Run identity. The ambient service enforces the same rule inside an execution.

**Sending from inside an execution**

```typescript
import { Messaging } from "generalist/runtime"

// Inside an execution, Generalist resolves the sender from the current Run.
const reply = Messaging.AgentMessaging.use((messaging) =>
  messaging.send({
    to: parentAddress,
    idempotencyKey: "result-1",
    prompt: findings,
    policy: "steer",
  }),
)
```

An identical retry returns the original `{ messageId, entryId, sequence, duplicate }` receipt. Different content under the same target Run and idempotency key fails `SteeringConflict`. Count or byte exhaustion fails `InboxFull`.

Every accepted message appends `Inbox { message, policy, from }` with its pending row before delivery. Reopening reconstructs that inbox from the journal without dispatching the message again.

## 4. Choose delivery timing

`policy` accepts `steer`, `enqueue`, `interrupt`, `rollback`, or `reject`. Consumption with the next model operation is the acknowledgement; listing the inbox does not consume entries.

See [How to steer a run](/guides/steering) for exact policy semantics and [the generalist/runtime reference](/reference/runtime) for the surrounding Run lifecycle.
