# `@batonfx/runtime`

Addressable Run admission, durable idempotent steering, canonical `RunEvent` streams, finite inspection reads, and memory, SQLite, PostgreSQL, or MySQL Runtime stores for Baton agents.

## Install

```sh
bun add effect @batonfx/core @batonfx/runtime
```

SQL backends need their Effect SQL driver. The workspace catalog pins `@effect/sql-pg`, `@effect/sql-mysql2`, and `@effect/sql-sqlite-bun` to `4.0.0-beta.98`.

## Imports

```ts
import {
  Address,
  AgentRef,
  MysqlRunSchema,
  Runtime,
  RunSchema,
  RunClaims,
  RuntimeWorker,
  RunStore,
} from "@batonfx/runtime"
```

## Layer graph

```text
Runtime.layerMemory({ agents, addresses })
├─ provides Runtime.Runtime
└─ provides RunStore.RunStore (ephemeral, backend: memory)

Runtime.layerSqlite({ filename, agents, addresses })
├─ provides Runtime.Runtime
└─ provides RunStore.RunStore (durable, backend: sqlite, multiWorker: false)

Runtime.layerPostgres({ url, agents, addresses })
├─ provides Runtime.Runtime
├─ provides RunStore.RunStore (durable, backend: postgres, multiWorker: true)
└─ provides RunClaims.RunClaims

Runtime.layerMysql({ url, agents, addresses })
├─ provides Runtime.Runtime
├─ provides RunStore.RunStore (durable, backend: mysql, multiWorker: true)
└─ provides RunClaims.RunClaims

RuntimeWorker.layerWorker({ workerId, concurrency, lease, pollInterval })
└─ requires RunClaims; ticks claim + lease refresh (test driver transitions today)
```

## Backend capability matrix

| Concern                                   | Memory                     | SQLite                                              | PostgreSQL                                                                | MySQL 8+                                                                  |
| ----------------------------------------- | -------------------------- | --------------------------------------------------- | ------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| Durability                                | Lost when Layer scope ends | Survives process restart in the DB file             | Survives process restart in Postgres                                      | Survives process restart in MySQL                                         |
| Admission / idempotency / FIFO            | Same contracts             | Same contracts                                      | Same contracts; only lane head is claimable                               | Same contracts; only lane head is claimable                               |
| Control-input bypass                      | Same                       | Same                                                | Same                                                                      | Same                                                                      |
| First terminal wins                       | Same                       | Same                                                | Same                                                                      | Same                                                                      |
| Operation unknown on non-idempotent crash | Same                       | Same                                                | Same                                                                      | Same                                                                      |
| Live event followers                      | Process-local              | Process-local over durable history                  | Process-local + LISTEN/NOTIFY hint; replay and polling are authoritative  | Process-local + polling; replay is authoritative                          |
| Multi-worker                              | Not claimed                | Rejected at construction (`MultiWorkerUnsupported`) | `FOR UPDATE SKIP LOCKED` claims, DB-time leases, monotonic attempt fences | `FOR UPDATE SKIP LOCKED` claims, DB-time leases, monotonic attempt fences |
| Schema at Runtime startup                 | None                       | Automatic migrate + verify                          | **Verify-only**; Runtime credentials need no DDL                          | **Verify-only**; Runtime credentials need no DDL                          |
| Predeploy schema job                      | n/a                        | n/a                                                 | `RunSchema.plan` / `check` / `apply`                                      | `MysqlRunSchema.plan` / `check` / `apply`                                 |

## PostgreSQL migrations

Runtime credentials must not need DDL. Apply schema in a predeploy job:

```ts
import { Effect, Redacted } from "effect"
import { PgClient } from "@effect/sql-pg"
import { RunSchema } from "@batonfx/runtime"

const url = process.env.BATON_DATABASE_URL!

await Effect.runPromise(
  RunSchema.apply("postgres").pipe(Effect.provide(PgClient.layer({ url: Redacted.make(url) })), Effect.scoped),
)
```

Commands:

```sh
# plan / check / apply via Effect programs using RunSchema.*
# Runtime startup only calls verify (check); it fails typed if upgrade is required
```

Env-gated tests and tracers:

```sh
export BATON_DATABASE_URL=postgres://user@127.0.0.1:5432/baton_runtime
bun run test:postgres
bun run test:tracer:postgres
bun run tracer:postgres
```

## Runnable program

```ts
import { Console, Effect, Stream } from "effect"
import { Prompt } from "effect/unstable/ai"
import { Address, AgentRef, Runtime, RunStore } from "@batonfx/runtime"

const assistant = { name: "assistant" }
const ref = AgentRef.make({ id: "assistant", version: "1", digest: "sha256:demo" })
const address = Address.make("agent:assistant")

const program = Effect.gen(function* () {
  const runtime = yield* Runtime.Runtime
  const store = yield* RunStore.RunStore
  const accepted = yield* runtime.send({
    runId: "run:demo:1",
    to: address,
    sessionId: "session:demo",
    idempotencyKey: "message:1",
    prompt: "Hello",
  })
  yield* runtime.steer({
    runId: accepted.runId,
    idempotencyKey: "steering:1",
    prompt: "Prioritize migration risk.",
  })
  const snapshot = yield* runtime.snapshot(accepted.runId)
  const history = yield* runtime.history({ runId: accepted.runId, cursor: -1, limit: 100 })
  const runs = yield* runtime.list({ limit: 100 })
  void snapshot
  void history
  void runs
  yield* store.complete({
    runId: accepted.runId,
    result: { text: "Hi", turns: 1, transcript: Prompt.fromMessages([]) },
  })
  yield* runtime.events({ runId: accepted.runId }).pipe(
    Stream.take(3),
    Stream.runForEach((event) => Console.log(event._tag)),
  )
}).pipe(
  Effect.provide(
    Runtime.layerMemory({
      agents: [{ ref, agent: assistant }],
      addresses: [{ address, agent: ref }],
    }),
  ),
)

await Effect.runPromise(program)
```

For durable single-process use, provide `Runtime.layerSqlite({ filename, agents, addresses })`. For multi-worker PostgreSQL, apply `RunSchema` first, then `Runtime.layerPostgres({ url, agents, addresses })` and claim ready runs through `RunClaims` / `RuntimeWorker`.

## Errors, requirements, and resources

Programs require `Runtime.Runtime`; host integration may use `RunStore.RunStore` for fenced execution and operation recording. Boundary failures are schema-backed (`AddressNotFound`, `IdempotencyConflict`, `SteeringConflict`, `RunIdConflict`, `RunNotFound`, `CursorExpired`, `SubscriberLagged`, `SchemaDirty`, `SchemaChecksumMismatch`, `SchemaVersionUnsupported`, `SchemaUpgradeRequired`, `StaleClaim`, `MultiWorkerUnsupported`, and related tags).

`AgentRef` values match `@batonfx/core` `{ id, version, digest }`. Runtime `AgentRef.make` accepts a pinned digest for tests and Layer wiring; core's manifest-based `make` remains available from `@batonfx/core`.

## MySQL

MySQL 8+ uses `READ COMMITTED`, `FOR UPDATE SKIP LOCKED`, database-time leases, named migration/admission locks, and polling for cross-process event notification. Apply schema with `MysqlRunSchema.apply`, then construct `Runtime.layerMysql`; startup verifies schema without applying DDL.

```sh
export BATON_MYSQL_URL=mysql://root@127.0.0.1:53306/baton_runtime
bun run test:mysql
bun run test:tracer:mysql
bun run tracer:mysql
```

## More

- Current behavior: [Runtime](../../docs/features/runtime.md)
