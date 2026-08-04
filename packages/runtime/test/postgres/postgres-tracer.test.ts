import { describe, expect, it } from "@effect/vitest"
import { Effect, Stream } from "effect"
import { RunClaims, Runtime, RunStore } from "../../src/index.js"
import { assistantAddress, completedResult, openWait, textPrompt } from "../helpers.js"
import { postgresAvailable, postgresLayer, postgresUrl, preparePostgres, uniqueSession } from "./helpers.js"

const describePostgres = postgresAvailable ? describe.sequential : describe.skip

const url = postgresUrl!

describePostgres("postgres process tracer", () => {
  it.live("traces multi-worker admit claim commit replay", () =>
    Effect.gen(function* () {
      yield* preparePostgres(url)
      const sessionId = uniqueSession("tracer")
      const trace = yield* Effect.gen(function* () {
        const runtime = yield* Runtime.Runtime
        const claims = yield* RunClaims.RunClaims
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
        yield* driver.wait({
          runId: first.runId,
          ownerId: "tracer-a",
          attemptFence: a[0]!.attemptFence,
          wait: openWait("gate", "external"),
        })
        yield* runtime.signal({ runId: first.runId, name: "gate" })
        yield* claims.commitWithClaim({
          runId: first.runId,
          workerId: "tracer-a",
          attemptFence: a[0]!.attemptFence,
          transition: "complete",
          result: completedResult("done"),
        })
        const b = yield* claims.claimReadyRuns({ workerId: "tracer-b", limit: 1, lease: "10 seconds" })
        expect(b[0]!.run.runId).toBe(second.runId)
        yield* claims.commitWithClaim({
          runId: second.runId,
          workerId: "tracer-b",
          attemptFence: b[0]!.attemptFence,
          transition: "complete",
          result: completedResult("done-2"),
        })
        const history = yield* runtime.events({ runId: first.runId, cursor: -1 }).pipe(
          Stream.take(5),
          Stream.runCollect,
          Effect.map((chunk) => [...chunk].map((event) => event._tag)),
        )
        return {
          duplicate: dup.duplicate,
          firstRunId: first.runId,
          secondRunId: second.runId,
          history,
          workers: ["tracer-a", "tracer-b"],
        }
      }).pipe(Effect.provide(postgresLayer(url)), Effect.scoped)

      expect(trace.duplicate).toBe(true)
      expect(trace.history[0]).toBe("RunAccepted")
      expect(trace.history).toContain("RunCompleted")
    }),
  )
})

if (!postgresAvailable) {
  it.skip("postgres tracer skipped: set BATON_DATABASE_URL or DATABASE_URL", () => undefined)
}
