import { expect, it } from "@effect/vitest"
import { Clock, Effect, Exit, Layer } from "effect"
import { SqlClient } from "effect/unstable/sql"
import { ExecutionHost } from "tenetkit/runtime/driver/execution-host"
import { LocalScheduler } from "tenetkit/runtime/driver/local-scheduler"
import { RunStore } from "tenetkit/runtime/driver/run-store"
import type { RunActivation, RunActivationProjection } from "tenetkit/runtime/driver/run-activation"
import { RuntimeUnavailable } from "tenetkit/runtime/driver/errors"
import { StaleClaim } from "tenetkit/runtime/driver/sql/errors"
import { ExecutableResolver, Runtime } from "../../tenetkit/src/runtime/index.js"
import { drain, makeExclusiveExecutionRecovery, makeProjection, schema } from "../src/durable-objects/index.js"
import { assistantAddress, assistantRef, registrationsFor, textPrompt } from "../../tenetkit/test/runtime/helpers.js"
import { tempDbPath } from "../../tenetkit/test/runtime/sqlite-helpers.js"
import { closedTestAgent } from "../../tenetkit/test/runtime/identity.js"
import { assistant } from "../../tenetkit/test/runtime/helpers.js"
import { layer as sqliteClientLayer } from "../../tenetkit/src/runtime/sql/bun-client.js"

const options = (filename: string, projection?: RunActivationProjection) => ({
  filename,
  resolver: ExecutableResolver.makeStatic([{ executable: assistantRef, agent: closedTestAgent(assistant) }]),
  addresses: [{ address: assistantAddress, executable: assistantRef, registrations: registrationsFor(assistantRef) }],
  ...(projection === undefined ? {} : { activationProjection: projection }),
  scheduler: { pollInterval: "1 day" as const },
})

const withLayer = <A, E, R, E2>(layer: Layer.Layer<R, E>, effect: Effect.Effect<A, E2, R>) =>
  Effect.scoped(Effect.flatMap(Layer.build(layer), (context) => Effect.provide(effect, context)))

const runtimeLayer = (projection?: RunActivationProjection) => {
  const filename = tempDbPath("cloudflare-activation")
  return Layer.merge(Runtime.layerSqlite(options(filename, projection)), sqliteClientLayer({ filename }))
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
      const claim = yield* store.claimExecution({ runId: admitted.runId, ownerId: "owner" })
      expect(changes.at(-1)).toEqual([{ runId: admitted.runId, intent: "inactive" }])
      yield* store.releaseExecution(claim)

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
      const store = RunStore.of({
        claimExecution: ({ runId }: { readonly runId: string }) =>
          Effect.sync(() => claimed.push(runId)).pipe(Effect.as({ runId })),
      } as never)
      const host = ExecutionHost.of({ execute: () => Effect.void } as never)
      const scheduler = LocalScheduler.of({ reconcileCancellation: () => Effect.void } as never)
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
        claimExecution: ({ runId }: { readonly runId: string }) =>
          Effect.fail(StaleClaim.make({ runId, workerId: "owner", attemptFence: 0 })),
      } as never)
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
      yield* sql`UPDATE baton_runs SET status = 'running', owner_worker_id = 'old', attempt_fence = 5
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
