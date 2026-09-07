import { objectRuntimeLayer, objectWorkerId } from "../execution/object.js"
import { cancellationConvergenceSuite } from "./suites/cancellation-convergence-suite.js"
import { expect, layer } from "@effect/vitest"
import { Effect, Layer } from "effect"
import { LocalScheduler, Runtime, RunStore } from "../../../src/runtime/index.js"
import { assistantAddress, parentRelativeOptions, resolverLayer, textPrompt } from "../execution/fixtures.js"

cancellationConvergenceSuite({
  name: "object",
  storeLayer: objectRuntimeLayer({ ...parentRelativeOptions, scheduler: { pollInterval: "1 day" } }).pipe(
    Layer.provide(resolverLayer),
  ),
})

const runtimeLayer = objectRuntimeLayer({ ...parentRelativeOptions, scheduler: { pollInterval: "1 day" } }).pipe(
  Layer.provide(resolverLayer),
)

layer(runtimeLayer)("object Session cancellation", (it) => {
  it.effect("cancels every prior root tree and proves nested descendants terminal", () =>
    Effect.gen(function* () {
      const runtime = yield* Runtime.Runtime
      const store = yield* RunStore.RunStore
      const scheduler = yield* LocalScheduler.LocalScheduler
      const sessionId = `thread:close:object`

      const first = yield* runtime.send({
        to: assistantAddress,
        sessionId,
        idempotencyKey: "first",
        prompt: textPrompt("first"),
      })
      const firstClaim = yield* store.claimExecution({
        commandId: "runtime-operation-tool-cancellation-test-ts-claim-1",
        runId: first.runId,
        ownerId: objectWorkerId,
      })
      const child = yield* runtime.spawn({
        parentRunId: first.runId,
        invocationId: "child",
        selection: "researcher",
        prompt: textPrompt("child"),
      })
      const childClaim = yield* store.claimExecution({
        commandId: "runtime-operation-tool-cancellation-test-ts-claim-2",
        runId: child.runId,
        ownerId: objectWorkerId,
      })
      const grandchild = yield* runtime.spawn({
        parentRunId: child.runId,
        invocationId: "grandchild",
        selection: "analyst",
        prompt: textPrompt("grandchild"),
      })
      const grandchildClaim = yield* store.claimExecution({
        commandId: "runtime-operation-tool-cancellation-test-ts-claim-3",
        runId: grandchild.runId,
        ownerId: objectWorkerId,
      })

      const prior = yield* runtime.send({
        to: assistantAddress,
        sessionId,
        idempotencyKey: "prior-root",
        prompt: textPrompt("prior"),
      })

      yield* runtime.cancelSession({
        commandId: "runtime-operation-tool-cancellation-test-ts-cancelSession-1",
        sessionId,
        reason: "thread closed",
      })
      yield* store.releaseExecution(firstClaim)
      yield* store.releaseExecution(childClaim)
      yield* store.releaseExecution(grandchildClaim)
      yield* scheduler.tick

      for (const runId of [first.runId, child.runId, grandchild.runId, prior.runId]) {
        expect((yield* runtime.inspect(runId)).status).toBe("cancelled")
      }
    }),
  )
})
