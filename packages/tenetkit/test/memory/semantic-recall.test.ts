import { expect, layer } from "@effect/vitest"
import { Effect, Layer } from "effect"
import { AiError, EmbeddingModel, Prompt } from "effect/unstable/ai"
import { Memory } from "tenetkit"
import { SemanticRecall, VectorStore } from "../../src/memory/index"

const key: Memory.Key = { agent: "memory-agent", subject: "subject-a" }
const otherKey: Memory.Key = { agent: "memory-agent", subject: "subject-b" }

const textPart = (text: string) => Prompt.makePart("text", { text })
const user = (text: string) => Prompt.makeMessage("user", { content: [textPart(text)] })
const assistant = (text: string) => Prompt.makeMessage("assistant", { content: [textPart(text)] })
const prompt = (...messages: ReadonlyArray<Prompt.Message>) => Prompt.fromMessages(messages)

const itemText = (item: Memory.Item): string =>
  item.content
    .filter((part): part is Prompt.TextPart => part.type === "text")
    .map((part) => part.text)
    .join("")

const vectorForText = (text: string): Array<number> =>
  text.toLowerCase().includes("color") || text.toLowerCase().includes("blue") ? [1, 0] : [0, 1]

const embeddingLayer = Layer.effect(
  EmbeddingModel.EmbeddingModel,
  EmbeddingModel.make({
    embedMany: ({ inputs }) =>
      Effect.succeed({
        results: inputs.map(vectorForText),
        usage: { inputTokens: undefined },
      }),
  }),
)

const memoryLayer = SemanticRecall.layer({ limit: 5 }).pipe(
  Layer.provideMerge(VectorStore.layerMemory),
  Layer.provideMerge(embeddingLayer),
)

layer(memoryLayer)("SemanticRecall", (it) => {
  it.effect("remembers a terminal user and assistant exchange for later recall", () =>
    Effect.gen(function* () {
      const memory = yield* Memory.Memory
      yield* memory.forget({ key })
      yield* memory.forget({ key: otherKey })

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
    }),
  )

  it.effect("does not upsert nonterminal turns", () =>
    Effect.gen(function* () {
      const memory = yield* Memory.Memory
      yield* memory.forget({ key })

      yield* memory.remember({
        key,
        turn: 0,
        terminal: false,
        transcript: prompt(user("What color is the sky?"), assistant("blue")),
      })

      const recalled = yield* memory.recall({ key, turn: 0, prompt: prompt(user("color")) })

      expect(recalled).toEqual([])
    }),
  )

  it.effect("isolates recall by memory key", () =>
    Effect.gen(function* () {
      const memory = yield* Memory.Memory
      yield* memory.forget({ key })
      yield* memory.forget({ key: otherKey })

      yield* memory.remember({
        key,
        turn: 0,
        terminal: true,
        transcript: prompt(user("What color is the sky?"), assistant("blue")),
      })

      const recalled = yield* memory.recall({ key: otherKey, turn: 0, prompt: prompt(user("color")) })

      expect(recalled).toEqual([])
    }),
  )

  it.effect("forgets one semantic memory id within the exact memory key", () =>
    Effect.gen(function* () {
      const memory = yield* Memory.Memory
      yield* memory.forget({ key })
      yield* memory.forget({ key: otherKey })

      yield* memory.remember({
        key,
        turn: 0,
        terminal: true,
        transcript: prompt(user("What color is the sky?"), assistant("blue")),
      })
      yield* memory.remember({
        key,
        turn: 1,
        terminal: true,
        transcript: prompt(user("What color is the ocean?"), assistant("blue")),
      })
      yield* memory.remember({
        key: otherKey,
        turn: 0,
        terminal: true,
        transcript: prompt(user("What color is the door?"), assistant("blue")),
      })

      const beforeForget = yield* memory.recall({ key, turn: 0, prompt: prompt(user("color")) })
      const first = beforeForget[0]
      if (first === undefined) return
      yield* memory.forget({ key, id: first.id })

      const retained = yield* memory.recall({ key, turn: 0, prompt: prompt(user("color")) })
      const otherRetained = yield* memory.recall({ key: otherKey, turn: 0, prompt: prompt(user("color")) })

      expect(retained.map(itemText)).toEqual(["User: What color is the ocean?\nAssistant: blue"])
      expect(otherRetained.map(itemText)).toEqual(["User: What color is the door?\nAssistant: blue"])
    }),
  )
})

const embeddingError = AiError.make({
  module: "SemanticRecallTest",
  method: "embedMany",
  reason: AiError.UnknownError.make({ description: "embedding failed" }),
})
const failingEmbedding = Layer.effect(
  EmbeddingModel.EmbeddingModel,
  EmbeddingModel.make({ embedMany: () => Effect.fail(embeddingError) }),
)

layer(
  SemanticRecall.layer({ limit: 5 }).pipe(
    Layer.provideMerge(VectorStore.layerMemory),
    Layer.provideMerge(failingEmbedding),
  ),
)((it) => {
  it.effect("maps embedding failures to MemoryError", () =>
    Effect.gen(function* () {
      const memory = yield* Memory.Memory
      const failure = yield* Effect.flip(memory.recall({ key, turn: 0, prompt: prompt(user("color")) }))

      expect(failure._tag).toBe("tenetkit/core/MemoryError")
      expect(failure.message).toContain("embedding failed")
    }),
  )
})
