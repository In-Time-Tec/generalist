import { expect, it } from "@effect/vitest"
import { Effect } from "effect"
import type { Options, Services, SteeringCapability } from "../contract.js"

type Prepare = <A, E>(effect: Effect.Effect<A, E>) => Effect.Effect<A, E>
type Open<LayerError> = <A, E>(use: (services: Services) => Effect.Effect<A, E>) => Effect.Effect<A, E | LayerError>

interface Seed {
  readonly runId: string
  readonly entryId: string
}

const seed = <LayerError, ClaimsLayerError>(options: Options<LayerError, ClaimsLayerError>, open: Open<LayerError>) =>
  open(({ runtime }) =>
    Effect.gen(function* () {
      const root = yield* runtime.send({
        to: options.address,
        sessionId: `conformance:steering:${options.name}`,
        idempotencyKey: "root",
        prompt: "start",
      })
      const receipt = yield* runtime.send(root.runId, "survive recovery", {
        idempotencyKey: "steering:reopen",
      })
      return { runId: root.runId, entryId: receipt.entryId } satisfies Seed
    }),
  )

const consume = <LayerError>(capability: SteeringCapability, open: Open<LayerError>, seeded: Seed) =>
  open((services) =>
    Effect.gen(function* () {
      const claim = yield* capability.claim(services, { runId: seeded.runId, workerId: "steering-reopen" })
      const entries = yield* services.store.readSteering(claim)
      expect(entries.map((entry) => entry.entryId)).toEqual([seeded.entryId])
      yield* services.store.recordOperation({
        ...claim,
        operationKey: "model:steering-reopen",
        kind: "model",
        inputDigest: "model:steering-reopen",
        input: { prompt: "survive recovery" },
        replayPolicy: "provider-idempotent",
        attempt: claim.attemptFence,
        steeringEntryIds: [seeded.entryId],
      })
      yield* services.store.releaseExecution(claim)
    }),
  )

const verify = <LayerError>(open: Open<LayerError>, seeded: Seed) =>
  open(({ runtime, store }) =>
    Effect.gen(function* () {
      expect(yield* store.pendingSteering({ runId: seeded.runId, limit: 10 })).toEqual([])
      const history = yield* runtime.history({ runId: seeded.runId, limit: 100 })
      expect(history.filter((event) => event._tag === "Inbox")).toHaveLength(1)
      expect(history.filter((event) => event._tag === "SteeringConsumed")).toHaveLength(1)
    }),
  )

/** Register shared durable inbox recovery conformance. */
export const registerSteering = <LayerError, ClaimsLayerError>(input: {
  readonly options: Options<LayerError, ClaimsLayerError>
  readonly capability: SteeringCapability
  readonly prepare: Prepare
  readonly open: Open<LayerError>
}): void => {
  it.effect("delivers one message exactly once across recovery", () =>
    input.prepare(
      input.capability.recovery === "rebuild"
        ? Effect.gen(function* () {
            const seeded = yield* seed(input.options, input.open)
            yield* consume(input.capability, input.open, seeded)
            yield* verify(input.open, seeded)
          })
        : input.open((services) =>
            Effect.gen(function* () {
              const root = yield* services.runtime.send({
                to: input.options.address,
                sessionId: `conformance:steering:${input.options.name}`,
                idempotencyKey: "root",
                prompt: "start",
              })
              const receipt = yield* services.runtime.send(root.runId, "survive recovery", {
                idempotencyKey: "steering:reopen",
              })
              const seeded = { runId: root.runId, entryId: receipt.entryId }
              const claim = yield* input.capability.claim(services, {
                runId: seeded.runId,
                workerId: "steering-reclaim",
              })
              const entries = yield* services.store.readSteering(claim)
              expect(entries.map((entry) => entry.entryId)).toEqual([seeded.entryId])
              yield* services.store.recordOperation({
                ...claim,
                operationKey: "model:steering-reclaim",
                kind: "model",
                inputDigest: "model:steering-reclaim",
                input: { prompt: "survive recovery" },
                replayPolicy: "provider-idempotent",
                attempt: claim.attemptFence,
                steeringEntryIds: [seeded.entryId],
              })
              expect(yield* services.store.readSteering(claim)).toEqual([])
              const history = yield* services.runtime.history({ runId: seeded.runId, limit: 100 })
              expect(history.filter((event) => event._tag === "Inbox")).toHaveLength(1)
              expect(history.filter((event) => event._tag === "SteeringConsumed")).toHaveLength(1)
            }),
          ),
    ),
  )
}
