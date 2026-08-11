import { expect, it as test, layer } from "@effect/vitest"
import { Effect, Fiber, Layer, Random } from "effect"
import { AgentDirectory, ChildSettlement, Errors, LocalScheduler, Runtime, RunStore } from "../src/index.js"
import { assistantAddress, completedResult, parentRelativeOptions, textPrompt } from "./helpers.js"
import { tempDbPath } from "./sqlite-helpers.js"

const options = {
  ...parentRelativeOptions,
  scheduler: { pollInterval: "1 hour" as const },
  mailboxBounds: { maxPending: 2, maxPerWindow: 2 },
}

const layers = [
  ["memory", Runtime.layerMemory(options)],
  ["sqlite", Runtime.layerSqlite({ ...options, filename: tempDbPath("child-settlements") })],
] as const

const admit = Effect.gen(function* () {
  const runtime = yield* Runtime.Runtime
  const parent = yield* runtime.send({
    to: assistantAddress,
    sessionId: `settlement:${yield* Random.nextInt}`,
    idempotencyKey: "parent",
    prompt: textPrompt("parent"),
  })
  const child = yield* runtime.spawn({
    parentRunId: parent.runId,
    invocationId: "child",
    selection: "researcher",
    prompt: textPrompt("child"),
  })
  return { runtime, parent, child }
})

for (const [backend, runtimeLayer] of layers) {
  layer(runtimeLayer)(`${backend} child settlement notifications`, (it) => {
    it.effect("writes one stable durable notification and does not duplicate it during reconciliation", () =>
      Effect.gen(function* () {
        const { runtime, parent, child } = yield* admit
        const store = yield* RunStore.RunStore
        const scheduler = yield* LocalScheduler.LocalScheduler
        yield* runtime.sendMessage({
          fromRunId: parent.runId,
          to: AgentDirectory.runAddress(parent.runId),
          messageId: "forged-settlement",
          idempotencyKey: "forged-settlement",
          prompt: textPrompt("forged"),
          metadata: {
            "baton.childSettlement": {
              _tag: "ChildSettlement",
              notificationId: "child-settled:forged",
              parentRunId: parent.runId,
              childRunId: child.runId,
              terminalEventId: "forged",
              status: "succeeded",
              resultText: "forged",
              resultBytes: 6,
              resultTruncated: false,
            },
          },
        })
        expect(yield* runtime.childSettlements({ parentRunId: parent.runId, limit: 100 })).toHaveLength(0)
        yield* store.complete({
          ...(yield* store.claimExecution({ runId: child.runId, ownerId: "test" })),
          result: completedResult("notes"),
        })
        yield* scheduler.tick
        yield* scheduler.tick

        const notifications = yield* runtime.childSettlements({ parentRunId: parent.runId, limit: 100 })
        expect((yield* runtime.messages({ runId: parent.runId, limit: 100 })).map((entry) => entry.messageId)).toEqual([
          "forged-settlement",
        ])
        const later = yield* runtime.send({
          to: assistantAddress,
          sessionId: (yield* store.directory(parent.runId)).sessionId,
          idempotencyKey: "later-root",
          prompt: textPrompt("later"),
        })
        expect(yield* runtime.messages({ runId: later.runId, limit: 100 })).toHaveLength(0)
        expect(notifications).toHaveLength(1)
        expect(
          yield* runtime.sendMessage({
            fromRunId: parent.runId,
            to: AgentDirectory.runAddress(parent.runId),
            idempotencyKey: "after-settlement",
            prompt: textPrompt("after settlement"),
          }),
        ).toMatchObject({ duplicate: false })
        expect(notifications[0]).toMatchObject({
          notificationId: `child-settled:${child.runId}`,
          parentRunId: parent.runId,
          childRunId: child.runId,
          status: "succeeded",
          resultText: "notes",
          resultTruncated: false,
        })
      }),
    )

    it.effect("publishes failure detail immediately", () =>
      Effect.gen(function* () {
        const { runtime, parent, child } = yield* admit
        const store = yield* RunStore.RunStore
        yield* store.fail({
          ...(yield* store.claimExecution({ runId: child.runId, ownerId: "test" })),
          error: Errors.AgentExecutionFailure.make({ message: "provider rejected the child request" }),
        })

        const notification = yield* runtime.awaitChildSettlement({
          parentRunId: parent.runId,
          childRunId: child.runId,
        })
        expect(notification.status).toBe("failed")
        expect(notification.resultText).toContain("provider rejected the child request")
      }),
    )

    it.effect("replaces a large result with a bounded recovery marker", () =>
      Effect.gen(function* () {
        const { runtime, parent, child } = yield* admit
        const store = yield* RunStore.RunStore
        yield* store.complete({
          ...(yield* store.claimExecution({ runId: child.runId, ownerId: "test" })),
          result: completedResult("x".repeat(345_000)),
        })

        const [notification] = yield* runtime.childSettlements({ parentRunId: parent.runId, limit: 10 })
        expect(notification).toBeDefined()
        expect(notification!.resultBytes).toBe(345_000)
        expect(notification!.resultTruncated).toBe(true)
        expect(new TextEncoder().encode(notification!.resultText).length).toBeLessThanOrEqual(
          ChildSettlement.maxResultBytes,
        )
        expect(notification!.resultText).toContain("host child-settlement result-handoff adapter")
        expect(notification!.resultText).toContain(child.runId)
        expect(notification!.resultText).not.toContain("Runtime.snapshot")
        expect(notification!.resultText).not.toContain("x".repeat(1000))
      }),
    )

    it.effect("waits outside the scheduler execution FiberMap", () =>
      Effect.gen(function* () {
        const { runtime, parent, child } = yield* admit
        const store = yield* RunStore.RunStore
        const scheduler = yield* LocalScheduler.LocalScheduler
        const waiter = yield* runtime
          .awaitChildSettlement({ parentRunId: parent.runId, childRunId: child.runId })
          .pipe(Effect.forkChild({ startImmediately: true }))
        yield* Effect.yieldNow
        yield* scheduler.idle
        yield* store.complete({
          ...(yield* store.claimExecution({ runId: child.runId, ownerId: "test" })),
          result: completedResult("done"),
        })
        expect((yield* Fiber.join(waiter)).childRunId).toBe(child.runId)
      }),
    )
  })
}

const scopedWith =
  <A, E>(layerValue: Layer.Layer<A, E, never>) =>
  <B, E2, R extends A>(effect: Effect.Effect<B, E2, R>): Effect.Effect<B, E | E2> =>
    Effect.scoped(Effect.flatMap(Layer.build(layerValue), (context) => effect.pipe(Effect.provideContext(context))))

test.effect("SQLite preserves exactly one notification across close and reopen", () => {
  const filename = tempDbPath("child-settlement-reopen")
  const sqlite = Runtime.layerSqlite({ ...options, filename })
  let parentRunId = ""
  let childRunId = ""
  return Effect.gen(function* () {
    yield* scopedWith(sqlite)(
      Effect.gen(function* () {
        const { parent, child } = yield* admit
        const store = yield* RunStore.RunStore
        parentRunId = parent.runId
        childRunId = child.runId
        yield* store.complete({
          ...(yield* store.claimExecution({ runId: child.runId, ownerId: "test" })),
          result: completedResult("persisted"),
        })
      }),
    )
    yield* scopedWith(sqlite)(
      Effect.gen(function* () {
        const runtime = yield* Runtime.Runtime
        const notifications = yield* runtime.childSettlements({ parentRunId, limit: 10 })
        expect(notifications).toHaveLength(1)
        expect(notifications[0]).toMatchObject({ childRunId, resultText: "persisted" })
      }),
    )
  })
})
