import { describe, expect, it } from "@effect/vitest"
import { Effect, Layer } from "effect"
import * as Ai from "effect/unstable/ai"
import { Memory } from "@batonfx/core"
import { SemanticRecall, VectorStore } from "../src/index"

const key: Memory.Key = { agent: "memory-agent", subject: "subject-a" }
const otherKey: Memory.Key = { agent: "memory-agent", subject: "subject-b" }

const textPart = (text: string) => Ai.Prompt.makePart("text", { text })
const user = (text: string) => Ai.Prompt.makeMessage("user", { content: [textPart(text)] })
const assistant = (text: string) => Ai.Prompt.makeMessage("assistant", { content: [textPart(text)] })
const prompt = (...messages: ReadonlyArray<Ai.Prompt.Message>) => Ai.Prompt.fromMessages(messages)

const itemText = (item: Memory.Item): string =>
  item.parts
    .filter((part): part is Ai.Prompt.TextPart => part.type === "text")
    .map((part) => part.text)
    .join("")

const vectorForText = (text: string): Array<number> =>
  text.toLowerCase().includes("color") || text.toLowerCase().includes("blue") ? [1, 0] : [0, 1]

const embeddingLayer = Layer.effect(
  Ai.EmbeddingModel.EmbeddingModel,
  Ai.EmbeddingModel.make({
    embedMany: ({ inputs }) =>
      Effect.succeed({
        results: inputs.map(vectorForText),
        usage: { inputTokens: undefined },
      }),
  }),
)

const memoryLayer = SemanticRecall.layer({ limit: 5 }).pipe(
  Layer.provideMerge(VectorStore.memoryLayer),
  Layer.provideMerge(embeddingLayer),
)

describe("SemanticRecall", () => {
  it.effect("remembers a terminal user and assistant exchange for later recall", () =>
    Effect.gen(function* () {
      const memory = yield* Memory.Memory

      yield* memory.remember({
        key,
        turn: 0,
        terminal: true,
        transcript: prompt(user("What color is the sky?"), assistant("blue")),
      })

      const recalled = yield* memory.recall({ key, turn: 0, prompt: prompt(user("color")) })

      expect(recalled).toHaveLength(1)
      expect(itemText(recalled[0]!)).toContain("User: What color is the sky?")
      expect(itemText(recalled[0]!)).toContain("Assistant: blue")
    }).pipe(Effect.provide(memoryLayer)),
  )

  it.effect("does not upsert nonterminal turns", () =>
    Effect.gen(function* () {
      const memory = yield* Memory.Memory

      yield* memory.remember({
        key,
        turn: 0,
        terminal: false,
        transcript: prompt(user("What color is the sky?"), assistant("blue")),
      })

      const recalled = yield* memory.recall({ key, turn: 0, prompt: prompt(user("color")) })

      expect(recalled).toEqual([])
    }).pipe(Effect.provide(memoryLayer)),
  )

  it.effect("isolates recall by memory key", () =>
    Effect.gen(function* () {
      const memory = yield* Memory.Memory

      yield* memory.remember({
        key,
        turn: 0,
        terminal: true,
        transcript: prompt(user("What color is the sky?"), assistant("blue")),
      })

      const recalled = yield* memory.recall({ key: otherKey, turn: 0, prompt: prompt(user("color")) })

      expect(recalled).toEqual([])
    }).pipe(Effect.provide(memoryLayer)),
  )

  it.effect("maps embedding failures to MemoryError", () => {
    const embeddingError = Ai.AiError.make({
      module: "SemanticRecallTest",
      method: "embedMany",
      reason: new Ai.AiError.UnknownError({ description: "embedding failed" }),
    })
    const failingEmbedding = Layer.effect(
      Ai.EmbeddingModel.EmbeddingModel,
      Ai.EmbeddingModel.make({ embedMany: () => Effect.fail(embeddingError) }),
    )

    return Effect.gen(function* () {
      const memory = yield* Memory.Memory

      const failure = yield* Effect.flip(memory.recall({ key, turn: 0, prompt: prompt(user("color")) }))

      expect(failure._tag).toBe("@batonfx/core/MemoryError")
      expect(failure.message).toContain("embedding failed")
    }).pipe(
      Effect.provide(
        SemanticRecall.layer({ limit: 5 }).pipe(
          Layer.provideMerge(VectorStore.memoryLayer),
          Layer.provideMerge(failingEmbedding),
        ),
      ),
    )
  })
})
