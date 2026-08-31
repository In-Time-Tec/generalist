import { expect, it } from "@effect/vitest"
import { layer } from "@effect/sql-sqlite-bun/SqliteClient"
import { Clock, Effect, Exit, Layer, Metric, Option } from "effect"
import { SqlClient } from "effect/unstable/sql"
import {
  Errors,
  ExecutableResolver,
  LocalScheduler as LocalSchedulerFacade,
  Message,
  RunExecutor as RunExecutorFacade,
  RunStore as RunStoreFacade,
  Runtime,
  TreePolicy,
} from "generalist/runtime"
import {
  makeExclusiveExecutionRecovery,
  type RunActivation,
  type RunActivationProjection,
  SqliteRunActivation,
} from "generalist/runtime/sql-driver"
import {
  assistant,
  assistantAddress,
  assistantRef,
  completedResult,
  registrationsFor,
  textPrompt,
} from "../runtime/execution/fixtures.js"
import { tempDbPath } from "../runtime/sql/scenario.js"
import { closedTestAgent } from "../runtime/run/identity.js"
import { makeSqliteRunStore } from "../../src/runtime/sql/store.js"
import { makeRuntime } from "../../src/runtime/memory/layer.js"
import { layer as activeExecutionsLayer } from "../../src/runtime/execution/active-executions.js"

import { Runtime as SqliteRuntime } from "../../src/runtime/sqlite-bun.js"
const LocalScheduler = LocalSchedulerFacade.LocalScheduler
const RunExecutor = RunExecutorFacade.RunExecutor
const RunStore = RunStoreFacade.RunStore
const RuntimeUnavailable = Errors.RuntimeUnavailable
const StaleClaim = Errors.StaleClaim
const makeMessage = Message.make
const defaultTreePolicy = TreePolicy.defaultTreePolicy

const resolverLayer = ExecutableResolver.layerStatic([
  { executable: assistantRef, agent: closedTestAgent(assistant) },
]).pipe(Layer.orDie)

const options = (filename: string, projection?: RunActivationProjection) => {
  const value = {
    filename,
    addresses: [{ address: assistantAddress, executable: assistantRef, registrations: registrationsFor(assistantRef) }],
    scheduler: { pollInterval: "1 day" as const },
  }
  return projection === undefined ? value : { ...value, activationProjection: projection }
}

const withLayer = <A, E, R, E2, R2>(provided: Layer.Layer<R, E, R2>, effect: Effect.Effect<A, E2, R>) =>
  Effect.scoped(Effect.flatMap(Layer.build(provided), (context) => effect.pipe(Effect.provideContext(context))))

const runtimeLayer = (projection?: RunActivationProjection) => {
  const filename = tempDbPath("cloudflare-activation")
  return Layer.merge(SqliteRuntime.layerSqlite(options(filename, projection)), layer({ filename })).pipe(
    Layer.provide(resolverLayer),
  )
}

const projectedRuntimeLayer = (rearm: Effect.Effect<void, Errors.RuntimeUnavailable>) => {
  const filename = tempDbPath("cloudflare-promotion-activation")
  const runtimeOptions = options(filename)
  const client = layer({ filename })
  const store = Layer.effect(
    RunStore,
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient
      yield* SqliteRunActivation.createSchema
      return yield* makeSqliteRunStore({
        ...runtimeOptions,
        activationProjection: SqliteRunActivation.makeProjection(sql, rearm),
      })
    }),
  ).pipe(Layer.provide(client))
  const dependencies = Layer.merge(store, activeExecutionsLayer)
  const runtime = Layer.effect(Runtime.Runtime, makeRuntime(runtimeOptions)).pipe(
    Layer.provide(dependencies),
    Layer.provide(resolverLayer),
  )
  return Layer.mergeAll(runtime, store, client)
}

it.live("projects only final transaction state, emits inactive, and rolls authority back on projection failure", () => {
  const changes: Array<ReadonlyArray<RunActivation>> = []
  let reject = false
  const projection: RunActivationProjection = {
    applyInTransaction: (batch) => {
      changes.push(batch)
      return reject ? Effect.fail(RuntimeUnavailable.make({ message: "projection rejected" })) : Effect.void
    },
  }
  return withLayer(
    runtimeLayer(projection),
    Effect.gen(function* () {
      const runtime = yield* Runtime.Runtime
      const store = yield* RunStore
      const admitted = yield* runtime.send({
        to: assistantAddress,
        sessionId: "projection",
        idempotencyKey: "one",
        prompt: textPrompt("one"),
      })
      expect(changes.at(-1)).toEqual([
        { runId: admitted.runId, intent: "execute", attemptFence: 1, runStatus: "running" },
      ])
      const untouched = yield* runtime.send({
        to: assistantAddress,
        sessionId: "projection",
        idempotencyKey: "untouched",
        prompt: textPrompt("untouched"),
      })
      expect(changes.at(-1)).toEqual([{ runId: untouched.runId, intent: "inactive" }])
      const claim = yield* store.claimExecution({ runId: admitted.runId, ownerId: "owner" })
      expect(changes.at(-1)).toEqual([{ runId: admitted.runId, intent: "inactive" }])
      yield* store.releaseExecution(claim)
      expect(changes.at(-1)).toEqual([
        { runId: admitted.runId, intent: "execute", attemptFence: 2, runStatus: "running" },
      ])

      reject = true
      const failed = yield* Effect.exit(
        runtime.send({
          to: assistantAddress,
          sessionId: "projection",
          idempotencyKey: "rolled-back",
          prompt: textPrompt("rollback"),
        }),
      )
      expect(Exit.isFailure(failed)).toBe(true)
      reject = false
      const retried = yield* runtime.send({
        to: assistantAddress,
        sessionId: "projection",
        idempotencyKey: "rolled-back",
        prompt: textPrompt("rollback"),
      })
      expect(retried.runId).toBeDefined()
    }),
  )
})

it.live("atomically projects a fan-out child promoted into ready capacity", () => {
  let rejectProjection = false
  return withLayer(
    projectedRuntimeLayer(
      Effect.suspend(() =>
        rejectProjection ? RuntimeUnavailable.make({ message: "forced shared alarm rollback" }) : Effect.void,
      ),
    ),
    Effect.gen(function* () {
      const runtime = yield* Runtime.Runtime
      const store = yield* RunStore
      const sql = yield* SqlClient.SqlClient

      const parent = yield* runtime.send({
        to: assistantAddress,
        sessionId: "promotion-projection",
        idempotencyKey: "parent",
        prompt: textPrompt("parent"),
      })
      const fanOut = yield* runtime.fanOut({
        parentRunId: parent.runId,
        idempotencyKey: "children",
        members: [
          { key: "first", selection: "researcher", prompt: "first" },
          { key: "second", selection: "researcher", prompt: "second" },
        ],
        concurrency: 1,
        join: { _tag: "AllSuccess" },
        remainder: "await",
      })
      const [first, second] = fanOut.childRunIds
      const firstClaim = yield* store.claimExecution({ runId: first!, ownerId: "first" })

      rejectProjection = true
      expect(
        Exit.isFailure(
          yield* Effect.exit(store.complete({ ...firstClaim, result: completedResult("first complete") })),
        ),
      ).toBe(true)
      expect((yield* runtime.inspect(first!)).status).toBe("running")
      expect((yield* runtime.inspectFanOut(fanOut.fanOutId)).members[1]?.status).toBe("pending")
      expect(yield* sql`SELECT run_id FROM generalist_activations WHERE run_id = ${second!}`).toHaveLength(0)

      rejectProjection = false
      yield* store.complete({ ...firstClaim, result: completedResult("first complete") })
      expect((yield* runtime.inspectFanOut(fanOut.fanOutId)).members[1]?.status).toBe("running")
      expect(
        yield* sql<{ intent: string; run_status: string }>`
          SELECT intent, run_status FROM generalist_activations WHERE run_id = ${second!}
        `,
      ).toEqual([{ intent: "execute", run_status: "queued" }])
    }),
  )
})

it.live("deletes inactive projections and rolls candidate writes back with the caller transaction", () =>
  withLayer(
    runtimeLayer(),
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient
      yield* SqliteRunActivation.createSchema
      const projection = SqliteRunActivation.makeProjection(sql, Effect.void)
      yield* sql.withTransaction(
        projection.applyInTransaction([{ runId: "run", intent: "execute", attemptFence: 0, runStatus: "running" }]),
      )
      expect(yield* sql`SELECT run_id FROM generalist_activations`).toHaveLength(1)
      yield* sql.withTransaction(projection.applyInTransaction([{ runId: "run", intent: "inactive" }]))
      expect(yield* sql`SELECT run_id FROM generalist_activations`).toHaveLength(0)
      yield* Effect.exit(
        sql.withTransaction(
          projection
            .applyInTransaction([{ runId: "rollback", intent: "execute", attemptFence: 0, runStatus: "running" }])
            .pipe(Effect.andThen(Effect.fail("rollback"))),
        ),
      )
      expect(yield* sql`SELECT run_id FROM generalist_activations WHERE run_id = 'rollback'`).toHaveLength(0)
    }),
  ),
)

it.live("rearms a shared host alarm from final transaction state and lets earlier host work win", () =>
  withLayer(
    runtimeLayer(),
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient
      yield* SqliteRunActivation.createSchema
      yield* sql`CREATE TABLE host_ready_work (due_at_millis INTEGER NOT NULL)`
      yield* sql`INSERT INTO host_ready_work VALUES (0)`
      const observed: Array<{ readonly generalist?: number; readonly shared: number }> = []
      const rearm = Effect.gen(function* () {
        const generalist = yield* SqliteRunActivation.nextDueAt
        const host = yield* sql<{ readonly due_at_millis: number }>`
          SELECT MIN(due_at_millis) AS due_at_millis FROM host_ready_work
        `
        const shared = Math.min(generalist ?? Number.POSITIVE_INFINITY, host[0]!.due_at_millis)
        const observation = generalist === undefined ? { shared } : { generalist, shared }
        observed.push(observation)
      }).pipe(
        Effect.provideService(SqlClient.SqlClient, sql),
        Effect.mapError(() => RuntimeUnavailable.make({ message: "shared alarm rearm failed" })),
      )
      yield* sql.withTransaction(
        SqliteRunActivation.makeProjection(sql, rearm).applyInTransaction([
          { runId: "generalist", intent: "execute", attemptFence: 1, runStatus: "running" },
        ]),
      )

      expect(observed).toHaveLength(1)
      expect(observed[0]!.generalist).toBeTypeOf("number")
      expect(observed[0]!.shared).toBe(0)
    }),
  ),
)

it.live("drains deterministically with bounded fuel and leaves duplicate or stale candidates harmless", () =>
  withLayer(
    runtimeLayer(),
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient
      yield* SqliteRunActivation.createSchema
      const future = (yield* Clock.currentTimeMillis) + 60_000
      yield* sql`INSERT INTO generalist_activations VALUES
        ('b', 'execute', 0, 0, 'queued'),
        ('a', 'execute', 0, 0, 'queued'),
        ('future', 'execute', ${future}, 0, 'queued')`
      const claimed: Array<string> = []
      const liveStore = yield* RunStore
      const liveExecutor = yield* RunExecutor
      const liveScheduler = yield* LocalScheduler
      const store = RunStore.of({
        ...liveStore,
        claimExecution: ({ runId, ownerId }: { readonly runId: string; readonly ownerId: string }) =>
          Effect.sync(() => claimed.push(runId)).pipe(
            Effect.as({
              runId,
              rootRunId: runId,
              depth: 0,
              treePolicy: defaultTreePolicy,
              activeChildCount: 0,
              ownerId,
              admittedAt: "2026-08-27T00:00:00.000Z",
              message: makeMessage({
                id: runId,
                to: assistantAddress,
                sessionId: "drain",
                prompt: textPrompt(runId),
                idempotencyKey: runId,
                correlationId: runId,
              }),
              executableRef: assistantRef.ref,
              executableManifest: assistantRef.manifest,
              attempt: 1,
              attemptFence: 1,
              session: {
                sessionId: "drain",
                runId,
                ownerId,
                runAttemptFence: 1,
                epoch: "1",
              },
              cancellationRequested: false,
              resolutions: [],
              registrations: registrationsFor(assistantRef),
            }),
          ),
      })
      const executor = RunExecutor.of({ ...liveExecutor, execute: () => Effect.void })
      const scheduler = LocalScheduler.of({
        ...liveScheduler,
        reconcileCancellation: () => Effect.succeed("inactive"),
      })
      const result = yield* SqliteRunActivation.drain({ ownerId: "owner", fuel: 1, rearm: Effect.void }).pipe(
        Effect.provideService(RunStore, store),
        Effect.provideService(RunExecutor, executor),
        Effect.provideService(LocalScheduler, scheduler),
      )
      expect(result).toEqual({
        processed: 1,
        hasMore: true,
        nextDueAt: 0,
        outcomes: [{ runId: "a", outcome: "executed" }],
      })
      expect(claimed).toEqual(["a"])

      const harmless = RunStore.of({
        ...liveStore,
        claimExecution: ({ runId }: { readonly runId: string }) =>
          Effect.fail(StaleClaim.make({ runId, workerId: "owner", attemptFence: 0 })),
      })
      const stale = yield* SqliteRunActivation.drain({ ownerId: "owner", fuel: 5, rearm: Effect.void }).pipe(
        Effect.provideService(RunStore, harmless),
        Effect.provideService(RunExecutor, executor),
        Effect.provideService(LocalScheduler, scheduler),
      )
      expect(stale).toEqual({
        processed: 2,
        hasMore: false,
        nextDueAt: 0,
        outcomes: [
          { runId: "a", outcome: "stale" },
          { runId: "b", outcome: "stale" },
        ],
      })
    }),
  ),
)

it.live("point cancellation is idempotent for missing and terminal runs", () =>
  withLayer(
    runtimeLayer(),
    Effect.gen(function* () {
      const runtime = yield* Runtime.Runtime
      const scheduler = yield* LocalScheduler
      yield* scheduler.reconcileCancellation("missing")
      const run = yield* runtime.send({
        to: assistantAddress,
        sessionId: "cancel-idempotence",
        idempotencyKey: "run",
        prompt: textPrompt("run"),
      })
      yield* runtime.cancel({ runId: run.runId, reason: "done" })
      yield* scheduler.reconcileCancellation(run.runId)
      yield* scheduler.reconcileCancellation(run.runId)
      expect((yield* runtime.inspect(run.runId)).status).toBe("cancelled")
    }),
  ),
)

it.live("recovers stale running and cancelling claims by status, raises fences, and rejects old fences", () =>
  withLayer(
    runtimeLayer(),
    Effect.gen(function* () {
      const runtime = yield* Runtime.Runtime
      const store = yield* RunStore
      const sql = yield* SqlClient.SqlClient
      const projected: Array<RunActivation> = []
      const projection: RunActivationProjection = {
        applyInTransaction: (changes) => Effect.sync(() => projected.push(...changes)),
      }
      const admit = (key: string) =>
        runtime.send({
          to: assistantAddress,
          sessionId: `recovery:${key}`,
          idempotencyKey: key,
          prompt: textPrompt(key),
        })
      const running = yield* admit("running")
      const cancelling = yield* admit("cancelling")
      const runningClaim = yield* store.claimExecution({ runId: running.runId, ownerId: "old" })
      yield* store.claimExecution({ runId: cancelling.runId, ownerId: "old" })
      yield* runtime.cancel({ runId: cancelling.runId, reason: "replace host" })

      const recovered = yield* makeExclusiveExecutionRecovery(sql, projection).recoverClaims({
        newOwnerId: "new",
      })
      expect(recovered.recovered).toBe(2)
      const recoveredRunning = yield* store.loadExecution(running.runId)
      expect(recoveredRunning.attemptFence).toBe(runningClaim.attemptFence + 1)
      expect(recoveredRunning.ownerId).toBeUndefined()
      expect((yield* runtime.inspect(cancelling.runId)).status).toBe("cancelled")
      expect(projected).toEqual(
        expect.arrayContaining([
          {
            runId: running.runId,
            intent: "execute",
            attemptFence: runningClaim.attemptFence + 1,
            runStatus: "running",
          },
          { runId: cancelling.runId, intent: "inactive" },
        ]),
      )

      const staleWriter = Option.getOrThrow(yield* store.claimedSessionStore(runningClaim))
      expect((yield* staleWriter.reserveEntryId.pipe(Effect.flip)).message).toContain("stale")
      const replacement = yield* store.claimExecution({ runId: running.runId, ownerId: "new" })
      expect(BigInt(replacement.session.epoch)).toBeGreaterThan(BigInt(runningClaim.session.epoch))
      yield* store.releaseExecution(runningClaim)
      expect(yield* store.loadExecution(running.runId)).toMatchObject({
        runId: replacement.runId,
        ownerId: replacement.ownerId,
        attemptFence: replacement.attemptFence,
      })

      const snapshots = yield* Metric.snapshot
      const recoveredClaims = snapshots.find(
        (snapshot) => snapshot.id === "generalist_runtime_sqlite_exclusive_recovered_claims",
      )
      expect(recoveredClaims?.type).toBe("Counter")
      if (recoveredClaims?.type === "Counter") expect(recoveredClaims.state.count).toBe(2)
      const recoveryDuration = snapshots.find(
        (snapshot) => snapshot.id === "generalist_runtime_sqlite_exclusive_recovery_duration",
      )
      expect(recoveryDuration?.type).toBe("Histogram")
      if (recoveryDuration?.type === "Histogram") expect(recoveryDuration.state.count).toBe(1)
    }),
  ).pipe(Effect.provideService(Metric.MetricRegistry, new Map())),
)
