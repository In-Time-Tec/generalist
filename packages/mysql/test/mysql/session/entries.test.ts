import { beforeAll } from "vitest"
import { describe, expect, it } from "@effect/vitest"
import { Effect } from "effect"
import { Errors, RunStore, Runtime } from "tenetkit/runtime"
import { assistantAddress, textPrompt } from "../../../../tenetkit/test/runtime/execution/fixtures.js"
import { provideScoped } from "../../../../tenetkit/test/runtime/execution/scoped-provide.js"
import { mysqlAvailable, mysqlDatabase, mysqlLayer, uniqueSession } from "../runtime/environment.js"

const describeBackend = describe.runIf(mysqlAvailable)
const database = mysqlDatabase("stranded-delivery")

/**
 * A message bound to a Run that dies before consuming it is still owed to the session.
 *
 * The durable backends derive pending-ness with a SQL predicate rather than the memory store's
 * in-process traversal, so the property needs its own proof against a real server.
 */
describeBackend("mysql stranded delivery", () => {
  beforeAll(database.provisioned, 60_000)

  it.live("returns a message to pending when its bound Run dies without consuming it", () =>
    Effect.gen(function* () {
      yield* database.ready
      yield* Effect.gen(function* () {
        const runtime = yield* Runtime.Runtime
        const store = yield* RunStore.RunStore
        const sessionId = uniqueSession("stranded")
        const parent = yield* runtime.send({
          to: assistantAddress,
          sessionId,
          idempotencyKey: `${sessionId}:parent`,
          prompt: textPrompt("plan"),
        })
        const child = yield* runtime.spawn({
          parentRunId: parent.runId,
          invocationId: "invocation:stranded-child",
          selection: "researcher",
          prompt: textPrompt("child"),
        })
        const target = yield* store.directory(child.runId)
        yield* runtime.sendMessage({
          fromRunId: parent.runId,
          to: target.address,
          idempotencyKey: `${sessionId}:stranded`,
          prompt: textPrompt("are you there?"),
        })
        const bound = yield* store.deliverPendingMessages({ runId: child.runId })
        expect(bound).toHaveLength(1)
        // Bound to a live Run, so it is not owed.
        expect(yield* store.pendingMessages({ sessionId: target.sessionId, limit: 10 })).toHaveLength(0)
        const claim = yield* store.claimExecution({ runId: child.runId, ownerId: "doomed" })
        yield* store.fail({ ...claim, error: Errors.AgentExecutionFailure.make({ message: "worker died" }) })
        // The holder died without consuming it, so the session is owed it again.
        const owed = yield* store.pendingMessages({ sessionId: target.sessionId, limit: 10 })
        expect(owed).toHaveLength(1)
        expect(owed[0]?.messageId).toBe(bound[0]?.messageId)
      }).pipe((effect) => provideScoped(mysqlLayer(database.url), effect))
    }),
  )
})
