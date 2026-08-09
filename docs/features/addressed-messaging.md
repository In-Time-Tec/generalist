# Addressed messaging

`@batonfx/runtime` owns durable agent-to-agent messaging: a directory of addressable Runs, a per-target durable inbox, safe-boundary delivery, and one durable `send` operation. Applications supply only the policy for addressing beyond Baton's derived relationships.

## Directory

Every Run is addressable. `AgentDirectory` builds three address shapes:

- `runAddress(runId)` names one exact execution.
- `sessionAddress(sessionId)` names one agent identity across its successive Runs, so a message can cross Sessions. It resolves to that session's **newest** Run, ordered by `(created_at, run_id)` descending. This is the defined contract, not an implementation detail: a session address means "whoever currently speaks for this agent", so a sender that holds one keeps reaching the agent as its Runs turn over, and it resolves even when the Run that was current at send time has since gone terminal. Two consequences follow. If a host keeps several Runs alive in one session concurrently, the newest wins and the others are unaddressable by session address — address those exactly with `runAddress`. And because resolution happens at send time, two sends moments apart can land on different Runs if a new Run started in between; both still land in the one durable inbox for that session, which is keyed by session rather than by Run, so no message is lost across the handover. Ordering is per target session, so a handover never reorders or splits an inbox.
- `nameAddress({ scope, name })` names a host-assigned friendly name. `AgentName` is a bounded lowercase identifier, and a name is unique inside its scope: the Run's parent, or its own root when it has no parent.

An Address states which directory table to read. It never carries authority. `RunStore.directory`, `resolveAddress`, and `listRelated` read identity, parentage, and session membership from the durable Run record; nothing is derived by parsing an id.

## Authorization

`relationship` derives `self`, `parent`, `child`, and `sibling` from durable parent links only. Those four are always allowed. Everything else — including addressing another Session — is refused unless the host's `MessagingPolicy` allows that exact sender/target pair. `Messaging.makePolicy()` with no overrides is the relationship-only default. Refusals are typed `MessagingUnauthorized` carrying `unrelated`, `cross-session`, or `policy`.

### Enabling cross-session addressing

Cross-session messaging is off by default and is enabled by one host-supplied policy, passed as `messagingPolicy` in the Runtime layer options. `allow` receives both resolved directory entries plus the derived `relationship` and a `crossSession` flag, and returns whether that one direction is permitted; `discover` returns addresses the host wants to advertise to a sender, and each one is still put through `allow` before it is listed. Baton's four relationships are checked first, so a policy only ever widens.

```ts
Runtime.layerSqlite({
  // ...
  messagingPolicy: {
    allow: (input) => Effect.succeed(linkedThreads(input.sender.sessionId, input.target.sessionId)),
    discover: (sender) => Effect.succeed(addressesOfThreadsLinkedTo(sender.sessionId)),
  },
})
```

Policy is directional: allowing A→B does not allow B→A. Both callbacks are Effects, so a host may consult its own store. The pair passed to `allow` is authoritative — it is read from durable Run records, never from caller-supplied text — so a policy can trust `sessionId` and `parentRunId` when deciding.

`Runtime.directory(runId)` lists the addresses a Run may reach: its durable relations plus any policy-announced address that also passes authorization. The sender itself is never listed.

## Durable mailbox

`Runtime.sendMessage` takes `fromRunId`, not a sender Address: Baton resolves the sender from its Run record, so cell code cannot forge `from`. Admission is idempotent on `(target session, messageId, idempotencyKey)`; a replay returns the original receipt with `duplicate: true`, and the same identity carrying a different payload fails `MessageConflict`.

Each target has one total order (`sequence`), which preserves per-sender FIFO within it. Bounds are enforced at admission so a sender learns immediately rather than discovering silent loss: `MailboxFull` for the pending-count and pending-byte limits, `MailboxRateLimited` for the per-window limit. Bounds are configured with `mailboxBounds`. A message to a terminal target fails `RunTerminal`.

## Delivery

Delivery reuses steering rather than adding a second mechanism. `deliverPendingMessages` binds each pending entry to the target Run's steering inbox, and the agent loop drains steering only at a turn boundary, consuming the observed batch atomically with the next model operation checkpoint. So a message admitted while a model turn is streaming never interrupts that turn; it lands in the next one. A message for an idle or terminal target stays pending and is taken by that session's next Run. Delivery is exactly-once from the consumer's view, and pending messages survive a Server restart.

Binding is not delivery. The contract is **consumption-acked: at-least-once bind, exactly-once consume.** A message is pending until it is consumed, not until it is bound, so a Run that takes a message and then reaches a terminal state — `succeeded`, `failed`, or `cancelled` — without consuming it returns that message to pending for the session's next Run. Consumption is what marks a steering entry against a model operation, and that happens in the same commit as the operation itself. Exactly-once therefore describes the journal: a turn folds its steering into the prompt before that operation commits, so a Run that dies in between leaves the entry pending and the next Run delivers text a model may already have seen. Repetition across a crash is the deliberate cost of one commit point instead of two. There is no separate ack call, and adding one would introduce a second commit point whose own failure window could lose or duplicate a message.

`deliveredRunId` records which Run currently holds an entry. It is attribution and diagnostics only, never the authority for pending-ness: a filter on `deliveredRunId` alone would strand a message on a Run that died holding it.

A delivered message enters the model as ordinary user content carrying its authoritative sender, so messaging adds no competing payload vocabulary.

## Durable send

Messaging inside an execution goes through `Messaging.make`, which schedules each send as a `send` driver operation with `never` replay policy. A send that crashed between the journal record and the mailbox insert is `Unknown` and is never blindly replayed; a recorded success is returned without crossing the boundary again.

## Backends

Memory, SQLite, PostgreSQL, and MySQL all carry the same contract, and every rule above is proven against all four rather than asserted from one. The SQL backends store the inbox in `baton_messages` and names in `baton_agent_names`; both are part of the replaced baseline schema, so they are created by the normal migration rather than added alongside it.

Two backend facts the contract depends on:

- **Identity is compared byte for byte.** `messageId` and `idempotencyKey` are wire identities, so the MySQL schema declares `utf8mb4_bin` rather than inheriting the server's case-insensitive default; otherwise two distinct messages differing only in case would collide as a `MessageConflict`.
- **Admission serializes on the target.** A mailbox entry takes the next `sequence` for its target session, so concurrent senders into one inbox are serialized on that inbox — a PostgreSQL advisory lock, a MySQL named lock — rather than on any one sender's Run.
