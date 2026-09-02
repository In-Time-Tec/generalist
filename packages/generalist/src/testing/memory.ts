import { describe, expect, it } from "@effect/vitest"
import { Effect, Layer } from "effect"
import { Prompt } from "effect/unstable/ai"
import { type Item, type Key, Memory, type Service } from "../core/context/memory.js"
import { record } from "./report.js"

/** @experimental Configuration for the Memory service conformance suite. */
export interface Options<E = never> {
  readonly layer: Layer.Layer<Memory, E, never>
  /** Rebuild the layer between write and recall to prove storage survives service closure. */
  readonly persistent?: boolean
}

const key = { agent: "testing-memory", subject: "session-primary" }
const otherKey = { agent: "testing-memory", subject: "session-other" }
const prompt = (text: string) => Prompt.make(text)
const transcript = (user: string, assistant: string) =>
  Prompt.fromMessages([
    Prompt.makeMessage("user", { content: [Prompt.makePart("text", { text: user })] }),
    Prompt.makeMessage("assistant", { content: [Prompt.makePart("text", { text: assistant })] }),
  ])
const remember = (memory: Service, inputKey: Key, text: string) =>
  memory.remember({
    key: inputKey,
    turn: 0,
    transcript: transcript(text, `Remembered ${text}`),
    terminal: true,
  })
const recall = (memory: Service, inputKey: Key, text: string) =>
  memory.recall({ key: inputKey, turn: 0, prompt: prompt(text) })
const content = (items: ReadonlyArray<Item>): string =>
  items
    .flatMap((item) => item.content)
    .filter((part): part is Prompt.TextPart => part.type === "text")
    .map((part) => part.text)
    .join("\n")

const provide = <A, E, LayerError>(options: Options<LayerError>, effect: Effect.Effect<A, E, Memory>) =>
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
    it.effect("recalls remembered content by semantic similarity", () =>
      provide(
        options,
        Effect.gen(function* () {
          const service = yield* Memory
          yield* remember(service, key, "The observatory studies distant galaxies.")
          const recalled = yield* recall(service, key, "What does the astronomy facility study?")
          expect(content(recalled)).toContain("distant galaxies")
        }),
      ),
    )

    it.effect("isolates remembered state by session key and forgets one session", () =>
      provide(
        options,
        Effect.gen(function* () {
          const service = yield* Memory
          yield* remember(service, key, "primary-session-marker")
          yield* remember(service, otherKey, "other-session-marker")
          expect(content(yield* recall(service, otherKey, "other-session-marker"))).toContain("other-session-marker")
          yield* service.forget({ key })
          expect(yield* recall(service, key, "primary-memory-marker")).toEqual([])
          expect(content(yield* recall(service, otherKey, "other-session-marker"))).toContain("other-session-marker")
        }),
      ),
    )

    it.effect("forgets one implementation-owned recalled item", () =>
      provide(
        options,
        Effect.gen(function* () {
          const service = yield* Memory
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

    it.effect("retains concurrent writes", () =>
      provide(
        options,
        Effect.gen(function* () {
          const service = yield* Memory
          const markers = Array.from({ length: 8 }, (_, index) => `concurrent-memory-${index}`)
          yield* Effect.all(
            markers.map((marker) => remember(service, key, marker)),
            { concurrency: 4 },
          )
          for (const marker of markers) {
            expect(content(yield* recall(service, key, marker))).toContain(marker)
          }
        }),
      ),
    )

    if (options.persistent === true) {
      it.effect("recalls after closing and reopening the service layer", () =>
        Effect.gen(function* () {
          yield* provide(
            options,
            Effect.flatMap(Memory, (service) => remember(service, key, "persistent-reopen-marker")),
          )
          yield* provide(
            options,
            Effect.gen(function* () {
              const service = yield* Memory
              expect(content(yield* recall(service, key, "persistent-reopen-marker"))).toContain(
                "persistent-reopen-marker",
              )
            }),
          )
        }),
      )
    }
  })
}
