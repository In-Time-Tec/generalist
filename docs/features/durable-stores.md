# Durable stores

Durable stores persist Runs, events, operations, Sessions, and related records in one versioned SQL state machine. SQLite hosts one process; PostgreSQL and MySQL add fenced claims for shared workers.

## Usage

```ts
import { Effect, Layer } from "effect"
import { Agent } from "generalist"
import { ExecutableResolver, Runtime } from "generalist/runtime"
import { Runtime as SqliteRuntime } from "generalist/runtime/sqlite-bun"
declare const resolverLayer: Layer.Layer<ExecutableResolver.ExecutableResolver>
const agent = Agent.make({ name: "build-explainer" })
declare const agentServices: Layer.Layer<Agent.Requirements<typeof agent>>

const program = Effect.gen(function* () {
  const runtime = yield* Runtime.Runtime
  yield* runtime.register(agent)
  return yield* runtime.start(agent, "Explain the failed build", {
    sessionId: "session:42",
    idempotencyKey: "answer:1",
  })
})

const store = Layer.merge(
  SqliteRuntime.layerSqlite({
    filename: "./generalist.sqlite",
    addresses: [],
  }).pipe(Layer.provide(resolverLayer)),
  agentServices,
)
Effect.runPromise(program.pipe(Effect.provide(store)))
```

`Runtime.layerSqlite` supplies the Runtime, store, executor, and local scheduler. Reusing the file reopens the same durable state.

## What runs

```text
construct SQLite Layer (source = "./generalist.sqlite")
├── apply/verify schema { version: 6, dirty: false }
└── Runtime.start(agent, input, { sessionId: "session:42" })
    └── transaction
        ├── lock identity "answer:1"; persist Run + Session
        ├── append RunAccepted
        └── COMMIT ──> publish local wakeup
            └── scheduler claim + atomic execution batch
                └── state + checkpoint + Session + ordered events
```

Rollback exposes none of the batch and publishes no committed event. An exact retry with the stable identity returns its existing result; changed payload or identity data is rejected.

## Bun SQLite

`generalist/runtime/sqlite-bun` exports `Runtime.layerSqlite` and `RunStore.layerSqlite`; both take `filename`. It uses `bun:sqlite` through `@effect/sql-sqlite-bun`, applies and verifies the baseline during Layer construction, and reports `multiWorker: false`.
It is Bun-only and single-process; requesting multi-worker operation fails with `MultiWorkerUnsupported`.

## PostgreSQL

`generalist/pg` exports `layer(options)` and `RuntimeSchema`. Pass `{ url, maxConnections? }`, or omit `url` and provide a caller-owned `PgClient`; the latter lets host SQL and Runtime operations share that transaction service and PostgreSQL savepoints.

```text
GENERALIST_DATABASE_URL (fallback: DATABASE_URL)
└── RuntimeSchema.apply ──> layer ──> SKIP LOCKED claims
    └── row/advisory locks + database leases + LISTEN/NOTIFY
```

This multi-worker Layer only verifies an applied schema. Use `RuntimeSchema.plan`, `check`, `apply`, or `markDirty` before startup.

## MySQL

`generalist/mysql` exports `layer({ url, maxConnections?, claimPollInterval?, ... })` and `RuntimeSchema`. It requires MySQL 8 or newer and initializes every pooled connection to `READ COMMITTED`.

```text
GENERALIST_MYSQL_URL (fallback: MYSQL_URL)
└── apply ──> GET_LOCK(30 seconds) ──> baseline once
    └── layer ──> row/named locks + leases + polling claims
```

This multi-worker Layer only verifies an applied schema; `RuntimeSchema.plan`, `check`, `apply`, and `markDirty` own schema work.

## sql-driver SPI

`generalist/runtime/sql-driver` exports `layerSqlRuntime`, driver/lock interfaces, `RunClaims`, `RuntimeWorker`, schema contract values, and typed errors. An adapter supplies transactions, locks, schema checks, claims, and optional event streams; `layerSqlRuntime` requires claims and assembles the shared store.

```text
RuntimeWorker.run (subscribe before catch-up)
└── claimReadyRuns(limit = free concurrency)
    └── fenced execute + half-lease renewal + fallback scan
```

`RunClaims` claims bounded ready batches, refreshes leases, releases claims, and commits terminal transitions under the exact worker, Run fence, and Session write claim.

## Invariants

- Version `6`, logical checksum, and baseline `{ id: 1, name: "generalist_runtime" }` are identical across adapters; physical DDL is adapter-owned.
- `generalist_host_sessions` persists product Session identity, optional title, creation time, and the next Session event sequence. Each `generalist_run_events` row may carry the root Run's Host Session ID plus its unique Session sequence, avoiding a copied Session event journal.
- Schema checks reject absent/old, dirty, unsupported, checksum-mismatched, or migration-identity-mismatched schemas with typed errors.
- Baseline creation refuses to overwrite existing Generalist application tables.
- Server Layers verify an applied schema; SQLite applies and verifies its schema during Layer construction.
- Store transitions atomically commit state, events, checkpoints, operations, conversation Session changes, and Host Session cursors, or expose none.
- Exact idempotent retries return the existing result; divergent identity reuse is rejected.
- Claim commits require the current worker, Run attempt fence, and Session write claim.
- Claim notifications are lossy hints; durable ordered scans are authoritative.
- SQLite is single-process; PostgreSQL and MySQL support multiple workers.
- The capability-based runtime-driver suite registers only each driver's advertised capabilities.
- SQLite, PostgreSQL, and MySQL run that shared contract for the capabilities they register.

## Related

- Source: `packages/generalist/src/runtime/sql/`, `packages/generalist/src/runtime/sql-driver.ts`, `packages/generalist/src/runtime/sqlite-bun.ts`, `packages/generalist/src/pg/`, `packages/generalist/src/mysql/`
- Site: `/docs/start/installation`, `/docs/reference/runtime`
- Sibling feature docs: `./runtime.md`, `./durable-agent-driver.md`
