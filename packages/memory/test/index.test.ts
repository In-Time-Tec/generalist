import { expect, layer } from "@effect/vitest"
import { Effect, Layer, Stream } from "effect"
import { EmbeddingModel, LanguageModel, Prompt } from "effect/unstable/ai"
import { Memory } from "@batonfx/core"
import { combinedLayer, VectorStore } from "../src/index"

const key: Memory.Key = { agent: "memory-agent", subject: "subject-a" }

const textPart = (text: string) => Prompt.makePart("text", { text })
const user = (text: string) => Prompt.makeMessage("user", { content: [textPart(text)] })
const assistant = (text: string) => Prompt.makeMessage("assistant", { content: [textPart(text)] })
const prompt = (...messages: ReadonlyArray<Prompt.Message>) => Prompt.fromMessages(messages)

const itemText = (item: Memory.Item): string =>
  item.parts
    .filter((part): part is Prompt.TextPart => part.type === "text")
    .map((part) => part.text)
    .join("")

const embeddingLayer = Layer.effect(
  EmbeddingModel.EmbeddingModel,
  EmbeddingModel.make({
    embedMany: ({ inputs }) =>
      Effect.succeed({
        results: inputs.map(() => [1, 0]),
        usage: { inputTokens: undefined },
      }),
  }),
)

const summaryModel = Layer.effect(
  LanguageModel.LanguageModel,
  LanguageModel.make({
    generateText: () => Effect.succeed([{ type: "text", text: "summary" }]),
    streamText: () => Stream.empty,
  }),
)

const combinedOptions = {
  working: { maxMessages: 1, summarize: { model: summaryModel, prompt: "Preserve facts." } },
  semantic: { limit: 5 },
}
const memoryLayer: Layer.Layer<Memory.Memory, never, VectorStore.VectorStore | EmbeddingModel.EmbeddingModel> =
  combinedLayer(combinedOptions)

layer(memoryLayer.pipe(Layer.provideMerge(VectorStore.memoryLayer), Layer.provideMerge(embeddingLayer)))(
  "@batonfx/memory",
  (it) => {
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

        expect(recalled.map(itemText)).toEqual([
          "<working-memory-summary>\nsummary\n</working-memory-summary>",
          "Assistant: blue",
          "User: What color is the sky?\nAssistant: blue",
        ])
      }),
    )
  },
)
