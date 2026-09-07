import { expect, it } from "@effect/vitest"
import { Effect, Layer } from "effect"
import { Runtime, RunStore } from "../../../src/runtime/index.js"
import type { ExecutableRef } from "../../../src/runtime/executable/manifest.js"
import { assistantAddress, assistantRef, resolverLayer, registrationsFor, textPrompt } from "../execution/fixtures.js"
import { makeObjectStorage, objectRuntimeLayer, objectWorkerId } from "../execution/object.js"
import type { Simulator } from "../../../src/testing/durability/index.js"

const withObject =
  (storage: Simulator) =>
  <A, E, R>(effect: Effect.Effect<A, E, R>) =>
    Effect.scoped(
      Layer.build(
        objectRuntimeLayer(
          {
            addresses: [
              { address: assistantAddress, executable: assistantRef, registrations: registrationsFor(assistantRef) },
            ],
          },
          storage,
        ).pipe(Layer.provide(resolverLayer)),
      ).pipe(Effect.flatMap((context) => effect.pipe(Effect.provideContext(context)))),
    )

const checkpoint = (executable: ExecutableRef) => ({
  driverVersion: "1" as const,
  executable,
  turn: 0,
  budget: { allocation: {}, remaining: {} },
  state: {},
})

it.live("phase-0 tracer: non-idempotent counter with crash boundaries", () =>
  Effect.gen(function* () {
    const storage = makeObjectStorage()
    let externalCounter = 0

    const crashAfterStart = yield* withObject(storage)(
      Effect.gen(function* () {
        const runtime = yield* Runtime.Runtime
        const driver = yield* RunStore.RunStore
        const receipt = yield* runtime.send({
          to: assistantAddress,
          sessionId: "session:tracer:crash-start",
          idempotencyKey: "crash-start",
          prompt: textPrompt("counter"),
        })
        const claim = yield* driver.claimExecution({
          commandId: "runtime-executable-manifest-test-ts-claim-1",
          runId: receipt.runId,
          ownerId: objectWorkerId,
        })
        const op = yield* driver.recordOperation({
          ...claim,
          runId: receipt.runId,
          operationKey: "tool:counter:1",
          kind: "tool",
          inputDigest: "counter:v1",
          input: { step: 1 },
          replayPolicy: "never",
          attempt: 1,
        })
        yield* driver.startOperation({
          commandId: "manifest.test-54",
          ...claim,
          runId: receipt.runId,
          operationId: op.operationId,
        })
        return { runId: receipt.runId, operationId: op.operationId }
      }),
    )

    const afterCrashStart = yield* withObject(storage)(
      Effect.gen(function* () {
        const driver = yield* RunStore.RunStore
        const claim = yield* driver.claimExecution({
          commandId: "runtime-executable-manifest-test-ts-claim-3",
          runId: crashAfterStart.runId,
          ownerId: objectWorkerId,
        })
        const expired = yield* driver.expireRunningOperation({
          commandId: "runtime-executable-manifest-test-ts-expireRunningOperation-2",
          ...claim,
          operationId: crashAfterStart.operationId,
        })
        expect(expired.outcome).toBe("unknown")
        expect(expired.record.status).toBe("unknown")
        expect(externalCounter).toBe(0)
        return expired
      }),
    )
    expect(afterCrashStart.record.status).toBe("unknown")

    const crashAfterObserve = yield* withObject(storage)(
      Effect.gen(function* () {
        const runtime = yield* Runtime.Runtime
        const driver = yield* RunStore.RunStore
        const receipt = yield* runtime.send({
          to: assistantAddress,
          sessionId: "session:tracer:crash-observe",
          idempotencyKey: "crash-observe",
          prompt: textPrompt("counter-2"),
        })
        const claim = yield* driver.claimExecution({
          commandId: "runtime-executable-manifest-test-ts-claim-4",
          runId: receipt.runId,
          ownerId: objectWorkerId,
        })
        const op = yield* driver.recordOperation({
          ...claim,
          runId: receipt.runId,
          operationKey: "tool:counter:2",
          kind: "tool",
          inputDigest: "counter:v2",
          input: { step: 2 },
          replayPolicy: "never",
          attempt: 1,
        })
        yield* driver.startOperation({
          commandId: "manifest.test-100",
          ...claim,
          runId: receipt.runId,
          operationId: op.operationId,
        })
        externalCounter += 1
        return { runId: receipt.runId, operationId: op.operationId, observed: externalCounter }
      }),
    )

    const afterCrashObserve = yield* withObject(storage)(
      Effect.gen(function* () {
        const driver = yield* RunStore.RunStore
        const claim = yield* driver.claimExecution({
          commandId: "runtime-executable-manifest-test-ts-claim-6",
          runId: crashAfterObserve.runId,
          ownerId: objectWorkerId,
        })
        const expired = yield* driver.expireRunningOperation({
          commandId: "runtime-executable-manifest-test-ts-expireRunningOperation-4",
          ...claim,
          operationId: crashAfterObserve.operationId,
        })
        expect(expired.outcome).toBe("unknown")
        expect(externalCounter).toBe(1)
        return expired
      }),
    )
    expect(afterCrashObserve.record.status).toBe("unknown")

    const committed = yield* withObject(storage)(
      Effect.gen(function* () {
        const runtime = yield* Runtime.Runtime
        const driver = yield* RunStore.RunStore
        const receipt = yield* runtime.send({
          to: assistantAddress,
          sessionId: "session:tracer:commit",
          idempotencyKey: "commit",
          prompt: textPrompt("counter-3"),
        })
        const claim = yield* driver.claimExecution({
          commandId: "runtime-executable-manifest-test-ts-claim-7",
          runId: receipt.runId,
          ownerId: objectWorkerId,
        })
        const op = yield* driver.recordOperation({
          ...claim,
          runId: receipt.runId,
          operationKey: "tool:counter:3",
          kind: "tool",
          inputDigest: "counter:v3",
          input: { step: 3 },
          replayPolicy: "never",
          attempt: 1,
        })
        yield* driver.startOperation({
          commandId: "manifest.test-149",
          ...claim,
          runId: receipt.runId,
          operationId: op.operationId,
        })
        externalCounter += 1
        const succeeded = yield* driver.completeOperation({
          ...claim,
          runId: receipt.runId,
          operationId: op.operationId,
          outcome: { _tag: "Succeeded", value: { count: externalCounter } },
          checkpoint: checkpoint(claim.executableRef),
        })
        const sameKey = yield* driver.recordOperation({
          ...claim,
          runId: receipt.runId,
          operationKey: "tool:counter:3",
          kind: "tool",
          inputDigest: "counter:v3",
          input: { step: 3 },
          replayPolicy: "never",
          attempt: 1,
        })
        expect(sameKey.operationId).toBe(op.operationId)
        expect(sameKey.status).toBe("requested")
        const persisted = yield* driver.getOperation({ runId: receipt.runId, operationId: op.operationId })
        expect(persisted.status).toBe("succeeded")
        expect(persisted.result).toEqual({ count: externalCounter })
        expect(succeeded.status).toBe("succeeded")
        return { runId: receipt.runId, count: externalCounter, receipt }
      }),
    )

    yield* withObject(storage)(
      Effect.gen(function* () {
        const driver = yield* RunStore.RunStore
        const runtime = yield* Runtime.Runtime
        const duplicate = yield* runtime.send({
          to: assistantAddress,
          sessionId: "session:tracer:commit",
          idempotencyKey: "commit",
          prompt: textPrompt("counter-3"),
        })
        expect(duplicate).toEqual(committed.receipt)
        const recorded = yield* driver.recordOperation({
          ...(yield* driver.claimExecution({
            commandId: "runtime-executable-manifest-test-ts-claim-11",
            runId: committed.runId,
            ownerId: objectWorkerId,
          })),
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

    yield* withObject(storage)(
      Effect.gen(function* () {
        const runtime = yield* Runtime.Runtime
        const driver = yield* RunStore.RunStore
        const receipt = yield* runtime.send({
          to: assistantAddress,
          sessionId: "session:tracer:pure-retry",
          idempotencyKey: "pure-retry",
          prompt: textPrompt("pure"),
        })
        const claim = yield* driver.claimExecution({
          commandId: "runtime-executable-manifest-test-ts-claim-12",
          runId: receipt.runId,
          ownerId: objectWorkerId,
        })
        const op = yield* driver.recordOperation({
          ...claim,
          runId: receipt.runId,
          operationKey: "model:pure:1",
          kind: "model",
          inputDigest: "pure:v1",
          input: { step: 1 },
          replayPolicy: "provider-idempotent",
          attempt: 1,
        })
        yield* driver.startOperation({
          commandId: "runtime-executable-manifest-test-ts-startOperation-6",
          ...claim,
          operationId: op.operationId,
        })
        const expired = yield* driver.expireRunningOperation({
          commandId: "runtime-executable-manifest-test-ts-expireRunningOperation-7",
          ...claim,
          operationId: op.operationId,
        })
        expect(expired.outcome).toBe("retried")
        yield* driver.startOperation({
          commandId: "manifest.test-243",
          ...claim,
          runId: receipt.runId,
          operationId: op.operationId,
        })
        const done = yield* driver.completeOperation({
          ...claim,
          runId: receipt.runId,
          operationId: op.operationId,
          outcome: { _tag: "Succeeded", value: { ok: true } },
          checkpoint: checkpoint(claim.executableRef),
        })
        expect(done.status).toBe("succeeded")
      }),
    )
  }).pipe(Effect.asVoid),
)
