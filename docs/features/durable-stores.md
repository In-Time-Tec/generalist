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
├── apply/verify schema { version: 11, dirty: false }
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

## Beta operating envelope

| Host                       | Recovery authority                          | Deployment boundary                                                                                               |
| -------------------------- | ------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| Memory                     | Process-local state                         | Tests and ephemeral execution; not restart-safe                                                                   |
| Bun SQLite                 | One SQLite file                             | One owning process; not a shared-worker backend                                                                   |
| PostgreSQL / MySQL         | Transactional SQL journal and fenced claims | Multiple workers; run the capability suite against the real server                                                |
| Cloudflare Durable Objects | Object-owned SQLite stores                  | Storage primitives, not a complete hosted worker/alarm lifecycle; the application owns scheduling and recovery    |
| Rivet actors               | Actor-local SQLite and incarnation fencing  | Experimental host integration; local tests are not a deployed Rivet outage certification                          |
| Object storage             | No Runtime driver                           | Suitable for application-owned immutable payloads or backups, not a replacement for transactional claim authority |

The SQL driver is not a generic key/value storage interface. A new backend must implement atomic multi-record transitions, exclusive ownership/fencing, ordered cursors, and recovery, then register the capabilities it actually proves. Object-only execution would need its own conditional-commit and ownership protocol; adding a blob client does not supply those guarantees.

### Payload and read limits

Durable admission and execution transitions reject JSON values over 1 MiB. The limit applies to the whole transition envelope, not just an individual field. Session entries, including Compaction and Handoff projections, have a 1 MiB encoded limit. Run events have a stricter 256 KiB encoded limit. Preflight rejects cycles, more than 64 levels of nesting, and more than 65,536 visited values before codec expansion. Oversized inputs return `RuntimeUnavailable` (or `SessionStoreError` at the Session boundary); they are not silently shortened into successful replay data. A rejected operation completion leaves the operation unresolved, so do not blindly redispatch a side effect after a size error.

Keep large tool results, attachments, and binary data outside the execution journal and return a bounded, application-owned reference with exact retrieval semantics. The framework does not upload rejected data for you. Existing model-facing tool-output previews are not an exact archival retrieval service. Artifact/CRDT snapshots and updates are a separate store and are **not** covered by these journal limits; the host must apply its own quotas there and at HTTP request admission.

SQL Run and Host Session replay fetch at most 128 event rows per page. New admitted event JSON therefore contributes at most 32 MiB per page, excluding SQL-driver buffers, decoded object/string overhead, checkpoints, and the separate live queue. Public `Runtime.history` accepts integer limits from 1 through 1000. Consumers use exclusive cursors; Session cursors may have gaps after rewind. Notifications are hints: each subscriber repairs missing delivery from durable pages before emitting a newer hint. Queue overflow fails explicitly rather than silently dropping committed events.

These are bounded query/result units, **not a constant-memory Runtime claim**. Full history exports, forks/rewinds, tree projections, artifact reconstruction, and lossless Session paths still materialize retained history. Forks copy their prefixes. An uncompacted model context still grows with the conversation; compact before it exceeds the model or durable checkpoint budget. SQL Session paths use sequential ancestor lookups; cold history no longer has to be decoded for a compacted model prompt, but older telemetry lookup can still traverse the ancestry. MySQL's bounded candidate output still uses a windowed eligibility scan and can examine/sort many rows; `LIMIT` does not cap database work. No production-scale throughput, RSS, database-memory ceiling, or multi-region performance guarantee follows from conformance tests.

### Before accepting beta traffic

1. Start with a disposable database and the exact Generalist/Effect versions used to build the executable registrations. Apply and verify the schema; never edit the version/checksum to force an incompatible store to open.
2. Exercise restart, interrupted operations, fork/rewind, and replay using `generalist/testing/runtime-driver`. PostgreSQL/MySQL suites that skip for missing URLs are not evidence.
3. Set a positive integer worker concurrency and a nonblank worker ID. Lease must be finite and at least 2 ms; fallback and cancellation intervals must be finite and at least 1 ms. These minima prevent invalid loops, not realistic production lease recommendations. Start with the 30-second lease and measure latency before tuning.
4. Load-test the application's actual Session lengths, compaction policy, payload sizes, subscribers, and worker contention. Track database query time/temp spill, process RSS, journal/branch growth, subscriber lag, and worker scan/wakeup failures. Bound retention and artifact usage operationally.
5. Test restoring a consistent database backup together with pinned executables and referenced external bytes before advertising recovery. See [recovery](./recovery.md).

## Invariants

- Version `11`, logical checksum, and baseline `{ id: 1, name: "generalist_runtime" }` are identical across adapters; physical DDL is adapter-owned.
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
