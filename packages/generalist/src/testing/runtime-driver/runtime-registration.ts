import { expect, it } from "@effect/vitest"
import { Effect } from "effect"
import type { ExecutionResult } from "../../runtime/execution/state.js"
import { registerPayload } from "./payload/index.js"
import { registerAcknowledgement } from "./acknowledgement.js"
import type { Options, RuntimeCapability, Services } from "./contract.js"
import { pluralWaitsConformance, toolSuspension } from "./plural-waits.js"

const identity = (name: string, suffix: string) => {
  const prefix = `conformance:${name.replace(/[^A-Za-z0-9]+/g, "-").toLowerCase()}:${suffix}`
  return { sessionId: `session:${prefix}`, idempotencyKey: prefix, runId: `run:${prefix}` }
}

const completedResult = (sessionId: string, text: string): ExecutionResult => ({
  text,
  output: text,
  turns: 1,
  session: { sessionId, leafId: null },
})

interface Registration<LayerError, ClaimsLayerError> {
  readonly options: Options<LayerError, ClaimsLayerError>
  readonly capability: RuntimeCapability
  readonly provide: <A, E>(use: (services: Services) => Effect.Effect<A, E>) => Effect.Effect<A, E | LayerError>
}

export const registerRuntime = <LayerError, ClaimsLayerError>(
  registration: Registration<LayerError, ClaimsLayerError>,
): void => {
  const { capability, options, provide } = registration
  registerAcknowledgement({ options, capability })

  const payloadIdentity = identity(options.name, "payload-bounds")
  registerPayload({
    capability,
    request: {
      to: options.address,
      sessionId: payloadIdentity.sessionId,
      idempotencyKey: payloadIdentity.idempotencyKey,
    },
    provide: (use) => provide(use),
  })

  it.effect("persists control transitions and strictly ordered durable events", () =>
    provide((services) =>
      Effect.gen(function* () {
        const id = identity(options.name, "runtime-control")
        const receipt = yield* services.runtime.send({
          to: options.address,
          sessionId: id.sessionId,
          idempotencyKey: id.idempotencyKey,
          prompt: "wait for signal",
        })
        const claim = yield* capability.claim(services, { runId: receipt.runId, commandId: "control-a" })
        const waitId = `${id.idempotencyKey}:signal`
        yield* services.store.suspend({
          ...claim,
          waits: [
            {
              waitId,
              reason: { _tag: "Signal", name: waitId },
              status: "open",
              openedAt: "2026-08-29T00:00:00.000Z",
            },
          ],
          suspension: toolSuspension([waitId]),
        })
        yield* services.runtime.signal({
          runId: receipt.runId,
          commandId: `${receipt.runId}:signal:${waitId}`,
          name: waitId,
        })
        const resumed = yield* capability.claim(services, { runId: receipt.runId, commandId: "control-b" })
        yield* services.store.complete({
          ...resumed,
          commandId: `${receipt.runId}:complete`,
          result: completedResult(id.sessionId, "completed"),
        })

        const inspection = yield* services.runtime.inspect(receipt.runId)
        const events = yield* services.runtime.history({ runId: receipt.runId, limit: 100 })
        expect(inspection.status).toBe("succeeded")
        const control = events.filter((event) => ["RunWaiting", "RunResumed", "RunCompleted"].includes(event._tag))
        expect(control.map((event) => event._tag)).toEqual(["RunWaiting", "RunResumed", "RunCompleted"])
        expect(events.every((event, index) => index === 0 || event.sequence > events[index - 1]!.sequence)).toBe(true)
        expect(events.map((event) => event.eventId)).toEqual(
          events.map((event) => `${receipt.runId}:${event.sequence}`),
        )
        expect(yield* Effect.flip(services.runtime.history({ runId: receipt.runId, limit: 1001 }))).toMatchObject({
          _tag: "generalist/runtime/HistoryLimitInvalid",
          minimum: 1,
          maximum: 1000,
        })
      }),
    ),
  )

  it.effect("keeps plural waits independent, idempotent, and insert-once", () =>
    provide((services) =>
      pluralWaitsConformance({ name: options.name, address: options.address, services, capability }),
    ),
  )
}
