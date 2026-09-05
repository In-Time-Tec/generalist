import { expect, it } from "@effect/vitest"
import { Cause, Deferred, Effect, Exit, Fiber, Layer, Ref, Schema, Stream } from "effect"
import { Prompt } from "effect/unstable/ai"
import { DurableDriver, RunBudget } from "../../../../src/index.js"
import { RunStore, Runtime } from "../../../../src/runtime/index.js"
import { RuntimeUnavailable } from "../../../../src/runtime/errors.js"
import { settleInterruptedExecution } from "../../../../src/runtime/execution/interruption.js"
import { make as makeActiveModelResponse } from "../../../../src/core/model/result/active-model-response.js"
import { assistantAddress } from "../fixtures.js"
import { sqliteManualClaimLayer, tempDbPath } from "../../sql/scenario.js"

const scopedWith =
  <A, E>(layer: Layer.Layer<A, E>) =>
  <B, E2, R extends A>(effect: Effect.Effect<B, E2, R>) =>
    Effect.scoped(Layer.build(layer).pipe(Effect.flatMap((context) => effect.pipe(Effect.provideContext(context)))))

for (const replayPolicy of ["pure", "never"] as const) {
  for (const persisted of [false, true]) {
    it.live(
      `${replayPolicy} stream interrupted ${persisted ? "after" : "before"} completion write reopens safely`,
      () =>
        Effect.gen(function* () {
          const filename = tempDbPath("stream-operation-boundary")
          const committing = yield* Deferred.make<void>()
          let invocations = 0
          const driver = DurableDriver.makeLoopDriver({ logicalOperationId: "stream", sessionId: "stream" })
          const initial = yield* driver.initial({ prompt: Prompt.empty, budget: RunBudget.make({}) })
          const spec = {
            kind: "memory" as const,
            key: "stream:memory",
            input: {},
            replayPolicy,
            success: Schema.Array(Schema.String),
            failure: Schema.Never,
          }
          const source = Stream.suspend(() => {
            invocations += 1
            return Stream.make("authored result")
          })
          const first = yield* scopedWith(sqliteManualClaimLayer(filename))(
            Effect.gen(function* () {
              const store = yield* RunStore.RunStore
              const runtime = yield* Runtime.Runtime
              const receipt = yield* runtime.send({
                to: assistantAddress,
                sessionId: "stream",
                idempotencyKey: "stream",
                prompt: "unused",
              })
              const claim = yield* store.claimExecution({ runId: receipt.runId, ownerId: "first" })
              const active = yield* Ref.make<ReadonlySet<string>>(new Set())
              let operationId = ""
              const interpreter = yield* DurableDriver.makeInline({
                driver,
                initial,
                journal: {
                  onScheduled: (operation, checkpoint) =>
                    Effect.gen(function* () {
                      const record = yield* store.recordOperation({
                        ...claim,
                        operationKey: operation.key,
                        kind: operation.kind,
                        input: operation.input,
                        inputDigest: operation.inputDigest,
                        replayPolicy,
                        attempt: claim.attempt,
                        checkpoint,
                      })
                      operationId = record.operationId
                      yield* store.startOperation({ ...claim, operationId })
                      yield* Ref.set(active, new Set([operationId]))
                    }).pipe(Effect.orDie),
                  onCompleted: (_operation, outcome, checkpoint) =>
                    Effect.gen(function* () {
                      expect(outcome).toEqual({ _tag: "Succeeded", value: ["authored result"] })
                      if (persisted)
                        yield* store.completeOperation({
                          ...claim,
                          operationId,
                          outcome: { _tag: "Succeeded", value: ["authored result"] },
                          checkpoint,
                        })
                      yield* Deferred.succeed(committing, undefined)
                      return yield* Effect.never
                    }).pipe(Effect.orDie),
                  onCheckpoint: () => Effect.void,
                },
              })
              const completing = yield* Ref.make<ReadonlySet<string>>(new Set())
              const caller = yield* interpreter
                .runStream(spec, source, { successCodec: DurableDriver.arrayStreamCodec<string>() })
                .pipe(
                  Stream.runCollect,
                  Effect.onInterrupt(() =>
                    settleInterruptedExecution({
                      store,
                      claim,
                      runId: receipt.runId,
                      activeOperationIds: active,
                      completingRetrySafeOperationIds: completing,
                      activeModelResponse: makeActiveModelResponse(),
                      reason: "failure",
                      settleRun: false,
                    }),
                  ),
                  Effect.ensuring(store.releaseExecution(claim).pipe(Effect.orDie)),
                  Effect.forkChild({ startImmediately: true }),
                )
              yield* Deferred.await(committing).pipe(Effect.timeout("5 seconds"))
              yield* Fiber.interrupt(caller).pipe(Effect.timeout("5 seconds"))
              const exit = yield* Fiber.await(caller)
              expect(Exit.isFailure(exit)).toBe(true)
              if (Exit.isFailure(exit)) expect(Cause.hasInterruptsOnly(exit.cause)).toBe(true)
              expect(invocations).toBe(1)
              const uncommitted = replayPolicy === "never" ? "unknown" : "requested"
              expect((yield* store.getOperation({ runId: receipt.runId, operationId })).status).toBe(
                persisted ? "succeeded" : uncommitted,
              )
              return { runId: receipt.runId, operationId }
            }),
          )
          yield* scopedWith(sqliteManualClaimLayer(filename))(
            Effect.gen(function* () {
              const runtime = yield* Runtime.Runtime
              const store = yield* RunStore.RunStore
              if (!persisted && replayPolicy === "never") {
                expect((yield* runtime.inspect(first.runId)).status).toBe("needs-resolution")
                yield* runtime.resolveOperation({
                  ...first,
                  idempotencyKey: "evidence",
                  resolution: { _tag: "Succeeded", value: ["external result"] },
                })
              }
              const claim = yield* store.claimExecution({ runId: first.runId, ownerId: "reopened" })
              expect(yield* store.recoverRunningOperations(claim)).toBe("ready")
              const reopened = yield* store.loadExecution(first.runId)
              const interpreter = yield* DurableDriver.makeInline({
                driver,
                initial: yield* Schema.decodeUnknownEffect(DurableDriver.DriverCheckpoint)(reopened.checkpoint),
                journal: {
                  onScheduled: () =>
                    Effect.gen(function* () {
                      const record = yield* store.getOperation(first)
                      if (record.status === "succeeded") return { _tag: "Succeeded" as const, value: record.result }
                      expect(record.status).toBe("requested")
                      yield* store.startOperation({ ...claim, operationId: first.operationId })
                      return undefined
                    }).pipe(Effect.orDie),
                  onCompleted: (_operation, outcome, checkpoint) =>
                    store
                      .completeOperation({
                        ...claim,
                        operationId: first.operationId,
                        outcome: outcome._tag === "Succeeded" ? outcome : { _tag: "Unknown" },
                        checkpoint,
                      })
                      .pipe(Effect.asVoid, Effect.orDie),
                  onCheckpoint: () => Effect.void,
                },
              })
              const result = yield* interpreter
                .runStream(spec, source, { successCodec: DurableDriver.arrayStreamCodec<string>() })
                .pipe(Stream.runCollect)
              expect(result).toEqual([!persisted && replayPolicy === "never" ? "external result" : "authored result"])
              expect(invocations).toBe(!persisted && replayPolicy === "pure" ? 2 : 1)
              expect((yield* store.getOperation(first)).status).toBe("succeeded")
              yield* store.releaseExecution(claim)
            }),
          )
        }),
    )
  }
}

for (const persisted of [false, true]) {
  it.live(
    `settlement expiration failure ${persisted ? "after" : "before"} a write preserves recovery of every operation`,
    () =>
      Effect.gen(function* () {
        const filename = tempDbPath("settlement-expiration")
        const fault = RuntimeUnavailable.make({ message: "injected expiration failure" })
        const first = yield* scopedWith(sqliteManualClaimLayer(filename))(
          Effect.gen(function* () {
            const runtime = yield* Runtime.Runtime
            const store = yield* RunStore.RunStore
            const receipt = yield* runtime.send({
              to: assistantAddress,
              sessionId: "expiration",
              idempotencyKey: "expiration",
              prompt: "unused",
            })
            const claim = yield* store.claimExecution({ runId: receipt.runId, ownerId: "first" })
            const ids: string[] = []
            for (const replayPolicy of ["pure", "never"] as const) {
              const operation = yield* store.recordOperation({
                ...claim,
                operationKey: replayPolicy,
                kind: "memory",
                input: {},
                inputDigest: replayPolicy,
                replayPolicy,
                attempt: claim.attempt,
              })
              ids.push(operation.operationId)
              yield* store.startOperation({ ...claim, operationId: operation.operationId })
            }
            let writes = 0
            const activeOperationIds = yield* Ref.make<ReadonlySet<string>>(new Set(ids))
            const completingRetrySafeOperationIds = yield* Ref.make<ReadonlySet<string>>(new Set())
            const exit = yield* settleInterruptedExecution({
              store: {
                ...store,
                expireRunningOperation: (input) =>
                  Effect.gen(function* () {
                    writes += 1
                    if (persisted) yield* store.expireRunningOperation(input)
                    return yield* fault
                  }),
              },
              claim,
              runId: receipt.runId,
              activeOperationIds,
              completingRetrySafeOperationIds,
              activeModelResponse: makeActiveModelResponse(),
              reason: "cancel",
            }).pipe(Effect.exit, Effect.ensuring(store.releaseExecution(claim).pipe(Effect.orDie)))
            expect(writes).toBe(1)
            expect(Exit.isFailure(exit)).toBe(true)
            if (Exit.isFailure(exit))
              expect(exit.cause.reasons).toContainEqual(expect.objectContaining({ defect: fault }))
            expect((yield* store.getOperation({ runId: receipt.runId, operationId: ids[0]! })).status).toBe(
              persisted ? "requested" : "running",
            )
            expect((yield* store.getOperation({ runId: receipt.runId, operationId: ids[1]! })).status).toBe("running")
            expect((yield* runtime.inspect(receipt.runId)).status).toBe("running")
            return { runId: receipt.runId, ids }
          }),
        )
        yield* scopedWith(sqliteManualClaimLayer(filename))(
          Effect.gen(function* () {
            const runtime = yield* Runtime.Runtime
            const store = yield* RunStore.RunStore
            const claim = yield* store.claimExecution({ runId: first.runId, ownerId: "reopened" })
            expect(yield* store.recoverRunningOperations(claim)).toBe("blocked")
            expect((yield* store.getOperation({ runId: first.runId, operationId: first.ids[0]! })).status).toBe(
              "requested",
            )
            expect((yield* store.getOperation({ runId: first.runId, operationId: first.ids[1]! })).status).toBe(
              "unknown",
            )
            expect((yield* runtime.inspect(first.runId)).status).toBe("needs-resolution")
            yield* store.releaseExecution(claim)
            yield* runtime.resolveOperation({
              runId: first.runId,
              operationId: first.ids[1]!,
              idempotencyKey: "evidence",
              resolution: { _tag: "Succeeded", value: "confirmed" },
            })
            expect((yield* runtime.inspect(first.runId)).status).toBe("running")
          }),
        )
      }),
  )
}
