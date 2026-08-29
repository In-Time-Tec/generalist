import { expect, it } from "@effect/vitest"
import * as SqliteClient from "@effect/sql-sqlite-bun/SqliteClient"
import { Clock, Effect, Exit, Layer } from "effect"
import { SqlClient } from "effect/unstable/sql"
import { ExecutionHost } from "tenetkit/runtime/driver/execution/host"
import { LocalScheduler } from "tenetkit/runtime/driver/execution/local-scheduler"
import { RunStore } from "tenetkit/runtime/driver/run/store"
import type { RunActivation, RunActivationProjection } from "tenetkit/runtime/driver/run/activation"
import { RuntimeUnavailable } from "tenetkit/runtime/driver/errors"
import { StaleClaim } from "tenetkit/runtime/driver/sql/errors"
import { make as makeMessage } from "tenetkit/runtime/driver/messaging/message"
import { defaultTreePolicy } from "tenetkit/runtime/driver/tree/policy"
import { ExecutableResolver, Runtime } from "../../tenetkit/src/runtime/index.js"
import {
  drain,
  makeExclusiveExecutionRecovery,
  makeProjection,
  nextDueAt,
  schema,
} from "../src/durable-objects/index.js"
import {
  assistant,
  assistantAddress,
  assistantRef,
  completedResult,
  registrationsFor,
  textPrompt,
} from "../../tenetkit/test/runtime/execution/fixtures.js"
import { tempDbPath } from "../../tenetkit/test/runtime/sql/scenario.js"
import { closedTestAgent } from "../../tenetkit/test/runtime/run/identity.js"
import { makeSqliteRunStore } from "../../tenetkit/src/runtime/sql/store.js"
import { makeRuntime } from "../../tenetkit/src/runtime/memory/layer.js"
import { layer as activeExecutionsLayer } from "../../tenetkit/src/runtime/execution/active-executions.js"

import { Runtime as SqliteRuntime } from "../../tenetkit/src/runtime/sqlite-bun.js"
const options = (filename: string, projection?: RunActivationProjection) => {
  const value = {
    filename,
    resolver: ExecutableResolver.makeStatic([{ executable: assistantRef, agent: closedTestAgent(assistant) }]),
    addresses: [{ address: assistantAddress, executable: assistantRef, registrations: registrationsFor(assistantRef) }],
    scheduler: { pollInterval: "1 day" as const },
  }
  return projection === undefined ? value : { ...value, activationProjection: projection }
}

const withLayer = <A, E, R, E2, R2>(layer: Layer.Layer<R, E, R2>, effect: Effect.Effect<A, E2, R>) =>
  Effect.scoped(Effect.flatMap(Layer.build(layer), (context) => effect.pipe(Effect.provideContext(context))))

const runtimeLayer = (projection?: RunActivationProjection) => {
  const filename = tempDbPath("cloudflare-activation")
  return Layer.merge(SqliteRuntime.layerSqlite(options(filename, projection)), SqliteClient.layer({ filename }))
}

const projectedRuntimeLayer = (rearm: Effect.Effect<void, RuntimeUnavailable>) => {
  const filename = tempDbPath("cloudflare-promotion-activation")
  const runtimeOptions = options(filename)
  const client = SqliteClient.layer({ filename })
  const store = Layer.effect(
    RunStore,
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient
      yield* schema
      return yield* makeSqliteRunStore({
        ...runtimeOptions,
        activationProjection: makeProjection(sql, rearm),
      })
    }),
  ).pipe(Layer.provide(client))
  const dependencies = Layer.merge(store, activeExecutionsLayer)
  const runtime = Layer.effect(Runtime.Runtime, makeRuntime(runtimeOptions)).pipe(Layer.provide(dependencies))
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
      expect(yield* sql`SELECT run_id FROM tenetkit_activations WHERE run_id = ${second!}`).toHaveLength(0)

      rejectProjection = false
      yield* store.complete({ ...firstClaim, result: completedResult("first complete") })
      expect((yield* runtime.inspectFanOut(fanOut.fanOutId)).members[1]?.status).toBe("running")
      expect(
        yield* sql<{ intent: string; run_status: string }>`
          SELECT intent, run_status FROM tenetkit_activations WHERE run_id = ${second!}
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
      yield* schema
      const projection = makeProjection(sql, Effect.void)
      yield* sql.withTransaction(
        projection.applyInTransaction([{ runId: "run", intent: "execute", attemptFence: 0, runStatus: "running" }]),
      )
      expect(yield* sql`SELECT run_id FROM tenetkit_activations`).toHaveLength(1)
      yield* sql.withTransaction(projection.applyInTransaction([{ runId: "run", intent: "inactive" }]))
      expect(yield* sql`SELECT run_id FROM tenetkit_activations`).toHaveLength(0)
      yield* Effect.exit(
        sql.withTransaction(
          projection
            .applyInTransaction([{ runId: "rollback", intent: "execute", attemptFence: 0, runStatus: "running" }])
            .pipe(Effect.andThen(Effect.fail("rollback"))),
        ),
      )
      expect(yield* sql`SELECT run_id FROM tenetkit_activations WHERE run_id = 'rollback'`).toHaveLength(0)
    }),
  ),
)

it.live("rearms a shared host alarm from final transaction state and lets earlier host work win", () =>
  withLayer(
    runtimeLayer(),
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient
      yield* schema
      yield* sql`CREATE TABLE host_ready_work (due_at_millis INTEGER NOT NULL)`
      yield* sql`INSERT INTO host_ready_work VALUES (0)`
      const observed: Array<{ readonly tenetkit?: number; readonly shared: number }> = []
      const rearm = Effect.gen(function* () {
        const tenetkit = yield* nextDueAt
        const host = yield* sql<{ readonly due_at_millis: number }>`
          SELECT MIN(due_at_millis) AS due_at_millis FROM host_ready_work
        `
        const shared = Math.min(tenetkit ?? Number.POSITIVE_INFINITY, host[0]!.due_at_millis)
        const observation = tenetkit === undefined ? { shared } : { tenetkit, shared }
        observed.push(observation)
      }).pipe(
        Effect.provideService(SqlClient.SqlClient, sql),
        Effect.mapError(() => RuntimeUnavailable.make({ message: "shared alarm rearm failed" })),
      )
      yield* sql.withTransaction(
        makeProjection(sql, rearm).applyInTransaction([
          { runId: "tenetkit", intent: "execute", attemptFence: 1, runStatus: "running" },
        ]),
      )

      expect(observed).toHaveLength(1)
      expect(observed[0]!.tenetkit).toBeTypeOf("number")
      expect(observed[0]!.shared).toBe(0)
    }),
  ),
)

it.live("drains deterministically with bounded fuel and leaves duplicate or stale candidates harmless", () =>
  withLayer(
    runtimeLayer(),
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient
      yield* schema
      const future = (yield* Clock.currentTimeMillis) + 60_000
      yield* sql`INSERT INTO tenetkit_activations VALUES
        ('b', 'execute', 0, 0, 'queued'),
        ('a', 'execute', 0, 0, 'queued'),
        ('future', 'execute', ${future}, 0, 'queued')`
      const claimed: Array<string> = []
      const liveStore = yield* RunStore
      const liveHost = yield* ExecutionHost
      const liveScheduler = yield* LocalScheduler
      const store = RunStore.of({
        ...liveStore,
        claimExecution: ({ runId }: { readonly runId: string }) =>
          Effect.sync(() => claimed.push(runId)).pipe(
            Effect.as({
              runId,
              rootRunId: runId,
              depth: 0,
              treePolicy: defaultTreePolicy,
              activeChildCount: 0,
              ownerId: "owner",
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
              cancellationRequested: false,
              registrations: registrationsFor(assistantRef),
            }),
          ),
      })
      const host = ExecutionHost.of({ ...liveHost, execute: () => Effect.void })
      const scheduler = LocalScheduler.of({
        ...liveScheduler,
        reconcileCancellation: () => Effect.succeed("inactive"),
      })
      const result = yield* drain({ ownerId: "owner", fuel: 1, rearm: Effect.void }).pipe(
        Effect.provideService(RunStore, store),
        Effect.provideService(ExecutionHost, host),
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
      const stale = yield* drain({ ownerId: "owner", fuel: 5, rearm: Effect.void }).pipe(
        Effect.provideService(RunStore, harmless),
        Effect.provideService(ExecutionHost, host),
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
          sessionId: "recovery",
          idempotencyKey: key,
          prompt: textPrompt(key),
        })
      const running = yield* admit("running")
      const cancelling = yield* admit("cancelling")
      yield* sql`UPDATE tenetkit_runs SET status = 'running', owner_worker_id = 'old', attempt_fence = 5
        WHERE run_id IN (${running.runId}, ${cancelling.runId})`
      yield* runtime.cancel({ runId: cancelling.runId, reason: "replace host" })
      const runningClaim = { runId: running.runId, ownerId: "old", attemptFence: 5 }

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
          { runId: running.runId, intent: "execute", attemptFence: 6, runStatus: "running" },
          { runId: cancelling.runId, intent: "inactive" },
        ]),
      )

      const replacement = yield* store.claimExecution({ runId: running.runId, ownerId: "new" })
      yield* store.releaseExecution(runningClaim)
      expect(yield* store.loadExecution(running.runId)).toMatchObject(replacement)
    }),
  ),
)
