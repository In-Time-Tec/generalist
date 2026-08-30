import { expect, it } from "@effect/vitest"
import { Context, Effect, Layer, Option, Schema } from "effect"
import { AckBeyondCommitted, AckInvalid, RunNotFound } from "../../runtime/errors.js"
import { RunStore } from "../../runtime/run/store.js"
import { Runtime } from "../../runtime/service.js"
import { RunClaims } from "../../runtime/sql/run/claims.js"
import type { Options, RuntimeCapability, Services } from "./index.js"

const servicesFrom = (context: Context.Context<Runtime | RunStore>): Services => {
  const claims = Context.getOption(context, RunClaims)
  const services: Services = {
    runtime: Context.get(context, Runtime),
    store: Context.get(context, RunStore),
  }
  return Option.isSome(claims) ? { ...services, claims: claims.value } : services
}

const provide = <A, E, LayerError, ClaimsLayerError>(
  options: Options<LayerError, ClaimsLayerError>,
  use: (services: Services) => Effect.Effect<A, E>,
): Effect.Effect<A, E | LayerError> => {
  const effect = Effect.scoped(Effect.flatMap(Layer.build(options.layer), (context) => use(servicesFrom(context))))
  return options.setup === undefined ? effect : Effect.andThen(options.setup, effect)
}

const identity = (name: string) => {
  const prefix = `conformance:${name.replace(/[^A-Za-z0-9]+/g, "-").toLowerCase()}:host-acknowledgement`
  return { sessionId: `session:${prefix}`, idempotencyKey: prefix }
}

/** @internal */
export const registerAcknowledgement = <LayerError, ClaimsLayerError>(input: {
  readonly options: Options<LayerError, ClaimsLayerError>
  readonly capability: RuntimeCapability
}): void => {
  const { capability, options } = input
  it.effect("persists exact monotonic host acknowledgements at completed model cycles", () =>
    provide(options, (services) =>
      Effect.gen(function* () {
        const id = identity(options.name)
        const receipt = yield* services.runtime.send({
          to: options.address,
          sessionId: id.sessionId,
          idempotencyKey: id.idempotencyKey,
          prompt: "acknowledge model cycles",
        })
        expect(yield* services.runtime.acknowledged(receipt.runId)).toEqual({ runId: receipt.runId, sequence: -1 })
        yield* services.runtime.acknowledge({ runId: receipt.runId, sequence: -1 })
        for (const sequence of [-2, 0.5, Number.NaN, Infinity, -Infinity, Number.MAX_SAFE_INTEGER + 1]) {
          expect(
            yield* services.runtime.acknowledge({ runId: receipt.runId, sequence }).pipe(Effect.flip),
          ).toBeInstanceOf(AckInvalid)
        }

        const claim = yield* capability.claim(services, { runId: receipt.runId, workerId: "host-acknowledgement" })
        yield* services.store.emitAgentEvent({ ...claim, event: { _tag: "TurnCompleted", turn: 0 } })
        yield* services.store.emitAgentEvent({ ...claim, event: { _tag: "TurnStarted", turn: 1 } })
        yield* services.store.emitAgentEvent({ ...claim, event: { _tag: "TurnCompleted", turn: 1 } })
        const history = yield* services.runtime.history({ runId: receipt.runId, limit: 100 })
        const boundaries = history.filter((event) => event._tag === "TurnCompleted")
        expect(boundaries).toHaveLength(2)
        const first = boundaries[0]!.sequence
        const second = boundaries[1]!.sequence
        const nonBoundary = history.find(
          (event) => event.sequence > first && event.sequence < second && event._tag !== "TurnCompleted",
        )!.sequence

        expect(
          yield* services.runtime.acknowledge({ runId: receipt.runId, sequence: nonBoundary }).pipe(Effect.flip),
        ).toBeInstanceOf(AckInvalid)
        yield* services.runtime.acknowledge({ runId: receipt.runId, sequence: first })
        yield* Effect.all(
          [
            services.runtime.acknowledge({ runId: receipt.runId, sequence: first }),
            services.runtime.acknowledge({ runId: receipt.runId, sequence: second }),
          ],
          { concurrency: "unbounded" },
        )
        yield* services.runtime.acknowledge({ runId: receipt.runId, sequence: first })
        const point = yield* services.runtime.acknowledged(receipt.runId)
        expect(point.runId).toBe(receipt.runId)
        expect(point.sequence).toBe(second)
        expect(point.acknowledgedAt).toBeTypeOf("string")

        const future = yield* services.runtime
          .acknowledge({ runId: receipt.runId, sequence: second + 1 })
          .pipe(Effect.flip)
        expect(future).toBeInstanceOf(AckBeyondCommitted)
        if (Schema.is(AckBeyondCommitted)(future)) expect(future.lastCommittedSequence).toBe(second)
        expect(
          yield* services.runtime.acknowledge({ runId: `${receipt.runId}:missing`, sequence: -1 }).pipe(Effect.flip),
        ).toBeInstanceOf(RunNotFound)
        expect(yield* services.runtime.acknowledged(`${receipt.runId}:missing`).pipe(Effect.flip)).toBeInstanceOf(
          RunNotFound,
        )
      }),
    ),
  )
}
