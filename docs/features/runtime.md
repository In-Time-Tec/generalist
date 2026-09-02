# Runtime

The Runtime registers typed Agents by unique name and turns an Agent value plus typed input into an addressable `Run`. The store's journal, cursor, and claim remain the authority for execution and recovery. Memory and SQLite host their own scheduler; SQL adapters expose the same state machine to fenced workers.

## Usage

```ts
import { Effect, Layer } from "effect"
import { Agent } from "generalist"
import { ExecutableResolver, Runtime } from "generalist/runtime"

const agent = Agent.make({ name: "build-explainer" })
declare const agentServices: Layer.Layer<Agent.Requirements<typeof agent>>
declare const resolverLayer: Layer.Layer<ExecutableResolver.ExecutableResolver>

const program = Effect.gen(function* () {
  const runtime = yield* Runtime.Runtime
  yield* runtime.register(agent)
  const handle = yield* runtime.start(agent, "Explain the failed build", {
    sessionId: "session:42",
    idempotencyKey: "answer:1",
  })
  return yield* handle.await
})

const memory = Layer.merge(Runtime.layerMemory({ addresses: [] }).pipe(Layer.provide(resolverLayer)), agentServices)
Effect.runPromise(program.pipe(Effect.provide(memory)))
```

`register` captures the Agent's exact service environment once per process. `start` is immediate admission: the scoped memory scheduler can claim the returned Run without an application claim loop. `handle.await` returns the Agent's schema-decoded output, `handle.events` replays then follows the Run, and `inspect` reports authoritative lifecycle state.

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
{ status: "queued" | "running" | ... , lastSequence: 0..n }
```

## State machine

```text
queued ──claim──> running ──suspend──> waiting ──resume──┐
  │                  │                                  │
  │ cancel           ├─ ambiguous operation ─> needs-resolution
  ▼                  ├─ cancel request ──────> cancelling
cancelled            └─ commit ─> succeeded | failed | cancelled
```

The complete `RunStatus` set is `queued`, `running`, `waiting`, `needs-resolution`, `cancelling`, `succeeded`, `failed`, and `cancelled`. The first canonical terminal event wins.

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

- `generalist/runtime` is Worker-safe and supplies the contract plus memory implementation; Bun SQLite, SQL claims, and hosted SQL worker loops are opt-in subpaths. A blocking ask is not a Runtime primitive.
- `Address` is an opaque routing key bound by a Layer to a pinned executable. `Message` carries Effect AI `Prompt`, idempotency, Session/lane, and correlation fields; Runtime adds no content vocabulary.
- `register` rejects duplicate Agent names in one Runtime process. `start(agent, input, options)` requires that registration, Schema-encodes the input, and atomically persists the generated executable identity, secret-free reconstruction registrations, and Run. An exact `{ sessionId, idempotencyKey }` retry returns a handle for the same Run ID without admitting a second run.
- Recovery resolves typed starts by the persisted Agent name against the new process's registered set. A missing name suspends the Run with `UnknownAgent { name, runId }` instead of failing it or dispatching work.
- `admit` is the separate low-level pinned-executable path. It persists only `RunAccepted` and leaves an unclaimable `queued` gate. `activate` races transactionally with `cancel`, appends `RunAttemptStarted` once when activation wins, and is idempotent before or after cancellation. Typed `start` performs immediate admission and activation.
- Optional capability content `{ codec, version, digest }` participates in manifest/executable identity. Missing or drifted codec, version, payload digest, or conflicting duplicate pin fails typed; identical duplicates pass, content-less capabilities remain opaque, and `ExecutableRegistration.narrow` enforces the active executable.
- Addressed and program execution still use `ExecutableResolver.resolve` with persisted Run identity, manifest, and root registrations. Typed Agent starts instead resolve the captured Agent and services by registered name. Runtime owns input, history, checkpoint, continuation, and durable execution identity.
- Root admission is FIFO per Session across addresses; only the lane head receives the Session writer claim. Other Sessions and child Sessions run independently, while `respond`, `signal`, and `cancel` bypass the lane.
- Exact idempotency replay returns the same receipt; changed payload fails typed. A caller-assigned `runId` conflicting with replay or existing identity fails `RunIdConflict`.

### Journal, control, and waits

- Every Run has one canonical stream: stable `eventId`, strictly increasing sequence, replay where `sequence > cursor`, then live follow. Bounded subscribers fail typed on lag or unavailable cursors without blocking producers.
- `acknowledge` advances one Runtime-global durable processed-through point only to `-1` or an existing `TurnCompleted` sequence; equal/older valid points are no-ops, invalid boundaries fail `AckInvalid`, and future points fail `AckBeyondCommitted`. Default is `{ sequence: -1 }`; feed the stored sequence to `events` after restart.
- `snapshot` atomically pairs inspection and exclusive cursor with terminal-event outcome, raw attempt `usageFacts`, and compaction state. Facts come only from `AttemptCompleted.usage` or `AttemptFailed.providerUsage`; agreeing attempt IDs deduplicate, disagreement is corruption, and Runtime computes no price.
- `inspect` includes the process-local Inspector snapshot shape: latest zero-based `turn`, aggregate `{ inputTokens, outputTokens }` usage, active tool names, the latest journaled Agent event that retains the process-local event contract, and elapsed wall time since `RunAccepted`. It adds durable lifecycle, budget, child, gate, suspension, branch, and raw `usageFacts` detail. Reference-only model-response events and transcript-free durable turn completions are not exposed as `lastEvent` because they cannot satisfy the process-local event payload.
- `RunEvent` is a strict lifecycle/core-model schema. Completed/interrupted model responses store references; `resolveModelResponse` verifies Session parent and digest. Only intentionally dynamic tool values and metadata remain unknown.
- `send(runId, prompt, options)` admits the unified durable Run inbox with `steer`, `enqueue`, `interrupt`, `rollback`, or `reject` policy. Each accepted message appends `Inbox` before delivery and remains pending until consumption commits with the next model operation/checkpoint or terminalization records its disposition. Exact duplicate precedes capacity checks; changed input is `SteeringConflict`, overload is `Steering.InboxFull`, and no durable request waits for backpressure. `SteeringDrained` is separate telemetry.
- Each `(runId, waitId)` row is the sole authority for immutable identity/reason, status, decoded resolution, and timestamps. Open waits preserve model order; each close changes one open row before one event and leaves siblings open. Exact duplicate response is read-only success, conflict is `ResponseConflict`, and terminal waits never reopen.
- Approval waits bind approval ID, operation, capability, and encoded input. Exact approve/deny replay is idempotent; mismatch is `ApprovalMismatch`, stale is `ApprovalStale`; generic `respond` and `resolveOperation` are separate controls.
- `cancelSession` covers every root tree already admitted to the Session; `awaitSessionTerminal` snapshots those roots and durably reinspects. Hosts must fence new roots before closing a Session. Cancellation closes operation admission, recursively marks descendants, and settles descendants before ancestors.
- Successful cancellation means durable request admission plus requested local interruption, not terminality. Hosted work retains ownership until exit. `RunCancellationRequested` preserves evidence; executor shutdown or lease loss uses recovery and never invents semantic cancellation.
- A cancellable tool remains `cancelling` until the same route reports `Cancelled` or `AlreadyTerminal`; callback/process/lease failure remains reclaimable for same-identity delivery. Ambiguous non-cancellable `never` work remains `unknown` and keeps the Run in `needs-resolution`.

### Execution, claims, and stores

- `run_operations` persists model, tool, memory, compaction, send, and structured-output work as `requested | running | cancelling | cancelled | succeeded | failed | unknown` before dispatch. Claimed hosts reconcile stale work before resolving or executing.
- Pure/provider-idempotent stale operations return to `requested`; `never` operations become `unknown`. `resolveOperation` atomically records schema-backed `Succeeded`, `Failed`, or `Retry` without changing the checkpoint; exact replay is idempotent, changed resolution conflicts, and all unknowns must resolve before replay continues without redispatch.
- `RunExecutor` attests the persisted executable closure, reconstructs the Agent and checkpoint, uses a fenced journal, and settles an active failure before the Run terminal event. Retryable post-turn model-stream failure gets at most two more attempts on the same Run/fence; completed operations replay, and attempt 3 terminalizes with the original failure.
- Compaction emits `CompactionStarted`, then `CompactionSkipped`, `CompactionApplied`, or `CompactionFailed`; applied state and deterministic checkpoint commit together. Compacting manifests require compaction-service and summary-model registrations; payload policy is secret-free and the manifest alone owns context limits.
- Memory and SQLite layers own one scoped scheduler. Exit finalizes resolver/execution scope, releases only the exact `(runId, ownerId, attemptFence)`, then removes the active marker; stale release cannot clear a replacement claim, and interruption makes only that host's nonterminal work reclaimable.
- Child settlement reconciliation pages waiting parents, not terminal Runs; each keyed wait is reread before conditional close. Idle cost is three bounded list calls, and cost scales with waiting parents/children rather than terminal backlog.
- Memory preserves admission, FIFO, controls, waits, cancellation, children, operations, and replay but loses all state when its Layer is released. SQLite is durable single-process (`multiWorker: false`), uses WAL, foreign keys, and `BEGIN IMMEDIATE`, and automatically creates/verifies the single version-7 baseline; dirty, checksum, old/future version, migration, and multi-worker errors are typed.
- Runtime drivers also own product-facing Host Session metadata, root Run membership, and one strict Session event cursor. Descendant events inherit the root Run's Host Session, while Session run lists contain roots only. `sessionEvents` replays committed events strictly after its exclusive cursor, then follows live events.
- PostgreSQL and MySQL are durable multi-worker adapters with verify-only startup and explicit `RuntimeSchema` predeploy work. Both use database-time leases, monotonic Run fences and Session writer epochs, lane-head claims, stale-owner rejection, and bounded fallback sweeps; PostgreSQL uses `LISTEN`/`NOTIFY` hints, while MySQL followers poll committed history.
- SQL wakeups are lossy hints only; replay after the authoritative cursor and bounded probes close missed notifications. Per-Run sequence allocation has no `MAX` race, and new events receive a transactional root-relative tree position.
- SQL telemetry records bounded backend/transition/outcome attributes; Run/Operation IDs are trace-only. Session/model content, checkpoints, tool payloads, SQL parameters, and durable payloads are never telemetry attributes.
- Opaque canonical JSON is schema-coded; correctness queries do not inspect payload JSON.

## Related

- Source: `packages/generalist/src/runtime/{index.ts,run.ts,service.ts,cursor.ts,address.ts}`, `packages/generalist/src/runtime/{run,session,execution}/`
- Site: `/docs/learn/native-runtime`, `/docs/reference/runtime`
- Decisions/tradeoffs: [`runtime-outside-core.md`](../decisions/runtime-outside-core.md), [`effect-workflow-substrate.md`](../decisions/effect-workflow-substrate.md), [`runtime-dynamic-transport.md`](../decisions/runtime-dynamic-transport.md)
- Sibling feature docs: [`fork.md`](./fork.md), [`host.md`](./host.md), [`durable-stores.md`](./durable-stores.md), [`durable-agent-driver.md`](./durable-agent-driver.md), [`child-admission.md`](./child-admission.md), [`addressed-messaging.md`](./addressed-messaging.md), [`nested-operations.md`](./nested-operations.md)
