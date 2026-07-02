import { describe, expect, it } from "@effect/vitest"
import { Deferred, Effect, Fiber, Layer, Ref, Stream } from "effect"
import * as Ai from "effect/unstable/ai"
import { ModelRegistry } from "../src/index"

const modelLayer = (delta: string) =>
  Layer.effect(
    Ai.LanguageModel.LanguageModel,
    Ai.LanguageModel.make({
      generateText: () => Effect.succeed([{ type: "text", text: delta }]),
      streamText: () => Stream.make(Ai.Response.makePart("text-delta", { id: "text", delta })),
    }),
  )

describe("ModelRegistry", () => {
  it.effect("fails typed when the selected model is not registered", () =>
    Effect.gen(function* () {
      const failure = yield* Effect.flip(
        ModelRegistry.provide({ provider: "missing", model: "none" }, Effect.succeed("unused")),
      )

      expect(failure._tag).toBe("LanguageModelNotRegistered")
      if (failure._tag === "LanguageModelNotRegistered") {
        expect(failure.provider).toBe("missing")
        expect(failure.model).toBe("none")
      }
    }).pipe(Effect.provide(ModelRegistry.memoryLayer())),
  )

  it.effect("provides a registered language model layer", () =>
    Effect.gen(function* () {
      const registration = yield* ModelRegistry.registrationFromLayer({
        provider: "test",
        model: "deterministic",
        layer: modelLayer("registered output"),
      })
      yield* ModelRegistry.register({ registration })

      const response = yield* ModelRegistry.provide(
        { provider: "test", model: "deterministic" },
        Ai.LanguageModel.generateText({ prompt: "hello" }),
      )

      expect(response.text).toBe("registered output")
    }).pipe(Effect.provide(ModelRegistry.memoryLayer())),
  )

  it.effect("upserts registrations by provider, model, and registrationKey", () =>
    Effect.gen(function* () {
      const first = yield* ModelRegistry.registrationFromLayer({
        provider: "test",
        model: "deterministic",
        layer: modelLayer("first"),
        metadata: { revision: 1 },
      })
      const second = yield* ModelRegistry.registrationFromLayer({
        provider: "test",
        model: "deterministic",
        layer: modelLayer("second"),
        metadata: { revision: 2 },
      })
      const keyed = yield* ModelRegistry.registrationFromLayer({
        provider: "test",
        model: "deterministic",
        registrationKey: "eu",
        layer: modelLayer("keyed"),
      })

      yield* ModelRegistry.register({ registration: first })
      yield* ModelRegistry.register({ registration: second })
      yield* ModelRegistry.register({ registration: keyed })
      const registrations = yield* ModelRegistry.registrations()

      expect(registrations).toHaveLength(2)
      expect(registrations[0]?.metadata).toEqual({ revision: 2 })
      expect(registrations[1]?.registrationKey).toBe("eu")

      const keyedResponse = yield* ModelRegistry.provide(
        { provider: "test", model: "deterministic", registrationKey: "eu" },
        Ai.LanguageModel.generateText({ prompt: "hello" }),
      )
      expect(keyedResponse.text).toBe("keyed")
    }).pipe(Effect.provide(ModelRegistry.memoryLayer())),
  )

  it.effect("bounds concurrent provides to maxConcurrentModelCalls", () =>
    Effect.gen(function* () {
      const registration = yield* ModelRegistry.registrationFromLayer({
        provider: "test",
        model: "deterministic",
        layer: modelLayer("unused"),
      })
      yield* ModelRegistry.register({ registration })
      const entered = yield* Ref.make(0)
      const firstEntered = yield* Deferred.make<void>()
      const gate = yield* Deferred.make<void>()
      const call = ModelRegistry.provide(
        { provider: "test", model: "deterministic" },
        Ref.updateAndGet(entered, (count) => count + 1).pipe(
          Effect.tap((count) => (count === 1 ? Deferred.succeed(firstEntered, undefined) : Effect.void)),
          Effect.andThen(Deferred.await(gate)),
        ),
      )

      const fibers = yield* Effect.all([Effect.forkChild(call), Effect.forkChild(call), Effect.forkChild(call)])
      yield* Deferred.await(firstEntered)
      yield* Effect.forEach(Array.from({ length: 20 }), () => Effect.yieldNow)
      const concurrent = yield* Ref.get(entered)

      yield* Deferred.succeed(gate, undefined)
      yield* Effect.forEach(fibers, Fiber.join)
      const total = yield* Ref.get(entered)

      expect(concurrent).toBe(1)
      expect(total).toBe(3)
    }).pipe(Effect.provide(ModelRegistry.memoryLayer([], { maxConcurrentModelCalls: 1 }))),
  )
})
