import { describe, expect, it } from "@effect/vitest"
import { Effect, Layer } from "effect"
import { Prompt } from "effect/unstable/ai"
import * as Memory from "../core/context/memory.js"
import { record } from "./report.js"

/** @experimental Configuration for the Memory service conformance suite. */
export interface Options<E = never> {
  readonly layer: Layer.Layer<Memory.Memory, E, never>
}

const key = { agent: "testing-memory", subject: "primary" }
const otherKey = { agent: "testing-memory", subject: "other" }
const prompt = (text: string) => Prompt.make(text)
const remember = (memory: Memory.Service, inputKey: Memory.Key, text: string) =>
  memory.remember({ key: inputKey, turn: 0, transcript: prompt(text), terminal: true })
const recall = (memory: Memory.Service, inputKey: Memory.Key, text: string) =>
  memory.recall({ key: inputKey, turn: 0, prompt: prompt(text) })

const provide = <A, E, LayerError>(options: Options<LayerError>, effect: Effect.Effect<A, E, Memory.Memory>) =>
  Effect.scoped(
    Layer.build(options.layer).pipe(
      Effect.flatMap((context) =>
        record({ name: "memory", capabilities: ["recall", "remember", "forget-key", "forget-item"] }).pipe(
          Effect.andThen(effect),
          Effect.provideContext(context),
        ),
      ),
    ),
  )

/** @experimental Registers the authoritative Memory service conformance suite. */
export const memory = <E>(options: Options<E>): void => {
  describe("Generalist Memory conformance", () => {
    it.effect("isolates remembered state by key and forgets one key", () =>
      provide(
        options,
        Effect.gen(function* () {
          const service = yield* Memory.Memory
          yield* remember(service, key, "primary-memory-marker")
          yield* remember(service, otherKey, "other-memory-marker")
          expect(yield* recall(service, otherKey, "other-memory-marker")).not.toHaveLength(0)
          yield* service.forget({ key })
          expect(yield* recall(service, key, "primary-memory-marker")).toEqual([])
          expect(yield* recall(service, otherKey, "other-memory-marker")).not.toHaveLength(0)
        }),
      ),
    )

    it.effect("forgets one implementation-owned recalled item", () =>
      provide(
        options,
        Effect.gen(function* () {
          const service = yield* Memory.Memory
          yield* remember(service, key, "first-memory-marker")
          const before = yield* recall(service, key, "first-memory-marker")
          expect(before).not.toHaveLength(0)
          const removed = before[0]!
          yield* service.forget({ key, id: removed.id })
          const after = yield* recall(service, key, "first-memory-marker")
          expect(after.some((item) => item.id === removed.id)).toBe(false)
        }),
      ),
    )
  })
}
