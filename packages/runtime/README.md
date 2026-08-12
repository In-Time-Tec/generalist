# `@batonfx/runtime`

Exact and addressed Run admission, durable steering, bounded fan-out and joins, canonical `RunEvent` streams, finite inspection reads, and memory, SQLite, PostgreSQL, or MySQL Runtime stores for Baton agents.

## Install

```sh
bun add effect @batonfx/core @batonfx/runtime
```

SQL backends need their Effect SQL driver. The workspace catalog pins `@effect/sql-pg`, `@effect/sql-mysql2`, and `@effect/sql-sqlite-bun` to `4.0.0-beta.98`.

## Imports

```ts
import {
  Address,
  ExecutableManifest,
  ExecutableRegistration,
  MysqlRunSchema,
  Runtime,
  RunSchema,
  RunClaims,
  RuntimeWorker,
  RunStore,
} from "@batonfx/runtime"
```

## Backends

- `Runtime.layerMemory({ resolver, addresses })` is process-local.
- `Runtime.layerSqlite({ filename, resolver, addresses })` is durable and single-process.
- `Runtime.layerPostgres({ url, resolver, addresses })` and `layerMysql` are durable and support fenced multi-worker claims.
- PostgreSQL and MySQL startup verify schema only. Apply migrations in a predeploy job with `RunSchema.apply` or `MysqlRunSchema.apply`.
- `RuntimeWorker.layerWorker` requires `RunClaims` and owns polling, claim concurrency, and lease refresh.

## Admission

`Runtime.start({ executable, registrations, sessionId, idempotencyKey, prompt })` starts an application-selected exact `PinnedExecutable` without an address binding. Its complete model/capability registration set is validated and atomically stored with the root Run. Registrations are immutable, bounded `{ pin, codec, version, payload }` JSON values; payloads contain reconstruction data such as credential references, never resolved credentials. On recovery, `ExecutableResolver.resolve` receives only the persisted Run manifest and registrations and owns codec interpretation, credential dereference, live resource construction, and scoped finalization.

`Runtime.send` remains FIFO addressed mailbox admission. Exact duplicate `start` or `send` calls return the same Run ID; changed prompts or executable authority fail as `IdempotencyConflict`, while changed data under an existing registration pin fails as `ExecutableRegistrationConflict`.

## Approvals

Approval suspensions are typed waits containing a stable approval ID and the exact requested operation, capability, and input. Inspect the Run or tree, then call `Approval.approve({ runId, approvalId })` or `Approval.deny({ runId, approvalId, reason })`. Exact duplicate decisions are idempotent; stale identities and changed decisions fail as `ApprovalStale` and `ApprovalMismatch`. Generic wait responses and unknown-operation resolution are separate controls.

## Child settlement notifications

Every child terminal transition atomically writes one deduplicated record to the parent's existing `baton_messages` inbox. The stable notification ID is `child-settled:<childRunId>`. Notifications contain the exact parent and child Run IDs, terminal event ID, `succeeded`, `failed`, or `cancelled` status, and result text. Result text is limited to 16 KiB; an oversized value is replaced by a marker that names `Runtime.snapshot(childRunId)` as the full-result recovery path.

The next consumer should use only these exported Runtime operations:

```ts
runtime.childSettlements({ parentRunId, afterSequence: -1, limit: 100 })
runtime.childSettlementChanges({ parentRunId, afterSequence: -1 })
runtime.awaitChildSettlement({ parentRunId, childRunId })
```

`childSettlements` is a finite ordered read. `childSettlementChanges` replays durable entries after `afterSequence` and then follows committed tree changes. `awaitChildSettlement` waits for one exact child. None starts or resumes the parent Run, enters `LocalScheduler`'s execution `FiberMap`, or consumes an execution concurrency seat.

## Fan-out

`AgentManifest.children` is a selection-name allowlist. `ExecutableManifest.make({ root, active?, profiles, entries })` pins the finite global `profiles: [{ selection, agent }]` registry and each Agent once, allowing mutually recursive profiles without depth unrolling or digest cycles. `Runtime.spawn` and `Runtime.fanOut` authorize against the active allowlist and resolve through that persisted registry under the parent lock. Fan-out is atomic and its await/inspection results preserve member order.

Join modes are `AllSuccess`, `AllSettled`, `FirstSuccess`, `Quorum`, and `BestEffort`. Remainder policies are `await`, `request-cancel`, and `abandon`. `terminate` is rejected until a host can prove that all member effects terminated.

`ChildRuns.tool` (`run_child`) blocks for one child; `ChildRuns.runGroupTool` (`run_child_group`) atomically admits an exact group and blocks one durable parent suspension until every member settles, returning complete ordered outcomes. Start/await tools remain lower-level detached operations. ExecutionHost omits blocking child tools at `maxDepth`, at zero width, or after lifetime quota exhaustion. Store admission remains authoritative under races.

Each root admission may pin `{ maxDepth, maxSubagents }`. Root depth is zero; child depth is derived from its parent. `maxSubagents` is a per-parent lifetime direct-child limit shared by singleton and group paths, not a global depth pool. Replays do not spend quota again, terminal children are never refunded, and an over-limit exact group leaves no partial state.

Core Agent budgets retain `childRuns` and `depth` for inline `AgentTool` nesting, but hosted child tools do not inspect them. `TreePolicy` is their sole recursive admission bound.

## Testing against PostgreSQL and MySQL

The backend contract suites cover Memory, SQLite, PostgreSQL, and MySQL. The live SQL suites provision an isolated schema or database per file and skip when their URL is absent:

```sh
docker compose -f packages/runtime/test/docker-compose.yml up -d --wait
export BATON_DATABASE_URL=postgres://baton:baton@127.0.0.1:55432/baton
export BATON_MYSQL_URL=mysql://baton:baton@127.0.0.1:33306/baton
bun --bun vitest run packages/runtime/test
docker compose -f packages/runtime/test/docker-compose.yml down -v
```

## Errors, requirements, and resources

Programs require `Runtime.Runtime`; host integration may use `RunStore.RunStore` for fenced execution and operation recording. Boundary failures are schema-backed (`AddressNotFound`, `ExecutableRegistrationInvalid`, `ExecutableRegistrationMissing`, `ExecutableRegistrationConflict`, `ChildSelectionMissing`, `IdempotencyConflict`, `SteeringConflict`, `RunIdConflict`, `RunNotFound`, `CursorExpired`, `SubscriberLagged`, `SchemaDirty`, `SchemaChecksumMismatch`, `SchemaVersionUnsupported`, `SchemaUpgradeRequired`, `StaleClaim`, `MultiWorkerUnsupported`, and related tags).

`ExecutableRef` values match Core's `{ executable, active }` closed-closure identity. Production applications construct them through `AgentManifest.make` / `fromLiveAgent` and `ExecutableManifest.make`; `ExecutableManifest.makeTest` is only for tests and non-running documentation fixtures.

## More

- Current behavior: [Runtime](../../docs/features/runtime.md)
