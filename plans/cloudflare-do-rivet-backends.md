# Plan: Native TenetKit backends for Cloudflare Durable Objects and Rivet Actors

Status: proposal (researched 2026-08; branch main @ 6742fdc)
Owner: runtime
Related: packages/runtime, packages/transport, PRODUCT.md ("TenetKit is not a deployment platform" — these are _backends_, not hosting)

## 1. Why this is tractable

The runtime was already built around one seam: the 62-method `RunStore` contract
(`packages/runtime/src/run-store.ts:111`). `makeRuntime`, `ExecutionHost`, `ActiveExecutions`,
journal replay, and all of `tenetkit/transport` are backend-agnostic; memory/sqlite/postgres/mysql
already prove the store is swappable. The platform-dependency audit found exactly **two**
hard platform couplings in all of core/runtime/providers/transport src:

1. `packages/runtime/src/sql/bun-client.ts:1` — `bun:sqlite` (the SqlClient driver)
2. `packages/runtime/src/sql/schema.ts:276` — `Bun.CryptoHasher` for the schema checksum
   (core already has a pure-JS `sha256Text` at `packages/core/src/durable/canonical-json.ts:63`)

Everything else flows through Effect services (Clock, Random, HttpClient, effect/unstable/http),
which run on workerd unmodified. The 20-table DDL in `sql/schema.ts` is plain SQLite
(no STRICT/WITHOUT ROWID/triggers) and runs unmodified on DO SQLite storage.

What does NOT port to Durable Objects is the _process model_:

- `LocalScheduler` 250ms poll fiber (`local-scheduler.ts:150`)
- in-memory EventHub subscribers (`sql/subscribers.ts`)
- unbounded claim holds (no lease in the sqlite schema)
  DOs are evicted aggressively (10s hibernate / 70-140s inactive), have ONE alarm, no shutdown
  hooks, and `ctx.waitUntil` is a documented no-op. Rivet actors, by contrast, run in a
  long-lived Node/Bun process — the existing scheduler and hub work there unchanged.

## 2. Target shape

Two new packages, mirroring how `layerSqlite`/`layerPostgres` are shipped today:

| Package                | Backend                                                                           | Process model                                  |
| ---------------------- | --------------------------------------------------------------------------------- | ---------------------------------------------- |
| `@tenetkit/cloudflare` | DO SQLite storage, one DO = one Run tree/session shard                            | event-driven: request + alarm wakes            |
| `@tenetkit/rivet`      | RivetKit actor, per-actor SQLite (`c.db`), one actor = one Run tree/session shard | long-lived `run` loop; existing LocalScheduler |

Both reuse `sql/store-*.ts` (the entire store implementation) by supplying a different
`SqlClient` layer, a different migrator, and (for DO) a different scheduler driver.

### 2.1 Sharding decision (both backends)

The sqlite store's invariant is "one database, one writer" (`MultiWorkerUnsupported`,
`sql/store.ts:99`). A DO / Rivet actor is _exactly_ that invariant reified: single-threaded,
one private SQLite DB. So the unit of placement = the unit the store already assumes:

    address(root sessionId) -> idFromName / actor key -> one object owns the whole Run tree

Child runs, fan-outs, mailbox, steering, waits, session entries for that tree all live in the
object's own DB. Cross-tree messaging (admitMessage to another session) becomes DO-to-DO /
actor-to-actor RPC in a later phase.

## 3. Architecture — Cloudflare Durable Objects

```
                       Cloudflare edge
  ┌────────────────────────────────────────────────────────────┐
  │  Worker (front door, stateless)                            │
  │  routes /sessions/:sessionId/* ──► env.BATON.getByName(id) │
  └───────────────┬────────────────────────────────────────────┘
                  │ RPC / fetch (WS upgrade passes through)
  ┌───────────────▼────────────────────────────────────────────┐
  │  TenetKitRunnerObject (Durable Object, SQLite-backed)         │
  │                                                            │
  │   ManagedRuntime (built lazily per wake, NOT in ctor)      │
  │   ┌──────────────────────────────────────────────────┐     │
  │   │ Runtime ◄─ makeRuntime (unchanged)               │     │
  │   │ ExecutionHost ◄─ makeExecutionHost (unchanged)   │     │
  │   │ RunStore ◄─ sql/store-*.ts (unchanged)           │     │
  │   │    ▲                                             │     │
  │   │    │ SqlClient over ctx.storage.sql   (NEW)      │     │
  │   │    │  withTransaction -> transactionSync         │     │
  │   │ AlarmScheduler                       (NEW)       │     │
  │   │  tick on: admit / respond / signal / alarm()     │     │
  │   │ EventHub: in-memory, valid (single writer)       │     │
  │   └──────────────────────────────────────────────────┘     │
  │                                                            │
  │   ctx.storage.sql   ── 20 baton_* tables + baton_alarms    │
  │   ctx.storage.setAlarm(nextDue)  ── ONE alarm, re-armed    │
  │   ctx.acceptWebSocket(ws, [runId]) ── hibernatable events  │
  └────────────────────────────────────────────────────────────┘
```

### 3.1 Scheduler: poll loop → wake-driven ticks

LocalScheduler's tick logic (sweep cancelling, select ready, claim, execute) is reused; only
the _driver_ changes. New seam in `tenetkit/runtime`:

```ts
// packages/runtime/src/scheduler-driver.ts (NEW, extracted from local-scheduler.ts)
export interface SchedulerDriver {
  /** Called after any store mutation that can make a Run ready. */
  readonly notify: Effect.Effect<void>
  /** One reconcile pass: sweep cancelling, claim ready, execute. Already exists as tick. */
  readonly tick: Effect.Effect<void>
}
```

- Local backends keep the poll fork (unchanged behavior).
- DO backend: `notify` = run `tick` inline (we are already awake, in-request) and set
  `ctx.storage.setAlarm(min(nextRetryAt, nextWakeAt))` before returning.
- `alarm()` = `tick` + re-arm. Alarm handler budget is 15 min wall clock — one model turn
  fits; longer work is already chunked by the operation journal (record/start/complete),
  so an evicted turn resumes by replay on the next wake. At-least-once alarms + attemptFence
  CAS make double-fire safe.

### 3.2 Claims on a single-writer object

`claimExecution`'s CAS (`owner_worker_id`, `attempt_fence`) is kept — it is what makes journal
replay after eviction safe. `ownerId` = the DO id. Because the DO is the only writer, StaleClaim
can only arise across attempts (eviction mid-turn → next wake claims attempt n+1, replays the
journal, expires the stuck operation via `expireRunningOperation` — this machinery all exists).

### 3.3 Turn execution and eviction

- A turn (claim → model stream → commit) runs inside one request/alarm invocation; the DO is
  pinned while the model HTTP stream is in flight. CPU budget (30s default, 5min config) resets
  per network event; wall clock in fetch/RPC is unlimited while the caller is connected.
- Between events, assume eviction at any await: every externally observable step is already
  journaled (recordOperation/completeOperation/commitModelResponse) — this is the same
  crash-recovery path the sqlite backend has today.
- No `Effect.sleep`-based retry/backoff at top level: retry-at timestamps go into the store,
  alarm is armed for min(due). (In-request sub-second sleeps are fine.)

### 3.4 Events out

- SSE: `tenetkit/transport` sse handler is pure `effect/unstable/http` → serve via
  `HttpEffect.toWebHandler` from the DO's `fetch`. Workers has no SSE duration limit;
  streaming pins the DO (billable) — acceptable, it is delivering live events.
- WebSocket: use the hibernation API. The wire protocol already carries cursors, so
  `webSocketMessage` handlers re-derive subscriptions from the durable cursor instead of
  holding a fiber. Attachment = { runId, cursor } (≤16KB).

### 3.5 Effect version note

Do NOT depend on `@effect/sql-sqlite-do` (its v4 line targets effect rc.110; workspace pins
beta.98, and its v3 line has a broken withTransaction on DO — issues #5987/#6006). We write our
own ~150-line SqlClient over `SqlStorage`, modeled on `sql/bun-client.ts`, mapping
`withTransaction` to `ctx.storage.transactionSync` (sync callback — our store's transaction
bodies are effectful, so the client instead relies on DO implicit write coalescing within one
event turn + a semaphore serializing statements; the buffered-event hub already defers
publishes to post-commit). Prior art to track: Effect PR #7322 (@effect/platform-cloudflare,
cluster-on-DO) — same architecture, validates the model.

DO SQL limits to respect: 2MB max row/blob (prompt/manifest JSON — enforce/segment),
100 bound params per statement (audit bulk inserts in store-admit/fan-out), no BEGIN/SAVEPOINT.

## 4. Architecture — Rivet Actors

```
  createClient<Registry>()            Rivet engine (Cloud or self-hosted Rust binary)
       │  getOrCreate([\"session\", id])      routing · lifecycle · durable per-actor SQLite
       ▼
  ┌────────────────────────────────────────────────────────────┐
  │  batonRunner actor (your Node/Bun process, RivetKit)       │
  │                                                            │
  │  run: async (c) => {            ◄── long-lived loop        │
  │    runtime = buildTenetKitRuntime(c.db)   // full stack       │
  │    for await (const m of c.queue.iter()) {  // sleeps idle │
  │      await c.keepAwake(handle(m))       // pinned in turn  │
  │    }                                                       │
  │  }                                                         │
  │                                                            │
  │  LocalScheduler: UNCHANGED (real long-lived process)       │
  │  EventHub: UNCHANGED (single writer)                       │
  │  RunStore ◄─ SqlClient over c.db.execute/transaction (NEW) │
  │  events → c.broadcast(...) bridge; actions for inspect     │
  └────────────────────────────────────────────────────────────┘
```

- RivetKit is \"just a library\" on Node ≥22/Bun — full Effect surface works, no bundler or
  timer constraints. The poll scheduler and in-memory hub run as-is.
- Per-actor SQLite via `c.db` (shipped, 10GiB/actor): SqlClient adapter over
  `c.db.execute(sql, ...params)` + `c.db.transaction(async tx => ...)`. Respect the
  1.25MB max dirty data per commit (chunk large event appends).
- Ingress: actor queue (durable mailbox) feeding `Runtime.send/start`; TenetKit's own
  idempotency keys make Rivet's at-most-once queue delivery safe (redelivery loss is
  recovered because admission is idempotent and the journal resumes).
- Turn safety: `c.keepAwake` around every turn (bare `await fetch` does NOT block actor
  sleep); raise `actionTimeout` (default 60s) or drive turns from `run`, not actions.
- Events: bridge `runtime.events` stream → `c.broadcast(\"run_event\", ...)`; clients use
  `.connect()`. SSE/WS via `onRequest`/`onWebSocket` escape hatches reusing transport codecs.
- Version pinning: rivetkit 2.3.x, breaking-change wave in flight (ctx.sql removal etc.).

## 5. Work plan

### Phase 0 — portability groundwork in tenetkit/runtime (no behavior change)

1. `schemaChecksum`: `Bun.CryptoHasher` → core `sha256Text` (3 sites incl. mysql/postgres).
2. Extract migrator seam: replace `SqliteMigrator.fromRecord` dependency with a
   driver-agnostic \"run DDL statements + meta row\" path (it is already almost that);
   keep bun path via the existing lazy import in `platform-layers.ts`.
3. Extract `SchedulerDriver` from `local-scheduler.ts` (tick stays; poll fork becomes the
   local driver). Memory/sqlite/postgres wiring unchanged.
4. Make `layerSqliteStore`-style store assembly reusable for an injected SqlClient +
   injected scheduler driver (a `makeSqlRunStoreWith` entry).
   Acceptance: existing vitest suites green (sqlite, postgres, mysql, memory).

### Phase 1 — @tenetkit/cloudflare

1. `src/sql-client.ts`: SqlClient over `SqlStorage` (+ semaphore, + transactionSync mapping,
   no WAL pragma, ArrayBuffer→Uint8Array).
2. `src/migrate.ts`: run `SCHEMA_STATEMENTS` + checksum row via the Phase-0 migrator seam.
3. `src/alarm-scheduler.ts`: SchedulerDriver over `ctx.storage.setAlarm` + due-time table.
4. `src/runner-object.ts`: `makeTenetKitRunnerObject(config)` → DO class:
   lazy ManagedRuntime per wake; `fetch` (transport SSE/WS + REST), RPC methods
   (send/start/respond/signal/cancel/inspect), `alarm()`, hibernatable WS handlers.
5. `src/worker.ts`: front-door router `routeTenetKitRequest(request, env)` +
   `layerDurableObject` client-side Runtime facade for Workers code.
6. Tests: `@cloudflare/vitest-pool-workers` (miniflare) — admission, replay-after-abort
   (simulate eviction via ctx.abort), alarm chaining, WS resubscribe from cursor,
   2MB/100-param bounds.
7. Example: `examples/cloudflare-agent/` with wrangler.jsonc (new_sqlite_classes migration,
   compatibility_date ≥ 2026-08-04).

### Phase 2 — @tenetkit/rivet

1. `src/sql-client.ts`: SqlClient over `c.db` (execute/transaction, named/positional params).
2. `src/actor.ts`: `batonRunnerActor(config)` → `actor({ db, run, actions, queues, events })`
   wiring the full runtime stack + LocalScheduler; keepAwake handling; event broadcast bridge.
3. `src/client.ts`: thin Runtime-facade over rivetkit client (send/start/events subscribe).
4. Tests: rivetkit test harness + local engine (docker rivetdev/engine) in CI (gated, like
   postgres suites today).
5. Example: `examples/rivet-agent/`.

### Phase 3 — cross-object topology + docs

1. Cross-tree `admitMessage` over DO RPC / actor-to-actor client (directory of session→object).
2. docs/features/runtime-backends.md: capability matrix (durability, multiWorker=false,
   placement = per-tree), limits tables (DO 2MB row / 10GB / alarms; Rivet 1.25MB commit /
   10GiB / at-most-once queues), failure-mode notes.
3. README capability matrix rows + release packaging.

## 6. Key risks

| Risk                                                                    | Mitigation                                                                                                                                                                                  |
| ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Store transaction bodies are effectful; DO transactionSync is sync-only | Rely on DO implicit coalescing per event turn + statement semaphore; buffered hub already publishes post-commit; add a conformance test that no store op awaits foreign I/O mid-transaction |
| Effect beta.98 vs ecosystem rc drift                                    | Own SqlClient (no @effect/sql-sqlite-do dep); revisit when workspace catalog moves to rc                                                                                                    |
| 2MB DO row limit vs large prompts/manifests                             | Size guard + segmented storage for session entry payloads (design in Phase 1)                                                                                                               |
| Rivet API churn (2.x unreleased breaking wave)                          | Pin exact rivetkit version; adapter surface kept minimal                                                                                                                                    |
| Alarm delayed up to 1 min                                               | Acceptable for retry/backoff; interactive paths are request-driven, not alarm-driven                                                                                                        |
| One tree per object = no cross-tree fan-out initially                   | Documented constraint; Phase 3 lifts it                                                                                                                                                     |
