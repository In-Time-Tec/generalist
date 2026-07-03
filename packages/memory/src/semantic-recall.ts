import { Effect, Layer, Ref } from "effect"
import * as Ai from "effect/unstable/ai"
import { Memory } from "@batonfx/core"
import * as VectorStore from "./vector-store"

/** @experimental */
export interface Options {
  readonly limit?: number
  readonly minScore?: number
}

const errorMessage = (error: unknown) => (error instanceof Error ? `${error.name}: ${error.message}` : String(error))

const memoryError = (error: unknown): Memory.MemoryError => new Memory.MemoryError({ message: errorMessage(error) })

const textPart = (text: string) => Ai.Prompt.makePart("text", { text })

const textFromParts = (parts: ReadonlyArray<Ai.Prompt.Part>): string =>
  parts
    .filter((part): part is Ai.Prompt.TextPart => part.type === "text")
    .map((part) => part.text)
    .join("")

const userText = (prompt: Ai.Prompt.Prompt): string =>
  prompt.content
    .filter((message): message is Ai.Prompt.UserMessage => message.role === "user")
    .map((message) => textFromParts(message.content))
    .filter((text) => text.length > 0)
    .join("\n\n")

const finalExchangeText = (prompt: Ai.Prompt.Prompt): string | undefined => {
  let assistant: string | undefined
  let assistantIndex = -1
  for (let index = prompt.content.length - 1; index >= 0; index -= 1) {
    const message = prompt.content[index]
    if (message?.role !== "assistant") continue
    const text = textFromParts(message.content).trim()
    if (text.length === 0) continue
    assistant = text
    assistantIndex = index
    break
  }
  if (assistant === undefined) return undefined
  for (let index = assistantIndex - 1; index >= 0; index -= 1) {
    const message = prompt.content[index]
    if (message?.role !== "user") continue
    const text = textFromParts(message.content).trim()
    if (text.length === 0) continue
    return `User: ${text}\nAssistant: ${assistant}`
  }
  return undefined
}

const itemFromMatch = (match: VectorStore.Match): Memory.Item => ({
  id: match.document.id,
  parts: [textPart(match.document.text)],
  metadata: { ...match.document.metadata, score: match.score },
})

/** @experimental */
export const make = (
  options: Options = {},
): Effect.Effect<Memory.Interface, never, VectorStore.VectorStore | Ai.EmbeddingModel.EmbeddingModel> =>
  Effect.gen(function* () {
    const store = yield* VectorStore.VectorStore
    const embeddingModel = yield* Ai.EmbeddingModel.EmbeddingModel
    const counter = yield* Ref.make(0)
    const limit = options.limit ?? 5

    return {
      recall: (input) => {
        const text = userText(input.prompt)
        if (text.length === 0) return Effect.succeed([])
        return embeddingModel.embed(text).pipe(
          Effect.mapError(memoryError),
          Effect.flatMap((embedding) =>
            store
              .query({
                key: input.key,
                embedding: embedding.vector,
                limit,
                ...(options.minScore === undefined ? {} : { minScore: options.minScore }),
              })
              .pipe(Effect.mapError(memoryError)),
          ),
          Effect.map((matches) => matches.map(itemFromMatch)),
        )
      },
      remember: (input) => {
        if (!input.terminal) return Effect.void
        const text = finalExchangeText(input.transcript)
        if (text === undefined) return Effect.void
        return embeddingModel.embed(text).pipe(
          Effect.mapError(memoryError),
          Effect.flatMap((embedding) =>
            Ref.modify(counter, (current) => [`semantic-${current + 1}`, current + 1]).pipe(
              Effect.flatMap((id) =>
                store.upsert([
                  {
                    id,
                    key: input.key,
                    text,
                    embedding: embedding.vector,
                  },
                ]),
              ),
            ),
          ),
          Effect.mapError(memoryError),
        )
      },
    }
  })

/** @experimental */
export const layer = (
  options: Options = {},
): Layer.Layer<Memory.Memory, never, VectorStore.VectorStore | Ai.EmbeddingModel.EmbeddingModel> =>
  Layer.effect(Memory.Memory, make(options).pipe(Effect.map(Memory.Memory.of)))
