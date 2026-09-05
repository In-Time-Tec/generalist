# Rivet actors

One Rivet Actor owns one durable Runtime partition in actor-local SQLite.
Rivet schedules and cron wake the actor; SQLite remains the execution authority.

## Usage

```ts
import { Layer } from "effect"
import { createClient, setup } from "rivetkit"
import { Agent } from "generalist"
import { ExecutableResolver } from "generalist/runtime"
import { makeRuntimeActor } from "generalist/unstable/rivet"

const runtimePartition = makeRuntimeActor({
  addresses: [{ address, executable, registrations }],
  resolver: ExecutableResolver.layerStatic([{ executable, agent: Agent.close(agent, agentServices) }]).pipe(
    Layer.orDie,
  ),
})
const registry = setup({ use: { runtimePartition } })
const client = createClient<typeof registry>()
const partition = client.runtimePartition.getOrCreate(["tenant-7"])

const receipt = await partition.runtime.send({
  to: address,
  sessionId: "session:review-42",
  idempotencyKey: "send:review-42",
  prompt: "Review pull request 42",
})
await partition.runtime.drain()
const run = await partition.runtime.inspect(receipt.runId)
```

Use `layerActorRuntime` when the Rivet actor also owns application actions and tables. Build the Layer once in `onWake`,
store that `ManagedRuntime` in actor vars, and dispose it from both `onSleep` and `onDestroy`:

```ts
import { Effect, Layer, ManagedRuntime } from "effect"
import { SqlClient, SqlError } from "effect/unstable/sql"
import { actor } from "rivetkit"
import { db } from "rivetkit/db"
import { Errors, Runtime } from "generalist/runtime"
import type { RunActivationProjection, SqliteStoreError } from "generalist/runtime/sql-driver"
import { ActorRuntime, layerActorRuntime, type ActorRuntimeServices } from "generalist/unstable/rivet"

type Host = ManagedRuntime.ManagedRuntime<
  ActorRuntimeServices,
  SqliteStoreError | SqlError.SqlError | Errors.RuntimeUnavailable
>
interface Vars {
  host: Host | undefined
}
const requireHost = (c: { vars: Vars }): Host => {
  if (c.vars.host === undefined) throw new Error("actor is asleep")
  return c.vars.host
}
const dispose = async (c: { vars: Vars }) => {
  const host = c.vars.host
  c.vars.host = undefined
  if (host !== undefined) await host.dispose()
}

const initialize = Effect.flatMap(SqlClient.SqlClient, (sql) =>
  sql`CREATE TABLE IF NOT EXISTS product_receipts (run_id TEXT PRIMARY KEY)`.pipe(Effect.asVoid),
)
const activationProjection = (sql: SqlClient.SqlClient): RunActivationProjection => ({
  applyInTransaction: (changes) =>
    Effect.forEach(
      changes,
      (change) =>
        change.intent === "execute"
          ? sql`INSERT INTO product_receipts (run_id) VALUES (${change.runId}) ON CONFLICT DO NOTHING`.pipe(
              Effect.asVoid,
            )
          : Effect.void,
      { discard: true },
    ),
})

const thread = actor({
  db: db({ warnOnManualTransactions: false }),
  createVars: (): Vars => ({ host: undefined }),
  onWake: async (c) => {
    const host = ManagedRuntime.make(
      layerActorRuntime(c, {
        addresses,
        drainAction: "runtime.drain",
        initialize,
        activationProjection,
      }).pipe(Layer.provide(resolver)),
    )
    try {
      await host.runPromise(ActorRuntime, { signal: c.abortSignal })
      c.vars.host = host
    } catch (error) {
      await host.dispose()
      throw error
    }
  },
  onSleep: dispose,
  onDestroy: dispose,
  actions: {
    runtime: {
      send: async (c, input: Runtime.SendInput) =>
        c.keepAwake(
          requireHost(c).runPromise(
            Effect.gen(function* () {
              const receipt = yield* (yield* Runtime.Runtime).send(input)
              yield* (yield* ActorRuntime).notify
              return receipt
            }),
            { signal: c.abortSignal },
          ),
        ),
      drain: async (c) =>
        c.keepAwake(
          requireHost(c).runPromise(
            Effect.flatMap(ActorRuntime, (actorRuntime) => actorRuntime.drain),
            {
              signal: c.abortSignal,
            },
          ),
        ),
    },
  },
})
```

`activationProjection` is application-only. Generalist always runs its native durable-activation projection after it,
with the same `SqlClient`, during ordinary Runtime transactions and stale-owner recovery. Do not wrap `Runtime.send` in
another `withTransaction`; the Runtime already owns the transaction. A projection failure rolls back the Run, product
receipt, and native activation together.

## What runs

```text
getOrCreate(["tenant-7"])
└── actor wake
    ├── open actor-local SQLite
    ├── allocate owner "actor-id:3"
    ├── recover stale claims, pages of 100
    └── drain authoritative activations, fuel 64

runtime.send({ idempotencyKey: "send:review-42", ... })
├── validate action input
├── SQLite transaction: admit Run "run_01J..."
└── arm lossy runtime.drain doorbell after commit

runtime.drain()
└── claim due activation from SQLite
    ├── resolve executable and run the agent
    └── commit Run { status: "succeeded", durability: "durable" }
```

If admission commits but its doorbell is lost, the next actor wake or periodic
cron drains the activation. If a wake replaces an interrupted owner, startup
increments the incarnation and recovers stale claims; never-replay work becomes
`needs-resolution` and is not dispatched again.

## Invariants

- One actor instance owns one Runtime partition and one actor-local SQLite handle.
- An application-owned actor and Generalist share one scoped `ManagedRuntime`, `SqlClient`, and transaction domain.
- Product table initialization completes before Runtime construction and startup recovery.
- Product and native activation projections run atomically, in that order, for admission and stale-owner recovery.
- SQLite owns Runs, Sessions, events, operations, claims, and activation rows.
- Actions expose `send`, `signal`, `respond`, `cancel`, `resolveOperation`, `inspect`, and `drain` directly, without an RPC envelope.
- A successful mutating action arms a one-shot drain only after its Runtime transaction commits.
- Wake and cron are lossy doorbells; startup and periodic drains read authoritative activation rows.
- Drain fuel defaults to 64 and is clamped to at least 1.
- Recovery page size defaults to 100 and is clamped to 1–1000.
- The recovery interval defaults to 5 seconds and cannot be configured below 5 seconds.
- Every wake increments the persisted host incarnation; the owner ID is `<actorId>:<incarnation>`.
- Startup recovers stale Run and Session-writer claims before draining activations.
- Repeated drains converge through claim predicates and do not redispatch completed work.
- Sleep and destroy dispose the scoped `ManagedRuntime`; the adapter never closes Rivet's actor-owned SQL handle.
- Raw statements and transactions serialize; nested transactions fail with `SqlError`.
- SQL interruption waits for an in-flight statement or rollback to settle.
- The published `generalist/unstable/rivet` subpath is ESM-only.

## Related

- Source: `packages/generalist/src/rivet/actors/`
- Site: `/docs/start/installation`, `/docs/reference/runtime/versioning`
- Decisions/tradeoffs: [Rivet actors Runtime host](../decisions/rivet-actors-runtime-host.md)
