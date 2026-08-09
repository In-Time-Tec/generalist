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

## Fan-out

`Runtime.spawn` and `Runtime.fanOut` accept semantic child selections declared by the parent Run's active Agent manifest. Admission resolves each selection to an exact Agent pin from the persisted executable closure under the parent lock; address bindings and the executable resolver are not consulted. Fan-out resolves every member atomically, and the resolved refs participate in its idempotency digest. `Runtime.awaitFanOut` waits on committed child events until the durable join decision is available; `Runtime.inspectFanOut` remains the non-blocking inspection operation. Both return member outcomes in input ordinal order.

Join modes are `AllSuccess`, `AllSettled`, `FirstSuccess`, `Quorum`, and `BestEffort`. Remainder policies are `await`, `request-cancel`, and `abandon`. `terminate` is rejected until a host can prove that all member effects terminated.

For model-authored work, `ChildRuns.tool` keeps `run_child` blocking for one dependent child. `ChildRuns.startGroupTool` returns ordered durable receipts without blocking, and `ChildRuns.awaitGroupTool` later joins that group through one durable parent suspension. `ChildRuns.makeTools` narrows model-facing selections from declared child authority.

## Testing against PostgreSQL and MySQL

The PostgreSQL and MySQL suites run against a real server and are skipped when no URL is configured. Start both servers, export their URLs, and run the suite:

```sh
docker compose -f packages/runtime/test/docker-compose.yml up -d --wait
export BATON_DATABASE_URL=postgres://baton:baton@127.0.0.1:55432/baton
export BATON_MYSQL_URL=mysql://baton:baton@127.0.0.1:33306/baton
bun --bun vitest run packages/runtime/test
docker compose -f packages/runtime/test/docker-compose.yml down -v
```

`BATON_DATABASE_URL` (or `DATABASE_URL`) selects the PostgreSQL server and `BATON_MYSQL_URL` (or `MYSQL_URL`) selects the MySQL server. Each test file provisions its own PostgreSQL schema or MySQL database from that server, so files never share tables and the suite is safe under Vitest file parallelism.

Nested durable operations, non-blocking child admission, and stranded-message recovery are one suite each, instantiated per backend: `nested-operations.test.ts`, `child-admission.test.ts`, and `messaging-stranded-delivery.test.ts` cover memory and SQLite, and `postgres/runtime-parity.test.ts` and `mysql/runtime-parity.test.ts` run the same cases against real servers. The memory and SQLite Runtimes bundle a `LocalScheduler` that promotes a queued Run itself, so a store-level claim succeeds immediately. The PostgreSQL and MySQL Runtimes expect an external worker, so those suites claim ready work through `RunClaims` before acting on a Run.

Addressed messaging follows the same shape across all four backends. Mailbox admission and bounds, authorization and directory scope, cross-session host policy, delivery idempotence, and the durable `send` operation are one suite each (`messaging-*-suite.ts`), instantiated for memory and SQLite by `messaging-*.test.ts` and for real servers by `postgres/messaging-parity.test.ts` and `mysql/messaging-parity.test.ts`. Mailbox bounds and messaging policy are Runtime construction options, so each backend supplies a Layer factory rather than a Layer and every bound or policy is its own Runtime. Mailbox durability across a close and reopen applies only to the durable backends, so that suite takes a store Layer directly.

## Errors, requirements, and resources

Programs require `Runtime.Runtime`; host integration may use `RunStore.RunStore` for fenced execution and operation recording. Boundary failures are schema-backed (`AddressNotFound`, `ExecutableRegistrationInvalid`, `ExecutableRegistrationMissing`, `ExecutableRegistrationConflict`, `ChildSelectionMissing`, `IdempotencyConflict`, `SteeringConflict`, `RunIdConflict`, `RunNotFound`, `CursorExpired`, `SubscriberLagged`, `SchemaDirty`, `SchemaChecksumMismatch`, `SchemaVersionUnsupported`, `SchemaUpgradeRequired`, `StaleClaim`, `MultiWorkerUnsupported`, and related tags).

`ExecutableRef` values match Core's `{ executable, active }` closed-closure identity. Production applications construct them through `AgentManifest.make` / `fromLiveAgent` and `ExecutableManifest.make`; `ExecutableManifest.makeTest` is only for tests and non-running documentation fixtures.

## More

- Current behavior: [Runtime](../../docs/features/runtime.md)
