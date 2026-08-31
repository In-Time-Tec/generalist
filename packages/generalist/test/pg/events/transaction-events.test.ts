import { describe, expect, it, layer } from "@effect/vitest"
import { Effect, Stream } from "effect"
import { Runtime, RunStore } from "generalist/runtime"
import { RunClaims } from "generalist/runtime/sql-driver"
import {
  assistantAddress,
  completedResult,
  openWait,
  suspension,
  textPrompt,
} from "../../../../generalist/test/runtime/execution/fixtures.js"
import { postgresAvailable, postgresDatabase, postgresLayer, uniqueSession } from "../database.js"

const describePostgres = postgresAvailable ? describe : describe.skip

const database = postgresDatabase("tracer")

describePostgres("PostgreSQL process tracer", () => {
  layer(database.provision(postgresLayer(database.url)), { excludeTestServices: true })(
    "traces multi-worker admit claim commit replay",
    (suite) => {
      suite.effect("traces multi-worker admit claim commit replay", () =>
        Effect.gen(function* () {
          const sessionId = uniqueSession("tracer")
          const runtime = yield* Runtime.Runtime
          const claims = yield* RunClaims
          const driver = yield* RunStore.RunStore
          const first = yield* runtime.send({
            to: assistantAddress,
            sessionId,
            idempotencyKey: "t1",
            prompt: textPrompt("one"),
          })
          const dup = yield* runtime.send({
            to: assistantAddress,
            sessionId,
            idempotencyKey: "t1",
            prompt: textPrompt("one"),
          })
          const second = yield* runtime.send({
            to: assistantAddress,
            sessionId,
            idempotencyKey: "t2",
            prompt: textPrompt("two"),
          })
          const a = yield* claims.claimReadyRuns({ workerId: "tracer-a", limit: 1, lease: "10 seconds" })
          expect(a).toHaveLength(1)
          expect(a[0]!.run.runId).toBe(first.runId)
          yield* driver.suspend({
            runId: first.runId,
            ownerId: "tracer-a",
            attemptFence: a[0]!.attemptFence,
            session: a[0]!.session,
            waits: [openWait({ waitId: "gate", reason: "external" })],
            suspension: suspension({ waitId: "gate" }),
          })
          yield* runtime.signal({ runId: first.runId, name: "gate" })
          const resumed = yield* claims.claimReadyRuns({ workerId: "tracer-a", limit: 1, lease: "10 seconds" })
          yield* claims.commitWithClaim({
            runId: first.runId,
            workerId: "tracer-a",
            attemptFence: resumed[0]!.attemptFence,
            session: resumed[0]!.session,
            transition: "complete",
            result: completedResult("done"),
          })
          const b = yield* claims.claimReadyRuns({ workerId: "tracer-b", limit: 1, lease: "10 seconds" })
          expect(b[0]!.run.runId).toBe(second.runId)
          yield* claims.commitWithClaim({
            runId: second.runId,
            workerId: "tracer-b",
            attemptFence: b[0]!.attemptFence,
            session: b[0]!.session,
            transition: "complete",
            result: completedResult("done-2"),
          })
          const history = yield* runtime.events({ runId: first.runId, cursor: -1 }).pipe(
            Stream.take(5),
            Stream.runCollect,
            Effect.map((chunk) => [...chunk].map((event) => event._tag)),
          )
          const trace = {
            duplicate: dup.duplicate,
            firstRunId: first.runId,
            secondRunId: second.runId,
            history,
            workers: ["tracer-a", "tracer-b"],
          }

          expect(trace.duplicate).toBe(true)
          expect(trace.history[0]).toBe("RunAccepted")
          expect(trace.history).toContain("RunCompleted")
        }),
      )
    },
  )
})

if (!postgresAvailable) {
  it.skip("postgres tracer skipped: set GENERALIST_DATABASE_URL or DATABASE_URL", () => undefined)
}
