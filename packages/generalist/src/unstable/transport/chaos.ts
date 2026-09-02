import { Effect, Layer, Ref, Stream } from "effect"
import { AiError, LanguageModel } from "effect/unstable/ai"
import { layerModel } from "../../ai/provider/deterministic.js"
import { adapt } from "../../core/model/service.js"
import { JournalFault } from "../../runtime/operation/journal-fault.js"
import { ConnectionFault } from "./connection-fault.js"
import { TransportError } from "./errors.js"

const positiveSafeInteger = (name: string, value: number): void => {
  if (!Number.isSafeInteger(value) || value <= 0) throw new TypeError(`${name} must be a positive safe integer`)
}

/** @experimental Interrupts the current run fiber immediately after its Nth durable operation is journaled. */
export const layerInterruptAfter = (operationCount: number): Layer.Layer<JournalFault> => {
  positiveSafeInteger("operationCount", operationCount)
  return Layer.effect(
    JournalFault,
    Ref.make(0).pipe(
      Effect.map((count) =>
        JournalFault.of({
          afterJournaledOperation: Ref.updateAndGet(count, (current) => current + 1).pipe(
            Effect.flatMap((current) => (current === operationCount ? Effect.interrupt : Effect.void)),
          ),
        }),
      ),
    ),
  )
}

/** @experimental Drops a reconnecting transport immediately after admitting its Nth event. */
export const layerDropConnection = (afterEvents: number): Layer.Layer<ConnectionFault> => {
  positiveSafeInteger("afterEvents", afterEvents)
  return Layer.effect(
    ConnectionFault,
    Ref.make(0).pipe(
      Effect.map((count) =>
        ConnectionFault.of({
          afterEvent: Ref.updateAndGet(count, (current) => current + 1).pipe(
            Effect.flatMap((current) =>
              current === afterEvents
                ? TransportError.make({ message: `chaos connection drop after ${afterEvents} events`, kind: "socket" })
                : Effect.void,
            ),
          ),
        }),
      ),
    ),
  )
}

const unavailable = (method: string): AiError.AiError =>
  AiError.make({
    module: "generalist/testing/chaos/flakyModel",
    method,
    reason: AiError.InternalProviderError.make({ description: "deterministic chaos model failure" }),
  })

/** @experimental Deterministic model provider that fails every Nth request. */
export const layerFlakyModel = (options: { readonly failEvery: number }): Layer.Layer<LanguageModel.LanguageModel> => {
  positiveSafeInteger("failEvery", options.failEvery)
  const wrapper = Layer.effect(
    LanguageModel.LanguageModel,
    Effect.gen(function* () {
      const model = yield* LanguageModel.LanguageModel
      const requests = yield* Ref.make(0)
      const fail = (method: string) =>
        Ref.updateAndGet(requests, (current) => current + 1).pipe(
          Effect.flatMap((current) =>
            current % options.failEvery === 0 ? Effect.fail(unavailable(method)) : Effect.void,
          ),
        )
      return adapt<AiError.AiError, AiError.AiError, AiError.AiError>(model, {
        generateText: (_input, invoke) => fail("generateText").pipe(Effect.andThen(invoke())),
        generateObject: (_input, invoke) => fail("generateObject").pipe(Effect.andThen(invoke())),
        streamText: (_input, invoke) => Stream.unwrap(fail("streamText").pipe(Effect.as(invoke()))),
      })
    }),
  )
  return wrapper.pipe(Layer.provide(layerModel()))
}
