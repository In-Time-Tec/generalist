# Addressed messaging

Runtime resolves a Run, session, or scoped name to a durable Run, authorizes the sender, and admits a `Message` to the target session's ordered mailbox. Delivery becomes ordinary user content at a turn boundary and is acknowledged only with the next committed model operation.

## Usage

```ts
import { Effect } from "effect"
import { AgentDirectory, Runtime } from "generalist/runtime"

const send = Effect.gen(function* () {
  const runtime = yield* Runtime.Runtime
  return yield* runtime.sendMessage({
    fromRunId: "run:planner-7",
    to: AgentDirectory.sessionAddress("session:reviewer"),
    idempotencyKey: "review-plan-v1",
    messageId: "msg:review-plan",
    correlationId: "job:42",
    prompt: "Review plan 42 for race conditions.",
    metadata: { priority: "high" },
  })
})
```

## What runs

```text
runtime.sendMessage({ fromRunId: "run:planner-7", ... })
├── resolve sender from durable Run record
├── resolve "session:session%3Areviewer"
│   └── newest Run by (created_at, run_id) descending
├── authorize(sender, target)
│   ├── derive self / parent / child / sibling
│   └── otherwise call MessagingPolicy.allow(...)
├── reject a terminal target unless address is session-scoped
└── admit Message to target session mailbox
    ├── check identity, bounds, and rate window
    ├── allocate next target sequence
    └── at a turn boundary, bind entry to steering
        └── commit model operation + consume batch atomically
```

## Data flow

```text
SendMessageInput
{ fromRunId: "run:planner-7", messageId: "msg:review-plan",
  to: "session:session%3Areviewer", prompt: "Review plan 42..." }
        │ resolve + normalize + derive authoritative `from`
        ▼
Message admission
{ from: "run:run%3Aplanner-7", targetSessionId: "session:reviewer",
  idempotencyKey: "review-plan-v1", correlationId: "job:42" }
        │ admitMessage(): digest, bytes, sequence
        ▼
MailboxEntry { sequence: 0, deliveredRunId: undefined }
```

## Failure paths

```text
authorize(sender, target)
├── related directly ─────────────────────────────── allow
└── unrelated
    └── MessagingPolicy.allow(...) === false
        └── MessagingUnauthorized
            ├── same session:  reason = "unrelated"
            └── other session: reason = "cross-session"
```

## Invariants

- `runAddress(runId)` names one exact Run; `sessionAddress(sessionId)` identifies one session and resolves at send time to its newest Run, including a terminal Run.
- Concurrent Runs in one session require Run addresses to avoid newest-Run selection; handover sends may resolve differently, but the session's single inbox and sequence do not split or reorder.
- `nameAddress({ scope, name })` is unique within the parent Run's scope, or the root Run's own scope; names are 1–64 lowercase letters, digits, dots, underscores, or hyphens and begin alphanumerically.
- Address parsing selects a lookup only; durable Run records establish identity, parentage, session membership, and authority.
- `Runtime.directory(runId)` excludes the sender, de-duplicates Runs, and returns durable relations plus policy-discovered targets that pass authorization.
- Durable direct `self`, `parent`, `child`, and `sibling` relationships are always allowed; policy can only widen access, and `Messaging.Policy.make()` defaults to relationships only.
- `MessagingPolicy.allow` receives authoritative entries, relationship, and `crossSession`; policy is directional, both callbacks are Effects, `discover` results are reauthorized, and the Runtime layer receives the policy as `messagingPolicy`.
- Current denials emit `unrelated` or `cross-session`; `policy` is reserved by the error schema but is not currently emitted.
- `fromRunId` is resolved and `from` is derived, so callers cannot forge sender identity; knowing an address grants no authority.
- Admission identity is target session + `messageId` + `idempotencyKey`; an exact replay returns the original receipt with `duplicate: true`, while changed payload fails with `MessageConflict`.
- Admission assigns the target's next sequence, preserves per-sender FIFO, and serializes concurrent senders on that inbox.
- `mailboxBounds` limits pending count, pending bytes, and sends per window; overflow fails with `MailboxFull` or `MailboxRateLimited` and never drops data.
- A terminal exact Run or name target fails with `RunTerminal`; a session address may wait for and bind to a later Run, while an exact Run-addressed message never migrates.
- Pending entries and inbox order survive server restart; a message remains pending until consumption.
- Delivery binds pending entries to steering only at a turn boundary, never interrupting an active model stream; the observed batch is consumed atomically with the next model-operation checkpoint.
- Binding is at least once and journal consumption is exactly once; there is no separate acknowledgement call, and a crash after model visibility but before commit may expose the text again.
- If a holder succeeds, fails, or is cancelled before consumption, only a session-addressed message returns to pending for a later Run; `deliveredRunId` is attribution, not pending state.
- Delivery is ordinary user content carrying authoritative sender and message ID, not a second model payload format.
- Child settlement observations are exact-parent-Run entries: generic inbox reads exclude them, they never become model content or migrate, and hosts read them through `childSettlements`, `childSettlementChanges`, or `awaitChildSettlement`; the initiating call already returns the child outcome.
- `Messaging.make` records in-execution sends as durable `send` driver operations with `never` replay: recorded success reuses its receipt, while a crash between journal record and mailbox insertion becomes `Unknown` rather than retrying blindly.
- Memory, SQLite, PostgreSQL, and MySQL share the contract; SQL uses `generalist_messages` and `generalist_agent_names`, baseline migrations create both, and identities compare byte-for-byte (MySQL uses `utf8mb4_bin`).
- PostgreSQL advisory locks and MySQL named locks allocate each target session's sequence.

## Related

- Source: `packages/generalist/src/runtime/messaging/`, `packages/generalist/src/runtime/address.ts`, `packages/generalist/src/runtime/execution/agent/directory.ts`
- Site: `/docs/guides/addressed-messaging`
- Decisions/tradeoffs: [`steering-consumption-is-the-ack`](../decisions/steering-consumption-is-the-ack.md)
