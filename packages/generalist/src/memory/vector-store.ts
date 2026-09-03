import { Context, Effect, HashMap, Layer, Ref, Schema } from "effect"
import type { Key, Metadata, OperationRef, Version } from "../core/context/memory.js"
import { ActionableTaggedError, errorHint } from "../core/error-hint.js"
export interface Document {
  readonly id: string
  readonly key: Key
  readonly text: string
  readonly metadata?: Metadata
  readonly version: Version
  readonly evidence: ReadonlyArray<OperationRef>
  readonly supersedes?: Version
  readonly appliedAt: string
}
export interface Embedded extends Document {
  readonly embedding: ReadonlyArray<number>
}
export interface Match {
  readonly document: Embedded
  readonly score: number
}
export interface Query {
  readonly key: Key
  readonly embedding: ReadonlyArray<number>
  readonly limit: number
  readonly minScore?: number
}
export interface DeleteInput {
  readonly key: Key
  readonly id?: string | undefined
}
export interface RevertInput {
  readonly entryId: string
  readonly to: Version
}
export class VectorStoreError extends ActionableTaggedError<VectorStoreError>()("generalist/memory/VectorStoreError", {
  message: Schema.String,
  hint: errorHint("Restore the vector store or correct the rejected document or query, then retry."),
}) {}
export interface Service {
  readonly upsert: (documents: ReadonlyArray<Embedded>) => Effect.Effect<void, VectorStoreError>
  readonly query: (query: Query) => Effect.Effect<ReadonlyArray<Match>, VectorStoreError>
  readonly delete: (input: DeleteInput) => Effect.Effect<void, VectorStoreError>
  readonly history: (entryId: string) => Effect.Effect<ReadonlyArray<Embedded>, VectorStoreError>
  readonly revert: (input: RevertInput) => Effect.Effect<void, VectorStoreError>
}
export class VectorStore extends Context.Service<VectorStore, Service>()(
  "generalist/memory/vector-store/VectorStore",
) {}

const storageKey = (key: Key, id: string): string => JSON.stringify([key.agent, key.subject, id])

const sameKey = (left: Key, right: Key): boolean => left.agent === right.agent && left.subject === right.subject

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

interface State {
  readonly active: HashMap.HashMap<string, Embedded>
  readonly hidden: HashMap.HashMap<string, true>
  readonly histories: HashMap.HashMap<string, ReadonlyArray<Embedded>>
}

const emptyState: State = {
  active: HashMap.empty(),
  hidden: HashMap.empty(),
  histories: HashMap.empty(),
}

const entryKey = (state: State, entryId: string): string | undefined => {
  for (const [key, versions] of state.histories) {
    if (versions[0]?.id === entryId) return key
  }
  return undefined
}

const append = (state: State, document: Embedded): State | VectorStoreError => {
  const key = storageKey(document.key, document.id)
  const existingKey = entryKey(state, document.id)
  if (existingKey !== undefined && existingKey !== key) {
    return VectorStoreError.make({ message: `entry id ${document.id} already belongs to another memory key` })
  }
  const versions = HashMap.get(state.histories, key)
  const history = versions._tag === "Some" ? versions.value : []
  const active = HashMap.get(state.active, key)
  if (history.length === 0) {
    if (document.version !== 1 || document.supersedes !== undefined) {
      return VectorStoreError.make({ message: `new entry ${document.id} must begin at version 1` })
    }
  } else {
    const latest = history.at(-1)!
    if (document.version !== latest.version + 1) {
      return VectorStoreError.make({
        message: `entry ${document.id} version ${document.version} must follow version ${latest.version}`,
      })
    }
    if (
      document.supersedes === undefined ||
      !history.some((version) => version.version === document.supersedes) ||
      (active._tag === "Some" && active.value.version !== document.supersedes)
    ) {
      return VectorStoreError.make({
        message: `entry ${document.id} does not have active version ${document.supersedes}`,
      })
    }
  }
  return {
    active: HashMap.set(state.active, key, document),
    hidden: HashMap.remove(state.hidden, key),
    histories: HashMap.set(state.histories, key, [...history, document]),
  }
}

const make = Ref.make(emptyState).pipe(
  Effect.map(
    (state): Service => ({
      upsert: (nextDocuments) =>
        Effect.gen(function* () {
          for (const document of nextDocuments) {
            yield* validateVector(`document ${document.id} embedding`, document.embedding)
          }
          yield* Ref.modify(state, (current) => {
            let next = current
            for (const document of nextDocuments) {
              const appended = append(next, document)
              if (Schema.is(VectorStoreError)(appended)) return [appended, current] as const
              next = appended
            }
            return [undefined, next] as const
          }).pipe(Effect.flatMap((failure) => (failure === undefined ? Effect.void : Effect.fail(failure))))
        }),
      query: (input) =>
        Effect.gen(function* () {
          if (input.limit <= 0) return []
          yield* validateVector("query embedding", input.embedding)
          const current = yield* Ref.get(state)
          const matches: Array<Match> = []
          for (const [key, document] of current.active) {
            if (HashMap.has(current.hidden, key)) continue
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
        Ref.update(state, (current) => {
          let hidden = current.hidden
          for (const [key, document] of current.active) {
            if (!sameKey(document.key, input.key)) continue
            if (input.id !== undefined && document.id !== input.id) continue
            hidden = HashMap.set(hidden, key, true)
          }
          return { ...current, hidden }
        }),
      history: (entryId) =>
        Ref.get(state).pipe(
          Effect.map((current) => {
            const key = entryKey(current, entryId)
            if (key === undefined) return []
            const versions = HashMap.get(current.histories, key)
            return versions._tag === "Some" ? versions.value : []
          }),
        ),
      revert: (input) =>
        Ref.modify(state, (current) => {
          const key = entryKey(current, input.entryId)
          if (key === undefined) {
            return [VectorStoreError.make({ message: `entry ${input.entryId} does not exist` }), current] as const
          }
          const history = HashMap.get(current.histories, key)
          const document =
            history._tag === "Some" ? history.value.find((version) => version.version === input.to) : undefined
          if (document === undefined) {
            return [
              VectorStoreError.make({ message: `entry ${input.entryId} has no version ${input.to}` }),
              current,
            ] as const
          }
          return [
            undefined,
            {
              ...current,
              active: HashMap.set(current.active, key, document),
              hidden: HashMap.remove(current.hidden, key),
            },
          ] as const
        }).pipe(Effect.flatMap((failure) => (failure === undefined ? Effect.void : Effect.fail(failure)))),
    }),
  ),
)

/** Ref-backed non-durable vector store. */
export const layerMemory: Layer.Layer<VectorStore> = Layer.effect(VectorStore, make.pipe(Effect.map(VectorStore.of)))
export const layerTest = (implementation: Service): Layer.Layer<VectorStore> =>
  Layer.succeed(VectorStore, VectorStore.of(implementation))
