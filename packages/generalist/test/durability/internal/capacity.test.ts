import { BunCrypto } from "@effect/platform-bun"
import { expect, it } from "@effect/vitest"
import { Effect, Layer, Result } from "effect"
import { Prompt } from "effect/unstable/ai"
import { activate, layerRunStore } from "../../../src/durability/index.js"
import { ObjectStore } from "../../../src/durability/object-store.js"
import { Address } from "../../../src/runtime/address.js"
import { makeTest } from "../../../src/runtime/executable/manifest.js"
import { RunStore } from "../../../src/runtime/run/store.js"
import { make as makeSimulator } from "../../../src/testing/durability/index.js"
import { completedResult } from "../../runtime/execution/fixtures.js"
import { provideScoped } from "../../runtime/execution/scoped-provide.js"

const executable = makeTest("capacity", "1")
const address = Address.make("agent:capacity")
const admission = (key: string) => ({
  message: {
    id: `message:${key}`,
    to: address,
    sessionId: `session:${key}`,
    prompt: Prompt.make("x".repeat(2048)),
    idempotencyKey: key,
    correlationId: key,
    metadata: {},
  },
  executableRef: executable.ref,
  executableManifest: executable.manifest,
  registrations: [],
})

it.effect("reserves canonical settlement and cancellation bytes when admission is exhausted across fresh Layers", () =>
  Effect.gen(function* () {
    const bucket = yield* makeSimulator()
    const fresh = () =>
      layerRunStore({
        environment: "capacity",
        tenant: "local",
        partition: "bounded",
        addresses: [{ address, executable, registrations: [] }],
        workerId: "capacity-worker",
        schedulerMode: "external",
        maxStateBytes: 128 * 1024,
        admissionReserveBytes: 64 * 1024,
      }).pipe(Layer.provide(Layer.merge(Layer.succeed(ObjectStore, bucket.store), BunCrypto.layer)))
    const retained = yield* provideScoped(
      fresh(),
      Effect.gen(function* () {
        yield* activate
        const store = yield* RunStore
        const first = yield* store.admitSend(admission("incurred"))
        const cancelled = yield* store.admitSend(admission("cancelled"))
        const claim = yield* store.claimExecution({
          runId: first.runId,
          commandId: "claim",
          ownerId: "capacity-worker",
        })
        const operation = yield* store.recordOperation({
          ...claim,
          operationKey: "incurred",
          kind: "tool",
          inputDigest: "input",
          input: { amount: 5 },
          replayPolicy: "never",
          attempt: 1,
        })
        yield* store.startOperation({ ...claim, operationId: operation.operationId, commandId: "dispatch" })
        let refused = false
        for (let index = 0; index < 32; index++) {
          const result = yield* store.admitSend(admission(`fill-${index}`)).pipe(Effect.result)
          if (Result.isFailure(result)) {
            expect(result.failure).toMatchObject({ reason: "limit" })
            refused = true
            break
          }
        }
        expect(refused).toBe(true)
        expect(yield* store.admitSend(admission("incurred"))).toEqual(first)
        const settled = yield* store.completeOperation({
          ...claim,
          operationId: operation.operationId,
          outcome: { _tag: "Succeeded", value: { amount: 5, receipt: "r".repeat(8192) } },
        })
        yield* store.complete({ ...claim, commandId: "complete", result: completedResult("done") })
        const cancellation = yield* store.cancel({ runId: cancelled.runId, commandId: "cancel", reason: "capacity" })
        return { first, cancelled, settled, cancellation }
      }),
    )
    yield* provideScoped(
      fresh(),
      Effect.gen(function* () {
        const store = yield* RunStore
        expect((yield* store.inspect(retained.first.runId)).status).toBe("succeeded")
        expect((yield* store.inspect(retained.cancelled.runId)).status).toBe("cancelled")
        expect(
          yield* store.getOperation({ runId: retained.first.runId, operationId: retained.settled.operationId }),
        ).toEqual(retained.settled)
        expect(yield* store.admitSend(admission("incurred"))).toEqual(retained.first)
        expect(
          yield* store.cancel({ runId: retained.cancelled.runId, commandId: "cancel", reason: "capacity" }),
        ).toEqual(retained.cancellation)
        expect(yield* store.admitSend(admission("after-recovery")).pipe(Effect.flip)).toMatchObject({ reason: "limit" })
      }),
    )
  }),
)
