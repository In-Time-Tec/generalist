# Runtime

The Runtime turns a pinned executable and prompt into an addressable `Run`, then makes the store's journal, cursor, and claim the authority for execution and recovery. Memory and SQLite host their own scheduler; SQL adapters expose the same state machine to fenced workers.

## Usage

```ts
import { Effect, Layer } from "effect"
import { ExecutableResolver, Runtime } from "generalist/runtime"

declare const executable: Runtime.StartInput["executable"]
declare const registrations: Runtime.StartInput["registrations"]
declare const resolverLayer: Layer.Layer<ExecutableResolver.ExecutableResolver>

const program = Effect.gen(function* () {
  const runtime = yield* Runtime.Runtime
  const receipt = yield* runtime.start({
    executable,
    registrations,
    sessionId: "session:42",
    idempotencyKey: "answer:1",
    prompt: "Explain the failed build",
  })
  return yield* runtime.inspect(receipt.runId)
})

const memory = Runtime.layerMemory({ addresses: [] }).pipe(Layer.provide(resolverLayer))
Effect.runPromise(program.pipe(Effect.provide(memory)))
```

`start` is immediate admission: the scoped memory scheduler can claim the returned Run without an application claim loop. The returned inspection's `status` and `lastSequence` are the authoritative lifecycle state and exclusive journal cursor.

## What runs

```text
Runtime.start({ sessionId: "session:42", key: "answer:1" })
├── validate pinned executable + registrations
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
RI  StartInput { sessionId: "session:42", idempotencyKey: "answer:1" }
        │ Runtime.start()
RO  RunReceipt { runId: "<stable id>", duplicate: false, ... }
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
- `start` atomically persists the exact executable, complete bounded immutable `{ pin, codec, version, payload }` registration catalog, Run, root associations, and optional bounded initial children/fan-outs. Registrations contain secret-free reconstruction data, not credentials. Changed initial-child sources conflict; exact retries return the same root and child IDs.
- `admit` validates the same root input but persists only `RunAccepted` and leaves an unclaimable `queued` gate. `activate` races transactionally with `cancel`, appends `RunAttemptStarted` once when activation wins, and is idempotent before or after cancellation. `start` composes admission and activation.
- Optional capability content `{ codec, version, digest }` participates in manifest/executable identity. Missing or drifted codec, version, payload digest, or conflicting duplicate pin fails typed; identical duplicates pass, content-less capabilities remain opaque, and `ExecutableRegistration.narrow` enforces the active executable.
- `ExecutableResolver.resolve` receives only persisted Run identity, manifest, and root registrations. The application interprets codecs, dereferences credentials, reconstructs providers, composes compaction services, and scopes finalizers; recovery never falls back to application rows or current configuration. Runtime owns prompt, history, checkpoint, continuation, identity, budget, and manifest context limits.
- Root admission is FIFO per Session across addresses; only the lane head receives the Session writer claim. Other Sessions and child Sessions run independently, while `respond`, `signal`, and `cancel` bypass the lane.
- Exact idempotency replay returns the same receipt; changed payload fails typed. A caller-assigned `runId` conflicting with replay or existing identity fails `RunIdConflict`.

### Journal, control, and waits

- Every Run has one canonical stream: stable `eventId`, strictly increasing sequence, replay where `sequence > cursor`, then live follow. Bounded subscribers fail typed on lag or unavailable cursors without blocking producers.
- `acknowledge` advances one Runtime-global durable processed-through point only to `-1` or an existing `TurnCompleted` sequence; equal/older valid points are no-ops, invalid boundaries fail `AckInvalid`, and future points fail `AckBeyondCommitted`. Default is `{ sequence: -1 }`; feed the stored sequence to `events` after restart.
- `snapshot` atomically pairs inspection and exclusive cursor with terminal-event outcome, raw attempt usage, and compaction state. Usage comes only from `AttemptCompleted.usage` or `AttemptFailed.providerUsage`; agreeing attempt IDs deduplicate, disagreement is corruption, and Runtime computes no price.
- `RunEvent` is a strict lifecycle/core-model schema. Completed/interrupted model responses store references; `resolveModelResponse` verifies Session parent and digest. Only intentionally dynamic tool values and metadata remain unknown.
- `steer` admits an idempotent FIFO entry only for a nonterminal Run, bounded to 64 pending entries and 1 MiB canonical prompts. Exact duplicate precedes capacity checks; changed input is `SteeringConflict`, overload is `Steering.InboxFull`, and no durable request waits for backpressure. Acceptance, consumption with the next model operation/checkpoint, and terminal discard are atomic and reconstructable; `SteeringDrained` is separate telemetry.
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
- Memory preserves admission, FIFO, controls, waits, cancellation, children, operations, and replay but loses all state when its Layer is released. SQLite is durable single-process (`multiWorker: false`), uses WAL, foreign keys, and `BEGIN IMMEDIATE`, and automatically creates/verifies the single version-4 baseline; dirty, checksum, old/future version, migration, and multi-worker errors are typed.
- PostgreSQL and MySQL are durable multi-worker adapters with verify-only startup and explicit `RuntimeSchema` predeploy work. Both use database-time leases, monotonic Run fences and Session writer epochs, lane-head claims, stale-owner rejection, and bounded fallback sweeps; PostgreSQL uses `LISTEN`/`NOTIFY` hints, while MySQL followers poll committed history.
- SQL wakeups are lossy hints only; replay after the authoritative cursor and bounded probes close missed notifications. Per-Run sequence allocation has no `MAX` race, and new events receive a transactional root-relative tree position.
- SQL telemetry records bounded backend/transition/outcome attributes; Run/Operation IDs are trace-only. Session/model content, checkpoints, tool payloads, SQL parameters, and durable payloads are never telemetry attributes.
- Opaque canonical JSON is schema-coded; correctness queries do not inspect payload JSON.

## Related

- Source: `packages/generalist/src/runtime/{index.ts,run.ts,service.ts,cursor.ts,address.ts}`, `packages/generalist/src/runtime/{run,execution}/`
- Site: `/docs/learn/native-runtime`, `/docs/reference/runtime`
- Decisions/tradeoffs: [`runtime-outside-core.md`](../decisions/runtime-outside-core.md), [`effect-workflow-substrate.md`](../decisions/effect-workflow-substrate.md), [`runtime-dynamic-transport.md`](../decisions/runtime-dynamic-transport.md)
- Sibling feature docs: [`durable-stores.md`](./durable-stores.md), [`durable-agent-driver.md`](./durable-agent-driver.md), [`child-admission.md`](./child-admission.md), [`addressed-messaging.md`](./addressed-messaging.md), [`nested-operations.md`](./nested-operations.md)
