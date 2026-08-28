import { expect, it, layer } from "@effect/vitest"
import { Effect, Fiber, Layer, Option, Random, Stream } from "effect"
import {
  AgentDirectory,
  ChildSettlement,
  Errors,
  LocalScheduler,
  Runtime,
  RunStore,
} from "../../../../src/runtime/index.js"
import { assistantAddress, completedResult, parentRelativeOptions, textPrompt } from "../../execution/fixtures.js"
import { tempDbPath } from "../../sql/scenario.js"

import { Runtime as SqliteRuntime } from "../../../../src/runtime/sqlite-bun.js"
const options = {
  ...parentRelativeOptions,
  scheduler: { pollInterval: "1 hour" as const },
  mailboxBounds: { maxPending: 2, maxPerWindow: 2 },
}

const layers = [
  ["memory", Runtime.layerMemory(options)],
  ["sqlite", SqliteRuntime.layerSqlite({ ...options, filename: tempDbPath("child-settlements") })],
] as const

it("separates cancelled settlement observation from model delivery", () => {
  const payload: ChildSettlement.Payload = {
    _tag: "ChildSettlement",
    notificationId: "child-settled:child",
    parentRunId: "parent",
    childRunId: "child",
    terminalEventId: "child:cancelled",
    status: "cancelled",
    resultText: "cancelled by user",
    resultBytes: 17,
    resultTruncated: false,
  }
  const observation = ChildSettlement.observationEntry({
    payload,
    parentSessionId: "session",
    sequence: 0,
    admittedAtMillis: 1,
  })

  expect(observation.prompt.content).toEqual([])
  expect(ChildSettlement.fromMailboxEntry(observation)).toMatchObject(payload)
})

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
  layer(runtimeLayer)(`${backend} child settlement notifications`, (suite) => {
    suite.effect("writes one stable durable notification and does not duplicate it during reconciliation", () =>
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
            "tenetkit.childSettlement": {
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

    suite.effect("observes a completed settlement without delivering it into the next Run", () =>
      Effect.gen(function* () {
        const { runtime, parent, child } = yield* admit
        const store = yield* RunStore.RunStore
        yield* store.fail({
          ...(yield* store.claimExecution({ runId: parent.runId, ownerId: "finished" })),
          error: Errors.AgentExecutionFailure.make({ message: "parent turn ended" }),
        })
        yield* store.complete({
          ...(yield* store.claimExecution({ runId: child.runId, ownerId: "test" })),
          result: completedResult("notes"),
        })
        const later = yield* runtime.send({
          to: assistantAddress,
          sessionId: (yield* store.directory(parent.runId)).sessionId,
          idempotencyKey: "next-run",
          prompt: textPrompt("next"),
        })
        expect(yield* store.deliverPendingMessages({ runId: later.runId })).toHaveLength(0)
        const history = yield* runtime.history({ runId: later.runId, cursor: -1, limit: 100 })
        expect(history.filter((event) => event._tag === "SteeringAccepted")).toEqual([])
        const [notification] = yield* runtime.childSettlements({ parentRunId: parent.runId, limit: 10 })
        expect(notification).toMatchObject({ childRunId: child.runId, status: "succeeded" })
        expect(notification!.resultText).toContain("notes")
      }),
    )

    suite.effect("observes a failed settlement without delivering it into the next Run", () =>
      Effect.gen(function* () {
        const { runtime, parent, child } = yield* admit
        const store = yield* RunStore.RunStore
        yield* store.fail({
          ...(yield* store.claimExecution({ runId: parent.runId, ownerId: "finished" })),
          error: Errors.AgentExecutionFailure.make({ message: "parent turn ended" }),
        })
        yield* store.fail({
          ...(yield* store.claimExecution({ runId: child.runId, ownerId: "test" })),
          error: Errors.AgentExecutionFailure.make({ message: "child provider failed" }),
        })
        const later = yield* runtime.send({
          to: assistantAddress,
          sessionId: (yield* store.directory(parent.runId)).sessionId,
          idempotencyKey: "next-run-after-failure",
          prompt: textPrompt("next"),
        })
        expect(yield* store.deliverPendingMessages({ runId: later.runId })).toHaveLength(0)
        const history = yield* runtime.history({ runId: later.runId, cursor: -1, limit: 100 })
        expect(history.filter((event) => event._tag === "SteeringAccepted")).toEqual([])
        const [notification] = yield* runtime.childSettlements({ parentRunId: parent.runId, limit: 10 })
        expect(notification).toMatchObject({ childRunId: child.runId, status: "failed" })
        expect(notification!.resultText).toContain("child provider failed")
      }),
    )

    suite.effect("observes cancellation without model delivery or forwarding", () =>
      Effect.gen(function* () {
        const { runtime, parent, child } = yield* admit
        const store = yield* RunStore.RunStore
        yield* runtime.cancel({ runId: child.runId, reason: "cancelled by user" })

        const notifications = yield* runtime.childSettlements({ parentRunId: parent.runId, limit: 10 })
        expect(notifications).toEqual([
          expect.objectContaining({
            notificationId: `child-settled:${child.runId}`,
            childRunId: child.runId,
            status: "cancelled",
            resultText: "cancelled by user",
          }),
        ])
        const changed = yield* runtime.childSettlementChanges({ parentRunId: parent.runId }).pipe(
          Stream.filter((entry) => entry.childRunId === child.runId),
          Stream.runHead,
        )
        expect(Option.getOrUndefined(changed)).toEqual(notifications[0])
        expect(yield* runtime.awaitChildSettlement({ parentRunId: parent.runId, childRunId: child.runId })).toEqual(
          notifications[0],
        )

        expect(yield* store.deliverPendingMessages({ runId: parent.runId })).toHaveLength(0)
        const parentHistory = yield* runtime.history({ runId: parent.runId, cursor: -1, limit: 100 })
        expect(parentHistory).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              _tag: "ChildSettled",
              childRunId: child.runId,
              terminalEventId: notifications[0]!.terminalEventId,
            }),
          ]),
        )
        expect(parentHistory.some((event) => event._tag === "SteeringAccepted" || event._tag === "RunResumed")).toBe(
          false,
        )

        yield* store.fail({
          ...(yield* store.claimExecution({ runId: parent.runId, ownerId: "finished" })),
          error: Errors.AgentExecutionFailure.make({ message: "parent turn ended" }),
        })
        const later = yield* runtime.send({
          to: assistantAddress,
          sessionId: (yield* store.directory(parent.runId)).sessionId,
          idempotencyKey: "next-run-after-cancellation",
          prompt: textPrompt("next"),
        })
        expect(yield* store.deliverPendingMessages({ runId: later.runId })).toHaveLength(0)
        expect(
          (yield* runtime.history({ runId: later.runId, cursor: -1, limit: 100 })).some(
            (event) => event._tag === "SteeringAccepted",
          ),
        ).toBe(false)
        expect(yield* runtime.childSettlements({ parentRunId: parent.runId, limit: 10 })).toEqual(notifications)
      }),
    )

    suite.effect("publishes failure detail immediately", () =>
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

    suite.effect("replaces a large result with a bounded recovery marker", () =>
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
        /**
         * A truncated result names where the full one already is. It used to name a
         * "result-handoff adapter" that exists nowhere in TenetKit, which a reader could only act on
         * by inventing it.
         */
        expect(notification!.resultText).toContain("the terminal event of child")
        expect(notification!.resultText).not.toContain("result-handoff adapter")
        expect(notification!.resultText).toContain(child.runId)
        expect(notification!.resultText).not.toContain("Runtime.snapshot")
        expect(notification!.resultText).not.toContain("x".repeat(1000))
      }),
    )

    suite.effect("waits outside the scheduler execution FiberMap", () =>
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

it.effect("SQLite preserves exactly one notification across close and reopen", () => {
  const filename = tempDbPath("child-settlement-reopen")
  const sqlite = SqliteRuntime.layerSqlite({ ...options, filename })
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

/**
 * A settled child is an observation, not model-facing content. The parent already receives the
 * child's result as the tool result of the call that started it, so projecting the settlement into
 * steering delivered the same outcome a second time as a user message.
 */
for (const [backend, runtimeLayer] of layers) {
  layer(runtimeLayer)(`${backend} settlement observation`, (suite) => {
    suite.effect("never binds a settled child into the parent Session's steering inbox", () =>
      Effect.gen(function* () {
        const runtime = yield* Runtime.Runtime
        const store = yield* RunStore.RunStore
        const sessionId = `joined-settlement:${yield* Random.nextInt}`
        const parent = yield* runtime.send({
          to: assistantAddress,
          sessionId,
          idempotencyKey: `joined:${backend}`,
          prompt: textPrompt("parent"),
        })
        const receipt = yield* runtime.fanOut({
          parentRunId: parent.runId,
          idempotencyKey: `group:${backend}`,
          members: [{ key: "member-0", selection: "researcher", prompt: "member-0" }],
          concurrency: 1,
          join: { _tag: "AllSuccess" },
          remainder: "await",
        })
        const member = receipt.childRunIds[0]!
        yield* store.complete({
          ...(yield* store.claimExecution({ runId: member, ownerId: "test" })),
          result: completedResult("MEMBER_RESULT_BODY"),
        })

        const [notification] = yield* runtime.childSettlements({ parentRunId: parent.runId, limit: 10 })
        expect(notification).toBeDefined()
        expect(notification!.joined).toBe(true)
        expect(notification!.resultText).toContain("MEMBER_RESULT_BODY")

        const claim = yield* store.claimExecution({ runId: parent.runId, ownerId: "parent" })
        yield* store.fail({ ...claim, error: Errors.AgentExecutionFailure.make({ message: "parent done" }) })
        const later = yield* runtime.send({
          to: assistantAddress,
          sessionId,
          idempotencyKey: `later:${backend}`,
          prompt: textPrompt("later"),
        })
        expect(yield* store.deliverPendingMessages({ runId: later.runId })).toHaveLength(0)
      }),
    )
  })
}
