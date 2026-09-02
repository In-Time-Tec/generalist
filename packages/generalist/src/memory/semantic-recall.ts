import { Effect, Layer } from "effect"
import { EmbeddingModel, IdGenerator, Prompt } from "effect/unstable/ai"
import { type Item, Memory, MemoryError, type Service } from "../core/context/memory.js"
import { VectorStore, type Match, type Query } from "./vector-store.js"
export interface Options {
  readonly limit?: number
  readonly minScore?: number
}

const memoryError = (reason: "embedding" | "vector-store", cause: unknown): MemoryError =>
  MemoryError.make({ reason, message: String(cause), cause })

const textPart = (text: string) => Prompt.makePart("text", { text })

const textFromParts = (parts: ReadonlyArray<Prompt.Part>): string =>
  parts
    .filter((part): part is Prompt.TextPart => part.type === "text")
    .map((part) => part.text)
    .join("")

const userText = (prompt: Prompt.Prompt): string =>
  prompt.content
    .filter((message): message is Prompt.UserMessage => message.role === "user")
    .map((message) => textFromParts(message.content))
    .filter((text) => text.length > 0)
    .join("\n\n")

const finalExchangeText = (prompt: Prompt.Prompt): string | undefined => {
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

const itemFromMatch = (match: Match): Item => ({
  id: match.document.id,
  content: [textPart(match.document.text)],
  metadata: { ...match.document.metadata, score: match.score },
})
export const make = (
  options: Options = {},
): Effect.Effect<Service, never, VectorStore | EmbeddingModel.EmbeddingModel> =>
  Effect.gen(function* () {
    const store = yield* VectorStore
    const embeddingModel = yield* EmbeddingModel.EmbeddingModel
    const limit = options.limit ?? 5

    return {
      recall: (input) => {
        const text = userText(input.prompt)
        if (text.length === 0) return Effect.succeed([])
        return embeddingModel.embed(text).pipe(
          Effect.mapError((error) => memoryError("embedding", error)),
          Effect.flatMap((embedding) =>
            store
              .query(
                options.minScore === undefined
                  ? { key: input.key, embedding: embedding.vector, limit }
                  : ({
                      key: input.key,
                      embedding: embedding.vector,
                      limit,
                      minScore: options.minScore,
                    } satisfies Query),
              )
              .pipe(Effect.mapError((error) => memoryError("vector-store", error))),
          ),
          Effect.map((matches) => matches.map(itemFromMatch)),
        )
      },
      remember: (input) => {
        if (!input.terminal) return Effect.void
        const text = finalExchangeText(input.transcript)
        if (text === undefined) return Effect.void
        return embeddingModel.embed(text).pipe(
          Effect.mapError((error) => memoryError("embedding", error)),
          Effect.flatMap((embedding) =>
            IdGenerator.defaultIdGenerator.generateId().pipe(
              Effect.flatMap((id) => store.upsert([{ id, key: input.key, text, embedding: embedding.vector }])),
              Effect.mapError((error) => memoryError("vector-store", error)),
            ),
          ),
        )
      },
      forget: (input) => store.delete(input).pipe(Effect.mapError((error) => memoryError("vector-store", error))),
    }
  })
export const layer = (options: Options = {}): Layer.Layer<Memory, never, VectorStore | EmbeddingModel.EmbeddingModel> =>
  Layer.effect(Memory, make(options).pipe(Effect.map(Memory.of)))
