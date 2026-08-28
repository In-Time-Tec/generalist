import { beforeAll } from "vitest"
import { describe, expect, it, layer } from "@effect/vitest"
import { Effect, Stream } from "effect"
import { RunClaims, Runtime } from "tenetkit/runtime"
import { assistantAddress, completedResult } from "../../../../tenetkit/test/runtime/execution/fixtures.js"
import { mysqlAvailable, mysqlDatabase, mysqlLayer, uniqueSession } from "../runtime/environment.js"

const describeMysql = describe.runIf(mysqlAvailable)
const database = mysqlDatabase("tracer")

describeMysql("mysql tracer", () => {
  beforeAll(database.provisioned, 60_000)

  layer(database.provision(mysqlLayer(database.url)), { excludeTestServices: true })(
    "traces admit, multi-worker claim, commit, and replay",
    (suite) => {
      suite.effect("traces admit, multi-worker claim, commit, and replay", () =>
        Effect.gen(function* () {
          const runtime = yield* Runtime.Runtime
          const claims = yield* RunClaims.RunClaims
          const first = yield* runtime.send({
            to: assistantAddress,
            sessionId: uniqueSession("trace-a"),
            idempotencyKey: "a",
            prompt: "a",
          })
          const second = yield* runtime.send({
            to: assistantAddress,
            sessionId: uniqueSession("trace-b"),
            idempotencyKey: "b",
            prompt: "b",
          })
          const a = yield* claims.claimReadyRuns({ workerId: "trace-a", limit: 1 })
          const b = yield* claims.claimReadyRuns({ workerId: "trace-b", limit: 1 })
          yield* claims.commitWithClaim({
            runId: first.runId,
            workerId: "trace-a",
            attemptFence: a[0]!.attemptFence,
            transition: "complete",
            result: completedResult("a"),
          })
          yield* claims.commitWithClaim({
            runId: second.runId,
            workerId: "trace-b",
            attemptFence: b[0]!.attemptFence,
            transition: "complete",
            result: completedResult("b"),
          })
          const trace = yield* runtime
            .events({ runId: first.runId, cursor: -1 })
            .pipe(Stream.take(3), Stream.runCollect)
          expect([...trace].map((event) => event._tag)).toEqual(["RunAccepted", "RunAttemptStarted", "RunCompleted"])
        }),
      )
    },
  )
})

if (!mysqlAvailable) it.skip("mysql tracer skipped: set TENETKIT_MYSQL_URL or MYSQL_URL", () => undefined)
