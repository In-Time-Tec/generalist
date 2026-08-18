import { expect, it } from "@effect/vitest"
import { Effect, Layer } from "effect"
import { Runtime, RunStore } from "../../src/runtime/index.js"
import type { ExecutableRef } from "../../src/runtime/executable-manifest.js"
import { assistantAddress, textPrompt } from "./helpers.js"
import { sqliteLayer, tempDbPath } from "./sqlite-helpers.js"

const withDb =
  (filename: string) =>
  <A, E, R>(effect: Effect.Effect<A, E, R>) =>
    Effect.scoped(
      Layer.build(sqliteLayer(filename)).pipe(Effect.flatMap((context) => effect.pipe(Effect.provideContext(context)))),
    )

const checkpoint = (executable: ExecutableRef) => ({
  driverVersion: "1" as const,
  executable,
  turn: 0,
  budget: { allocation: {}, remaining: {}, depth: 0 },
  state: {},
})

it.live("phase-0 tracer: non-idempotent counter with crash boundaries", () =>
  Effect.gen(function* () {
    const filename = tempDbPath("tracer")
    let externalCounter = 0

    const crashAfterStart = yield* withDb(filename)(
      Effect.gen(function* () {
        const runtime = yield* Runtime.Runtime
        const driver = yield* RunStore.RunStore
        const receipt = yield* runtime.send({
          to: assistantAddress,
          sessionId: "session:tracer:crash-start",
          idempotencyKey: "crash-start",
          prompt: textPrompt("counter"),
        })
        const op = yield* driver.recordOperation({
          ...(yield* driver.claimExecution({ runId: receipt.runId, ownerId: "test" })),
          runId: receipt.runId,
          operationKey: "tool:counter:1",
          kind: "tool",
          inputDigest: "counter:v1",
          input: { step: 1 },
          replayPolicy: "never",
          attempt: 1,
        })
        yield* driver.startOperation({
          ...(yield* driver.claimExecution({ runId: receipt.runId, ownerId: "test" })),
          runId: receipt.runId,
          operationId: op.operationId,
        })
        return { runId: receipt.runId, operationId: op.operationId }
      }),
    )

    const afterCrashStart = yield* withDb(filename)(
      Effect.gen(function* () {
        const driver = yield* RunStore.RunStore
        const claim = yield* driver.claimExecution({ runId: crashAfterStart.runId, ownerId: "recovery" })
        const expired = yield* driver.expireRunningOperation({ ...claim, operationId: crashAfterStart.operationId })
        expect(expired.outcome).toBe("unknown")
        expect(expired.record.status).toBe("unknown")
        expect(externalCounter).toBe(0)
        return expired
      }),
    )
    expect(afterCrashStart.record.status).toBe("unknown")

    const crashAfterObserve = yield* withDb(filename)(
      Effect.gen(function* () {
        const runtime = yield* Runtime.Runtime
        const driver = yield* RunStore.RunStore
        const receipt = yield* runtime.send({
          to: assistantAddress,
          sessionId: "session:tracer:crash-observe",
          idempotencyKey: "crash-observe",
          prompt: textPrompt("counter-2"),
        })
        const op = yield* driver.recordOperation({
          ...(yield* driver.claimExecution({ runId: receipt.runId, ownerId: "test" })),
          runId: receipt.runId,
          operationKey: "tool:counter:2",
          kind: "tool",
          inputDigest: "counter:v2",
          input: { step: 2 },
          replayPolicy: "never",
          attempt: 1,
        })
        yield* driver.startOperation({
          ...(yield* driver.claimExecution({ runId: receipt.runId, ownerId: "test" })),
          runId: receipt.runId,
          operationId: op.operationId,
        })
        externalCounter += 1
        return { runId: receipt.runId, operationId: op.operationId, observed: externalCounter }
      }),
    )

    const afterCrashObserve = yield* withDb(filename)(
      Effect.gen(function* () {
        const driver = yield* RunStore.RunStore
        const claim = yield* driver.claimExecution({ runId: crashAfterObserve.runId, ownerId: "recovery" })
        const expired = yield* driver.expireRunningOperation({
          ...claim,
          operationId: crashAfterObserve.operationId,
        })
        expect(expired.outcome).toBe("unknown")
        expect(externalCounter).toBe(1)
        return expired
      }),
    )
    expect(afterCrashObserve.record.status).toBe("unknown")

    const committed = yield* withDb(filename)(
      Effect.gen(function* () {
        const runtime = yield* Runtime.Runtime
        const driver = yield* RunStore.RunStore
        const receipt = yield* runtime.send({
          to: assistantAddress,
          sessionId: "session:tracer:commit",
          idempotencyKey: "commit",
          prompt: textPrompt("counter-3"),
        })
        const op = yield* driver.recordOperation({
          ...(yield* driver.claimExecution({ runId: receipt.runId, ownerId: "test" })),
          runId: receipt.runId,
          operationKey: "tool:counter:3",
          kind: "tool",
          inputDigest: "counter:v3",
          input: { step: 3 },
          replayPolicy: "never",
          attempt: 1,
        })
        yield* driver.startOperation({
          ...(yield* driver.claimExecution({ runId: receipt.runId, ownerId: "test" })),
          runId: receipt.runId,
          operationId: op.operationId,
        })
        externalCounter += 1
        const completionClaim = yield* driver.claimExecution({ runId: receipt.runId, ownerId: "test" })
        const succeeded = yield* driver.completeOperation({
          ...completionClaim,
          runId: receipt.runId,
          operationId: op.operationId,
          outcome: { _tag: "Succeeded", value: { count: externalCounter } },
          checkpoint: checkpoint(completionClaim.executableRef),
        })
        const sameKey = yield* driver.recordOperation({
          ...(yield* driver.claimExecution({ runId: receipt.runId, ownerId: "test" })),
          runId: receipt.runId,
          operationKey: "tool:counter:3",
          kind: "tool",
          inputDigest: "counter:v3",
          input: { step: 3 },
          replayPolicy: "never",
          attempt: 1,
        })
        expect(sameKey.operationId).toBe(op.operationId)
        expect(sameKey.status).toBe("succeeded")
        expect(sameKey.result).toEqual({ count: externalCounter })
        expect(succeeded.status).toBe("succeeded")
        return { runId: receipt.runId, count: externalCounter }
      }),
    )

    const reopen = yield* withDb(filename)(
      Effect.gen(function* () {
        const driver = yield* RunStore.RunStore
        const runtime = yield* Runtime.Runtime
        const receipt = yield* runtime.send({
          to: assistantAddress,
          sessionId: "session:tracer:commit",
          idempotencyKey: "commit",
          prompt: textPrompt("counter-3"),
        })
        expect(receipt.duplicate).toBe(true)
        const recorded = yield* driver.recordOperation({
          ...(yield* driver.claimExecution({ runId: committed.runId, ownerId: "test" })),
          runId: committed.runId,
          operationKey: "tool:counter:3",
          kind: "tool",
          inputDigest: "counter:v3",
          input: { step: 3 },
          replayPolicy: "never",
          attempt: 1,
        })
        expect(recorded.status).toBe("succeeded")
        expect(recorded.result).toEqual({ count: committed.count })
        expect(externalCounter).toBe(2)
      }),
    )
    void reopen

    const idempotentRetry = yield* withDb(filename)(
      Effect.gen(function* () {
        const runtime = yield* Runtime.Runtime
        const driver = yield* RunStore.RunStore
        const receipt = yield* runtime.send({
          to: assistantAddress,
          sessionId: "session:tracer:pure-retry",
          idempotencyKey: "pure-retry",
          prompt: textPrompt("pure"),
        })
        const op = yield* driver.recordOperation({
          ...(yield* driver.claimExecution({ runId: receipt.runId, ownerId: "test" })),
          runId: receipt.runId,
          operationKey: "model:pure:1",
          kind: "model",
          inputDigest: "pure:v1",
          input: { step: 1 },
          replayPolicy: "provider-idempotent",
          attempt: 1,
        })
        const claim = yield* driver.claimExecution({ runId: receipt.runId, ownerId: "test" })
        yield* driver.startOperation({ ...claim, operationId: op.operationId })
        const expired = yield* driver.expireRunningOperation({
          ...claim,
          operationId: op.operationId,
        })
        expect(expired.outcome).toBe("retried")
        yield* driver.startOperation({
          ...(yield* driver.claimExecution({ runId: receipt.runId, ownerId: "test" })),
          runId: receipt.runId,
          operationId: op.operationId,
        })
        const completionClaim = yield* driver.claimExecution({ runId: receipt.runId, ownerId: "test" })
        const done = yield* driver.completeOperation({
          ...completionClaim,
          runId: receipt.runId,
          operationId: op.operationId,
          outcome: { _tag: "Succeeded", value: { ok: true } },
          checkpoint: checkpoint(completionClaim.executableRef),
        })
        expect(done.status).toBe("succeeded")
      }),
    )
    void idempotentRetry
  }).pipe(Effect.asVoid),
)
