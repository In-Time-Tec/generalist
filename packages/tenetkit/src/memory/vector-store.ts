import { Context, Effect, HashMap, Layer, Ref, Schema } from "effect"
import { Memory } from "../core/index.js"

/** @experimental */
export interface Document {
  readonly id: string
  readonly key: Memory.Key
  readonly text: string
  readonly metadata?: Memory.Metadata
}

/** @experimental */
export interface Embedded extends Document {
  readonly embedding: ReadonlyArray<number>
}

/** @experimental */
export interface Match {
  readonly document: Embedded
  readonly score: number
}

/** @experimental */
export interface Query {
  readonly key: Memory.Key
  readonly embedding: ReadonlyArray<number>
  readonly limit: number
  readonly minScore?: number
}

/** @experimental */
export interface DeleteInput {
  readonly key: Memory.Key
  readonly id?: string | undefined
}

/** @experimental */
export class VectorStoreError extends Schema.TaggedError<VectorStoreError>()("tenetkit/memory/VectorStoreError", {
  message: Schema.String,
}) {}

/** @experimental */
export interface Service {
  readonly upsert: (documents: ReadonlyArray<Embedded>) => Effect.Effect<void, VectorStoreError>
  readonly query: (query: Query) => Effect.Effect<ReadonlyArray<Match>, VectorStoreError>
  readonly delete: (input: DeleteInput) => Effect.Effect<void, VectorStoreError>
}

/** @experimental */
export class VectorStore extends Context.Service<VectorStore, Service>()("tenetkit/memory/vector-store/VectorStore") {}

const storageKey = (key: Memory.Key, id: string): string => JSON.stringify([key.agent, key.subject, id])

const sameKey = (left: Memory.Key, right: Memory.Key): boolean =>
  left.agent === right.agent && left.subject === right.subject

const validateVector = (label: string, vector: ReadonlyArray<number>): Effect.Effect<void, VectorStoreError> => {
  const invalid = vector.find((value) => !Number.isFinite(value))
  return invalid === undefined
    ? Effect.void
    : Effect.fail(VectorStoreError.make({ message: `${label} contains a non-finite value` }))
}

const cosine = (left: ReadonlyArray<number>, right: ReadonlyArray<number>): number => {
  let dot = 0
  let leftMagnitude = 0
  let rightMagnitude = 0
  for (let index = 0; index < left.length; index += 1) {
    const leftValue = left[index] ?? 0
    const rightValue = right[index] ?? 0
    dot += leftValue * rightValue
    leftMagnitude += leftValue * leftValue
    rightMagnitude += rightValue * rightValue
  }
  if (leftMagnitude === 0 || rightMagnitude === 0) return 0
  return dot / (Math.sqrt(leftMagnitude) * Math.sqrt(rightMagnitude))
}

const make = Ref.make(HashMap.empty<string, Embedded>()).pipe(
  Effect.map(
    (documents): Service => ({
      upsert: (nextDocuments) =>
        Effect.gen(function* () {
          for (const document of nextDocuments) {
            yield* validateVector(`document ${document.id} embedding`, document.embedding)
          }
          yield* Ref.update(documents, (current) => {
            let next = current
            for (const document of nextDocuments) {
              next = HashMap.set(next, storageKey(document.key, document.id), document)
            }
            return next
          })
        }),
      query: (input) =>
        Effect.gen(function* () {
          if (input.limit <= 0) return []
          yield* validateVector("query embedding", input.embedding)
          const current = yield* Ref.get(documents)
          const matches: Array<Match> = []
          for (const [, document] of current) {
            if (!sameKey(document.key, input.key)) continue
            if (document.embedding.length !== input.embedding.length) {
              return yield* VectorStoreError.make({
                message: `document ${document.id} embedding dimension ${document.embedding.length} does not match query dimension ${input.embedding.length}`,
              })
            }
            const score = cosine(document.embedding, input.embedding)
            if (input.minScore !== undefined && score < input.minScore) continue
            matches.push({ document, score })
          }
          return matches.toSorted((left, right) => right.score - left.score).slice(0, input.limit)
        }),
      delete: (input) =>
        Ref.update(documents, (current) =>
          HashMap.filter(current, (document) => {
            if (!sameKey(document.key, input.key)) return true
            return input.id === undefined ? false : document.id !== input.id
          }),
        ),
    }),
  ),
)

/** @experimental Ref-backed non-durable vector store. */
export const layerMemory: Layer.Layer<VectorStore> = Layer.effect(VectorStore, make.pipe(Effect.map(VectorStore.of)))

/** @experimental */
export const layerTest = (implementation: Service): Layer.Layer<VectorStore> =>
  Layer.succeed(VectorStore, VectorStore.of(implementation))
