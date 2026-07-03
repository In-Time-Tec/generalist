import { describe, expect, it } from "@effect/vitest"
import { Effect, Layer } from "effect"
import * as Ai from "effect/unstable/ai"
import { Memory } from "@batonfx/core"
import { combinedLayer, VectorStore } from "../src/index"

const key: Memory.Key = { agent: "memory-agent", subject: "subject-a" }

const textPart = (text: string) => Ai.Prompt.makePart("text", { text })
const user = (text: string) => Ai.Prompt.makeMessage("user", { content: [textPart(text)] })
const assistant = (text: string) => Ai.Prompt.makeMessage("assistant", { content: [textPart(text)] })
const prompt = (...messages: ReadonlyArray<Ai.Prompt.Message>) => Ai.Prompt.fromMessages(messages)

const itemText = (item: Memory.Item): string =>
  item.parts
    .filter((part): part is Ai.Prompt.TextPart => part.type === "text")
    .map((part) => part.text)
    .join("")

const embeddingLayer = Layer.effect(
  Ai.EmbeddingModel.EmbeddingModel,
  Ai.EmbeddingModel.make({
    embedMany: ({ inputs }) =>
      Effect.succeed({
        results: inputs.map(() => [1, 0]),
        usage: { inputTokens: undefined },
      }),
  }),
)

describe("@batonfx/memory", () => {
  it.effect("combinedLayer recalls working memory before semantic matches", () =>
    Effect.gen(function* () {
      const memory = yield* Memory.Memory

      yield* memory.remember({
        key,
        turn: 0,
        terminal: true,
        transcript: prompt(user("What color is the sky?"), assistant("blue")),
      })

      const recalled = yield* memory.recall({ key, turn: 0, prompt: prompt(user("color")) })

      expect(recalled.map(itemText)).toEqual(["Assistant: blue", "User: What color is the sky?\nAssistant: blue"])
    }).pipe(
      Effect.provide(
        combinedLayer({ working: { maxMessages: 1 }, semantic: { limit: 5 } }).pipe(
          Layer.provideMerge(VectorStore.memoryLayer),
          Layer.provideMerge(embeddingLayer),
        ),
      ),
    ),
  )
})
