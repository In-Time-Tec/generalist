---
title: "Runtime"
description: "Run typed Agents and manage Sessions through scoped commands and bounded observations."
---

The Runtime turns a declared Agent and typed input into a durable Run. Applications use semantic commands and bounded observations; the engine owns registration, claims, persistence, and scheduling. One object-native engine supplies recovery through S3 or native R2, independently of the compute host.

## Usage

```ts
import { Crypto, Effect, Layer } from "effect"
import { Agent } from "generalist"
import { ObjectStore } from "generalist/durability/object-store"
import { Runtime } from "generalist/runtime"

const agent = Agent.make({ name: "build-explainer" })
declare const agentServices: Layer.Layer<Agent.Requirements<typeof agent>>
declare const storage: Layer.Layer<ObjectStore | Crypto.Crypto>

const runtimeLayer = Runtime.layer({
  agents: { "build-explainer": agent },
  revision: "build-explainer-v1",
  services: agentServices,
  storage,
  namespace: { environment: "production", tenant: "builds", partition: "default" },
})

const program = Effect.gen(function* () {
  const runtime = yield* Runtime.Runtime
  const handle = yield* runtime.start(agent, "Explain the failed build", {
    sessionId: "session:42",
    idempotencyKey: "answer:1",
  })
  return yield* handle.await
})

Effect.runPromise(program.pipe(Effect.provide(runtimeLayer), Effect.scoped))
```

This composition fragment needs the model/tool services required by the Agent and an object transport plus Crypto. See [object durability](./durable-stores.md) for S3 and native R2 configuration. Declaring the Layer performs no I/O; acquiring it validates and registers the declarations, acquires execution ownership, and starts the scheduler before publishing Runtime.

`start` admits work for immediate execution. `hold(agent, input, { idempotencyKey })` instead returns a held handle; only `handle.activate(commandId)` opens its execution gate. Both handles expose the Run ID, schema-decoded `await`, replay-then-live `events`, and `send` for an existing Run's inbox. `schedule` registers a durable recurrence for a declared Agent.

The acquired `Runtime.Runtime` is ready without `Durability.activate`. Ownership loss interrupts and awaits owned work; retained commands and observations fail `RuntimeOwnershipLost`, or `RuntimeRetired` after scope closure. The lossy preview stream stops without adding a failure channel. Advanced compute-host adapters retain their explicit activation boundary, but ordinary applications do not register Agents, claim Runs, or construct schedulers.

`inspect` and bounded `list({ limit, status? })` return canonical public Run views. Session admission is grouped under `sessions`, direct-child observations under `children`, and addressed delivery under `messaging`. Operator recovery remains under `operator`. Execution-scoped child mutation is a separate nominal capability supplied to an execution-service factory; knowing another Run ID does not grant that capability.

## What runs

```text
Runtime.start(agent, input, { sessionId: "session:42", idempotencyKey: "answer:1" })
├── resolve the process registration by Agent name
├── encode input through the Agent Schema
├── admit Run
│   └── append RunAccepted(sequence: 0)
└── local scheduler wake
    └── claim(runId, ownerId, attemptFence)
        ├── reconcile stale operations
        ├── append RunAttemptStarted(sequence: 1)
        ├── ExecutableResolver.resolve(persisted pins)
        └── RunExecutor
            ├── persist operation before dispatch
            ├── append model/tool RunEvents
            └── commit RunCompleted | RunFailed | RunCancelled
                └── lastSequence = terminal event sequence
```

```text
RI  Agent<Input, Output> + Input + StartOptions
        │ Runtime.start()
RO  RunHandle<Output> { runId, await, events, send }
        │ Runtime.inspect(runId)
{ status: "pending" | "running" | ... , lastSequence: 0..n }
```

## State machine

```text
queued ──claim──> running ──suspend──> waiting ──resume──┐
  │                  │                                  │
  │ cancel           ├─ ambiguous operation ─> needs-resolution
  ▼                  ├─ cancel request ──────> cancelling
cancelled            └─ commit ─> succeeded | failed | cancelled
```

This diagram shows engine states. Public inspection projects them to `pending`, `running`, `waiting`, `succeeded`, `failed`, or `cancelled`; it does not expose recovery-only transitions. The first canonical terminal event wins.

## Failure and recovery

```text
worker/process loss
└── replacement claim with a higher fence
    ├── stale owner commit ─> StaleClaim / StaleSessionClaim
    └── reconcile each operation
        ├── pure/provider-idempotent ─> requested ─> redispatch
        └── never ─> unknown + OperationUnknown
                    └── Run needs-resolution
                        └── resolveOperation(Succeeded|Failed|Retry)
```

## Invariants

### Admission and identity

- `generalist/runtime` is the Worker-safe execution contract. Compose `generalist/durability` with S3 or native R2; Core remains process-local without either. A blocking ask is not a Runtime primitive.
- `Address` is an opaque routing key bound by a Layer to a pinned executable. `Message` carries Effect AI `Prompt`, idempotency, Session/lane, and correlation fields; Runtime adds no content vocabulary.
- Layer acquisition rejects duplicate Agent names and captures each declaration's service environment. `start(agent, input, options)` requires a declared Agent, Schema-encodes the input, and atomically persists its identity and Run. An exact `{ sessionId, idempotencyKey }` retry returns the same Run ID without another admission.
- Recovery uses the persisted revision and executable identity. An exact retained-revision loader can reconstruct its declarations and services; missing or mismatched definitions fail closed rather than substituting the current Agent revision.
- A held Run remains unclaimable until its handle activates it. Activation races transactionally with cancellation and retains its original command receipt. The lower-level pinned admission and claim operations stay inside the engine.
- Optional capability content `{ codec, version, digest }` participates in manifest/executable identity. Missing or drifted codec, version, payload digest, or conflicting duplicate pin fails typed; identical duplicates pass, content-less capabilities remain opaque, and `ExecutableRegistration.narrow` enforces the active executable.
- Addressed and program execution still use `ExecutableResolver.resolve` with persisted Run identity, manifest, and root registrations. Typed Agent starts instead resolve the captured Agent and services by registered name. Runtime owns input, history, checkpoint, continuation, and durable execution identity.
- Root admission is FIFO per Session across addresses; only the lane head receives the Session writer claim. Other Sessions and child Sessions run independently, while `respond`, `signal`, and `cancel` bypass the lane.
- Exact idempotency replay returns the same receipt; changed payload fails typed. A caller-assigned `runId` conflicting with replay or existing identity fails `RunIdConflict`.

### Session input queue

- `runtime.sessions.create({ sessionId, title? })` and `get(sessionId)` return semantic Session handles. `session.submit(agent, input, { commandId })` validates the declared Agent's typed input without requiring a parent Run or exposing a pinned selection.
- Idle submission atomically removes the first pending item and admits a fresh Run. Later input remains pending without a Run ID. When the active Run reaches a terminal state, releasing its lane and promoting the next item commit together. This queue does not inject follow-up input into the old Run's inbox.
- `session.update({ id, expectedRevision, commandId, agent, value })` edits a pending task; `session.remove({ id, expectedRevision, commandId })` removes it. Stale revisions, including edits racing promotion, fail `SessionQueueConflict` rather than changing an admitted Run.
- Admission returns immutable `{ sessionId, id, revision }` receipts. Exact retries retain them after promotion, removal, or fresh-host recovery; changed command facts fail `SessionIdempotencyConflict`. Read `session.queue` for current membership, `session.inspect` for its bounded summary, and `session.events(cursor?)` for projected client events.
- The queue is bounded to 64 pending items and 1 MiB of encoded pending inputs including pins and registrations. Rejected mutations leave canonical state unchanged. Selection and queue recovery use the same object engine as Runs, with fresh namespaces and no compatibility reader for retired durable enqueue state.
- `session.control("stop" | "close" | "resume", commandId)` controls its admission lifecycle. [Host Session handles](./host.md#conversational-queue) additionally support conversational input; they do not expose the engine's selection construction.

### Journal, control, and waits

- Every Run has one canonical stream: stable `eventId`, strictly increasing sequence, replay where `sequence > cursor`, then live follow. Bounded subscribers fail typed on lag or unavailable cursors without blocking producers.
- `acknowledge` advances one Runtime-global durable processed-through point only to `-1` or an existing `TurnCompleted` sequence; equal/older valid points are no-ops, invalid boundaries fail `AckInvalid`, and future points fail `AckBeyondCommitted`. Default is `{ sequence: -1 }`; feed the stored sequence to `events` after restart.
- The engine's snapshot atomically pairs state and an exclusive cursor. Its raw usage facts come only from committed provider usage; agreeing attempt IDs deduplicate and disagreements fail as corruption. Those internal snapshots are not public Runtime methods.
- Public `inspect` returns Agent/revision identity, Session and parent/root IDs, projected status, turn, last sequence, aggregate usage, remaining budget, and bounded waits/children. It omits executable manifests, reconstruction registrations, checkpoints, raw usage facts, and claim authority. Use the separate read-only Inspection Layer when no execution host should be acquired.
- `RunEvent` is a strict lifecycle/core-model schema. Completed/interrupted model responses store references; `resolveModelResponse` verifies Session parent and digest. Only intentionally dynamic tool values and metadata remain unknown.
- `send(runId, prompt, options)` admits the unified durable Run inbox with `steer`, `interrupt`, `rollback`, or `reject` policy. Each accepted message appends `Inbox` before delivery and remains pending until consumption commits with the next model operation/checkpoint or terminalization records its disposition. Exact duplicate precedes capacity checks; changed input is `SteeringConflict`, aggregate overload is `Steering.InboxFull`, a message above the 256 KiB per-event payload bound is `Steering.MessageTooLarge`, and no durable request waits for backpressure. `SteeringDrained` is separate telemetry. Durable conversational follow-up uses the Session queue instead of an `enqueue` policy; Core's process-local follow-up lane remains available.
- Each `(runId, waitId)` row is the sole authority for immutable identity/reason, status, decoded resolution, and timestamps. Open waits preserve model order; each close changes one open row before one event and leaves siblings open. Exact duplicate response is read-only success, a response whose kind does not match the immutable reason is `ResponseKindMismatch` and leaves the wait open, conflict is `ResponseConflict`, and terminal waits never reopen.
- An Agent Run's `wait({ runs, messages, commandId, timeout })` uses the same durable wait row and suspension journal to resume with the first selected terminal Run settlement or authenticated pending message. Run selectors are bounded to 32 same-family Runs, and the message result carries the durable inbox cursor; consuming it marks that inbox entry so a retry cannot deliver it twice.
- Wait registration checks already-arrived inbox entries and terminal Run events in the same state transition that records the open wait. A message or settlement closes only its matching wait, while sibling provider tool calls remain open until their own results are valid; timeout closes only the wait and never cancels the selected Run.
- Approval waits bind approval ID, operation, capability, and encoded input. Exact approve/deny replay is idempotent; mismatch is `ApprovalMismatch`, stale is `ApprovalStale`; generic `respond` and `resolveOperation` are separate controls.
- `cancelSession` covers every root tree already admitted to the Session; `awaitSessionTerminal` snapshots those roots and durably reinspects. Hosts must fence new roots before closing a Session. Cancellation closes operation admission, recursively marks descendants, and settles descendants before ancestors.
- Successful cancellation means durable request admission plus requested local interruption, not terminality. Hosted work retains ownership until exit. `RunCancellationRequested` preserves evidence; executor shutdown or lease loss uses recovery and never invents semantic cancellation.
- A cancellable tool remains `cancelling` until the same route reports `Cancelled` or `AlreadyTerminal`; callback/process/lease failure remains reclaimable for same-identity delivery. Ambiguous non-cancellable `never` work remains `unknown` and keeps the Run in `needs-resolution`.

### Execution, claims, and stores

- `run_operations` persists model, tool, memory, compaction, send, and structured-output work as `requested | running | cancelling | cancelled | succeeded | failed | unknown` before dispatch. Claimed hosts reconcile stale work before resolving or executing.
- Pure/provider-idempotent stale operations return to `requested`; `never` operations become `unknown`. `resolveOperation` atomically records schema-backed `Succeeded`, `Failed`, or `Retry` without changing the checkpoint; exact replay is idempotent, changed resolution conflicts, and all unknowns must resolve before replay continues without redispatch.
- `RunExecutor` attests the persisted executable closure, reconstructs the Agent and checkpoint, uses a fenced journal, and settles an active failure before the Run terminal event. Retryable post-turn model-stream failure gets at most two more attempts on the same Run/fence; completed operations replay, and attempt 3 terminalizes with the original failure.
- Compaction emits `CompactionStarted`, then `CompactionSkipped`, `CompactionApplied`, or `CompactionFailed`; applied state and deterministic checkpoint commit together. Compacting manifests require compaction-service and summary-model registrations; payload policy is secret-free and the manifest alone owns context limits.
- The activated host scope owns execution and scheduler fibers. Exit finalizes resolver/execution scopes; stale authority cannot release or mutate a replacement claim.
- Child settlement reconciliation pages waiting parents, not terminal Runs; each keyed wait is reread before conditional close. Idle cost is three bounded list calls, and cost scales with waiting parents/children rather than terminal backlog.
- There is no production memory, filesystem, or SQL Runtime. Test-only object simulators exercise the same engine but are not restart-safe production storage.
- Runtime drivers also own product-facing Host Session metadata, root Run membership, and one strict Session event cursor. Descendant events inherit the root Run's Host Session, while Session run lists contain roots only. `sessionEvents` replays committed events strictly after its exclusive cursor, then follows live events.
- Object journal commits order ownership generations, Run-attempt fences, Session writer authority, and protected transitions. Missing executable or component pins fail closed on reconstruction.
- Wakeups are lossy hints only; replay after the authoritative cursor and independent reconciliation recover missed delivery.
- Telemetry must not expose credentials, Session/model content, checkpoints, tool payloads, or canonical bytes.
- Opaque canonical JSON is schema-coded; correctness queries do not inspect payload JSON.

## Related

- Source: `packages/generalist/src/runtime/{index.ts,run.ts,service.ts,cursor.ts,address.ts}`, `packages/generalist/src/runtime/{run,session,execution}/`
- Test: [`runtime/execution/recovery/exclusive.test.ts`](https://github.com/In-Time-Tec/generalist/blob/main/packages/generalist/test/runtime/execution/recovery/exclusive.test.ts)
- Site: `/docs/architecture`, `/docs/durability`
- Decisions/tradeoffs: [`runtime-outside-core.md`](../decisions/runtime-outside-core.md), [`effect-workflow-substrate.md`](../decisions/effect-workflow-substrate.md), [`runtime-dynamic-transport.md`](../decisions/runtime-dynamic-transport.md)
- Sibling feature docs: [`fork.md`](./fork.md), [`host.md`](./host.md), [`durable-stores.md`](./durable-stores.md), [`durable-agent-driver.md`](./durable-agent-driver.md), [`child-admission.md`](./child-admission.md), [`addressed-messaging.md`](./addressed-messaging.md), [`nested-operations.md`](./nested-operations.md)
