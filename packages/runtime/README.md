# `@batonfx/runtime`

Addressable Run admission, durable steering, bounded fan-out and joins, canonical `RunEvent` streams, finite inspection reads, and memory, SQLite, PostgreSQL, or MySQL Runtime stores for Baton agents.

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

## Fan-out

`Runtime.spawn` and `Runtime.fanOut` accept semantic child selections declared by the parent Run's active Agent manifest. Admission resolves each selection to an exact Agent pin from the persisted executable closure under the parent lock; address bindings and the executable resolver are not consulted. Fan-out resolves every member atomically, and the resolved refs participate in its idempotency digest. `Runtime.awaitFanOut` waits on committed child events until the durable join decision is available; `Runtime.inspectFanOut` remains the non-blocking inspection operation. Both return member outcomes in input ordinal order.

Join modes are `AllSuccess`, `AllSettled`, `FirstSuccess`, `Quorum`, and `BestEffort`. Remainder policies are `await`, `request-cancel`, and `abandon`. `terminate` is rejected until a host can prove that all member effects terminated.

## Errors, requirements, and resources

Programs require `Runtime.Runtime`; host integration may use `RunStore.RunStore` for fenced execution and operation recording. Boundary failures are schema-backed (`AddressNotFound`, `ChildSelectionMissing`, `IdempotencyConflict`, `SteeringConflict`, `RunIdConflict`, `RunNotFound`, `CursorExpired`, `SubscriberLagged`, `SchemaDirty`, `SchemaChecksumMismatch`, `SchemaVersionUnsupported`, `SchemaUpgradeRequired`, `StaleClaim`, `MultiWorkerUnsupported`, and related tags).

`ExecutableRef` values match Core's `{ executable, active }` closed-closure identity. Production applications construct them through `AgentManifest.make` / `fromLiveAgent` and `ExecutableManifest.make`; `ExecutableManifest.makeTest` is only for tests and non-running documentation fixtures.

## More

- Current behavior: [Runtime](../../docs/features/runtime.md)
